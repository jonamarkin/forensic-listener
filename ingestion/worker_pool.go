package ingestion

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/core/types"

	"forensic-listener/client"
	"forensic-listener/forensics"
	"forensic-listener/models"
	"forensic-listener/store"
)

const (
	ingestWorkers            = 20
	ingestBuffer             = 2048
	enrichmentWorkers        = 3
	enrichmentPollInterval   = 200 * time.Millisecond
	enrichmentRetryDelay     = 15 * time.Second
	enrichmentLeaseTTL       = 2 * time.Minute
	circularDetectionTimeout = 1500 * time.Millisecond
)

// Engine coordinates ingestion, persistence, and enrichment.
type Engine struct {
	client   *client.Client
	pg       *store.Postgres
	graph    *store.Neo4j
	vector   *store.Vector
	circular *forensics.CircularDetector
	anomaly  *forensics.AnomalyDetector
}

func NewEngine(
	c *client.Client,
	pg *store.Postgres,
	graph *store.Neo4j,
	vector *store.Vector,
	circular *forensics.CircularDetector,
	anomaly *forensics.AnomalyDetector,
) *Engine {
	return &Engine{
		client:   c,
		pg:       pg,
		graph:    graph,
		vector:   vector,
		circular: circular,
		anomaly:  anomaly,
	}
}

// Run starts the ingestion engine and blocks until ctx is cancelled.
func (e *Engine) Run(ctx context.Context) {
	log.Println("[engine] starting ingestion engine")

	txCh, err := e.client.SubscribePendingTransactions(ctx)
	if err != nil {
		log.Fatalf("[engine] subscribing to transactions: %v", err)
	}

	ingestCh := make(chan *types.Transaction, ingestBuffer)

	var ingestWG sync.WaitGroup
	for i := range ingestWorkers {
		ingestWG.Add(1)
		go e.ingestWorker(ctx, i, ingestCh, &ingestWG)
	}

	var enrichmentWG sync.WaitGroup
	for i := range enrichmentWorkers {
		enrichmentWG.Add(1)
		go e.enrichmentWorker(ctx, i, &enrichmentWG)
	}

	defer func() {
		close(ingestCh)
		ingestWG.Wait()
		enrichmentWG.Wait()
	}()

	log.Printf(
		"[engine] %d ingest workers and %d enrichment workers ready",
		ingestWorkers, enrichmentWorkers,
	)

	for {
		select {
		case <-ctx.Done():
			log.Println("[engine] shutting down ingestion engine")
			return
		case tx, ok := <-txCh:
			if !ok {
				log.Println("[engine] geth subscription closed")
				return
			}

			select {
			case ingestCh <- tx:
			case <-ctx.Done():
				log.Println("[engine] shutting down ingestion engine")
				return
			}
		}
	}
}

func (e *Engine) ingestWorker(
	ctx context.Context,
	id int,
	jobCh <-chan *types.Transaction,
	wg *sync.WaitGroup,
) {
	defer wg.Done()

	log.Printf("[ingest worker %d] started", id)
	for {
		select {
		case <-ctx.Done():
			log.Printf("[ingest worker %d] stopping", id)
			return
		case raw, ok := <-jobCh:
			if !ok {
				log.Printf("[ingest worker %d] job channel closed", id)
				return
			}

			tx, err := toModel(raw)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[ingest worker %d] error converting tx %s: %v",
					id, raw.Hash().Hex(), err)
				continue
			}

			if err := e.pg.SaveTransaction(ctx, tx); err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[ingest worker %d] error saving tx %s: %v",
					id, tx.Hash, err)
				continue
			}
		}
	}
}

func (e *Engine) enrichmentWorker(
	ctx context.Context,
	id int,
	wg *sync.WaitGroup,
) {
	defer wg.Done()

	log.Printf("[enrichment worker %d] started", id)
	for {
		if ctx.Err() != nil {
			log.Printf("[enrichment worker %d] stopping", id)
			return
		}

		tx, err := e.pg.ClaimEnrichmentJob(ctx, enrichmentLeaseTTL)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[enrichment worker %d] error claiming enrichment job: %v", id, err)
			if !sleepOrDone(ctx, enrichmentPollInterval) {
				log.Printf("[enrichment worker %d] stopping", id)
				return
			}
			continue
		}
		if tx == nil {
			if !sleepOrDone(ctx, enrichmentPollInterval) {
				log.Printf("[enrichment worker %d] stopping", id)
				return
			}
			continue
		}

		if err := e.enrich(ctx, tx); err != nil {
			if ctx.Err() != nil {
				return
			}
			if markErr := e.pg.MarkEnrichmentFailed(ctx, tx.Hash, err, enrichmentRetryDelay); markErr != nil {
				log.Printf("[enrichment worker %d] error requeueing tx %s after failure: %v", id, tx.Hash, markErr)
			}
			log.Printf("[enrichment worker %d] error enriching tx %s: %v", id, tx.Hash, err)
			continue
		}

		if err := e.pg.MarkEnrichmentDone(ctx, tx.Hash); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[enrichment worker %d] error marking tx %s enriched: %v", id, tx.Hash, err)
		}
	}
}

func (e *Engine) enrich(ctx context.Context, tx *models.Transaction) error {
	var errs []error
	graphReady := e.graph == nil

	if e.graph != nil {
		if err := e.graph.SaveTransaction(ctx, tx); err != nil {
			errs = append(errs, fmt.Errorf("neo4j ETL: %w", err))
		} else {
			graphReady = true
		}
	}

	if tx.To != "" && len(tx.Data) > 0 {
		code, err := e.client.CodeAt(ctx, tx.To)
		if err != nil {
			errs = append(errs, fmt.Errorf("loading contract code for %s: %w", tx.To, err))
		} else if len(code) > 0 {
			if err := e.pg.UpsertAccount(ctx, tx.To, true); err != nil {
				errs = append(errs, fmt.Errorf("marking postgres contract %s: %w", tx.To, err))
			}
			if e.graph != nil {
				if err := e.graph.MarkContract(ctx, tx.To); err != nil {
					errs = append(errs, fmt.Errorf("marking neo4j contract %s: %w", tx.To, err))
				}
			}
			if e.vector != nil {
				if err := e.vector.UpsertContract(ctx, tx.To, code); err != nil {
					errs = append(errs, fmt.Errorf("upserting vector contract %s: %w", tx.To, err))
				} else if e.anomaly != nil {
					if err := e.anomaly.EvaluateDestination(ctx, tx, code); err != nil {
						errs = append(errs, fmt.Errorf("anomaly detector: %w", err))
					}
				}
			}
		}
	}

	if e.circular != nil && graphReady && shouldEvaluateCircular(tx) {
		detectCtx, cancel := context.WithTimeout(ctx, circularDetectionTimeout)
		err := e.circular.EvaluateTransaction(detectCtx, tx)
		cancel()
		if err != nil && ctx.Err() == nil {
			log.Printf("[enrichment] skipping circular check for tx %s: %v", tx.Hash, err)
		}
	}

	return errors.Join(errs...)
}

func shouldEvaluateCircular(tx *models.Transaction) bool {
	if tx == nil || tx.To == "" {
		return false
	}

	return len(tx.Data) == 0
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

// toModel converts a go-ethereum transaction into the application's domain model.
func toModel(tx *types.Transaction) (*models.Transaction, error) {
	to := ""
	if tx.To() != nil {
		to = tx.To().Hex()
	}

	from, err := senderAddress(tx)
	if err != nil {
		return nil, err
	}

	value := "0"
	if tx.Value() != nil {
		value = tx.Value().String()
	}

	gasPrice := "0"
	if tx.GasPrice() != nil {
		gasPrice = tx.GasPrice().String()
	}

	return &models.Transaction{
		Hash:        tx.Hash().Hex(),
		From:        from,
		To:          to,
		Value:       value,
		Gas:         tx.Gas(),
		GasPrice:    gasPrice,
		Nonce:       tx.Nonce(),
		BlockNumber: 0,
		Data:        tx.Data(),
		Timestamp:   time.Now().UTC(),
	}, nil
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
