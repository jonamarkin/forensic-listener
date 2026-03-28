package models

import "time"

// Transaction is the central data structure that flows through
// every part of the system — ingestion, all three stores, and the API.
// In Go, exported fields (capital letter) are accessible from other packages.
type Transaction struct {
	Hash        string    `json:"hash"`
	From        string    `json:"from"`
	To          string    `json:"to"`         // empty string if contract creation
	Value       string    `json:"value"`       // in Wei, use string to avoid int overflow
	Gas         uint64    `json:"gas"`
	GasPrice    string    `json:"gas_price"`
	Nonce       uint64    `json:"nonce"`
	BlockNumber uint64    `json:"block_number"`
	Data        []byte    `json:"data"`        // contract bytecode if contract call
	Timestamp   time.Time `json:"timestamp"`
}

// Account represents a wallet or contract address
type Account struct {
	Address     string    `json:"address"`
	Balance     string    `json:"balance"`
	IsContract  bool      `json:"is_contract"`
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
}

// ForensicFlag is raised when anomalies are detected
type ForensicFlag struct {
	ID          int       `json:"id"`
	TxHash      string    `json:"tx_hash"`
	Address     string    `json:"address"`
	FlagType    string    `json:"flag_type"`    // e.g. "circular_flow", "similar_bytecode"
	Severity    string    `json:"severity"`     // "low", "medium", "high"
	Description string    `json:"description"`
	DetectedAt  time.Time `json:"detected_at"`
}