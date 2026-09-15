package api

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"forensic-listener/models"
	"forensic-listener/store"
)

const exactCountsInterval = 30 * time.Second

// snapshotHub builds one live snapshot per interval and shares it with every
// connected client. Previously each open browser tab re-ran all dashboard queries
// every two seconds.
type snapshotHub struct {
	mu      sync.Mutex
	latest  *models.StreamSnapshot
	payload []byte
	changed chan struct{}
}

func newSnapshotHub() *snapshotHub {
	return &snapshotHub{changed: make(chan struct{})}
}

func (h *snapshotHub) publish(snapshot *models.StreamSnapshot) {
	payload, err := json.Marshal(snapshot)
	if err != nil {
		log.Printf("[api] encoding snapshot: %v", err)
		return
	}
	h.mu.Lock()
	h.latest = snapshot
	h.payload = payload
	close(h.changed)
	h.changed = make(chan struct{})
	h.mu.Unlock()
}

// current returns the latest payload and a channel closed on the next publish.
func (h *snapshotHub) current() ([]byte, *models.StreamSnapshot, <-chan struct{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.payload, h.latest, h.changed
}

// runSnapshots refreshes the shared snapshot. Exact table counts are expensive on
// large tables, so they run every 30 s; between refreshes the transaction count is
// advanced with an index-backed count of rows newer than the exact count.
func (s *Server) runSnapshots(ctx context.Context) {
	var exact *store.ExactCounts
	var exactAt time.Time

	ticker := time.NewTicker(s.config.StreamInterval)
	defer ticker.Stop()

	for {
		if exact == nil || time.Since(exactAt) >= exactCountsInterval {
			if counts, err := s.pg.ExactCounts(ctx); err != nil {
				if ctx.Err() == nil {
					log.Printf("[api] exact counts: %v", err)
				}
			} else {
				exact, exactAt = counts, time.Now()
			}
		}

		if exact != nil {
			if snapshot, err := s.buildSnapshot(ctx, exact); err != nil {
				if ctx.Err() == nil {
					log.Printf("[api] building snapshot: %v", err)
				}
			} else {
				s.hub.publish(snapshot)
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Server) buildSnapshot(ctx context.Context, exact *store.ExactCounts) (*models.StreamSnapshot, error) {
	live, err := s.pg.LiveCounts(ctx, exact.AsOf)
	if err != nil {
		return nil, err
	}
	enrichment, err := s.pg.EnrichmentStatus(ctx)
	if err != nil {
		return nil, err
	}
	enrichment.Done = exact.DoneJobs

	recentTransactions, err := s.pg.RecentTransactions(ctx, 12)
	if err != nil {
		return nil, err
	}
	recentFlags, err := s.pg.RecentFlags(ctx, 10)
	if err != nil {
		return nil, err
	}
	enrichFlags(recentFlags)

	chain := exact.Chain

	snapshot := &models.StreamSnapshot{
		Timestamp: time.Now().UTC(),
		Overview: &models.OverviewStats{
			TransactionCount:    exact.TransactionCount + live.NewTransactionsSince,
			PendingCount:        live.PendingCount,
			AccountCount:        exact.AccountCount,
			ContractCount:       exact.ContractCount,
			FlagCount:           live.FlagCount,
			HighFlagCount24h:    live.HighFlagCount24h,
			TokenTransferCount:  exact.TokenTransferCount,
			BlockCount:          exact.BlockCount,
			LatestBlock:         live.LatestBlock,
			LatestBlockAt:       live.LatestBlockAt,
			LatestTransactionAt: live.LatestTransactionAt,
			FirstTransactionAt:  exact.FirstTransactionAt,
		},
		Enrichment:         enrichment,
		Chain:              &chain,
		RecentTransactions: recentTransactions,
		RecentFlags:        recentFlags,
	}
	if s.ingestion != nil {
		snapshot.Ingestion = s.ingestion.Snapshot()
	}
	return snapshot, nil
}
