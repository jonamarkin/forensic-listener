package ingestion

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"forensic-listener/models"
)

const (
	enrichmentWorkers      = 4
	enrichmentPollInterval = 200 * time.Millisecond
	enrichmentLeaseTTL     = 2 * time.Minute
	enrichmentMaxAttempts  = 6
	detectionTimeout       = 1500 * time.Millisecond
)

func (e *Engine) enrichmentWorker(ctx context.Context, id int) {
	for ctx.Err() == nil {
		tx, err := e.pg.ClaimEnrichmentJob(ctx, enrichmentLeaseTTL)
		if err != nil {
			if ctx.Err() == nil {
				log.Printf("[enrich %d] claiming job: %v", id, err)
			}
			if !sleepOrDone(ctx, enrichmentPollInterval) {
				return
			}
			continue
		}
		if tx == nil {
			if !sleepOrDone(ctx, enrichmentPollInterval) {
				return
			}
			continue
		}

		if err := e.enrich(ctx, tx); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[enrich %d] %s: %v", id, tx.Hash, err)
			if markErr := e.pg.MarkEnrichmentFailed(ctx, tx.Hash, err, enrichmentMaxAttempts); markErr != nil {
				log.Printf("[enrich %d] re-queueing %s: %v", id, tx.Hash, markErr)
			}
			continue
		}

		if err := e.pg.MarkEnrichmentDone(ctx, tx.Hash); err != nil && ctx.Err() == nil {
			log.Printf("[enrich %d] completing %s: %v", id, tx.Hash, err)
		}
	}
}

// enrich projects one committed transaction into the other stores and runs detection.
// Every write is idempotent (Neo4j MERGE, SQL ON CONFLICT), so a retried job is harmless.
func (e *Engine) enrich(ctx context.Context, tx *models.Transaction) error {
	var errs []error
	graphReady := e.graph == nil

	if e.graph != nil && tx.To != "" {
		if err := e.graph.SaveTransaction(ctx, tx); err != nil {
			errs = append(errs, fmt.Errorf("neo4j: %w", err))
		} else {
			graphReady = true
		}
	}

	transfers, err := e.pg.TokenTransfersForTransaction(ctx, tx.Hash)
	if err != nil {
		errs = append(errs, err)
	}
	if e.graph != nil && len(transfers) > 0 {
		if err := e.graph.SaveTokenTransfers(ctx, transfers); err != nil {
			errs = append(errs, fmt.Errorf("neo4j token transfers: %w", err))
			graphReady = false
		} else if tx.To == "" {
			graphReady = true
		}
	}

	if target := contractTarget(tx); target != "" {
		if err := e.analyseContract(ctx, tx, target); err != nil {
			errs = append(errs, err)
		}
	}

	if e.circular != nil && graphReady {
		if tx.To != "" && len(tx.Data) == 0 && tx.Value != "0" {
			e.detectLoop(ctx, tx.Hash, tx.From, tx.To, tx.Timestamp, "eth")
		}
		for _, tt := range transfers {
			e.detectLoop(ctx, tt.TxHash, tt.From, tt.To, tt.MinedAt, "token")
		}
	}

	return errors.Join(errs...)
}

func (e *Engine) detectLoop(ctx context.Context, txHash, from, to string, at time.Time, kind string) {
	detectCtx, cancel := context.WithTimeout(ctx, detectionTimeout)
	defer cancel()
	if err := e.circular.Evaluate(detectCtx, txHash, from, to, at, kind); err != nil && ctx.Err() == nil {
		log.Printf("[enrich] circular check for %s skipped: %v", txHash, err)
	}
}

// contractTarget returns the address whose code this transaction reveals: a newly
// created contract, or the recipient of a call that carries calldata.
func contractTarget(tx *models.Transaction) string {
	if tx.CreatedContract != "" {
		return tx.CreatedContract
	}
	if tx.To != "" && len(tx.Data) > 0 {
		return tx.To
	}
	return ""
}

// analyseContract fetches and embeds bytecode the first time a contract is seen, then
// compares it against known contracts. Contracts already embedded are skipped, which
// avoids an eth_getCode round trip for every call to a popular contract.
func (e *Engine) analyseContract(ctx context.Context, tx *models.Transaction, address string) error {
	if e.vector == nil {
		return nil
	}

	embedded, err := e.vector.HasEmbedding(ctx, address)
	if err != nil || embedded {
		return err
	}

	code, err := e.client.CodeAt(ctx, address)
	if err != nil {
		return err
	}
	if len(code) == 0 {
		return nil
	}

	if err := e.pg.UpsertAccount(ctx, address, true); err != nil {
		return err
	}
	if e.graph != nil {
		if err := e.graph.MarkContract(ctx, address); err != nil {
			return err
		}
	}
	if err := e.vector.UpsertContract(ctx, address, code); err != nil {
		return err
	}
	if e.anomaly != nil {
		if err := e.anomaly.EvaluateContract(ctx, tx.Hash, address, code); err != nil {
			return fmt.Errorf("bytecode detector: %w", err)
		}
	}
	return nil
}
