package ingestion

import (
	"context"
	"log"
	"time"
)

const (
	maintenanceInterval  = 30 * time.Second
	rollupBackfillWindow = 30 * 24 * time.Hour
	rollupRecentWindow   = 2 * time.Hour
	behaviorBatch        = 2000
	reembedBatch         = 500
	finishedJobRetention = 24 * time.Hour
	droppedAfter         = 3 * time.Hour
)

// runMaintenance keeps derived data current without putting work on the request path.
func (e *Engine) runMaintenance(ctx context.Context) {
	if n, err := e.pg.RefreshNetworkHourly(ctx, time.Now().Add(-rollupBackfillWindow)); err != nil {
		if ctx.Err() == nil {
			log.Printf("[maintenance] rollup backfill: %v", err)
		}
	} else {
		log.Printf("[maintenance] hourly rollup backfilled (%d buckets)", n)
	}

	behaviourSince := time.Now().Add(-24 * time.Hour)
	ticker := time.NewTicker(maintenanceInterval)
	defer ticker.Stop()

	for {
		runStarted := time.Now()

		if _, err := e.pg.RefreshNetworkHourly(ctx, time.Now().Add(-rollupRecentWindow)); err != nil && ctx.Err() == nil {
			log.Printf("[maintenance] rollup refresh: %v", err)
		}

		if e.vector != nil {
			for batch := 0; batch < 5; batch++ {
				n, err := e.vector.ReembedMissing(ctx, reembedBatch)
				if err != nil {
					if ctx.Err() == nil {
						log.Printf("[maintenance] re-embedding contracts: %v", err)
					}
					break
				}
				if n > 0 {
					log.Printf("[maintenance] re-embedded %d contracts with the v2 bytecode model", n)
				}
				if n < reembedBatch {
					break
				}
			}

			n, err := e.vector.RebuildBehaviors(ctx, behaviourSince, behaviorBatch)
			if err != nil {
				if ctx.Err() == nil {
					log.Printf("[maintenance] behaviour vectors: %v", err)
				}
			} else {
				behaviourSince = runStarted.Add(-maintenanceInterval)
				if n > 0 {
					log.Printf("[maintenance] rebuilt %d behaviour vectors", n)
				}
			}
		}

		if n, err := e.pg.PruneEnrichmentJobs(ctx, finishedJobRetention); err != nil {
			if ctx.Err() == nil {
				log.Printf("[maintenance] pruning jobs: %v", err)
			}
		} else if n > 0 {
			log.Printf("[maintenance] pruned %d finished jobs", n)
		}

		// Without a block feed nothing is ever marked mined, so "still pending" would be meaningless.
		if e.status.headsRecently(5 * time.Minute) {
			if n, err := e.pg.MarkDroppedTransactions(ctx, droppedAfter); err != nil {
				if ctx.Err() == nil {
					log.Printf("[maintenance] marking dropped transactions: %v", err)
				}
			} else if n > 0 {
				log.Printf("[maintenance] %d transactions not mined within %s marked dropped", n, droppedAfter)
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
