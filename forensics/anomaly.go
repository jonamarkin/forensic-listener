package forensics

import (
	"context"
	"encoding/json"
	"fmt"

	"forensic-listener/models"
	"forensic-listener/store"
)

type transactionLocator interface {
	LatestTransactionHashFor(ctx context.Context, address string) (string, error)
}

// AnomalyDetector flags contracts whose code is nearly identical to a contract that
// is already labelled or flagged as risky. Similarity alone is not suspicious (most
// contracts are clones of popular templates), so a match only raises a flag when the
// neighbour carries risk.
type AnomalyDetector struct {
	vector  *store.Vector
	flags   flagSaver
	locator transactionLocator
}

func NewAnomalyDetector(vector *store.Vector, flags flagSaver, locator transactionLocator) *AnomalyDetector {
	return &AnomalyDetector{vector: vector, flags: flags, locator: locator}
}

// EvaluateContract compares a newly analysed contract against every stored contract.
func (d *AnomalyDetector) EvaluateContract(ctx context.Context, txHash, address string, bytecode []byte) error {
	if d == nil || d.vector == nil || d.flags == nil || len(bytecode) == 0 {
		return nil
	}

	matches, err := d.vector.FindSimilarBytecode(ctx, address, bytecode, 5)
	if err != nil {
		return err
	}
	for _, match := range matches {
		if riskyNeighbour(match) {
			return d.flag(ctx, txHash, address, match)
		}
	}
	return nil
}

// PropagateLabel runs when an investigator labels a contract medium or high risk:
// every stored contract in the same code family is flagged immediately.
func (d *AnomalyDetector) PropagateLabel(ctx context.Context, address, riskLevel string) (int, error) {
	if d == nil || d.vector == nil || d.flags == nil || d.locator == nil {
		return 0, nil
	}
	if riskLevel != "medium" && riskLevel != "high" {
		return 0, nil
	}

	matches, err := d.vector.SimilarContracts(ctx, address, 25)
	if err != nil {
		return 0, err
	}

	source := &models.ContractSimilarity{Address: store.NormalizeAddress(address), RiskLevel: riskLevel}
	flagged := 0
	for _, match := range matches {
		if match.Similarity < store.SimilarBytecodeThreshold {
			continue
		}
		txHash, err := d.locator.LatestTransactionHashFor(ctx, match.Address)
		if err != nil {
			return flagged, err
		}
		if txHash == "" {
			continue
		}
		source.Similarity = match.Similarity
		source.SameSkeleton = match.SameSkeleton
		if err := d.flag(ctx, txHash, match.Address, source); err != nil {
			return flagged, err
		}
		flagged++
	}
	return flagged, nil
}

func riskyNeighbour(match *models.ContractSimilarity) bool {
	if match.Similarity < store.SimilarBytecodeThreshold {
		return false
	}
	return match.Flagged || match.RiskLevel == "medium" || match.RiskLevel == "high"
}

func (d *AnomalyDetector) flag(ctx context.Context, txHash, address string, neighbour *models.ContractSimilarity) error {
	if err := d.vector.MarkFlagged(ctx, address, true); err != nil {
		return err
	}

	relation := fmt.Sprintf("shares %.1f%% of its code structure with", neighbour.Similarity*100)
	if neighbour.SameSkeleton {
		relation = "is an exact code clone of"
	}
	neighbourRisk := neighbour.RiskLevel
	if neighbourRisk == "" || neighbourRisk == "none" {
		neighbourRisk = "flagged"
	}

	evidence, err := json.Marshal(map[string]any{
		"matched_address": neighbour.Address,
		"similarity":      neighbour.Similarity,
		"same_skeleton":   neighbour.SameSkeleton,
		"matched_risk":    neighbourRisk,
		"threshold":       store.SimilarBytecodeThreshold,
	})
	if err != nil {
		return fmt.Errorf("encoding bytecode evidence: %w", err)
	}

	severity := "medium"
	if neighbour.RiskLevel == "high" {
		severity = "high"
	}

	return d.flags.SaveFlag(ctx, &models.ForensicFlag{
		TxHash:      txHash,
		Address:     address,
		FlagType:    "similar_bytecode",
		Severity:    severity,
		Description: fmt.Sprintf("Contract %s %s %s (%s)", shortAddress(store.NormalizeAddress(address)), relation, shortAddress(neighbour.Address), neighbourRisk),
		Evidence:    evidence,
	})
}
