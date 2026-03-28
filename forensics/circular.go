package forensics

import (
	"context"
	"fmt"
	"strings"

	"forensic-listener/models"
	"forensic-listener/store"
)

type flagSaver interface {
	SaveFlag(ctx context.Context, flag *models.ForensicFlag) error
}

// CircularDetector uses the Neo4j graph to flag funds that quickly route back.
type CircularDetector struct {
	graph *store.Neo4j
	flags flagSaver
}

func NewCircularDetector(graph *store.Neo4j, flags flagSaver) *CircularDetector {
	return &CircularDetector{
		graph: graph,
		flags: flags,
	}
}

func (d *CircularDetector) EvaluateTransaction(ctx context.Context, tx *models.Transaction) error {
	if d == nil || d.graph == nil || d.flags == nil || tx.To == "" {
		return nil
	}

	flow, err := d.graph.FindReturnPath(ctx, tx.From, tx.To, 3)
	if err != nil {
		return err
	}
	if flow == nil {
		return nil
	}

	description := fmt.Sprintf(
		"Detected a %d-hop return path from %s back to %s: %s",
		flow.Hops, tx.To, tx.From, strings.Join(flow.Path, " -> "),
	)

	return d.flags.SaveFlag(ctx, &models.ForensicFlag{
		TxHash:      tx.Hash,
		Address:     tx.From,
		FlagType:    "circular_flow",
		Severity:    circularSeverity(flow.Hops),
		Description: description,
	})
}

func circularSeverity(hops int) string {
	switch {
	case hops <= 2:
		return "high"
	case hops == 3:
		return "medium"
	default:
		return "low"
	}
}
