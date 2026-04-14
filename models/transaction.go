package models

import "time"

// Transaction is the primary ledger record shared across ingestion, storage, and API layers.
type Transaction struct {
	Hash        string    `json:"hash"`
	From        string    `json:"from"`
	To          string    `json:"to"`
	Value       string    `json:"value"`
	Gas         uint64    `json:"gas"`
	GasPrice    string    `json:"gas_price"`
	Nonce       uint64    `json:"nonce"`
	BlockNumber uint64    `json:"block_number"`
	Data        []byte    `json:"data"`
	Timestamp   time.Time `json:"timestamp"`
}

// Account represents a wallet or contract address.
type Account struct {
	Address    string    `json:"address"`
	Balance    string    `json:"balance"`
	IsContract bool      `json:"is_contract"`
	FirstSeen  time.Time `json:"first_seen"`
	LastSeen   time.Time `json:"last_seen"`
}

// ForensicFlag captures a detection raised by the analysis pipeline.
type ForensicFlag struct {
	ID           int        `json:"id"`
	TxHash       string     `json:"tx_hash"`
	Address      string     `json:"address"`
	FlagType     string     `json:"flag_type"`
	Severity     string     `json:"severity"`
	Description  string     `json:"description"`
	DetectedAt   time.Time  `json:"detected_at"`
	TriageStatus string     `json:"triage_status,omitempty"`
	Assignee     string     `json:"assignee,omitempty"`
	AnalystNote  string     `json:"analyst_note,omitempty"`
	CaseID       *int64     `json:"case_id,omitempty"`
	CaseTitle    string     `json:"case_title,omitempty"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
	WhyFlagged   string     `json:"why_flagged,omitempty"`
	TriggerLogic string     `json:"trigger_logic,omitempty"`
	Confidence   string     `json:"confidence,omitempty"`
	Provenance   string     `json:"provenance,omitempty"`
	NextAction   string     `json:"next_action,omitempty"`
}
