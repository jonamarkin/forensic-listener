package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"forensic-listener/models"
)

// Postgres implements Store with a pgx connection pool.
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

	cfg.MaxConns = 20
	cfg.MinConns = 5
	cfg.MaxConnLifetime = 1 * time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

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

func (p *Postgres) Close() {
	p.pool.Close()
}

// UpsertAccount inserts an account or updates last_seen on conflict.
// Called before every transaction insert to satisfy the foreign key constraint.
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
		SELECT address, balance, is_contract, first_seen, last_seen
		FROM accounts
		WHERE address = $1
	`, address).Scan(
		&acc.Address, &acc.Balance, &acc.IsContract,
		&acc.FirstSeen, &acc.LastSeen,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "account", ID: address}
		}
		return nil, fmt.Errorf("querying account %s: %w", address, err)
	}
	return acc, nil
}

// GetAccountProfile returns a richer dossier for a single address.
func (p *Postgres) GetAccountProfile(ctx context.Context, address string) (*models.AccountProfile, error) {
	address = NormalizeAddress(address)

	profile := &models.AccountProfile{}
	err := p.pool.QueryRow(ctx, `
		WITH sent AS (
			SELECT COUNT(*) AS sent_count,
			       COALESCE(SUM(value), 0)::text AS total_sent
			FROM transactions
			WHERE from_address = $1
		),
		received AS (
			SELECT COUNT(*) AS received_count,
			       COALESCE(SUM(value), 0)::text AS total_received
			FROM transactions
			WHERE to_address = $1
		),
		flags AS (
			SELECT COUNT(*) AS flag_count,
			       COUNT(*) FILTER (WHERE severity = 'high') AS high_severity_flag_count,
			       CASE MAX(
			           CASE severity
			               WHEN 'high' THEN 3
			               WHEN 'medium' THEN 2
			               WHEN 'low' THEN 1
			               ELSE 0
			           END
			       )
			           WHEN 3 THEN 'high'
			           WHEN 2 THEN 'medium'
			           WHEN 1 THEN 'low'
			           ELSE 'none'
			       END AS risk_level
			FROM forensic_flags
			WHERE address = $1
		)
		SELECT
			a.address,
			a.balance::text,
			a.is_contract,
			a.first_seen,
			a.last_seen,
			COALESCE(s.sent_count, 0),
			COALESCE(r.received_count, 0),
			COALESCE(s.sent_count, 0) + COALESCE(r.received_count, 0) AS total_count,
			COALESCE(s.total_sent, '0'),
			COALESCE(r.total_received, '0'),
			COALESCE(f.flag_count, 0),
			COALESCE(f.high_severity_flag_count, 0),
			COALESCE(NULLIF(ke.risk_level, ''), f.risk_level, 'none') AS risk_level,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			COALESCE(ke.is_hub, FALSE)
		FROM accounts a
		LEFT JOIN sent s ON TRUE
		LEFT JOIN received r ON TRUE
		LEFT JOIN flags f ON TRUE
		LEFT JOIN known_entities ke ON ke.address = a.address
		WHERE a.address = $1
	`, address).Scan(
		&profile.Address,
		&profile.Balance,
		&profile.IsContract,
		&profile.FirstSeen,
		&profile.LastSeen,
		&profile.SentCount,
		&profile.ReceivedCount,
		&profile.TotalCount,
		&profile.TotalSent,
		&profile.TotalReceived,
		&profile.FlagCount,
		&profile.HighSeverityFlagCount,
		&profile.RiskLevel,
		&profile.EntityName,
		&profile.EntityType,
		&profile.IsHub,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "account", ID: address}
		}
		return nil, fmt.Errorf("querying account profile %s: %w", address, err)
	}

	if profile.EntityType == "" {
		if profile.IsContract {
			profile.EntityType = "contract"
		} else {
			profile.EntityType = "wallet"
		}
	}
	if profile.RiskLevel == "" {
		profile.RiskLevel = "none"
	}

	counterparties, err := p.AccountCounterparties(ctx, address, 8)
	if err != nil {
		return nil, err
	}
	recentTransactions, err := p.RecentTransactionsForAddress(ctx, address, 8)
	if err != nil {
		return nil, err
	}
	profile.Counterparties = counterparties
	profile.RecentTransactions = recentTransactions

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
			SELECT to_address AS counterparty,
			       1::bigint AS sent_count,
			       0::bigint AS received_count,
			       value,
			       timestamp
			FROM transactions
			WHERE from_address = $1
			  AND to_address IS NOT NULL
			UNION ALL
			SELECT from_address AS counterparty,
			       0::bigint AS sent_count,
			       1::bigint AS received_count,
			       value,
			       timestamp
			FROM transactions
			WHERE to_address = $1
		),
		aggregated AS (
			SELECT counterparty,
			       SUM(sent_count) AS sent_count,
			       SUM(received_count) AS received_count,
			       COUNT(*) AS total_count,
			       COALESCE(SUM(value), 0)::text AS total_value,
			       MAX(timestamp) AS last_seen
			FROM related
			GROUP BY counterparty
		),
		risk AS (
			SELECT address,
			       CASE MAX(
			           CASE severity
			               WHEN 'high' THEN 3
			               WHEN 'medium' THEN 2
			               WHEN 'low' THEN 1
			               ELSE 0
			           END
			       )
			           WHEN 3 THEN 'high'
			           WHEN 2 THEN 'medium'
			           WHEN 1 THEN 'low'
			           ELSE 'none'
			       END AS risk_level
			FROM forensic_flags
			GROUP BY address
		)
		SELECT
			a.counterparty,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			COALESCE(NULLIF(ke.risk_level, ''), risk.risk_level, 'none') AS risk_level,
			COALESCE(ac.is_contract, FALSE),
			a.sent_count,
			a.received_count,
			a.total_count,
			a.total_value,
			a.last_seen
		FROM aggregated a
		LEFT JOIN accounts ac ON ac.address = a.counterparty
		LEFT JOIN known_entities ke ON ke.address = a.counterparty
		LEFT JOIN risk ON risk.address = a.counterparty
		ORDER BY a.total_count DESC, a.last_seen DESC
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying counterparties for %s: %w", address, err)
	}
	defer rows.Close()

	counterparties := make([]*models.CounterpartyActivity, 0)
	for rows.Next() {
		counterparty := &models.CounterpartyActivity{}
		if err := rows.Scan(
			&counterparty.Address,
			&counterparty.EntityName,
			&counterparty.EntityType,
			&counterparty.RiskLevel,
			&counterparty.IsContract,
			&counterparty.SentCount,
			&counterparty.ReceivedCount,
			&counterparty.TotalCount,
			&counterparty.TotalValue,
			&counterparty.LastSeen,
		); err != nil {
			return nil, fmt.Errorf("scanning counterparty for %s: %w", address, err)
		}
		if counterparty.EntityType == "" {
			if counterparty.IsContract {
				counterparty.EntityType = "contract"
			} else {
				counterparty.EntityType = "wallet"
			}
		}
		if counterparty.RiskLevel == "" {
			counterparty.RiskLevel = "none"
		}
		counterparties = append(counterparties, counterparty)
	}

	return counterparties, rows.Err()
}

// RecentTransactionsForAddress returns the latest transactions touching an address.
func (p *Postgres) RecentTransactionsForAddress(ctx context.Context, address string, limit int) ([]*models.Transaction, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 8
	}

	rows, err := p.pool.Query(ctx, `
		SELECT hash, from_address, to_address, value, gas,
		       gas_price, nonce, block_number, timestamp
		FROM transactions
		WHERE from_address = $1 OR to_address = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent transactions for %s: %w", address, err)
	}
	defer rows.Close()

	return scanTransactions(rows)
}

// ContractDetail returns the current contract dossier for an address.
func (p *Postgres) ContractDetail(ctx context.Context, address string) (*models.ContractDetail, error) {
	address = NormalizeAddress(address)

	detail := &models.ContractDetail{}
	var bytecodeHex string
	var abi []byte
	err := p.pool.QueryRow(ctx, `
		WITH risk AS (
			SELECT address,
			       CASE MAX(
			           CASE severity
			               WHEN 'high' THEN 3
			               WHEN 'medium' THEN 2
			               WHEN 'low' THEN 1
			               ELSE 0
			           END
			       )
			           WHEN 3 THEN 'high'
			           WHEN 2 THEN 'medium'
			           WHEN 1 THEN 'low'
			           ELSE 'none'
			       END AS risk_level
			FROM forensic_flags
			GROUP BY address
		)
		SELECT
			a.address,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			COALESCE(NULLIF(ke.risk_level, ''), risk.risk_level, 'none') AS risk_level,
			COALESCE(cv.flagged, FALSE),
			COALESCE(OCTET_LENGTH(cv.bytecode), 0),
			ENCODE(COALESCE(cv.bytecode, '\x'::bytea), 'hex'),
			a.first_seen,
			a.last_seen,
			COALESCE(cm.verified, FALSE),
			COALESCE(cm.compiler_version, ''),
			cm.abi,
			COALESCE(cm.source_code, ''),
			COALESCE(cm.decompiled_code, '')
		FROM accounts a
		LEFT JOIN contract_vectors cv ON cv.address = a.address
		LEFT JOIN contract_metadata cm ON cm.address = a.address
		LEFT JOIN known_entities ke ON ke.address = a.address
		LEFT JOIN risk ON risk.address = a.address
		WHERE a.address = $1
		  AND a.is_contract = TRUE
	`, address).Scan(
		&detail.Address,
		&detail.EntityName,
		&detail.EntityType,
		&detail.RiskLevel,
		&detail.Flagged,
		&detail.BytecodeSize,
		&bytecodeHex,
		&detail.FirstSeen,
		&detail.LastSeen,
		&detail.Verified,
		&detail.CompilerVersion,
		&abi,
		&detail.SourceCode,
		&detail.DecompiledCode,
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
	if detail.RiskLevel == "" {
		detail.RiskLevel = "none"
	}
	detail.Bytecode = "0x" + bytecodeHex
	if len(abi) > 0 {
		detail.ABI = abi
	}

	return detail, nil
}

// NetworkMetrics aggregates live transaction volume and gas posture over time.
func (p *Postgres) NetworkMetrics(ctx context.Context, bucket string, hours int) ([]*models.NetworkMetricPoint, error) {
	rows, err := p.pool.Query(ctx, `
		WITH windowed AS (
			SELECT date_trunc($1, timestamp) AS bucket,
			       hash,
			       gas_price,
			       value,
			       from_address,
			       to_address
			FROM transactions
			WHERE timestamp >= NOW() - ($2 * INTERVAL '1 hour')
		),
		bucketed AS (
			SELECT bucket,
			       COUNT(*) AS transaction_count,
			       COALESCE(AVG(gas_price), 0)::text AS avg_gas_price,
			       COALESCE(SUM(value), 0)::text AS total_value
			FROM windowed
			GROUP BY bucket
		),
		participants AS (
			SELECT bucket, COUNT(DISTINCT address) AS unique_addresses
			FROM (
				SELECT bucket, from_address AS address FROM windowed
				UNION ALL
				SELECT bucket, to_address AS address FROM windowed WHERE to_address IS NOT NULL
			) all_addresses
			GROUP BY bucket
		)
		SELECT
			b.bucket,
			b.transaction_count,
			COALESCE(p.unique_addresses, 0),
			b.avg_gas_price,
			b.total_value
		FROM bucketed b
		LEFT JOIN participants p USING (bucket)
		ORDER BY b.bucket ASC
	`, bucket, hours)
	if err != nil {
		return nil, fmt.Errorf("querying network metrics: %w", err)
	}
	defer rows.Close()

	points := make([]*models.NetworkMetricPoint, 0)
	for rows.Next() {
		point := &models.NetworkMetricPoint{}
		if err := rows.Scan(
			&point.Bucket,
			&point.TransactionCount,
			&point.UniqueAddresses,
			&point.AvgGasPrice,
			&point.TotalValue,
		); err != nil {
			return nil, fmt.Errorf("scanning network metric: %w", err)
		}
		points = append(points, point)
	}

	return points, rows.Err()
}

// AddressVelocity charts address activity across recent time buckets.
func (p *Postgres) AddressVelocity(ctx context.Context, address, bucket string, hours int) ([]*models.AccountVelocityPoint, error) {
	address = NormalizeAddress(address)

	rows, err := p.pool.Query(ctx, `
		WITH related AS (
			SELECT date_trunc($2, timestamp) AS bucket,
			       'out'::text AS direction,
			       value
			FROM transactions
			WHERE from_address = $1
			  AND timestamp >= NOW() - ($3 * INTERVAL '1 hour')
			UNION ALL
			SELECT date_trunc($2, timestamp) AS bucket,
			       'in'::text AS direction,
			       value
			FROM transactions
			WHERE to_address = $1
			  AND timestamp >= NOW() - ($3 * INTERVAL '1 hour')
		)
		SELECT
			bucket,
			COUNT(*) FILTER (WHERE direction = 'out') AS sent_count,
			COUNT(*) FILTER (WHERE direction = 'in') AS received_count,
			COUNT(*) AS total_count,
			COALESCE(SUM(value) FILTER (WHERE direction = 'out'), 0)::text AS sent_value,
			COALESCE(SUM(value) FILTER (WHERE direction = 'in'), 0)::text AS received_value,
			COALESCE(SUM(value), 0)::text AS total_value
		FROM related
		GROUP BY bucket
		ORDER BY bucket ASC
	`, address, bucket, hours)
	if err != nil {
		return nil, fmt.Errorf("querying address velocity for %s: %w", address, err)
	}
	defer rows.Close()

	points := make([]*models.AccountVelocityPoint, 0)
	for rows.Next() {
		point := &models.AccountVelocityPoint{}
		if err := rows.Scan(
			&point.Bucket,
			&point.SentCount,
			&point.ReceivedCount,
			&point.TotalCount,
			&point.SentValue,
			&point.ReceivedValue,
			&point.TotalValue,
		); err != nil {
			return nil, fmt.Errorf("scanning velocity point for %s: %w", address, err)
		}
		points = append(points, point)
	}

	return points, rows.Err()
}

// KnownEntitiesByAddresses loads any curated metadata attached to a set of addresses.
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
		entity := &models.KnownEntity{}
		if err := rows.Scan(
			&entity.Address,
			&entity.Name,
			&entity.EntityType,
			&entity.RiskLevel,
			&entity.IsHub,
			&entity.Source,
			&entity.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning known entity: %w", err)
		}
		entities[entity.Address] = entity
	}

	return entities, rows.Err()
}

// AddressRiskByAddresses returns the highest observed forensic severity for each address.
func (p *Postgres) AddressRiskByAddresses(ctx context.Context, addresses []string) (map[string]string, error) {
	normalized := normalizeAddressList(addresses)
	if len(normalized) == 0 {
		return map[string]string{}, nil
	}

	rows, err := p.pool.Query(ctx, `
		SELECT address,
		       CASE MAX(
		           CASE severity
		               WHEN 'high' THEN 3
		               WHEN 'medium' THEN 2
		               WHEN 'low' THEN 1
		               ELSE 0
		           END
		       )
		           WHEN 3 THEN 'high'
		           WHEN 2 THEN 'medium'
		           WHEN 1 THEN 'low'
		           ELSE 'none'
		       END AS risk_level
		FROM forensic_flags
		WHERE address = ANY($1)
		GROUP BY address
	`, normalized)
	if err != nil {
		return nil, fmt.Errorf("querying address risk levels: %w", err)
	}
	defer rows.Close()

	riskLevels := make(map[string]string, len(normalized))
	for rows.Next() {
		var address string
		var riskLevel string
		if err := rows.Scan(&address, &riskLevel); err != nil {
			return nil, fmt.Errorf("scanning address risk level: %w", err)
		}
		riskLevels[address] = riskLevel
	}

	return riskLevels, rows.Err()
}

// SeedKnownEntities inserts a curated starter set of labeled addresses.
// Existing manual entries are preserved.
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
			SET is_contract = accounts.is_contract OR EXCLUDED.is_contract,
			    last_seen = accounts.last_seen
		`, address, entity.IsContract); err != nil {
			return seeded, fmt.Errorf("upserting seeded account %s: %w", address, err)
		}

		tag, err := p.pool.Exec(ctx, `
			INSERT INTO known_entities (
				address,
				name,
				entity_type,
				risk_level,
				is_hub,
				source,
				updated_at
			)
			VALUES ($1, $2, $3, $4, $5, 'seed', NOW())
			ON CONFLICT (address) DO UPDATE
			SET name = EXCLUDED.name,
			    entity_type = EXCLUDED.entity_type,
			    risk_level = EXCLUDED.risk_level,
			    is_hub = EXCLUDED.is_hub,
			    source = EXCLUDED.source,
			    updated_at = NOW()
			WHERE known_entities.source <> 'manual'
		`, address, entity.Name, entity.EntityType, entity.RiskLevel, entity.IsHub)
		if err != nil {
			return seeded, fmt.Errorf("upserting known entity %s: %w", address, err)
		}
		seeded += int(tag.RowsAffected())
	}

	return seeded, nil
}

// SaveTransaction persists a transaction and its account references atomically.
func (p *Postgres) SaveTransaction(ctx context.Context, tx *models.Transaction) error {
	fromAddress := NormalizeAddress(tx.From)
	toAddress := NormalizeAddress(tx.To)

	dbTx, err := p.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer dbTx.Rollback(ctx)

	if _, err := dbTx.Exec(ctx, `
		INSERT INTO accounts (address, is_contract, first_seen, last_seen)
		VALUES ($1, FALSE, NOW(), NOW())
		ON CONFLICT (address) DO UPDATE SET last_seen = NOW()
	`, fromAddress); err != nil {
		return fmt.Errorf("upserting sender %s: %w", fromAddress, err)
	}

	if toAddress != "" {
		if _, err := dbTx.Exec(ctx, `
			INSERT INTO accounts (address, is_contract, first_seen, last_seen)
			VALUES ($1, FALSE, NOW(), NOW())
			ON CONFLICT (address) DO UPDATE SET last_seen = NOW()
		`, toAddress); err != nil {
			return fmt.Errorf("upserting receiver %s: %w", toAddress, err)
		}
	}

	_, err = dbTx.Exec(ctx, `
		INSERT INTO transactions
		    (hash, from_address, to_address, value, gas,
		     gas_price, nonce, block_number, data, timestamp)
		VALUES
		    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (hash) DO NOTHING
	`,
		tx.Hash, fromAddress, nullableString(toAddress), tx.Value,
		tx.Gas, tx.GasPrice, tx.Nonce,
		tx.BlockNumber, tx.Data, tx.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("inserting transaction %s: %w", tx.Hash, err)
	}

	if toAddress != "" {
		_, err = dbTx.Exec(ctx, `
			INSERT INTO enrichment_jobs (tx_hash, status, available_at, updated_at)
			VALUES ($1, 'pending', NOW(), NOW())
			ON CONFLICT (tx_hash) DO NOTHING
		`, tx.Hash)
		if err != nil {
			return fmt.Errorf("enqueueing enrichment job %s: %w", tx.Hash, err)
		}
	}

	return dbTx.Commit(ctx)
}

// ClaimEnrichmentJob leases the next pending enrichment job and returns its transaction payload.
func (p *Postgres) ClaimEnrichmentJob(ctx context.Context, staleAfter time.Duration) (*models.Transaction, error) {
	staleBefore := time.Now().Add(-staleAfter)
	tx := &models.Transaction{}
	var toAddr *string

	err := p.pool.QueryRow(ctx, `
		WITH candidate AS (
			SELECT tx_hash
			FROM enrichment_jobs
			WHERE available_at <= NOW()
			  AND (
				status = 'pending'
				OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at <= $1)
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
		SELECT t.hash, t.from_address, t.to_address, t.value, t.gas,
		       t.gas_price, t.nonce, t.block_number, t.data, t.timestamp
		FROM claimed c
		JOIN transactions t ON t.hash = c.tx_hash
	`, staleBefore).Scan(
		&tx.Hash, &tx.From, &toAddr, &tx.Value,
		&tx.Gas, &tx.GasPrice, &tx.Nonce,
		&tx.BlockNumber, &tx.Data, &tx.Timestamp,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("claiming enrichment job: %w", err)
	}

	if toAddr != nil {
		tx.To = *toAddr
	}

	return tx, nil
}

func (p *Postgres) MarkEnrichmentDone(ctx context.Context, hash string) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE enrichment_jobs
		SET status = 'done',
		    locked_at = NULL,
		    last_error = NULL,
		    updated_at = NOW()
		WHERE tx_hash = $1
	`, hash)
	if err != nil {
		return fmt.Errorf("marking enrichment job %s done: %w", hash, err)
	}

	return nil
}

func (p *Postgres) MarkEnrichmentFailed(ctx context.Context, hash string, failure error, retryAfter time.Duration) error {
	lastError := ""
	if failure != nil {
		lastError = failure.Error()
	}

	_, err := p.pool.Exec(ctx, `
		UPDATE enrichment_jobs
		SET status = 'pending',
		    locked_at = NULL,
		    last_error = $2,
		    available_at = $3,
		    updated_at = NOW()
		WHERE tx_hash = $1
	`, hash, lastError, time.Now().Add(retryAfter))
	if err != nil {
		return fmt.Errorf("marking enrichment job %s failed: %w", hash, err)
	}

	return nil
}

// RecentTransactions returns the latest N transactions ordered by time.
func (p *Postgres) RecentTransactions(ctx context.Context, limit int) ([]*models.Transaction, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT hash, from_address, to_address, value, gas,
		       gas_price, nonce, block_number, timestamp
		FROM   transactions
		ORDER  BY timestamp DESC
		LIMIT  $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent transactions: %w", err)
	}
	defer rows.Close()

	return scanTransactions(rows)
}

// TransactionByHash retrieves a single transaction by its hash.
func (p *Postgres) TransactionByHash(ctx context.Context, hash string) (*models.Transaction, error) {
	tx := &models.Transaction{}
	var toAddr *string

	err := p.pool.QueryRow(ctx, `
		SELECT hash, from_address, to_address, value, gas,
		       gas_price, nonce, block_number, data, timestamp
		FROM   transactions
		WHERE  hash = $1
	`, hash).Scan(
		&tx.Hash, &tx.From, &toAddr, &tx.Value,
		&tx.Gas, &tx.GasPrice, &tx.Nonce,
		&tx.BlockNumber, &tx.Data, &tx.Timestamp,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "transaction", ID: hash}
		}
		return nil, fmt.Errorf("querying transaction %s: %w", hash, err)
	}

	if toAddr != nil {
		tx.To = *toAddr
	}
	return tx, nil
}

// SaveFlag persists a forensic flag raised by the analysis engine.
func (p *Postgres) SaveFlag(ctx context.Context, flag *models.ForensicFlag) error {
	address := NormalizeAddress(flag.Address)

	_, err := p.pool.Exec(ctx, `
		INSERT INTO forensic_flags
		    (tx_hash, address, flag_type, severity, description, detected_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (tx_hash, address, flag_type) DO NOTHING
	`,
		flag.TxHash, address, flag.FlagType,
		flag.Severity, flag.Description,
	)
	if err != nil {
		return fmt.Errorf("saving forensic flag: %w", err)
	}
	return nil
}

// RecentFlags returns the latest N forensic flags.
func (p *Postgres) RecentFlags(ctx context.Context, limit int) ([]*models.ForensicFlag, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT
			f.id,
			COALESCE(f.tx_hash, ''),
			f.address,
			f.flag_type,
			f.severity,
			COALESCE(f.description, ''),
			f.detected_at
		FROM forensic_flags f
		ORDER  BY detected_at DESC
		LIMIT  $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent flags: %w", err)
	}
	defer rows.Close()

	return scanForensicFlags(rows)
}

// FlagsForTransaction lists all forensic flags attached to a transaction hash.
func (p *Postgres) FlagsForTransaction(ctx context.Context, hash string) ([]*models.ForensicFlag, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT
			f.id,
			COALESCE(f.tx_hash, ''),
			f.address,
			f.flag_type,
			f.severity,
			COALESCE(f.description, ''),
			f.detected_at
		FROM forensic_flags f
		WHERE f.tx_hash = $1
		ORDER BY f.detected_at DESC, f.id DESC
	`, hash)
	if err != nil {
		return nil, fmt.Errorf("querying flags for transaction %s: %w", hash, err)
	}
	defer rows.Close()

	return scanForensicFlags(rows)
}

// OverviewStats returns dashboard summary counters across the primary stores.
func (p *Postgres) OverviewStats(ctx context.Context) (*models.OverviewStats, error) {
	stats := &models.OverviewStats{}

	err := p.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM transactions),
			(SELECT COUNT(*) FROM accounts),
			(SELECT COUNT(*) FROM accounts WHERE is_contract = TRUE),
			(SELECT COUNT(*) FROM forensic_flags),
			(SELECT COUNT(*) FROM enrichment_jobs WHERE status = 'pending'),
			(SELECT COUNT(*) FROM enrichment_jobs WHERE status = 'processing'),
			(SELECT COUNT(*) FROM enrichment_jobs WHERE status = 'done'),
			(SELECT MAX(timestamp) FROM transactions)
	`).Scan(
		&stats.TransactionCount,
		&stats.AccountCount,
		&stats.ContractCount,
		&stats.FlagCount,
		&stats.PendingEnrichment,
		&stats.ProcessingEnrichment,
		&stats.DoneEnrichment,
		&stats.LatestTransactionAt,
	)
	if err != nil {
		return nil, fmt.Errorf("querying overview stats: %w", err)
	}

	return stats, nil
}

// EnrichmentStatus reports backlog and retry state for the durable enrichment queue.
func (p *Postgres) EnrichmentStatus(ctx context.Context) (*models.EnrichmentStatus, error) {
	status := &models.EnrichmentStatus{}

	err := p.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending'),
			COUNT(*) FILTER (WHERE status = 'processing'),
			COUNT(*) FILTER (WHERE status = 'done'),
			COUNT(*) FILTER (WHERE status = 'pending' AND attempts > 0),
			COALESCE(MAX(attempts), 0),
			MIN(available_at) FILTER (WHERE status = 'pending')
		FROM enrichment_jobs
	`).Scan(
		&status.Pending,
		&status.Processing,
		&status.Done,
		&status.Retrying,
		&status.MaxAttempts,
		&status.OldestPendingAt,
	)
	if err != nil {
		return nil, fmt.Errorf("querying enrichment status: %w", err)
	}

	return status, nil
}

// TopAddresses returns the most active addresses across sent and received transfers.
func (p *Postgres) TopAddresses(ctx context.Context, limit int) ([]*models.AddressActivity, error) {
	rows, err := p.pool.Query(ctx, `
		WITH sent AS (
			SELECT from_address AS address,
			       COUNT(*) AS sent_count,
			       COALESCE(SUM(value), 0)::text AS total_sent
			FROM transactions
			GROUP BY from_address
		),
		received AS (
			SELECT to_address AS address,
			       COUNT(*) AS received_count,
			       COALESCE(SUM(value), 0)::text AS total_received
			FROM transactions
			WHERE to_address IS NOT NULL
			GROUP BY to_address
		)
		SELECT
			a.address,
			a.is_contract,
			a.first_seen,
			a.last_seen,
			COALESCE(s.sent_count, 0),
			COALESCE(r.received_count, 0),
			COALESCE(s.sent_count, 0) + COALESCE(r.received_count, 0) AS total_count,
			COALESCE(s.total_sent, '0'),
			COALESCE(r.total_received, '0')
		FROM accounts a
		LEFT JOIN sent s ON s.address = a.address
		LEFT JOIN received r ON r.address = a.address
		WHERE COALESCE(s.sent_count, 0) + COALESCE(r.received_count, 0) > 0
		ORDER BY total_count DESC, a.last_seen DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying top addresses: %w", err)
	}
	defer rows.Close()

	addresses := make([]*models.AddressActivity, 0)
	for rows.Next() {
		address := &models.AddressActivity{}
		if err := rows.Scan(
			&address.Address,
			&address.IsContract,
			&address.FirstSeen,
			&address.LastSeen,
			&address.SentCount,
			&address.ReceivedCount,
			&address.TotalCount,
			&address.TotalSent,
			&address.TotalReceived,
		); err != nil {
			return nil, fmt.Errorf("scanning top address: %w", err)
		}
		addresses = append(addresses, address)
	}

	return addresses, rows.Err()
}

// RecentContracts returns recently-seen contracts along with vector metadata.
func (p *Postgres) RecentContracts(ctx context.Context, limit int) ([]*models.ContractSummary, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT
			a.address,
			COALESCE(cv.flagged, FALSE),
			COALESCE(OCTET_LENGTH(cv.bytecode), 0),
			a.first_seen,
			a.last_seen
		FROM accounts a
		LEFT JOIN contract_vectors cv ON cv.address = a.address
		WHERE a.is_contract = TRUE
		ORDER BY a.last_seen DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("querying recent contracts: %w", err)
	}
	defer rows.Close()

	contracts := make([]*models.ContractSummary, 0)
	for rows.Next() {
		contract := &models.ContractSummary{}
		if err := rows.Scan(
			&contract.Address,
			&contract.Flagged,
			&contract.BytecodeSize,
			&contract.FirstSeen,
			&contract.LastSeen,
		); err != nil {
			return nil, fmt.Errorf("scanning recent contract: %w", err)
		}
		contracts = append(contracts, contract)
	}

	return contracts, rows.Err()
}

// FlagSeries groups forensic flags over time for charting in the dashboard.
func (p *Postgres) FlagSeries(ctx context.Context, bucket string, hours int) ([]*models.FlagBucket, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT
			date_trunc($1, detected_at) AS bucket,
			flag_type,
			severity,
			COUNT(*) AS count
		FROM forensic_flags
		WHERE detected_at >= NOW() - ($2 * INTERVAL '1 hour')
		GROUP BY 1, 2, 3
		ORDER BY bucket DESC, flag_type ASC, severity ASC
	`, bucket, hours)
	if err != nil {
		return nil, fmt.Errorf("querying flag series: %w", err)
	}
	defer rows.Close()

	buckets := make([]*models.FlagBucket, 0)
	for rows.Next() {
		bucket := &models.FlagBucket{}
		if err := rows.Scan(
			&bucket.Bucket,
			&bucket.FlagType,
			&bucket.Severity,
			&bucket.Count,
		); err != nil {
			return nil, fmt.Errorf("scanning flag bucket: %w", err)
		}
		buckets = append(buckets, bucket)
	}

	return buckets, rows.Err()
}

// nullableString converts an empty string to nil for nullable SQL fields.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// scanTransactions scans a result set into transaction models.
func scanTransactions(rows pgx.Rows) ([]*models.Transaction, error) {
	txs := make([]*models.Transaction, 0)
	for rows.Next() {
		tx := &models.Transaction{}
		var toAddr *string
		if err := rows.Scan(
			&tx.Hash, &tx.From, &toAddr, &tx.Value,
			&tx.Gas, &tx.GasPrice, &tx.Nonce,
			&tx.BlockNumber, &tx.Timestamp,
		); err != nil {
			return nil, fmt.Errorf("scanning transaction: %w", err)
		}
		if toAddr != nil {
			tx.To = *toAddr
		}
		txs = append(txs, tx)
	}
	return txs, rows.Err()
}

func normalizeAddressList(addresses []string) []string {
	if len(addresses) == 0 {
		return nil
	}

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

func scanForensicFlags(rows pgx.Rows) ([]*models.ForensicFlag, error) {
	flags := make([]*models.ForensicFlag, 0)
	for rows.Next() {
		flag := &models.ForensicFlag{}
		if err := rows.Scan(
			&flag.ID,
			&flag.TxHash,
			&flag.Address,
			&flag.FlagType,
			&flag.Severity,
			&flag.Description,
			&flag.DetectedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning forensic flag: %w", err)
		}
		flags = append(flags, flag)
	}

	return flags, rows.Err()
}

// RunMigrations applies pending schema migrations on startup.
func RunMigrations(connStr string) error {
	m, err := migrate.New("file://migrations", connStr)
	if err != nil {
		return fmt.Errorf("creating migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("running migrations: %w", err)
	}

	return nil
}
