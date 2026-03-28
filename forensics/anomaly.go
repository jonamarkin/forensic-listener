package forensics

import (
	"context"
	"fmt"

	"forensic-listener/models"
	"forensic-listener/store"
)

const similarBytecodeThreshold = 0.98

// AnomalyDetector raises flags for contracts that look suspiciously alike.
type AnomalyDetector struct {
	vector *store.Vector
	flags  flagSaver
}

func NewAnomalyDetector(vector *store.Vector, flags flagSaver) *AnomalyDetector {
	return &AnomalyDetector{
		vector: vector,
		flags:  flags,
	}
}

func (d *AnomalyDetector) EvaluateDestination(ctx context.Context, tx *models.Transaction, bytecode []byte) error {
	if d == nil || d.vector == nil || d.flags == nil || tx.To == "" || len(bytecode) == 0 {
		return nil
	}

	matches, err := d.vector.FindSimilarBytecode(ctx, tx.To, bytecode, 1)
	if err != nil {
		return err
	}
	if len(matches) == 0 {
		return nil
	}

	top := matches[0]
	if top.Similarity < similarBytecodeThreshold {
		return nil
	}

	if err := d.vector.MarkFlagged(ctx, tx.To, true); err != nil {
		return err
	}

	description := fmt.Sprintf(
		"Contract %s is %.2f similar to %s based on pgvector bytecode fingerprints",
		tx.To, top.Similarity, top.Address,
	)

	return d.flags.SaveFlag(ctx, &models.ForensicFlag{
		TxHash:      tx.Hash,
		Address:     tx.To,
		FlagType:    "similar_bytecode",
		Severity:    bytecodeSeverity(top.Similarity),
		Description: description,
	})
}

func bytecodeSeverity(similarity float64) string {
	switch {
	case similarity >= 0.995:
		return "high"
	case similarity >= 0.985:
		return "medium"
	default:
		return "low"
	}
}
