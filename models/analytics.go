package models

import "time"

type OverviewStats struct {
	TransactionCount     int64      `json:"transaction_count"`
	AccountCount         int64      `json:"account_count"`
	ContractCount        int64      `json:"contract_count"`
	FlagCount            int64      `json:"flag_count"`
	PendingEnrichment    int64      `json:"pending_enrichment"`
	ProcessingEnrichment int64      `json:"processing_enrichment"`
	DoneEnrichment       int64      `json:"done_enrichment"`
	LatestTransactionAt  *time.Time `json:"latest_transaction_at"`
}

type EnrichmentStatus struct {
	Pending         int64      `json:"pending"`
	Processing      int64      `json:"processing"`
	Done            int64      `json:"done"`
	Retrying        int64      `json:"retrying"`
	MaxAttempts     int64      `json:"max_attempts"`
	OldestPendingAt *time.Time `json:"oldest_pending_at"`
}

type AddressActivity struct {
	Address       string    `json:"address"`
	IsContract    bool      `json:"is_contract"`
	FirstSeen     time.Time `json:"first_seen"`
	LastSeen      time.Time `json:"last_seen"`
	SentCount     int64     `json:"sent_count"`
	ReceivedCount int64     `json:"received_count"`
	TotalCount    int64     `json:"total_count"`
	TotalSent     string    `json:"total_sent"`
	TotalReceived string    `json:"total_received"`
}

type ContractSummary struct {
	Address      string    `json:"address"`
	Flagged      bool      `json:"flagged"`
	BytecodeSize int       `json:"bytecode_size"`
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
}

type FlagBucket struct {
	Bucket   time.Time `json:"bucket"`
	FlagType string    `json:"flag_type"`
	Severity string    `json:"severity"`
	Count    int64     `json:"count"`
}

type GraphNode struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	IsContract bool   `json:"is_contract"`
	EntityType string `json:"entity_type"`
	EntityName string `json:"entity_name"`
	RiskLevel  string `json:"risk_level"`
	IsHub      bool   `json:"is_hub"`
	Degree     int    `json:"degree"`
}

type GraphEdge struct {
	Hash      string    `json:"hash"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Value     string    `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

type AddressGraph struct {
	Center string      `json:"center"`
	Nodes  []GraphNode `json:"nodes"`
	Edges  []GraphEdge `json:"edges"`
}

type AddressTrace struct {
	From              string      `json:"from"`
	To                string      `json:"to"`
	Hops              int         `json:"hops"`
	Path              []string    `json:"path"`
	TransactionHashes []string    `json:"transaction_hashes"`
	Edges             []GraphEdge `json:"edges"`
}

type KnownEntity struct {
	Address    string    `json:"address"`
	Name       string    `json:"name"`
	EntityType string    `json:"entity_type"`
	RiskLevel  string    `json:"risk_level"`
	IsHub      bool      `json:"is_hub"`
	Source     string    `json:"source"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type HubSummary struct {
	Address       string    `json:"address"`
	IsContract    bool      `json:"is_contract"`
	EntityType    string    `json:"entity_type"`
	EntityName    string    `json:"entity_name"`
	RiskLevel     string    `json:"risk_level"`
	IsHub         bool      `json:"is_hub"`
	OutgoingCount int       `json:"outgoing_count"`
	IncomingCount int       `json:"incoming_count"`
	Degree        int       `json:"degree"`
	UpdatedAt     time.Time `json:"updated_at,omitempty"`
}

type StreamSnapshot struct {
	Timestamp          time.Time         `json:"timestamp"`
	Overview           *OverviewStats    `json:"overview"`
	Enrichment         *EnrichmentStatus `json:"enrichment"`
	RecentTransactions []*Transaction    `json:"recent_transactions"`
	RecentFlags        []*ForensicFlag   `json:"recent_flags"`
}
