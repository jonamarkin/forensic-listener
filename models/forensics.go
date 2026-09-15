package models

import "time"

// CircularFlow is a time-ordered path that returns value to where it started.
type CircularFlow struct {
	FlagID            int       `json:"flag_id,omitempty"`
	TxHash            string    `json:"tx_hash,omitempty"`
	Address           string    `json:"address,omitempty"`
	Severity          string    `json:"severity,omitempty"`
	DetectedAt        time.Time `json:"detected_at,omitempty"`
	Path              []string  `json:"path"`
	TransactionHashes []string  `json:"transaction_hashes"`
	Kinds             []string  `json:"kinds"`
	Hops              int       `json:"hops"`
}

// CircularEvidence is the structured evidence stored in forensic_flags.evidence for
// circular_flow flags: the full loop, hop by hop.
type CircularEvidence struct {
	Path              []string `json:"path"`
	TransactionHashes []string `json:"transaction_hashes"`
	Kinds             []string `json:"kinds"`
	Hops              int      `json:"hops"`
}

// ContractSimilarity is a nearest-neighbour match from pgvector.
type ContractSimilarity struct {
	Address      string  `json:"address"`
	EntityName   string  `json:"entity_name"`
	RiskLevel    string  `json:"risk_level"`
	Similarity   float64 `json:"similarity"`
	SameSkeleton bool    `json:"same_skeleton"`
	Flagged      bool    `json:"flagged"`
}
