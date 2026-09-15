package models

import "time"

type OverviewStats struct {
	TransactionCount    int64      `json:"transaction_count"`
	PendingCount        int64      `json:"pending_count"`
	AccountCount        int64      `json:"account_count"`
	ContractCount       int64      `json:"contract_count"`
	FlagCount           int64      `json:"flag_count"`
	HighFlagCount24h    int64      `json:"high_flag_count_24h"`
	TokenTransferCount  int64      `json:"token_transfer_count"`
	BlockCount          int64      `json:"block_count"`
	LatestBlock         *uint64    `json:"latest_block"`
	LatestBlockAt       *time.Time `json:"latest_block_at"`
	LatestTransactionAt *time.Time `json:"latest_transaction_at"`
	FirstTransactionAt  *time.Time `json:"first_transaction_at"`
}

type EnrichmentStatus struct {
	Pending         int64      `json:"pending"`
	Processing      int64      `json:"processing"`
	Done            int64      `json:"done"`
	Failed          int64      `json:"failed"`
	Retrying        int64      `json:"retrying"`
	OldestPendingAt *time.Time `json:"oldest_pending_at"`
}

// ChainStatus breaks observed transactions down by lifecycle state.
type ChainStatus struct {
	Pending  int64     `json:"pending"`
	Mined    int64     `json:"mined"`
	Replaced int64     `json:"replaced"`
	Dropped  int64     `json:"dropped"`
	AsOf     time.Time `json:"as_of"`
}

// IngestionStatus reports whether the node feeds are connected and when they last delivered data.
type IngestionStatus struct {
	PendingFeedConnected bool       `json:"pending_feed_connected"`
	LastPendingAt        *time.Time `json:"last_pending_at"`
	HeadFeedConnected    bool       `json:"head_feed_connected"`
	LastHeadAt           *time.Time `json:"last_head_at"`
	LastBlock            *uint64    `json:"last_block"`
}

type StoreHealth struct {
	Name      string  `json:"name"`
	OK        bool    `json:"ok"`
	LatencyMs float64 `json:"latency_ms"`
	Error     string  `json:"error,omitempty"`
}

type Health struct {
	Status    string          `json:"status"`
	Stores    []StoreHealth   `json:"stores"`
	Ingestion IngestionStatus `json:"ingestion"`
}

type AddressActivity struct {
	Address       string    `json:"address"`
	EntityName    string    `json:"entity_name"`
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
	Address          string    `json:"address"`
	EntityName       string    `json:"entity_name"`
	RiskLevel        string    `json:"risk_level"`
	Flagged          bool      `json:"flagged"`
	BytecodeSize     int       `json:"bytecode_size"`
	CloneFamilySize  int       `json:"clone_family_size"`
	FirstSeen        time.Time `json:"first_seen"`
	LastSeen         time.Time `json:"last_seen"`
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

// GraphEdge is one value movement: an ETH transaction (kind "eth", Neo4j :SENT)
// or an ERC-20 transfer (kind "token", Neo4j :TRANSFERRED).
type GraphEdge struct {
	Kind      string    `json:"kind"`
	Hash      string    `json:"hash"`
	LogIndex  *int      `json:"log_index,omitempty"`
	Token     string    `json:"token,omitempty"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Value     string    `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

type AddressGraph struct {
	Center    string      `json:"center"`
	Nodes     []GraphNode `json:"nodes"`
	Edges     []GraphEdge `json:"edges"`
	Truncated bool        `json:"truncated"`
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
	Chain              *ChainStatus      `json:"chain"`
	Ingestion          IngestionStatus   `json:"ingestion"`
	RecentTransactions []*Transaction    `json:"recent_transactions"`
	RecentFlags        []*ForensicFlag   `json:"recent_flags"`
}
