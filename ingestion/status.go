package ingestion

import (
	"sync/atomic"
	"time"

	"forensic-listener/models"
)

// Status tracks whether the node feeds are connected and when they last delivered.
// It is written by the ingestion loops and read by the API without locks.
type Status struct {
	pendingConnected atomic.Bool
	headsConnected   atomic.Bool
	lastPending      atomic.Int64 // unix nanoseconds
	lastHead         atomic.Int64
	lastBlock        atomic.Uint64
}

func (s *Status) touchPending() { s.lastPending.Store(time.Now().UnixNano()) }

func (s *Status) touchHead(number uint64) {
	s.lastHead.Store(time.Now().UnixNano())
	s.lastBlock.Store(number)
}

// headsRecently reports whether a block header arrived within d.
func (s *Status) headsRecently(d time.Duration) bool {
	last := s.lastHead.Load()
	return last != 0 && time.Since(time.Unix(0, last)) < d
}

func (s *Status) Snapshot() models.IngestionStatus {
	out := models.IngestionStatus{
		PendingFeedConnected: s.pendingConnected.Load(),
		HeadFeedConnected:    s.headsConnected.Load(),
	}
	if v := s.lastPending.Load(); v != 0 {
		t := time.Unix(0, v).UTC()
		out.LastPendingAt = &t
	}
	if v := s.lastHead.Load(); v != 0 {
		t := time.Unix(0, v).UTC()
		out.LastHeadAt = &t
		block := s.lastBlock.Load()
		out.LastBlock = &block
	}
	return out
}
