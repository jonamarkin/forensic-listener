// Mirrors the Go models in /models. Big integers (wei, token amounts) are strings.

export type TxStatus = "pending" | "mined" | "replaced" | "dropped";
export type RiskLevel = "none" | "low" | "medium" | "high";

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: number;
  /** Legacy gas price, or the max fee per gas for EIP-1559 (type 2+) transactions. */
  gas_price: string;
  max_priority_fee: string | null;
  type: number;
  nonce: number;
  /** Calldata, base64-encoded. Only present on the transaction detail endpoint. */
  data?: string;
  /** When this system first observed the transaction. */
  timestamp: string;
  status: TxStatus;
  block_number: number | null;
  mined_at: string | null;
  gas_used: number | null;
  effective_gas_price: string | null;
  receipt_status: number | null;
  created_contract?: string;
};

export type TokenTransfer = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  token: string;
  token_name: string;
  from: string;
  to: string;
  amount: string;
  mined_at: string;
};

export type CircularEvidence = {
  path: string[];
  transaction_hashes: string[];
  kinds: ("eth" | "token")[];
  hops: number;
};

export type BytecodeEvidence = {
  matched_address: string;
  similarity: number;
  same_skeleton: boolean;
  matched_risk: string;
  threshold: number;
};

export type ForensicFlag = {
  id: number;
  tx_hash: string;
  address: string;
  flag_type: "circular_flow" | "similar_bytecode" | string;
  severity: RiskLevel;
  description: string;
  evidence?: CircularEvidence | BytecodeEvidence | Record<string, unknown>;
  detected_at: string;
  why_flagged?: string;
  trigger_logic?: string;
  /** Detection method, fixed per detector (not a per-flag score). */
  confidence?: string;
  provenance?: string;
  next_action?: string;
};

export type OverviewStats = {
  transaction_count: number;
  pending_count: number;
  account_count: number;
  contract_count: number;
  flag_count: number;
  high_flag_count_24h: number;
  token_transfer_count: number;
  block_count: number;
  latest_block: number | null;
  latest_block_at: string | null;
  latest_transaction_at: string | null;
  first_transaction_at: string | null;
};

export type EnrichmentStatus = {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  retrying: number;
  oldest_pending_at: string | null;
};

export type ChainStatus = {
  pending: number;
  mined: number;
  replaced: number;
  dropped: number;
  as_of: string;
};

export type IngestionStatus = {
  pending_feed_connected: boolean;
  last_pending_at: string | null;
  head_feed_connected: boolean;
  last_head_at: string | null;
  last_block: number | null;
};

export type StoreHealth = {
  name: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
};

export type Health = {
  status: "ok" | "degraded" | "down";
  stores: StoreHealth[];
  ingestion: IngestionStatus;
};

export type StreamSnapshot = {
  timestamp: string;
  overview: OverviewStats | null;
  enrichment: EnrichmentStatus | null;
  chain: ChainStatus | null;
  ingestion: IngestionStatus;
  recent_transactions: Transaction[];
  recent_flags: ForensicFlag[];
};

export type AddressActivity = {
  address: string;
  entity_name: string;
  is_contract: boolean;
  first_seen: string;
  last_seen: string;
  sent_count: number;
  received_count: number;
  total_count: number;
  total_sent: string;
  total_received: string;
};

export type ContractSummary = {
  address: string;
  entity_name: string;
  risk_level: RiskLevel;
  flagged: boolean;
  bytecode_size: number;
  clone_family_size: number;
  first_seen: string;
  last_seen: string;
};

export type FlagBucket = {
  bucket: string;
  flag_type: string;
  severity: string;
  count: number;
};

export type GraphNode = {
  id: string;
  label: string;
  is_contract: boolean;
  entity_type: string;
  entity_name: string;
  risk_level: RiskLevel;
  is_hub: boolean;
  degree: number;
};

export type GraphEdge = {
  kind: "eth" | "token";
  hash: string;
  log_index?: number;
  token?: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
};

export type AddressGraph = {
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
};

export type AddressTrace = {
  from: string;
  to: string;
  hops: number;
  path: string[];
  transaction_hashes: string[];
  edges: GraphEdge[];
};

export type HubSummary = {
  address: string;
  is_contract: boolean;
  entity_type: string;
  entity_name: string;
  risk_level: RiskLevel;
  is_hub: boolean;
  outgoing_count: number;
  incoming_count: number;
  degree: number;
  updated_at?: string;
};

export type KnownEntity = {
  address: string;
  name: string;
  entity_type: string;
  risk_level: RiskLevel;
  is_hub: boolean;
  source: string;
  updated_at: string;
};

export type CounterpartyActivity = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: RiskLevel;
  is_contract: boolean;
  sent_count: number;
  received_count: number;
  total_count: number;
  total_value: string;
  last_seen: string;
};

export type AccountProfile = {
  address: string;
  /** Live balance from the node in wei; null when the node is unreachable. */
  balance: string | null;
  is_contract: boolean;
  first_seen: string;
  last_seen: string;
  sent_count: number;
  received_count: number;
  total_count: number;
  total_sent: string;
  total_received: string;
  counterparty_count: number;
  token_transfer_count: number;
  flag_count: number;
  high_severity_flag_count: number;
  risk_level: RiskLevel;
  flag_risk: RiskLevel;
  label_risk: RiskLevel;
  entity_name: string;
  entity_type: string;
  label_source: string;
  is_hub: boolean;
  counterparties: CounterpartyActivity[];
  recent_transactions: Transaction[];
  recent_token_transfers: TokenTransfer[];
  flags: ForensicFlag[];
};

export type AccountBehaviorProfile = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: RiskLevel;
  is_contract: boolean;
  sample_size: number;
  features: Record<string, number>;
  updated_at: string;
};

export type SimilarAccountMatch = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: RiskLevel;
  is_contract: boolean;
  sample_size: number;
  similarity: number;
  highlights: string[];
};

export type ContractDetail = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: RiskLevel;
  flagged: boolean;
  bytecode_size: number;
  bytecode: string;
  skeleton_hash: string;
  clone_family_size: number;
  transaction_count: number;
  first_seen: string;
  last_seen: string;
  embedded_at: string | null;
};

export type ContractSimilarity = {
  address: string;
  entity_name: string;
  risk_level: RiskLevel;
  similarity: number;
  same_skeleton: boolean;
  flagged: boolean;
};

export type NetworkMetricPoint = {
  bucket: string;
  transaction_count: number;
  unique_addresses: number;
  avg_gas_price: string;
  total_value: string;
};

export type AccountVelocityPoint = {
  bucket: string;
  sent_count: number;
  received_count: number;
  total_count: number;
  sent_value: string;
  received_value: string;
  total_value: string;
};

export type CircularFlow = {
  flag_id: number;
  tx_hash: string;
  address: string;
  severity: RiskLevel;
  detected_at: string;
  path: string[];
  transaction_hashes: string[];
  kinds: ("eth" | "token")[];
  hops: number;
};
