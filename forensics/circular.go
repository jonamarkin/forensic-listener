package forensics

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"forensic-listener/models"
	"forensic-listener/store"
)

type flagSaver interface {
	SaveFlag(ctx context.Context, flag *models.ForensicFlag) error
}

const (
	// CircularMaxHops bounds the return path searched in Neo4j; with the closing
	// transfer the longest loop detected is CircularMaxHops+1 transfers.
	CircularMaxHops = 3
	// CircularWindow limits how far back the earlier legs of a loop may be.
	CircularWindow = 7 * 24 * time.Hour
)

// CircularDetector uses the Neo4j graph to flag value that returns to where it started.
type CircularDetector struct {
	graph *store.Neo4j
	flags flagSaver
}

func NewCircularDetector(graph *store.Neo4j, flags flagSaver) *CircularDetector {
	return &CircularDetector{graph: graph, flags: flags}
}

// Evaluate checks whether the transfer from -> to at time `at` closes a loop: an
// earlier, time-ordered chain to -> ... -> from inside the detection window.
// kind is "eth" for a plain transaction or "token" for an ERC-20 transfer.
func (d *CircularDetector) Evaluate(ctx context.Context, txHash, from, to string, at time.Time, kind string) error {
	if d == nil || d.graph == nil || d.flags == nil {
		return nil
	}
	from, to = store.NormalizeAddress(from), store.NormalizeAddress(to)
	if from == "" || to == "" || from == to {
		return nil
	}

	flow, err := d.graph.FindReturnPath(ctx, from, to, at.Add(-CircularWindow), at, CircularMaxHops)
	if err != nil || flow == nil {
		return err
	}

	// The loop as it happened: from -> to (this transfer) -> ... -> from.
	loop := models.CircularEvidence{
		Path:              append([]string{from}, flow.Path...),
		TransactionHashes: append(append([]string{}, txHash), flow.TransactionHashes...),
		Kinds:             append(append([]string{}, kind), flow.Kinds...),
		Hops:              flow.Hops + 1,
	}
	evidence, err := json.Marshal(loop)
	if err != nil {
		return fmt.Errorf("encoding circular evidence: %w", err)
	}

	return d.flags.SaveFlag(ctx, &models.ForensicFlag{
		TxHash:   txHash,
		Address:  from,
		FlagType: "circular_flow",
		Severity: circularSeverity(loop.Hops),
		Description: fmt.Sprintf(
			"Value returned to %s after a %d-transfer loop: %s",
			shortAddress(from), loop.Hops, strings.Join(shortAddresses(loop.Path), " → "),
		),
		Evidence: evidence,
	})
}

// circularSeverity ranks loops by length. A direct A -> B -> A return is common
// (refunds, exchange round-trips) and scores low; routing through intermediaries is
// the classic layering pattern.
func circularSeverity(transfers int) string {
	switch {
	case transfers <= 2:
		return "low"
	case transfers == 3:
		return "high"
	default:
		return "medium"
	}
}

func shortAddress(address string) string {
	if len(address) <= 12 {
		return address
	}
	return address[:6] + "…" + address[len(address)-4:]
}

func shortAddresses(addresses []string) []string {
	out := make([]string, len(addresses))
	for i, a := range addresses {
		out[i] = shortAddress(a)
	}
	return out
}
