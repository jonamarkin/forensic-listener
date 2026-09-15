package ingestion

import (
	"context"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ethereum/go-ethereum/core/types"

	"forensic-listener/client"
	"forensic-listener/forensics"
	"forensic-listener/models"
	"forensic-listener/store"
)

const (
	ingestWorkers = 16
	ingestBuffer  = 4096
)

// Engine runs the four ingestion loops:
//
//	pending   node mempool feed  -> PostgreSQL (transaction + enrichment job, one ACID txn)
//	blocks    node newHeads feed -> PostgreSQL (block, receipts, token transfers, status)
//	enrich    job queue          -> Neo4j edges, pgvector embeddings, detectors
//	maintain  every 30 s         -> rollups, behaviour vectors, pruning, dropped txs
type Engine struct {
	client       *client.Client
	pg           *store.Postgres
	graph        *store.Neo4j
	vector       *store.Vector
	circular     *forensics.CircularDetector
	anomaly      *forensics.AnomalyDetector
	status       *Status
	ingestBlocks bool
}

type Config struct {
	Client       *client.Client
	Postgres     *store.Postgres
	Graph        *store.Neo4j
	Vector       *store.Vector
	Circular     *forensics.CircularDetector
	Anomaly      *forensics.AnomalyDetector
	IngestBlocks bool
}

func NewEngine(cfg Config) *Engine {
	return &Engine{
		client:       cfg.Client,
		pg:           cfg.Postgres,
		graph:        cfg.Graph,
		vector:       cfg.Vector,
		circular:     cfg.Circular,
		anomaly:      cfg.Anomaly,
		status:       &Status{},
		ingestBlocks: cfg.IngestBlocks,
	}
}

// Status exposes live feed health to the API.
func (e *Engine) Status() *Status { return e.status }

// Run starts every loop and blocks until ctx is cancelled.
func (e *Engine) Run(ctx context.Context) {
	log.Printf("[engine] starting (%d ingest workers, %d enrichment workers, block ingestion %t)",
		ingestWorkers, enrichmentWorkers, e.ingestBlocks)

	var wg sync.WaitGroup
	wg.Go(func() { e.runPending(ctx) })
	if e.ingestBlocks {
		wg.Go(func() { e.runBlocks(ctx) })
	}
	for i := range enrichmentWorkers {
		wg.Go(func() { e.enrichmentWorker(ctx, i) })
	}
	wg.Go(func() { e.runMaintenance(ctx) })
	wg.Wait()

	log.Println("[engine] stopped")
}

func (e *Engine) runPending(ctx context.Context) {
	feed := e.client.StreamPendingTransactions(ctx, e.status.pendingConnected.Store)
	jobs := make(chan *types.Transaction, ingestBuffer)

	var workers sync.WaitGroup
	for range ingestWorkers {
		workers.Go(func() { e.ingestWorker(ctx, jobs) })
	}

	var dropped atomic.Int64
	reportTicker := time.NewTicker(time.Minute)
	defer reportTicker.Stop()

loop:
	for {
		select {
		case <-ctx.Done():
			break loop
		case <-reportTicker.C:
			if n := dropped.Swap(0); n > 0 {
				log.Printf("[pending] ingest buffer full: skipped %d pending transactions in the last minute (they are still captured when mined)", n)
			}
		case raw, ok := <-feed:
			if !ok {
				break loop
			}
			e.status.touchPending()
			// Never block the subscription: a node disconnects subscribers that fall behind.
			select {
			case jobs <- raw:
			default:
				dropped.Add(1)
			}
		}
	}

	close(jobs)
	workers.Wait()
}

func (e *Engine) ingestWorker(ctx context.Context, jobs <-chan *types.Transaction) {
	for raw := range jobs {
		tx, err := toModel(raw, time.Now().UTC())
		if err != nil {
			log.Printf("[pending] skipping %s: %v", raw.Hash().Hex(), err)
			continue
		}
		if err := e.pg.SaveTransaction(ctx, tx); err != nil && ctx.Err() == nil {
			log.Printf("[pending] saving %s: %v", tx.Hash, err)
		}
	}
}

// toModel converts a go-ethereum transaction into the domain model.
func toModel(tx *types.Transaction, observedAt time.Time) (*models.Transaction, error) {
	from, err := senderAddress(tx)
	if err != nil {
		return nil, err
	}

	m := &models.Transaction{
		Hash:      tx.Hash().Hex(),
		From:      from,
		Value:     "0",
		Gas:       tx.Gas(),
		GasPrice:  "0",
		Type:      tx.Type(),
		Nonce:     tx.Nonce(),
		Data:      tx.Data(),
		Timestamp: observedAt,
		Status:    models.TxPending,
	}
	if tx.To() != nil {
		m.To = tx.To().Hex()
	}
	if tx.Value() != nil {
		m.Value = tx.Value().String()
	}
	// For EIP-1559 transactions GasPrice() returns the max fee per gas (GasFeeCap).
	if tx.GasPrice() != nil {
		m.GasPrice = tx.GasPrice().String()
	}
	if tx.Type() >= types.DynamicFeeTxType && tx.GasTipCap() != nil {
		tip := tx.GasTipCap().String()
		m.MaxPriorityFee = &tip
	}
	return m, nil
}

func senderAddress(tx *types.Transaction) (string, error) {
	chainID := tx.ChainId()

	var signer types.Signer
	switch {
	case tx.Type() == types.LegacyTxType && !tx.Protected():
		signer = types.HomesteadSigner{}
	case chainID != nil && chainID.Sign() > 0:
		signer = types.LatestSignerForChainID(chainID)
	default:
		return "", fmt.Errorf("transaction type %d has invalid chain ID %v", tx.Type(), chainID)
	}

	sender, err := types.Sender(signer, tx)
	if err != nil {
		return "", fmt.Errorf("recovering sender: %w", err)
	}
	return sender.Hex(), nil
}

func sleepOrDone(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
