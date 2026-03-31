package models

import (
	"encoding/json"
	"time"
)

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

type InvestigatorNote struct {
	ID        int64     `json:"id"`
	Address   string    `json:"address"`
	Author    string    `json:"author"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AddressTag struct {
	ID        int64     `json:"id"`
	Address   string    `json:"address"`
	Tag       string    `json:"tag"`
	CreatedAt time.Time `json:"created_at"`
}

type AccountProfile struct {
	Address               string                      `json:"address"`
	Balance               string                      `json:"balance"`
	IsContract            bool                        `json:"is_contract"`
	FirstSeen             time.Time                   `json:"first_seen"`
	LastSeen              time.Time                   `json:"last_seen"`
	SentCount             int64                       `json:"sent_count"`
	ReceivedCount         int64                       `json:"received_count"`
	TotalCount            int64                       `json:"total_count"`
	TotalSent             string                      `json:"total_sent"`
	TotalReceived         string                      `json:"total_received"`
	FlagCount             int64                       `json:"flag_count"`
	HighSeverityFlagCount int64                       `json:"high_severity_flag_count"`
	RiskLevel             string                      `json:"risk_level"`
	EntityName            string                      `json:"entity_name"`
	EntityType            string                      `json:"entity_type"`
	IsHub                 bool                        `json:"is_hub"`
	Counterparties        []*CounterpartyActivity     `json:"counterparties"`
	RecentTransactions    []*Transaction              `json:"recent_transactions"`
	Notes                 []*InvestigatorNote         `json:"notes"`
	Tags                  []*AddressTag               `json:"tags"`
	Cases                 []*InvestigationCaseSummary `json:"cases"`
}

type ContractDetail struct {
	Address         string          `json:"address"`
	EntityName      string          `json:"entity_name"`
	EntityType      string          `json:"entity_type"`
	RiskLevel       string          `json:"risk_level"`
	Flagged         bool            `json:"flagged"`
	BytecodeSize    int             `json:"bytecode_size"`
	Bytecode        string          `json:"bytecode"`
	FirstSeen       time.Time       `json:"first_seen"`
	LastSeen        time.Time       `json:"last_seen"`
	Verified        bool            `json:"verified"`
	CompilerVersion string          `json:"compiler_version"`
	ABI             json.RawMessage `json:"abi,omitempty"`
	SourceCode      string          `json:"source_code,omitempty"`
	DecompiledCode  string          `json:"decompiled_code,omitempty"`
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

type VelocityAlert struct {
	Address       string    `json:"address"`
	EntityName    string    `json:"entity_name"`
	EntityType    string    `json:"entity_type"`
	RiskLevel     string    `json:"risk_level"`
	IsContract    bool      `json:"is_contract"`
	CurrentCount  int64     `json:"current_count"`
	BaselineCount float64   `json:"baseline_count"`
	SpikeRatio    float64   `json:"spike_ratio"`
	LastSeen      time.Time `json:"last_seen"`
}
