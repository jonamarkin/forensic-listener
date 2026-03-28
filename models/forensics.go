package models

// CircularFlow captures a potential laundering loop or return path
// across the transaction graph.
type CircularFlow struct {
	Path              []string `json:"path"`
	TransactionHashes []string `json:"transaction_hashes"`
	Hops              int      `json:"hops"`
}

// ContractSimilarity captures a nearest-neighbour match in pgvector.
type ContractSimilarity struct {
	Address    string  `json:"address"`
	Similarity float64 `json:"similarity"`
	Flagged    bool    `json:"flagged"`
}
