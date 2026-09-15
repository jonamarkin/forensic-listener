package models

import (
	"encoding/json"
	"time"
)

// Transaction lifecycle states stored in transactions.status.
const (
	TxPending  = "pending"
	TxMined    = "mined"
	TxReplaced = "replaced"
	TxDropped  = "dropped"
)

// Transaction is the primary ledger record shared across ingestion, storage, and API layers.
type Transaction struct {
	Hash  string `json:"hash"`
	From  string `json:"from"`
	To    string `json:"to"`
	Value string `json:"value"`
	Gas   uint64 `json:"gas"`
	// GasPrice is the legacy gas price, or the max fee per gas for EIP-1559 (type 2+) transactions.
	GasPrice       string  `json:"gas_price"`
	MaxPriorityFee *string `json:"max_priority_fee"`
	Type           uint8   `json:"type"`
	Nonce          uint64  `json:"nonce"`
	Data           []byte  `json:"data,omitempty"`
	// Timestamp is when this system first observed the transaction (pending or mined).
	Timestamp time.Time `json:"timestamp"`

	Status            string     `json:"status"`
	BlockNumber       *uint64    `json:"block_number"`
	MinedAt           *time.Time `json:"mined_at"`
	GasUsed           *uint64    `json:"gas_used"`
	EffectiveGasPrice *string    `json:"effective_gas_price"`
	ReceiptStatus     *int       `json:"receipt_status"`
	// CreatedContract is set for mined contract-creation transactions.
	CreatedContract string `json:"created_contract,omitempty"`
}

// Account represents a wallet or contract address.
type Account struct {
	Address    string    `json:"address"`
	IsContract bool      `json:"is_contract"`
	FirstSeen  time.Time `json:"first_seen"`
	LastSeen   time.Time `json:"last_seen"`
}

// Block is a mined block recorded by the block watcher.
type Block struct {
	Number     uint64    `json:"number"`
	Hash       string    `json:"hash"`
	ParentHash string    `json:"parent_hash"`
	MinedAt    time.Time `json:"mined_at"`
	TxCount    int       `json:"tx_count"`
	GasUsed    uint64    `json:"gas_used"`
	BaseFee    *string   `json:"base_fee"`
}

// Receipt carries the execution result of a mined transaction.
type Receipt struct {
	GasUsed           uint64
	EffectiveGasPrice string
	Status            int
}

// TokenTransfer is a decoded ERC-20 Transfer event.
type TokenTransfer struct {
	TxHash      string    `json:"tx_hash"`
	LogIndex    uint      `json:"log_index"`
	BlockNumber uint64    `json:"block_number"`
	Token       string    `json:"token"`
	TokenName   string    `json:"token_name"`
	From        string    `json:"from"`
	To          string    `json:"to"`
	Amount      string    `json:"amount"`
	MinedAt     time.Time `json:"mined_at"`
}

// MinedBlock bundles everything the block watcher persists for one block.
type MinedBlock struct {
	Block          Block
	Transactions   []*Transaction
	Receipts       map[string]Receipt
	TokenTransfers []*TokenTransfer
}

// ForensicFlag captures a detection raised by the analysis pipeline.
type ForensicFlag struct {
	ID          int             `json:"id"`
	TxHash      string          `json:"tx_hash"`
	Address     string          `json:"address"`
	FlagType    string          `json:"flag_type"`
	Severity    string          `json:"severity"`
	Description string          `json:"description"`
	Evidence    json.RawMessage `json:"evidence,omitempty"`
	DetectedAt  time.Time       `json:"detected_at"`

	WhyFlagged   string `json:"why_flagged,omitempty"`
	TriggerLogic string `json:"trigger_logic,omitempty"`
	Confidence   string `json:"confidence,omitempty"`
	Provenance   string `json:"provenance,omitempty"`
	NextAction   string `json:"next_action,omitempty"`
}
