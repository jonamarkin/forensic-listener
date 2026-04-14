export type OverviewStats = {
  transaction_count: number;
  account_count: number;
  contract_count: number;
  flag_count: number;
  pending_enrichment: number;
  processing_enrichment: number;
  done_enrichment: number;
  latest_transaction_at?: string | null;
};

export type EnrichmentStatus = {
  pending: number;
  processing: number;
  done: number;
  retrying: number;
  max_attempts: number;
  oldest_pending_at?: string | null;
};

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: number;
  gas_price: string;
  nonce: number;
  block_number: number;
  data: string | number[];
  timestamp: string;
};

export type ForensicFlag = {
  id: number;
  tx_hash: string;
  address: string;
  flag_type: string;
  severity: string;
  description: string;
  detected_at: string;
  why_flagged?: string;
  trigger_logic?: string;
  confidence?: string;
  provenance?: string;
  next_action?: string;
};

export type AddressActivity = {
  address: string;
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
  flagged: boolean;
  bytecode_size: number;
  first_seen: string;
  last_seen: string;
};

export type GraphNode = {
  id: string;
  label: string;
  is_contract: boolean;
  entity_type: string;
  entity_name: string;
  risk_level: string;
  is_hub: boolean;
  degree: number;
};

export type GraphEdge = {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
};

export type AddressGraph = {
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  risk_level: string;
  is_hub: boolean;
  outgoing_count: number;
  incoming_count: number;
  degree: number;
  updated_at?: string;
};

export type CounterpartyActivity = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: string;
  is_contract: boolean;
  sent_count: number;
  received_count: number;
  total_count: number;
  total_value: string;
  last_seen: string;
};

export type AccountProfile = {
  address: string;
  balance: string;
  is_contract: boolean;
  first_seen: string;
  last_seen: string;
  sent_count: number;
  received_count: number;
  total_count: number;
  total_sent: string;
  total_received: string;
  flag_count: number;
  high_severity_flag_count: number;
  risk_level: string;
  entity_name: string;
  entity_type: string;
  is_hub: boolean;
  counterparties: CounterpartyActivity[];
  recent_transactions: Transaction[];
};

export type AccountBehaviorProfile = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: string;
  is_contract: boolean;
  sample_size: number;
  features: Record<string, number>;
  updated_at: string;
};

export type SimilarAccountMatch = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: string;
  is_contract: boolean;
  similarity: number;
  highlights: string[];
};

export type ContractDetail = {
  address: string;
  entity_name: string;
  entity_type: string;
  risk_level: string;
  flagged: boolean;
  bytecode_size: number;
  bytecode: string;
  first_seen: string;
  last_seen: string;
  verified: boolean;
  compiler_version: string;
  abi?: unknown;
  source_code?: string;
  decompiled_code?: string;
};

export type ContractSimilarity = {
  address: string;
  similarity: number;
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
  path: string[];
  transaction_hashes: string[];
  hops: number;
};

export type StreamSnapshot = {
  timestamp: string;
  overview?: OverviewStats | null;
  enrichment?: EnrichmentStatus | null;
  recent_transactions?: Transaction[];
  recent_flags?: ForensicFlag[];
};
