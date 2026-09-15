package models

import "time"

type CounterpartyActivity struct {
	Address       string    `json:"address"`
	EntityName    string    `json:"entity_name"`
	EntityType    string    `json:"entity_type"`
	RiskLevel     string    `json:"risk_level"`
	IsContract    bool      `json:"is_contract"`
	SentCount     int64     `json:"sent_count"`
	ReceivedCount int64     `json:"received_count"`
	TotalCount    int64     `json:"total_count"`
	TotalValue    string    `json:"total_value"`
	LastSeen      time.Time `json:"last_seen"`
}

type AccountProfile struct {
	Address string `json:"address"`
	// Balance is read live from the node (wei); nil when the node is unreachable.
	Balance               *string                 `json:"balance"`
	IsContract            bool                    `json:"is_contract"`
	FirstSeen             time.Time               `json:"first_seen"`
	LastSeen              time.Time               `json:"last_seen"`
	SentCount             int64                   `json:"sent_count"`
	ReceivedCount         int64                   `json:"received_count"`
	TotalCount            int64                   `json:"total_count"`
	TotalSent             string                  `json:"total_sent"`
	TotalReceived         string                  `json:"total_received"`
	CounterpartyCount     int64                   `json:"counterparty_count"`
	TokenTransferCount    int64                   `json:"token_transfer_count"`
	FlagCount             int64                   `json:"flag_count"`
	HighSeverityFlagCount int64                   `json:"high_severity_flag_count"`
	RiskLevel             string                  `json:"risk_level"`
	FlagRisk              string                  `json:"flag_risk"`
	LabelRisk             string                  `json:"label_risk"`
	EntityName            string                  `json:"entity_name"`
	EntityType            string                  `json:"entity_type"`
	LabelSource           string                  `json:"label_source"`
	IsHub                 bool                    `json:"is_hub"`
	Counterparties        []*CounterpartyActivity `json:"counterparties"`
	RecentTransactions    []*Transaction          `json:"recent_transactions"`
	RecentTokenTransfers  []*TokenTransfer        `json:"recent_token_transfers"`
	Flags                 []*ForensicFlag         `json:"flags"`
}

type ContractDetail struct {
	Address          string     `json:"address"`
	EntityName       string     `json:"entity_name"`
	EntityType       string     `json:"entity_type"`
	RiskLevel        string     `json:"risk_level"`
	Flagged          bool       `json:"flagged"`
	BytecodeSize     int        `json:"bytecode_size"`
	Bytecode         string     `json:"bytecode"`
	SkeletonHash     string     `json:"skeleton_hash"`
	CloneFamilySize  int        `json:"clone_family_size"`
	TransactionCount int64      `json:"transaction_count"`
	FirstSeen        time.Time  `json:"first_seen"`
	LastSeen         time.Time  `json:"last_seen"`
	EmbeddedAt       *time.Time `json:"embedded_at"`
}

type AccountBehaviorProfile struct {
	Address    string             `json:"address"`
	EntityName string             `json:"entity_name"`
	EntityType string             `json:"entity_type"`
	RiskLevel  string             `json:"risk_level"`
	IsContract bool               `json:"is_contract"`
	SampleSize int64              `json:"sample_size"`
	Features   map[string]float64 `json:"features"`
	UpdatedAt  time.Time          `json:"updated_at"`
}

type SimilarAccountMatch struct {
	Address    string   `json:"address"`
	EntityName string   `json:"entity_name"`
	EntityType string   `json:"entity_type"`
	RiskLevel  string   `json:"risk_level"`
	IsContract bool     `json:"is_contract"`
	SampleSize int64    `json:"sample_size"`
	Similarity float64  `json:"similarity"`
	Highlights []string `json:"highlights"`
}

type NetworkMetricPoint struct {
	Bucket           time.Time `json:"bucket"`
	TransactionCount int64     `json:"transaction_count"`
	UniqueAddresses  int64     `json:"unique_addresses"`
	AvgGasPrice      string    `json:"avg_gas_price"`
	TotalValue       string    `json:"total_value"`
}

type AccountVelocityPoint struct {
	Bucket        time.Time `json:"bucket"`
	SentCount     int64     `json:"sent_count"`
	ReceivedCount int64     `json:"received_count"`
	TotalCount    int64     `json:"total_count"`
	SentValue     string    `json:"sent_value"`
	ReceivedValue string    `json:"received_value"`
	TotalValue    string    `json:"total_value"`
}
