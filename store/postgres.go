package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math/rand/v2"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"

	"forensic-listener/models"
)

// Postgres implements Store with a pgx connection pool. It is the system of record:
// every other store is a projection rebuilt from what is committed here.
type Postgres struct {
	pool *pgxpool.Pool
}

var _ Store = (*Postgres)(nil)

// NewPostgres creates and validates a new Postgres store.
func NewPostgres(ctx context.Context, connStr string) (*Postgres, error) {
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("parsing connection string: %w", err)
	}

	cfg.MaxConns = 30
	cfg.MinConns = 5
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging postgres: %w", err)
	}

	return &Postgres{pool: pool}, nil
}

// Pool exposes the shared pool so the pgvector store uses the same connections.
func (p *Postgres) Pool() *pgxpool.Pool { return p.pool }

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

// withTx runs fn inside a transaction and retries it when PostgreSQL aborts it
// because of a deadlock (40P01) or serialization failure (40001). Both are
// expected under concurrency and safe to retry because fn is re-run from scratch.
func (p *Postgres) withTx(ctx context.Context, fn func(pgx.Tx) error) error {
	const maxAttempts = 5
	for attempt := 1; ; attempt++ {
		err := pgx.BeginFunc(ctx, p.pool, fn)
		if err == nil || !isRetryable(err) || attempt == maxAttempts || ctx.Err() != nil {
			return err
		}
		backoff := time.Duration(attempt*attempt)*10*time.Millisecond + time.Duration(rand.IntN(20))*time.Millisecond
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}
}

func isRetryable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "40P01" || pgErr.Code == "40001")
}

// upsertAccountsSQL inserts or touches a set of accounts in one statement, in
// sorted address order. Every writer locks account rows in the same global order,
// so two transactions touching A->B and B->A can no longer deadlock.
const upsertAccountsSQL = `
	INSERT INTO accounts (address, is_contract, first_seen, last_seen)
	SELECT a, FALSE, $2, $2
	FROM (SELECT DISTINCT a FROM unnest($1::text[]) AS a WHERE a <> '') AS s
	ORDER BY a
	ON CONFLICT (address) DO UPDATE
	    SET last_seen = GREATEST(accounts.last_seen, EXCLUDED.last_seen)
`

// UpsertAccount inserts an account or marks it as a contract.
func (p *Postgres) UpsertAccount(ctx context.Context, address string, isContract bool) error {
	address = NormalizeAddress(address)
	if address == "" {
		return nil
	}

	_, err := p.pool.Exec(ctx, `
		INSERT INTO accounts (address, is_contract, first_seen, last_seen)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (address) DO UPDATE
		    SET last_seen   = NOW(),
		        is_contract = accounts.is_contract OR EXCLUDED.is_contract
	`, address, isContract)
	if err != nil {
		return fmt.Errorf("upserting account %s: %w", address, err)
	}
	return nil
}

// GetAccount retrieves a single account by address.
func (p *Postgres) GetAccount(ctx context.Context, address string) (*models.Account, error) {
	address = NormalizeAddress(address)

	acc := &models.Account{}
	err := p.pool.QueryRow(ctx, `
		SELECT address, is_contract, first_seen, last_seen
		FROM accounts
		WHERE address = $1
	`, address).Scan(&acc.Address, &acc.IsContract, &acc.FirstSeen, &acc.LastSeen)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "account", ID: address}
		}
		return nil, fmt.Errorf("querying account %s: %w", address, err)
	}
	return acc, nil
}

// ---------------------------------------------------------------------------
// Ingestion writes
// ---------------------------------------------------------------------------

// SaveTransaction persists a pending transaction, its accounts and its enrichment
// job atomically (the transactional outbox).
func (p *Postgres) SaveTransaction(ctx context.Context, tx *models.Transaction) error {
	from := NormalizeAddress(tx.From)
	to := NormalizeAddress(tx.To)

	return p.withTx(ctx, func(dbTx pgx.Tx) error {
		if _, err := dbTx.Exec(ctx, upsertAccountsSQL, []string{from, to}, tx.Timestamp); err != nil {
			return fmt.Errorf("upserting accounts for %s: %w", tx.Hash, err)
		}

		tag, err := dbTx.Exec(ctx, `
			INSERT INTO transactions
			    (hash, from_address, to_address, value, gas, gas_price, max_priority_fee,
			     tx_type, nonce, data, timestamp, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
			ON CONFLICT (hash) DO NOTHING
		`,
			tx.Hash, from, nullableString(to), tx.Value, int64(tx.Gas), tx.GasPrice,
			tx.MaxPriorityFee, int16(tx.Type), int64(tx.Nonce), tx.Data, tx.Timestamp,
		)
		if err != nil {
			return fmt.Errorf("inserting transaction %s: %w", tx.Hash, err)
		}
		if tag.RowsAffected() == 0 || to == "" {
			return nil
		}

		if _, err := dbTx.Exec(ctx, `
			INSERT INTO enrichment_jobs (tx_hash, status, available_at, updated_at)
			VALUES ($1, 'pending', NOW(), NOW())
			ON CONFLICT (tx_hash) DO NOTHING
		`, tx.Hash); err != nil {
			return fmt.Errorf("enqueueing enrichment job %s: %w", tx.Hash, err)
		}
		return nil
	})
}

// SaveBlock records a mined block in one transaction: the block row, its accounts,
// every transaction (inserting unseen ones, promoting pending ones to mined), receipt
// data, replaced-by-nonce detection and decoded token transfers. A block already
// stored under the same hash is skipped; a different hash at the same height is a
// reorg, and the old block's effects are undone first.
func (p *Postgres) SaveBlock(ctx context.Context, mb *models.MinedBlock) error {
	b := mb.Block

	return p.withTx(ctx, func(dbTx pgx.Tx) error {
		var existingHash string
		err := dbTx.QueryRow(ctx, `SELECT hash FROM blocks WHERE number = $1 FOR UPDATE`, int64(b.Number)).Scan(&existingHash)
		switch {
		case err == nil && existingHash == b.Hash:
			return nil
		case err == nil:
			if _, err := dbTx.Exec(ctx, `DELETE FROM token_transfers WHERE block_number = $1`, int64(b.Number)); err != nil {
				return fmt.Errorf("reorg: removing token transfers of block %d: %w", b.Number, err)
			}
			if _, err := dbTx.Exec(ctx, `
				UPDATE transactions
				SET status = 'pending', block_number = NULL, mined_at = NULL,
				    gas_used = NULL, effective_gas_price = NULL, receipt_status = NULL
				WHERE block_number = $1
			`, int64(b.Number)); err != nil {
				return fmt.Errorf("reorg: reverting transactions of block %d: %w", b.Number, err)
			}
		case errors.Is(err, pgx.ErrNoRows):
		default:
			return fmt.Errorf("checking block %d: %w", b.Number, err)
		}

		if _, err := dbTx.Exec(ctx, `
			INSERT INTO blocks (number, hash, parent_hash, mined_at, tx_count, gas_used, base_fee)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (number) DO UPDATE
			    SET hash = EXCLUDED.hash, parent_hash = EXCLUDED.parent_hash,
			        mined_at = EXCLUDED.mined_at, tx_count = EXCLUDED.tx_count,
			        gas_used = EXCLUDED.gas_used, base_fee = EXCLUDED.base_fee,
			        ingested_at = NOW()
		`, int64(b.Number), b.Hash, b.ParentHash, b.MinedAt, b.TxCount, int64(b.GasUsed), b.BaseFee); err != nil {
			return fmt.Errorf("upserting block %d: %w", b.Number, err)
		}

		addresses := make([]string, 0, len(mb.Transactions)*2+len(mb.TokenTransfers)*3)
		for _, tx := range mb.Transactions {
			addresses = append(addresses, NormalizeAddress(tx.From), NormalizeAddress(tx.To))
		}
		for _, tt := range mb.TokenTransfers {
			addresses = append(addresses, NormalizeAddress(tt.Token), NormalizeAddress(tt.From), NormalizeAddress(tt.To))
		}
		if _, err := dbTx.Exec(ctx, upsertAccountsSQL, addresses, b.MinedAt); err != nil {
			return fmt.Errorf("upserting accounts for block %d: %w", b.Number, err)
		}

		if len(mb.Transactions) > 0 {
			if err := p.upsertMinedTransactions(ctx, dbTx, mb); err != nil {
				return err
			}
		}

		if len(mb.TokenTransfers) > 0 {
			if err := insertTokenTransfers(ctx, dbTx, b.Number, mb.TokenTransfers); err != nil {
				return err
			}
		}

		return nil
	})
}

func (p *Postgres) upsertMinedTransactions(ctx context.Context, dbTx pgx.Tx, mb *models.MinedBlock) error {
	n := len(mb.Transactions)
	hashes := make([]string, n)
	froms := make([]string, n)
	tos := make([]string, n)
	values := make([]string, n)
	gases := make([]int64, n)
	gasPrices := make([]string, n)
	priorityFees := make([]string, n)
	types := make([]int16, n)
	nonces := make([]int64, n)
	data := make([][]byte, n)
	gasUsed := make([]int64, n)
	effective := make([]string, n)
	statuses := make([]int16, n)
	created := make([]string, n)
	createdContracts := make([]string, 0)

	jobHashes := make([]string, 0, n)
	for i, tx := range mb.Transactions {
		hashes[i] = tx.Hash
		froms[i] = NormalizeAddress(tx.From)
		tos[i] = NormalizeAddress(tx.To)
		values[i] = tx.Value
		gases[i] = int64(tx.Gas)
		gasPrices[i] = tx.GasPrice
		if tx.MaxPriorityFee != nil {
			priorityFees[i] = *tx.MaxPriorityFee
		}
		types[i] = int16(tx.Type)
		nonces[i] = int64(tx.Nonce)
		data[i] = tx.Data
		statuses[i] = -1
		if r, ok := mb.Receipts[tx.Hash]; ok {
			gasUsed[i] = int64(r.GasUsed)
			effective[i] = r.EffectiveGasPrice
			statuses[i] = int16(r.Status)
		}
		created[i] = NormalizeAddress(tx.CreatedContract)
		if created[i] != "" {
			createdContracts = append(createdContracts, created[i])
		}
		if tos[i] != "" || created[i] != "" {
			jobHashes = append(jobHashes, tx.Hash)
		}
	}

	if len(createdContracts) > 0 {
		if _, err := dbTx.Exec(ctx, upsertAccountsSQL, createdContracts, mb.Block.MinedAt); err != nil {
			return fmt.Errorf("upserting created contracts for block %d: %w", mb.Block.Number, err)
		}
		if _, err := dbTx.Exec(ctx, `
			UPDATE accounts SET is_contract = TRUE
			WHERE address = ANY($1) AND NOT is_contract
		`, createdContracts); err != nil {
			return fmt.Errorf("marking created contracts for block %d: %w", mb.Block.Number, err)
		}
	}

	if _, err := dbTx.Exec(ctx, `
		INSERT INTO transactions
		    (hash, from_address, to_address, value, gas, gas_price, max_priority_fee, tx_type,
		     nonce, data, timestamp, status, block_number, mined_at, gas_used,
		     effective_gas_price, receipt_status, created_contract)
		SELECT t.hash, t.from_address, NULLIF(t.to_address, ''), t.value::numeric, t.gas,
		       t.gas_price::numeric, NULLIF(t.priority_fee, '')::numeric, t.tx_type, t.nonce, t.data,
		       $15, 'mined', $16, $15, NULLIF(t.gas_used, 0), NULLIF(t.effective, '')::numeric,
		       NULLIF(t.receipt_status, -1), NULLIF(t.created, '')
		FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::bigint[], $6::text[],
		            $7::text[], $8::smallint[], $9::bigint[], $10::bytea[], $11::bigint[],
		            $12::text[], $13::smallint[], $14::text[])
		     AS t(hash, from_address, to_address, value, gas, gas_price, priority_fee, tx_type,
		          nonce, data, gas_used, effective, receipt_status, created)
		ON CONFLICT (hash) DO UPDATE
		    SET status = 'mined',
		        block_number = EXCLUDED.block_number,
		        mined_at = EXCLUDED.mined_at,
		        gas_used = EXCLUDED.gas_used,
		        effective_gas_price = EXCLUDED.effective_gas_price,
		        receipt_status = EXCLUDED.receipt_status,
		        created_contract = EXCLUDED.created_contract
	`, hashes, froms, tos, values, gases, gasPrices, priorityFees, types, nonces, data,
		gasUsed, effective, statuses, created, mb.Block.MinedAt, int64(mb.Block.Number)); err != nil {
		return fmt.Errorf("upserting transactions of block %d: %w", mb.Block.Number, err)
	}

	// A pending transaction whose sender+nonce was mined under a different hash was
	// replaced (speed-up or cancel) and will never be mined itself.
	if _, err := dbTx.Exec(ctx, `
		UPDATE transactions p
		SET status = 'replaced'
		FROM unnest($1::text[], $2::bigint[], $3::text[]) AS m(from_address, nonce, hash)
		WHERE p.status = 'pending'
		  AND p.from_address = m.from_address
		  AND p.nonce = m.nonce
		  AND p.hash <> m.hash
	`, froms, nonces, hashes); err != nil {
		return fmt.Errorf("marking replaced transactions for block %d: %w", mb.Block.Number, err)
	}

	if len(jobHashes) > 0 {
		if _, err := dbTx.Exec(ctx, `
			INSERT INTO enrichment_jobs (tx_hash, status, available_at, updated_at)
			SELECT h, 'pending', NOW(), NOW() FROM unnest($1::text[]) AS h ORDER BY h
			ON CONFLICT (tx_hash) DO NOTHING
		`, jobHashes); err != nil {
			return fmt.Errorf("enqueueing enrichment for block %d: %w", mb.Block.Number, err)
		}
	}

	return nil
}

// insertTokenTransfers stores decoded transfers and re-queues their transactions so
// the enrichment workers add the token edges to Neo4j and re-run detection.
func insertTokenTransfers(ctx context.Context, dbTx pgx.Tx, blockNumber uint64, transfers []*models.TokenTransfer) error {
	n := len(transfers)
	hashes := make([]string, n)
	logIndexes := make([]int32, n)
	tokens := make([]string, n)
	froms := make([]string, n)
	tos := make([]string, n)
	amounts := make([]string, n)
	for i, tt := range transfers {
		hashes[i] = tt.TxHash
		logIndexes[i] = int32(tt.LogIndex)
		tokens[i] = NormalizeAddress(tt.Token)
		froms[i] = NormalizeAddress(tt.From)
		tos[i] = NormalizeAddress(tt.To)
		amounts[i] = tt.Amount
	}

	if _, err := dbTx.Exec(ctx, `
		INSERT INTO token_transfers
		    (tx_hash, log_index, block_number, token_address, from_address, to_address, amount)
		SELECT t.hash, t.log_index, $7, t.token, t.from_address, t.to_address, t.amount::numeric
		FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[])
		     AS t(hash, log_index, token, from_address, to_address, amount)
		ON CONFLICT (tx_hash, log_index) DO NOTHING
	`, hashes, logIndexes, tokens, froms, tos, amounts, int64(blockNumber)); err != nil {
		return fmt.Errorf("inserting token transfers for block %d: %w", blockNumber, err)
	}

	if _, err := dbTx.Exec(ctx, `
		INSERT INTO enrichment_jobs (tx_hash, status, available_at, updated_at)
		SELECT DISTINCT h, 'pending', NOW(), NOW() FROM unnest($1::text[]) AS h ORDER BY h
		ON CONFLICT (tx_hash) DO UPDATE
		    SET status = 'pending', attempts = 0, available_at = NOW(),
		        locked_at = NULL, last_error = NULL, updated_at = NOW()
		WHERE enrichment_jobs.status <> 'pending'
	`, hashes); err != nil {
		return fmt.Errorf("re-queueing token transfer enrichment for block %d: %w", blockNumber, err)
	}

	return nil
}

// MarkDroppedTransactions marks transactions still pending after olderThan as dropped.
// Only meaningful while blocks are being ingested, otherwise nothing is ever mined.
func (p *Postgres) MarkDroppedTransactions(ctx context.Context, olderThan time.Duration) (int64, error) {
	tag, err := p.pool.Exec(ctx, `
		UPDATE transactions
		SET status = 'dropped'
		WHERE status = 'pending'
		  AND timestamp < NOW() - make_interval(secs => $1)
	`, olderThan.Seconds())
	if err != nil {
		return 0, fmt.Errorf("marking dropped transactions: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ---------------------------------------------------------------------------
// Enrichment queue
// ---------------------------------------------------------------------------

// ClaimEnrichmentJob leases the next open job with FOR UPDATE SKIP LOCKED, so
// concurrent workers never claim the same row, and reclaims expired leases.
func (p *Postgres) ClaimEnrichmentJob(ctx context.Context, staleAfter time.Duration) (*models.Transaction, error) {
	staleBefore := time.Now().Add(-staleAfter)

	row := p.pool.QueryRow(ctx, `
		WITH candidate AS (
			SELECT tx_hash
			FROM enrichment_jobs
			WHERE status IN ('pending', 'processing')
			  AND available_at <= NOW()
			  AND (
				status = 'pending'
				OR (status = 'processing' AND locked_at <= $1)
			  )
			ORDER BY available_at ASC, updated_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		),
		claimed AS (
			UPDATE enrichment_jobs AS ej
			SET status = 'processing',
			    attempts = ej.attempts + 1,
			    locked_at = NOW(),
			    updated_at = NOW()
			FROM candidate
			WHERE ej.tx_hash = candidate.tx_hash
			RETURNING ej.tx_hash
		)
		SELECT `+txColumns+`, t.data
		FROM claimed c
		JOIN transactions t ON t.hash = c.tx_hash
	`, staleBefore)

	tx, err := scanTransaction(row, true)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("claiming enrichment job: %w", err)
	}
	return tx, nil
}

// MarkEnrichmentDone completes a job. The status guard means a job that was
// re-queued while being processed (for example when its block arrived) stays queued.
func (p *Postgres) MarkEnrichmentDone(ctx context.Context, hash string) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE enrichment_jobs
		SET status = 'done', locked_at = NULL, last_error = NULL, updated_at = NOW()
		WHERE tx_hash = $1 AND status = 'processing'
	`, hash)
	if err != nil {
		return fmt.Errorf("marking enrichment job %s done: %w", hash, err)
	}
	return nil
}

// MarkEnrichmentFailed re-queues a job with exponential backoff (5s, 10s, 20s ... 5 min),
// or parks it as failed once maxAttempts is reached.
func (p *Postgres) MarkEnrichmentFailed(ctx context.Context, hash string, failure error, maxAttempts int) error {
	lastError := ""
	if failure != nil {
		lastError = failure.Error()
	}

	_, err := p.pool.Exec(ctx, `
		UPDATE enrichment_jobs
		SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'pending' END,
		    locked_at = NULL,
		    last_error = $2,
		    available_at = NOW() + make_interval(secs => LEAST(power(2, attempts) * 5, 300)),
		    updated_at = NOW()
		WHERE tx_hash = $1 AND status = 'processing'
	`, hash, lastError, maxAttempts)
	if err != nil {
		return fmt.Errorf("marking enrichment job %s failed: %w", hash, err)
	}
	return nil
}

// PruneEnrichmentJobs deletes finished jobs older than olderThan, in bounded batches.
func (p *Postgres) PruneEnrichmentJobs(ctx context.Context, olderThan time.Duration) (int64, error) {
	tag, err := p.pool.Exec(ctx, `
		DELETE FROM enrichment_jobs
		WHERE tx_hash IN (
			SELECT tx_hash FROM enrichment_jobs
			WHERE status = 'done' AND updated_at < NOW() - make_interval(secs => $1)
			LIMIT 10000
		)
	`, olderThan.Seconds())
	if err != nil {
		return 0, fmt.Errorf("pruning enrichment jobs: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ---------------------------------------------------------------------------
// Transactions, flags, token transfers
// ---------------------------------------------------------------------------

const txColumns = `
	t.hash, t.from_address, COALESCE(t.to_address, ''), t.value::text, t.gas, t.gas_price::text,
	t.max_priority_fee::text, t.tx_type, t.nonce, t.timestamp, t.status, t.block_number,
	t.mined_at, t.gas_used, t.effective_gas_price::text, t.receipt_status,
	COALESCE(t.created_contract, '')`

type scanner interface {
	Scan(dest ...any) error
}

func scanTransaction(s scanner, withData bool) (*models.Transaction, error) {
	tx := &models.Transaction{}
	var gas, nonce int64
	var txType int16
	var blockNumber, gasUsed *int64
	var receiptStatus *int16

	dest := []any{
		&tx.Hash, &tx.From, &tx.To, &tx.Value, &gas, &tx.GasPrice,
		&tx.MaxPriorityFee, &txType, &nonce, &tx.Timestamp, &tx.Status, &blockNumber,
		&tx.MinedAt, &gasUsed, &tx.EffectiveGasPrice, &receiptStatus, &tx.CreatedContract,
	}
	if withData {
		dest = append(dest, &tx.Data)
	}
	if err := s.Scan(dest...); err != nil {
		return nil, err
	}

	tx.Gas = uint64(gas)
	tx.Nonce = uint64(nonce)
	tx.Type = uint8(txType)
	if blockNumber != nil {
		v := uint64(*blockNumber)
		tx.BlockNumber = &v
	}
	if gasUsed != nil {
		v := uint64(*gasUsed)
		tx.GasUsed = &v
	}
	if receiptStatus != nil {
		v := int(*receiptStatus)
		tx.ReceiptStatus = &v
	}
	return tx, nil
}

func scanTransactions(rows pgx.Rows) ([]*models.Transaction, error) {
	defer rows.Close()
	txs := make([]*models.Transaction, 0)
	for rows.Next() {
		tx, err := scanTransaction(rows, false)
		if err != nil {
			return nil, fmt.Errorf("scanning transaction: %w", err)
		}
		txs = append(txs, tx)
	}
	return txs, rows.Err()
}

// RecentTransactions returns the latest N observed transactions.
func (p *Postgres) RecentTransactions(ctx context.Context, limit int) ([]*models.Transaction, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+txColumns+` FROM transactions t ORDER BY t.timestamp DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent transactions: %w", err)
	}
	return scanTransactions(rows)
}

// TransactionByHash retrieves a single transaction, including calldata.
func (p *Postgres) TransactionByHash(ctx context.Context, hash string) (*models.Transaction, error) {
	row := p.pool.QueryRow(ctx, `SELECT `+txColumns+`, t.data FROM transactions t WHERE t.hash = $1`, hash)
	tx, err := scanTransaction(row, true)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "transaction", ID: hash}
		}
		return nil, fmt.Errorf("querying transaction %s: %w", hash, err)
	}
	return tx, nil
}

// RecentTransactionsForAddress returns the latest transactions touching an address.
func (p *Postgres) RecentTransactionsForAddress(ctx context.Context, address string, limit int) ([]*models.Transaction, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 8
	}
	rows, err := p.pool.Query(ctx, `
		SELECT `+txColumns+`
		FROM transactions t
		WHERE t.from_address = $1 OR t.to_address = $1
		ORDER BY t.timestamp DESC
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent transactions for %s: %w", address, err)
	}
	return scanTransactions(rows)
}

const tokenTransferColumns = `
	tt.tx_hash, tt.log_index, tt.block_number, tt.token_address, COALESCE(ke.name, ''),
	tt.from_address, tt.to_address, tt.amount::text, b.mined_at`

func scanTokenTransfers(rows pgx.Rows) ([]*models.TokenTransfer, error) {
	defer rows.Close()
	transfers := make([]*models.TokenTransfer, 0)
	for rows.Next() {
		tt := &models.TokenTransfer{}
		var logIndex int32
		var blockNumber int64
		if err := rows.Scan(&tt.TxHash, &logIndex, &blockNumber, &tt.Token, &tt.TokenName,
			&tt.From, &tt.To, &tt.Amount, &tt.MinedAt); err != nil {
			return nil, fmt.Errorf("scanning token transfer: %w", err)
		}
		tt.LogIndex = uint(logIndex)
		tt.BlockNumber = uint64(blockNumber)
		transfers = append(transfers, tt)
	}
	return transfers, rows.Err()
}

// TokenTransfersForTransaction lists the ERC-20 transfers emitted by a transaction.
func (p *Postgres) TokenTransfersForTransaction(ctx context.Context, hash string) ([]*models.TokenTransfer, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT `+tokenTransferColumns+`
		FROM token_transfers tt
		JOIN blocks b ON b.number = tt.block_number
		LEFT JOIN known_entities ke ON ke.address = tt.token_address
		WHERE tt.tx_hash = $1
		ORDER BY tt.log_index
	`, hash)
	if err != nil {
		return nil, fmt.Errorf("querying token transfers for %s: %w", hash, err)
	}
	return scanTokenTransfers(rows)
}

// RecentTokenTransfersForAddress lists the latest token transfers sent or received by an address.
func (p *Postgres) RecentTokenTransfersForAddress(ctx context.Context, address string, limit int) ([]*models.TokenTransfer, error) {
	address = NormalizeAddress(address)
	rows, err := p.pool.Query(ctx, `
		SELECT `+tokenTransferColumns+`
		FROM token_transfers tt
		JOIN blocks b ON b.number = tt.block_number
		LEFT JOIN known_entities ke ON ke.address = tt.token_address
		WHERE tt.from_address = $1 OR tt.to_address = $1
		ORDER BY tt.block_number DESC, tt.log_index DESC
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying token transfers for %s: %w", address, err)
	}
	return scanTokenTransfers(rows)
}

// SaveFlag persists a forensic flag. The unique (tx_hash, address, flag_type) index
// makes detectors idempotent: re-running enrichment never duplicates a flag.
func (p *Postgres) SaveFlag(ctx context.Context, flag *models.ForensicFlag) error {
	address := NormalizeAddress(flag.Address)
	evidence := flag.Evidence
	if len(evidence) == 0 {
		evidence = json.RawMessage(`{}`)
	}

	_, err := p.pool.Exec(ctx, `
		INSERT INTO forensic_flags
		    (tx_hash, address, flag_type, severity, description, evidence, detected_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
		ON CONFLICT (tx_hash, address, flag_type) DO NOTHING
	`, flag.TxHash, address, flag.FlagType, flag.Severity, flag.Description, string(evidence))
	if err != nil {
		return fmt.Errorf("saving forensic flag: %w", err)
	}
	return nil
}

const flagColumns = `f.id, COALESCE(f.tx_hash, ''), f.address, f.flag_type, f.severity,
	COALESCE(f.description, ''), f.evidence, f.detected_at`

func scanForensicFlags(rows pgx.Rows) ([]*models.ForensicFlag, error) {
	defer rows.Close()
	flags := make([]*models.ForensicFlag, 0)
	for rows.Next() {
		flag := &models.ForensicFlag{}
		var evidence []byte
		if err := rows.Scan(&flag.ID, &flag.TxHash, &flag.Address, &flag.FlagType,
			&flag.Severity, &flag.Description, &evidence, &flag.DetectedAt); err != nil {
			return nil, fmt.Errorf("scanning forensic flag: %w", err)
		}
		flag.Evidence = evidence
		flags = append(flags, flag)
	}
	return flags, rows.Err()
}

// RecentFlags returns the latest N forensic flags.
func (p *Postgres) RecentFlags(ctx context.Context, limit int) ([]*models.ForensicFlag, error) {
	rows, err := p.pool.Query(ctx, `SELECT `+flagColumns+` FROM forensic_flags f ORDER BY f.detected_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent flags: %w", err)
	}
	return scanForensicFlags(rows)
}

// FlagsForTransaction lists all forensic flags attached to a transaction hash.
func (p *Postgres) FlagsForTransaction(ctx context.Context, hash string) ([]*models.ForensicFlag, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT `+flagColumns+`
		FROM forensic_flags f
		WHERE f.tx_hash = $1
		ORDER BY f.detected_at DESC, f.id DESC
	`, hash)
	if err != nil {
		return nil, fmt.Errorf("querying flags for transaction %s: %w", hash, err)
	}
	return scanForensicFlags(rows)
}

// FlagsForAddress lists the latest flags raised against an address.
func (p *Postgres) FlagsForAddress(ctx context.Context, address string, limit int) ([]*models.ForensicFlag, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT `+flagColumns+`
		FROM forensic_flags f
		WHERE f.address = $1
		ORDER BY f.detected_at DESC
		LIMIT $2
	`, NormalizeAddress(address), limit)
	if err != nil {
		return nil, fmt.Errorf("querying flags for address %s: %w", address, err)
	}
	return scanForensicFlags(rows)
}

// RecentCircularFlows returns circular-flow flags with their structured path evidence.
func (p *Postgres) RecentCircularFlows(ctx context.Context, limit int) ([]*models.CircularFlow, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT f.id, COALESCE(f.tx_hash, ''), f.address, f.severity, f.detected_at, f.evidence
		FROM forensic_flags f
		WHERE f.flag_type = 'circular_flow'
		ORDER BY f.detected_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying circular flows: %w", err)
	}
	defer rows.Close()

	flows := make([]*models.CircularFlow, 0)
	for rows.Next() {
		flow := &models.CircularFlow{}
		var evidenceJSON []byte
		if err := rows.Scan(&flow.FlagID, &flow.TxHash, &flow.Address, &flow.Severity, &flow.DetectedAt, &evidenceJSON); err != nil {
			return nil, fmt.Errorf("scanning circular flow: %w", err)
		}
		var evidence models.CircularEvidence
		if err := json.Unmarshal(evidenceJSON, &evidence); err == nil {
			flow.Path = evidence.Path
			flow.TransactionHashes = evidence.TransactionHashes
			flow.Kinds = evidence.Kinds
			flow.Hops = evidence.Hops
		}
		flows = append(flows, flow)
	}
	return flows, rows.Err()
}

// LatestTransactionHashFor returns the most recent transaction that called or created
// an address, used to anchor flags raised outside the normal enrichment flow.
func (p *Postgres) LatestTransactionHashFor(ctx context.Context, address string) (string, error) {
	address = NormalizeAddress(address)
	var hash string
	err := p.pool.QueryRow(ctx, `
		SELECT hash FROM (
			(SELECT hash, timestamp FROM transactions WHERE to_address = $1 ORDER BY timestamp DESC LIMIT 1)
			UNION ALL
			(SELECT hash, timestamp FROM transactions WHERE created_contract = $1 ORDER BY timestamp DESC LIMIT 1)
		) latest
		ORDER BY timestamp DESC
		LIMIT 1
	`, address).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("finding latest transaction for %s: %w", address, err)
	}
	return hash, nil
}

// FlagSeries groups forensic flags over time for charting.
func (p *Postgres) FlagSeries(ctx context.Context, bucket string, hours int) ([]*models.FlagBucket, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT date_trunc($1, detected_at) AS bucket, flag_type, severity, COUNT(*)
		FROM forensic_flags
		WHERE detected_at >= NOW() - make_interval(hours => $2)
		GROUP BY 1, 2, 3
		ORDER BY bucket DESC, flag_type ASC, severity ASC
	`, bucket, hours)
	if err != nil {
		return nil, fmt.Errorf("querying flag series: %w", err)
	}
	defer rows.Close()

	buckets := make([]*models.FlagBucket, 0)
	for rows.Next() {
		b := &models.FlagBucket{}
		if err := rows.Scan(&b.Bucket, &b.FlagType, &b.Severity, &b.Count); err != nil {
			return nil, fmt.Errorf("scanning flag bucket: %w", err)
		}
		buckets = append(buckets, b)
	}
	return buckets, rows.Err()
}

// ---------------------------------------------------------------------------
// Profiles and entities
// ---------------------------------------------------------------------------

// GetAccountProfile returns the dossier for a single address. Risk comes from the
// address_risk view: the worse of the curated label and the most severe flag.
func (p *Postgres) GetAccountProfile(ctx context.Context, address string) (*models.AccountProfile, error) {
	address = NormalizeAddress(address)

	profile := &models.AccountProfile{}
	err := p.pool.QueryRow(ctx, `
		WITH sent AS (
			SELECT COUNT(*) AS n, COALESCE(SUM(value), 0)::text AS total
			FROM transactions WHERE from_address = $1
		),
		received AS (
			SELECT COUNT(*) AS n, COALESCE(SUM(value), 0)::text AS total
			FROM transactions WHERE to_address = $1
		),
		counterparties AS (
			SELECT COUNT(*) AS n FROM (
				SELECT to_address FROM transactions WHERE from_address = $1 AND to_address IS NOT NULL
				UNION
				SELECT from_address FROM transactions WHERE to_address = $1
			) c
		),
		tokens AS (
			SELECT COUNT(*) AS n FROM token_transfers WHERE from_address = $1 OR to_address = $1
		)
		SELECT
			a.address, a.is_contract, a.first_seen, a.last_seen,
			sent.n, received.n, sent.n + received.n, sent.total, received.total,
			counterparties.n, tokens.n,
			r.flag_count, r.high_flag_count, r.risk_level, r.flag_risk, r.label_risk,
			COALESCE(ke.name, ''), COALESCE(ke.entity_type, ''), COALESCE(ke.source, ''),
			COALESCE(ke.is_hub, FALSE)
		FROM accounts a
		CROSS JOIN sent
		CROSS JOIN received
		CROSS JOIN counterparties
		CROSS JOIN tokens
		JOIN address_risk r ON r.address = a.address
		LEFT JOIN known_entities ke ON ke.address = a.address
		WHERE a.address = $1
	`, address).Scan(
		&profile.Address, &profile.IsContract, &profile.FirstSeen, &profile.LastSeen,
		&profile.SentCount, &profile.ReceivedCount, &profile.TotalCount,
		&profile.TotalSent, &profile.TotalReceived,
		&profile.CounterpartyCount, &profile.TokenTransferCount,
		&profile.FlagCount, &profile.HighSeverityFlagCount,
		&profile.RiskLevel, &profile.FlagRisk, &profile.LabelRisk,
		&profile.EntityName, &profile.EntityType, &profile.LabelSource, &profile.IsHub,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "account", ID: address}
		}
		return nil, fmt.Errorf("querying account profile %s: %w", address, err)
	}

	if profile.EntityType == "" {
		profile.EntityType = defaultEntityType(profile.IsContract)
	}

	if profile.Counterparties, err = p.AccountCounterparties(ctx, address, 8); err != nil {
		return nil, err
	}
	if profile.RecentTransactions, err = p.RecentTransactionsForAddress(ctx, address, 8); err != nil {
		return nil, err
	}
	if profile.RecentTokenTransfers, err = p.RecentTokenTransfersForAddress(ctx, address, 8); err != nil {
		return nil, err
	}
	if profile.Flags, err = p.FlagsForAddress(ctx, address, 10); err != nil {
		return nil, err
	}

	return profile, nil
}

// AccountCounterparties returns the most frequent counterparties for an address.
func (p *Postgres) AccountCounterparties(ctx context.Context, address string, limit int) ([]*models.CounterpartyActivity, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 8
	}

	rows, err := p.pool.Query(ctx, `
		WITH related AS (
			SELECT to_address AS counterparty, 1 AS sent, 0 AS received, value, timestamp
			FROM transactions
			WHERE from_address = $1 AND to_address IS NOT NULL
			UNION ALL
			SELECT from_address, 0, 1, value, timestamp
			FROM transactions
			WHERE to_address = $1
		),
		top AS (
			SELECT counterparty,
			       SUM(sent) AS sent_count,
			       SUM(received) AS received_count,
			       COUNT(*) AS total_count,
			       COALESCE(SUM(value), 0)::text AS total_value,
			       MAX(timestamp) AS last_seen
			FROM related
			GROUP BY counterparty
			ORDER BY total_count DESC, last_seen DESC
			LIMIT $2
		)
		SELECT
			top.counterparty,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			address_risk_level(top.counterparty),
			COALESCE(ac.is_contract, FALSE),
			top.sent_count, top.received_count, top.total_count, top.total_value, top.last_seen
		FROM top
		LEFT JOIN accounts ac ON ac.address = top.counterparty
		LEFT JOIN known_entities ke ON ke.address = top.counterparty
		ORDER BY top.total_count DESC, top.last_seen DESC
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying counterparties for %s: %w", address, err)
	}
	defer rows.Close()

	counterparties := make([]*models.CounterpartyActivity, 0)
	for rows.Next() {
		c := &models.CounterpartyActivity{}
		if err := rows.Scan(&c.Address, &c.EntityName, &c.EntityType, &c.RiskLevel, &c.IsContract,
			&c.SentCount, &c.ReceivedCount, &c.TotalCount, &c.TotalValue, &c.LastSeen); err != nil {
			return nil, fmt.Errorf("scanning counterparty for %s: %w", address, err)
		}
		if c.EntityType == "" {
			c.EntityType = defaultEntityType(c.IsContract)
		}
		counterparties = append(counterparties, c)
	}
	return counterparties, rows.Err()
}

// ContractDetail returns the contract dossier for an address.
func (p *Postgres) ContractDetail(ctx context.Context, address string) (*models.ContractDetail, error) {
	address = NormalizeAddress(address)

	detail := &models.ContractDetail{}
	var bytecodeHex string
	err := p.pool.QueryRow(ctx, `
		SELECT
			a.address,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			address_risk_level(a.address),
			COALESCE(cv.flagged, FALSE),
			COALESCE(OCTET_LENGTH(cv.bytecode), 0),
			ENCODE(COALESCE(cv.bytecode, '\x'::bytea), 'hex'),
			COALESCE(cv.skeleton_hash, ''),
			CASE WHEN cv.skeleton_hash IS NULL THEN 0
			     ELSE (SELECT COUNT(*) FROM contract_vectors c2 WHERE c2.skeleton_hash = cv.skeleton_hash)
			END,
			(SELECT COUNT(*) FROM transactions t WHERE t.to_address = a.address),
			a.first_seen,
			a.last_seen,
			cv.embedded_at
		FROM accounts a
		LEFT JOIN contract_vectors cv ON cv.address = a.address
		LEFT JOIN known_entities ke ON ke.address = a.address
		WHERE a.address = $1 AND a.is_contract
	`, address).Scan(
		&detail.Address, &detail.EntityName, &detail.EntityType, &detail.RiskLevel,
		&detail.Flagged, &detail.BytecodeSize, &bytecodeHex, &detail.SkeletonHash,
		&detail.CloneFamilySize, &detail.TransactionCount,
		&detail.FirstSeen, &detail.LastSeen, &detail.EmbeddedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "contract", ID: address}
		}
		return nil, fmt.Errorf("querying contract detail %s: %w", address, err)
	}

	if detail.EntityType == "" {
		detail.EntityType = "contract"
	}
	detail.Bytecode = "0x" + bytecodeHex
	return detail, nil
}

// RecentContracts returns recently active contracts with clone-family size.
func (p *Postgres) RecentContracts(ctx context.Context, limit int) ([]*models.ContractSummary, error) {
	rows, err := p.pool.Query(ctx, `
		WITH recent AS (
			SELECT address, first_seen, last_seen
			FROM accounts
			WHERE is_contract
			ORDER BY last_seen DESC
			LIMIT $1
		)
		SELECT
			r.address,
			COALESCE(ke.name, ''),
			address_risk_level(r.address),
			COALESCE(cv.flagged, FALSE),
			COALESCE(OCTET_LENGTH(cv.bytecode), 0),
			CASE WHEN cv.skeleton_hash IS NULL THEN 0
			     ELSE (SELECT COUNT(*) FROM contract_vectors c2 WHERE c2.skeleton_hash = cv.skeleton_hash)
			END,
			r.first_seen,
			r.last_seen
		FROM recent r
		LEFT JOIN contract_vectors cv ON cv.address = r.address
		LEFT JOIN known_entities ke ON ke.address = r.address
		ORDER BY r.last_seen DESC
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent contracts: %w", err)
	}
	defer rows.Close()

	contracts := make([]*models.ContractSummary, 0)
	for rows.Next() {
		c := &models.ContractSummary{}
		if err := rows.Scan(&c.Address, &c.EntityName, &c.RiskLevel, &c.Flagged, &c.BytecodeSize,
			&c.CloneFamilySize, &c.FirstSeen, &c.LastSeen); err != nil {
			return nil, fmt.Errorf("scanning recent contract: %w", err)
		}
		contracts = append(contracts, c)
	}
	return contracts, rows.Err()
}

// KnownEntitiesByAddresses loads curated labels for a set of addresses.
func (p *Postgres) KnownEntitiesByAddresses(ctx context.Context, addresses []string) (map[string]*models.KnownEntity, error) {
	normalized := normalizeAddressList(addresses)
	if len(normalized) == 0 {
		return map[string]*models.KnownEntity{}, nil
	}

	rows, err := p.pool.Query(ctx, `
		SELECT address, name, entity_type, risk_level, is_hub, source, updated_at
		FROM known_entities
		WHERE address = ANY($1)
	`, normalized)
	if err != nil {
		return nil, fmt.Errorf("querying known entities: %w", err)
	}
	defer rows.Close()

	entities := make(map[string]*models.KnownEntity, len(normalized))
	for rows.Next() {
		e := &models.KnownEntity{}
		if err := rows.Scan(&e.Address, &e.Name, &e.EntityType, &e.RiskLevel, &e.IsHub, &e.Source, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scanning known entity: %w", err)
		}
		entities[e.Address] = e
	}
	return entities, rows.Err()
}

// AddressRiskByAddresses returns the combined risk level for each address.
func (p *Postgres) AddressRiskByAddresses(ctx context.Context, addresses []string) (map[string]string, error) {
	normalized := normalizeAddressList(addresses)
	if len(normalized) == 0 {
		return map[string]string{}, nil
	}

	rows, err := p.pool.Query(ctx, `SELECT address, risk_level FROM address_risk WHERE address = ANY($1)`, normalized)
	if err != nil {
		return nil, fmt.Errorf("querying address risk levels: %w", err)
	}
	defer rows.Close()

	risk := make(map[string]string, len(normalized))
	for rows.Next() {
		var address, level string
		if err := rows.Scan(&address, &level); err != nil {
			return nil, fmt.Errorf("scanning address risk level: %w", err)
		}
		risk[address] = level
	}
	return risk, rows.Err()
}

// UpsertKnownEntity records an investigator's label for an address.
func (p *Postgres) UpsertKnownEntity(ctx context.Context, entity *models.KnownEntity) (*models.KnownEntity, error) {
	address := NormalizeAddress(entity.Address)
	saved := &models.KnownEntity{}

	err := p.withTx(ctx, func(dbTx pgx.Tx) error {
		if _, err := dbTx.Exec(ctx, upsertAccountsSQL, []string{address}, time.Now().UTC()); err != nil {
			return fmt.Errorf("upserting labelled account %s: %w", address, err)
		}
		return dbTx.QueryRow(ctx, `
			INSERT INTO known_entities (address, name, entity_type, risk_level, is_hub, source, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'manual', NOW())
			ON CONFLICT (address) DO UPDATE
			    SET name = EXCLUDED.name, entity_type = EXCLUDED.entity_type,
			        risk_level = EXCLUDED.risk_level, is_hub = EXCLUDED.is_hub,
			        source = 'manual', updated_at = NOW()
			RETURNING address, name, entity_type, risk_level, is_hub, source, updated_at
		`, address, entity.Name, entity.EntityType, entity.RiskLevel, entity.IsHub).Scan(
			&saved.Address, &saved.Name, &saved.EntityType, &saved.RiskLevel, &saved.IsHub, &saved.Source, &saved.UpdatedAt,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("saving label for %s: %w", address, err)
	}
	return saved, nil
}

// SeedKnownEntities inserts a curated starter set of labelled addresses.
// Labels an investigator edited (source 'manual') are never overwritten.
func (p *Postgres) SeedKnownEntities(ctx context.Context) (int, error) {
	seeded := 0

	for _, entity := range builtinKnownEntities {
		address := NormalizeAddress(entity.Address)
		if address == "" {
			continue
		}

		if _, err := p.pool.Exec(ctx, `
			INSERT INTO accounts (address, is_contract, first_seen, last_seen)
			VALUES ($1, $2, NOW(), NOW())
			ON CONFLICT (address) DO UPDATE
			SET is_contract = accounts.is_contract OR EXCLUDED.is_contract
		`, address, entity.IsContract); err != nil {
			return seeded, fmt.Errorf("upserting seeded account %s: %w", address, err)
		}

		tag, err := p.pool.Exec(ctx, `
			INSERT INTO known_entities (address, name, entity_type, risk_level, is_hub, source, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'seed', NOW())
			ON CONFLICT (address) DO UPDATE
			SET name = EXCLUDED.name,
			    entity_type = EXCLUDED.entity_type,
			    risk_level = EXCLUDED.risk_level,
			    is_hub = EXCLUDED.is_hub,
			    source = EXCLUDED.source,
			    updated_at = NOW()
			WHERE known_entities.source = 'seed'
			  AND (known_entities.name, known_entities.entity_type, known_entities.risk_level, known_entities.is_hub)
			      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.entity_type, EXCLUDED.risk_level, EXCLUDED.is_hub)
		`, address, entity.Name, entity.EntityType, entity.RiskLevel, entity.IsHub)
		if err != nil {
			return seeded, fmt.Errorf("upserting known entity %s: %w", address, err)
		}
		seeded += int(tag.RowsAffected())
	}

	return seeded, nil
}

// ---------------------------------------------------------------------------
// Dashboard statistics
// ---------------------------------------------------------------------------

// ExactCounts runs the full-table counts. They get slower as tables grow, so the API
// refreshes them every 30 seconds and adds LiveCounts deltas in between.
type ExactCounts struct {
	AsOf               time.Time
	TransactionCount   int64
	AccountCount       int64
	ContractCount      int64
	TokenTransferCount int64
	BlockCount         int64
	DoneJobs           int64
	FirstTransactionAt *time.Time
	Chain              models.ChainStatus
}

func (p *Postgres) ExactCounts(ctx context.Context) (*ExactCounts, error) {
	c := &ExactCounts{}
	err := p.pool.QueryRow(ctx, `
		SELECT
			clock_timestamp(),
			(SELECT COUNT(*) FROM accounts),
			(SELECT COUNT(*) FROM accounts WHERE is_contract),
			(SELECT COUNT(*) FROM token_transfers),
			(SELECT COUNT(*) FROM blocks),
			(SELECT COUNT(*) FROM enrichment_jobs WHERE status = 'done'),
			(SELECT MIN(timestamp) FROM transactions),
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status = 'mined'),
			COUNT(*) FILTER (WHERE status = 'replaced'),
			COUNT(*) FILTER (WHERE status = 'dropped')
		FROM transactions
	`).Scan(
		&c.AsOf, &c.AccountCount, &c.ContractCount, &c.TokenTransferCount, &c.BlockCount,
		&c.DoneJobs, &c.FirstTransactionAt, &c.TransactionCount,
		&c.Chain.Pending, &c.Chain.Mined, &c.Chain.Replaced, &c.Chain.Dropped,
	)
	if err != nil {
		return nil, fmt.Errorf("querying exact counts: %w", err)
	}
	c.Chain.AsOf = c.AsOf
	return c, nil
}

// LiveCounts are cheap, index-backed figures refreshed every stream tick.
type LiveCounts struct {
	NewTransactionsSince int64
	PendingCount         int64
	FlagCount            int64
	HighFlagCount24h     int64
	LatestBlock          *uint64
	LatestBlockAt        *time.Time
	LatestTransactionAt  *time.Time
}

func (p *Postgres) LiveCounts(ctx context.Context, since time.Time) (*LiveCounts, error) {
	c := &LiveCounts{}
	var latestBlock *int64
	err := p.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM transactions WHERE timestamp > $1),
			(SELECT COUNT(*) FROM transactions WHERE status = 'pending'),
			(SELECT COUNT(*) FROM forensic_flags),
			(SELECT COUNT(*) FROM forensic_flags WHERE severity = 'high' AND detected_at >= NOW() - INTERVAL '24 hours'),
			(SELECT MAX(number) FROM blocks),
			(SELECT mined_at FROM blocks ORDER BY number DESC LIMIT 1),
			(SELECT MAX(timestamp) FROM transactions)
	`, since).Scan(
		&c.NewTransactionsSince, &c.PendingCount, &c.FlagCount, &c.HighFlagCount24h,
		&latestBlock, &c.LatestBlockAt, &c.LatestTransactionAt,
	)
	if err != nil {
		return nil, fmt.Errorf("querying live counts: %w", err)
	}
	if latestBlock != nil {
		v := uint64(*latestBlock)
		c.LatestBlock = &v
	}
	return c, nil
}

// EnrichmentStatus reports the open part of the queue using the partial index.
func (p *Postgres) EnrichmentStatus(ctx context.Context) (*models.EnrichmentStatus, error) {
	s := &models.EnrichmentStatus{}
	err := p.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status = 'processing'),
			COUNT(*) FILTER (WHERE status = 'failed'),
			COUNT(*) FILTER (WHERE status = 'pending' AND attempts > 0),
			MIN(available_at) FILTER (WHERE status = 'pending')
		FROM enrichment_jobs
		WHERE status IN ('pending', 'processing', 'failed')
	`).Scan(&s.Pending, &s.Processing, &s.Failed, &s.Retrying, &s.OldestPendingAt)
	if err != nil {
		return nil, fmt.Errorf("querying enrichment status: %w", err)
	}
	return s, nil
}

// TopAddresses returns the most active addresses over all observed transactions.
func (p *Postgres) TopAddresses(ctx context.Context, limit int) ([]*models.AddressActivity, error) {
	rows, err := p.pool.Query(ctx, `
		WITH sent AS (
			SELECT from_address AS address, COUNT(*) AS n, COALESCE(SUM(value), 0) AS total
			FROM transactions GROUP BY from_address
		),
		received AS (
			SELECT to_address AS address, COUNT(*) AS n, COALESCE(SUM(value), 0) AS total
			FROM transactions WHERE to_address IS NOT NULL GROUP BY to_address
		),
		top AS (
			SELECT COALESCE(s.address, r.address) AS address,
			       COALESCE(s.n, 0) AS sent_count, COALESCE(r.n, 0) AS received_count,
			       COALESCE(s.total, 0)::text AS total_sent, COALESCE(r.total, 0)::text AS total_received
			FROM sent s FULL OUTER JOIN received r ON r.address = s.address
			ORDER BY COALESCE(s.n, 0) + COALESCE(r.n, 0) DESC
			LIMIT $1
		)
		SELECT top.address, COALESCE(ke.name, ''), a.is_contract, a.first_seen, a.last_seen,
		       top.sent_count, top.received_count, top.sent_count + top.received_count,
		       top.total_sent, top.total_received
		FROM top
		JOIN accounts a ON a.address = top.address
		LEFT JOIN known_entities ke ON ke.address = top.address
		ORDER BY top.sent_count + top.received_count DESC
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying top addresses: %w", err)
	}
	defer rows.Close()

	addresses := make([]*models.AddressActivity, 0)
	for rows.Next() {
		a := &models.AddressActivity{}
		if err := rows.Scan(&a.Address, &a.EntityName, &a.IsContract, &a.FirstSeen, &a.LastSeen,
			&a.SentCount, &a.ReceivedCount, &a.TotalCount, &a.TotalSent, &a.TotalReceived); err != nil {
			return nil, fmt.Errorf("scanning top address: %w", err)
		}
		addresses = append(addresses, a)
	}
	return addresses, rows.Err()
}

// RefreshNetworkHourly recomputes the hourly rollup for every hour from `since` onward.
func (p *Postgres) RefreshNetworkHourly(ctx context.Context, since time.Time) (int64, error) {
	tag, err := p.pool.Exec(ctx, `
		WITH windowed AS (
			SELECT date_trunc('hour', timestamp) AS bucket, gas_price, value, from_address, to_address
			FROM transactions
			WHERE timestamp >= date_trunc('hour', $1::timestamptz)
		),
		bucketed AS (
			SELECT bucket, COUNT(*) AS transaction_count,
			       COALESCE(ROUND(AVG(gas_price)), 0) AS avg_gas_price,
			       COALESCE(SUM(value), 0) AS total_value
			FROM windowed
			GROUP BY bucket
		),
		participants AS (
			SELECT bucket, COUNT(DISTINCT address) AS unique_addresses
			FROM (
				SELECT bucket, from_address AS address FROM windowed
				UNION ALL
				SELECT bucket, to_address FROM windowed WHERE to_address IS NOT NULL
			) all_addresses
			GROUP BY bucket
		)
		INSERT INTO network_hourly (bucket, transaction_count, unique_addresses, avg_gas_price, total_value, refreshed_at)
		SELECT b.bucket, b.transaction_count, COALESCE(p.unique_addresses, 0), b.avg_gas_price, b.total_value, NOW()
		FROM bucketed b
		LEFT JOIN participants p USING (bucket)
		ON CONFLICT (bucket) DO UPDATE
		    SET transaction_count = EXCLUDED.transaction_count,
		        unique_addresses = EXCLUDED.unique_addresses,
		        avg_gas_price = EXCLUDED.avg_gas_price,
		        total_value = EXCLUDED.total_value,
		        refreshed_at = NOW()
	`, since)
	if err != nil {
		return 0, fmt.Errorf("refreshing network rollup: %w", err)
	}
	return tag.RowsAffected(), nil
}

// NetworkMetrics returns one point per hour for the last `hours` hours, with empty
// hours filled in as zeros so charts are drawn to time scale.
func (p *Postgres) NetworkMetrics(ctx context.Context, hours int) ([]*models.NetworkMetricPoint, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT s.bucket,
		       COALESCE(n.transaction_count, 0),
		       COALESCE(n.unique_addresses, 0),
		       COALESCE(n.avg_gas_price, 0)::text,
		       COALESCE(n.total_value, 0)::text
		FROM generate_series(
			date_trunc('hour', NOW()) - make_interval(hours => $1 - 1),
			date_trunc('hour', NOW()),
			INTERVAL '1 hour'
		) AS s(bucket)
		LEFT JOIN network_hourly n ON n.bucket = s.bucket
		ORDER BY s.bucket
	`, hours)
	if err != nil {
		return nil, fmt.Errorf("querying network metrics: %w", err)
	}
	defer rows.Close()

	points := make([]*models.NetworkMetricPoint, 0, hours)
	for rows.Next() {
		pt := &models.NetworkMetricPoint{}
		if err := rows.Scan(&pt.Bucket, &pt.TransactionCount, &pt.UniqueAddresses, &pt.AvgGasPrice, &pt.TotalValue); err != nil {
			return nil, fmt.Errorf("scanning network metric: %w", err)
		}
		points = append(points, pt)
	}
	return points, rows.Err()
}

// AddressVelocity returns hourly activity for an address, zero-filled.
func (p *Postgres) AddressVelocity(ctx context.Context, address string, hours int) ([]*models.AccountVelocityPoint, error) {
	address = NormalizeAddress(address)

	rows, err := p.pool.Query(ctx, `
		WITH window_start AS (
			SELECT date_trunc('hour', NOW()) - make_interval(hours => $2 - 1) AS start_at
		),
		related AS (
			SELECT date_trunc('hour', timestamp) AS bucket, 'out' AS direction, value
			FROM transactions, window_start
			WHERE from_address = $1 AND timestamp >= start_at
			UNION ALL
			SELECT date_trunc('hour', timestamp), 'in', value
			FROM transactions, window_start
			WHERE to_address = $1 AND timestamp >= start_at
		),
		agg AS (
			SELECT bucket,
			       COUNT(*) FILTER (WHERE direction = 'out') AS sent_count,
			       COUNT(*) FILTER (WHERE direction = 'in') AS received_count,
			       COUNT(*) AS total_count,
			       COALESCE(SUM(value) FILTER (WHERE direction = 'out'), 0) AS sent_value,
			       COALESCE(SUM(value) FILTER (WHERE direction = 'in'), 0) AS received_value,
			       COALESCE(SUM(value), 0) AS total_value
			FROM related
			GROUP BY bucket
		)
		SELECT s.bucket,
		       COALESCE(agg.sent_count, 0), COALESCE(agg.received_count, 0), COALESCE(agg.total_count, 0),
		       COALESCE(agg.sent_value, 0)::text, COALESCE(agg.received_value, 0)::text, COALESCE(agg.total_value, 0)::text
		FROM window_start,
		     generate_series(window_start.start_at, date_trunc('hour', NOW()), INTERVAL '1 hour') AS s(bucket)
		LEFT JOIN agg ON agg.bucket = s.bucket
		ORDER BY s.bucket
	`, address, hours)
	if err != nil {
		return nil, fmt.Errorf("querying address velocity for %s: %w", address, err)
	}
	defer rows.Close()

	points := make([]*models.AccountVelocityPoint, 0, hours)
	for rows.Next() {
		pt := &models.AccountVelocityPoint{}
		if err := rows.Scan(&pt.Bucket, &pt.SentCount, &pt.ReceivedCount, &pt.TotalCount,
			&pt.SentValue, &pt.ReceivedValue, &pt.TotalValue); err != nil {
			return nil, fmt.Errorf("scanning velocity point for %s: %w", address, err)
		}
		points = append(points, pt)
	}
	return points, rows.Err()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func defaultEntityType(isContract bool) string {
	if isContract {
		return "contract"
	}
	return "wallet"
}

// nullableString converts an empty string to nil for nullable SQL fields.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func normalizeAddressList(addresses []string) []string {
	seen := make(map[string]struct{}, len(addresses))
	normalized := make([]string, 0, len(addresses))
	for _, address := range addresses {
		address = NormalizeAddress(address)
		if address == "" {
			continue
		}
		if _, ok := seen[address]; ok {
			continue
		}
		seen[address] = struct{}{}
		normalized = append(normalized, address)
	}
	return normalized
}

// RunMigrations applies pending schema migrations from an embedded filesystem, so
// the binary no longer depends on the working directory it is started from.
func RunMigrations(migrations fs.FS, connStr string) error {
	source, err := iofs.New(migrations, "migrations")
	if err != nil {
		return fmt.Errorf("opening embedded migrations: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", source, connStr)
	if err != nil {
		return fmt.Errorf("creating migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("running migrations: %w", err)
	}
	return nil
}
