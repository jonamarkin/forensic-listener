package store

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"forensic-listener/models"
)

// Neo4j stores value flows as a property graph for traversal queries:
//
//	(:Account {address})-[:SENT {hash, value, value_eth, timestamp}]->(:Account)
//	(:Account {address})-[:TRANSFERRED {tx_hash, log_index, token, amount, timestamp}]->(:Account)
type Neo4j struct {
	driver neo4j.DriverWithContext
}

type accountDuplicateGroup struct {
	address string
	nodeIDs []int64
}

const (
	neo4jWriteTimeout  = 5 * time.Second
	neo4jReadTimeout   = 3 * time.Second
	neo4jMaxRetryTime  = 5 * time.Second
	neo4jSchemaTimeout = 2 * time.Minute

	zeroAddress = "0x0000000000000000000000000000000000000000"
)

// Flow kinds accepted by graph queries, mapped to relationship types.
var flowRelationshipTypes = map[string]string{
	"all":   "SENT|TRANSFERRED",
	"eth":   "SENT",
	"token": "TRANSFERRED",
}

// FlowTypes returns the relationship-type expression for a flow kind (default "all").
func FlowTypes(kind string) string {
	if types, ok := flowRelationshipTypes[kind]; ok {
		return types
	}
	return flowRelationshipTypes["all"]
}

func NewNeo4j(ctx context.Context, uri, user, password string) (*Neo4j, error) {
	return newNeo4j(ctx, uri, user, password, true)
}

// NewNeo4jWithoutSchema connects to Neo4j without attempting startup schema repair.
func NewNeo4jWithoutSchema(ctx context.Context, uri, user, password string) (*Neo4j, error) {
	return newNeo4j(ctx, uri, user, password, false)
}

func newNeo4j(ctx context.Context, uri, user, password string, ensureSchema bool) (*Neo4j, error) {
	driver, err := neo4j.NewDriverWithContext(
		uri,
		neo4j.BasicAuth(user, password, ""),
		func(cfg *neo4j.Config) {
			cfg.MaxTransactionRetryTime = neo4jMaxRetryTime
		},
	)
	if err != nil {
		return nil, fmt.Errorf("creating neo4j driver: %w", err)
	}

	if err := driver.VerifyConnectivity(ctx); err != nil {
		_ = driver.Close(context.Background())
		return nil, fmt.Errorf("verifying neo4j connectivity: %w", err)
	}

	store := &Neo4j{driver: driver}
	if ensureSchema {
		schemaCtx, cancel := context.WithTimeout(ctx, neo4jSchemaTimeout)
		defer cancel()
		if err := store.ensureSchema(schemaCtx); err != nil {
			_ = driver.Close(context.Background())
			return nil, fmt.Errorf("ensuring neo4j schema: %w", err)
		}
	}

	return store, nil
}

func (n *Neo4j) Close() {
	_ = n.driver.Close(context.Background())
}

func (n *Neo4j) Ping(ctx context.Context) error {
	return n.driver.VerifyConnectivity(ctx)
}

// EnsureSchema enforces the graph constraints required by the application.
func (n *Neo4j) EnsureSchema(ctx context.Context) error {
	return n.ensureSchema(ctx)
}

func (n *Neo4j) write(ctx context.Context, query string, params map[string]any) error {
	writeCtx, cancel := context.WithTimeout(ctx, neo4jWriteTimeout)
	defer cancel()

	session := n.driver.NewSession(writeCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(writeCtx)

	_, err := session.ExecuteWrite(writeCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(writeCtx, query, params)
		if err != nil {
			return nil, err
		}
		_, err = result.Consume(writeCtx)
		return nil, err
	})
	return err
}

// SaveTransaction upserts both accounts and the directed :SENT edge between them.
// MERGE on the transaction hash makes the write idempotent.
func (n *Neo4j) SaveTransaction(ctx context.Context, tx *models.Transaction) error {
	from := NormalizeAddress(tx.From)
	to := NormalizeAddress(tx.To)
	if to == "" {
		return nil
	}

	err := n.write(ctx, `
		MERGE (from:Account {address: $from})
		  ON CREATE SET from.first_seen = datetime($timestamp)
		SET from.last_seen = CASE WHEN from.last_seen IS NULL OR from.last_seen < datetime($timestamp)
		                          THEN datetime($timestamp) ELSE from.last_seen END

		MERGE (to:Account {address: $to})
		  ON CREATE SET to.first_seen = datetime($timestamp)
		SET to.last_seen = CASE WHEN to.last_seen IS NULL OR to.last_seen < datetime($timestamp)
		                        THEN datetime($timestamp) ELSE to.last_seen END

		MERGE (from)-[sent:SENT {hash: $hash}]->(to)
		SET sent.value = $value,
		    sent.value_eth = toFloat($value) / 1.0e18,
		    sent.nonce = $nonce,
		    sent.timestamp = datetime($timestamp)
	`, map[string]any{
		"from":      from,
		"to":        to,
		"hash":      tx.Hash,
		"value":     tx.Value,
		"nonce":     int64(tx.Nonce),
		"timestamp": tx.Timestamp.UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return fmt.Errorf("saving transaction %s to neo4j: %w", tx.Hash, err)
	}
	return nil
}

// SaveTokenTransfers adds :TRANSFERRED edges between the real sender and recipient of
// each ERC-20 transfer. Mints and burns (the zero address) are not money flows and are
// kept out of the graph.
func (n *Neo4j) SaveTokenTransfers(ctx context.Context, transfers []*models.TokenTransfer) error {
	rows := make([]map[string]any, 0, len(transfers))
	for _, tt := range transfers {
		from, to := NormalizeAddress(tt.From), NormalizeAddress(tt.To)
		if from == zeroAddress || to == zeroAddress || from == "" || to == "" {
			continue
		}
		rows = append(rows, map[string]any{
			"from":      from,
			"to":        to,
			"tx_hash":   tt.TxHash,
			"log_index": int64(tt.LogIndex),
			"token":     NormalizeAddress(tt.Token),
			"amount":    tt.Amount,
			"timestamp": tt.MinedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	if len(rows) == 0 {
		return nil
	}

	err := n.write(ctx, `
		UNWIND $rows AS t
		MERGE (from:Account {address: t.from})
		  ON CREATE SET from.first_seen = datetime(t.timestamp)
		SET from.last_seen = CASE WHEN from.last_seen IS NULL OR from.last_seen < datetime(t.timestamp)
		                          THEN datetime(t.timestamp) ELSE from.last_seen END
		MERGE (to:Account {address: t.to})
		  ON CREATE SET to.first_seen = datetime(t.timestamp)
		SET to.last_seen = CASE WHEN to.last_seen IS NULL OR to.last_seen < datetime(t.timestamp)
		                        THEN datetime(t.timestamp) ELSE to.last_seen END
		MERGE (from)-[r:TRANSFERRED {tx_hash: t.tx_hash, log_index: t.log_index}]->(to)
		SET r.token = t.token,
		    r.amount = t.amount,
		    r.timestamp = datetime(t.timestamp)
	`, map[string]any{"rows": rows})
	if err != nil {
		return fmt.Errorf("saving %d token transfers to neo4j: %w", len(rows), err)
	}
	return nil
}

// MarkContract flags the graph node as a contract.
func (n *Neo4j) MarkContract(ctx context.Context, address string) error {
	address = NormalizeAddress(address)
	if address == "" {
		return nil
	}
	if err := n.write(ctx, `
		MERGE (acct:Account {address: $address})
		SET acct.is_contract = true
	`, map[string]any{"address": address}); err != nil {
		return fmt.Errorf("marking contract %s in neo4j: %w", address, err)
	}
	return nil
}

func (n *Neo4j) readSingle(ctx context.Context, query string, params map[string]any) (*neo4j.Record, error) {
	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	recordAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, query, params)
		if err != nil {
			return nil, err
		}
		if !result.Next(readCtx) {
			return nil, result.Err()
		}
		return result.Record(), result.Err()
	})
	if err != nil || recordAny == nil {
		return nil, err
	}
	return recordAny.(*neo4j.Record), nil
}

// FindReturnPath looks for value that left `to` and came back to `from` through a
// time-ordered chain of transfers inside [since, before]: every hop happens no earlier
// than the one before it. Called when the transfer from -> to closes the loop.
func (n *Neo4j) FindReturnPath(ctx context.Context, from, to string, since, before time.Time, maxHops int) (*models.CircularFlow, error) {
	from = NormalizeAddress(from)
	to = NormalizeAddress(to)
	if from == "" || to == "" || from == to || maxHops < 1 {
		return nil, nil
	}

	// maxHops is an integer clamped by the caller; it cannot carry injected Cypher.
	query := fmt.Sprintf(`
		MATCH (dst:Account {address: $to}), (src:Account {address: $from})
		MATCH p = (dst)-[:SENT|TRANSFERRED*1..%d]->(src)
		WHERE all(r IN relationships(p) WHERE r.timestamp >= datetime($since) AND r.timestamp <= datetime($before))
		  AND all(i IN range(0, size(relationships(p)) - 2)
		          WHERE relationships(p)[i].timestamp <= relationships(p)[i + 1].timestamp)
		RETURN [x IN nodes(p) | x.address] AS path,
		       [r IN relationships(p) | coalesce(r.hash, r.tx_hash)] AS tx_hashes,
		       [r IN relationships(p) | CASE type(r) WHEN 'SENT' THEN 'eth' ELSE 'token' END] AS kinds,
		       length(p) AS hops
		ORDER BY hops ASC
		LIMIT 1
	`, clamp(maxHops, 1, 4))

	record, err := n.readSingle(ctx, query, map[string]any{
		"from":   from,
		"to":     to,
		"since":  since.UTC().Format(time.RFC3339Nano),
		"before": before.UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return nil, fmt.Errorf("querying return path %s -> %s: %w", to, from, err)
	}
	if record == nil {
		return nil, nil
	}

	pathValue, _ := record.Get("path")
	hashesValue, _ := record.Get("tx_hashes")
	kindsValue, _ := record.Get("kinds")
	hopsValue, _ := record.Get("hops")

	return &models.CircularFlow{
		Path:              toStringSlice(pathValue),
		TransactionHashes: toStringSlice(hashesValue),
		Kinds:             toStringSlice(kindsValue),
		Hops:              toInt(hopsValue),
	}, nil
}

// AddressGraph returns the neighbourhood around an address. The path budget is split
// evenly across hop levels and each level stops expanding as soon as its budget is
// met (LIMIT inside the subquery), so a hub cannot trigger an unbounded expansion.
// The original query collected every path before slicing and exhausted a 1 GB heap
// at depth 3.
func (n *Neo4j) AddressGraph(ctx context.Context, address string, depth, limit int, flows string) (*models.AddressGraph, error) {
	address = NormalizeAddress(address)
	if address == "" {
		return nil, nil
	}
	depth = clamp(depth, 1, 3)
	if limit <= 0 {
		limit = 60
	}
	perLevel := (limit + depth - 1) / depth
	types := FlowTypes(flows)

	branches := make([]string, 0, depth)
	for d := 1; d <= depth; d++ {
		branches = append(branches, fmt.Sprintf(`
			WITH center
			OPTIONAL MATCH p = (center)-[:%s*%d]-(:Account)
			RETURN p LIMIT $per_level`, types, d))
	}

	query := `
		MATCH (center:Account {address: $address})
		CALL {` + strings.Join(branches, "\n\t\t\tUNION ALL") + `
		}
		WITH center, collect(p) AS paths
		CALL {
			WITH paths
			UNWIND paths AS p
			UNWIND nodes(p) AS x
			RETURN collect(DISTINCT {id: x.address, is_contract: coalesce(x.is_contract, false)}) AS nodes
		}
		CALL {
			WITH paths
			UNWIND paths AS p
			UNWIND relationships(p) AS r
			RETURN collect(DISTINCT {
				kind: CASE type(r) WHEN 'SENT' THEN 'eth' ELSE 'token' END,
				hash: coalesce(r.hash, r.tx_hash),
				log_index: r.log_index,
				token: r.token,
				from: startNode(r).address,
				to: endNode(r).address,
				value: coalesce(r.value, r.amount),
				timestamp: toString(r.timestamp)
			}) AS edges
		}
		RETURN center.address AS center, coalesce(center.is_contract, false) AS center_is_contract,
		       nodes, edges, size(paths) AS path_count
	`

	record, err := n.readSingle(ctx, query, map[string]any{"address": address, "per_level": perLevel})
	if err != nil {
		return nil, fmt.Errorf("querying address graph for %s: %w", address, err)
	}
	if record == nil {
		return nil, nil
	}

	centerValue, _ := record.Get("center")
	centerIsContract, _ := record.Get("center_is_contract")
	nodesValue, _ := record.Get("nodes")
	edgesValue, _ := record.Get("edges")
	pathCount, _ := record.Get("path_count")

	graph := &models.AddressGraph{
		Center:    fmt.Sprint(centerValue),
		Nodes:     toGraphNodes(nodesValue),
		Edges:     toGraphEdges(edgesValue),
		Truncated: toInt(pathCount) >= perLevel,
	}
	hasCenter := false
	for _, node := range graph.Nodes {
		if node.ID == graph.Center {
			hasCenter = true
			break
		}
	}
	if !hasCenter {
		graph.Nodes = append(graph.Nodes, models.GraphNode{ID: graph.Center, Label: graph.Center, IsContract: toBool(centerIsContract)})
	}
	return graph, nil
}

// TracePath returns the shortest directed path between two addresses. shortestPath
// uses a bidirectional breadth-first search and stops at the first hit.
func (n *Neo4j) TracePath(ctx context.Context, from, to string, maxHops int, flows string) (*models.AddressTrace, error) {
	from = NormalizeAddress(from)
	to = NormalizeAddress(to)
	if from == "" || to == "" || from == to || maxHops < 1 {
		return nil, nil
	}

	query := fmt.Sprintf(`
		MATCH (src:Account {address: $from}), (dst:Account {address: $to})
		MATCH p = shortestPath((src)-[:%s*1..%d]->(dst))
		RETURN [x IN nodes(p) | x.address] AS path,
		       [r IN relationships(p) | coalesce(r.hash, r.tx_hash)] AS tx_hashes,
		       [r IN relationships(p) | {
		           kind: CASE type(r) WHEN 'SENT' THEN 'eth' ELSE 'token' END,
		           hash: coalesce(r.hash, r.tx_hash),
		           log_index: r.log_index,
		           token: r.token,
		           from: startNode(r).address,
		           to: endNode(r).address,
		           value: coalesce(r.value, r.amount),
		           timestamp: toString(r.timestamp)
		       }] AS edges,
		       length(p) AS hops
	`, FlowTypes(flows), clamp(maxHops, 1, 6))

	record, err := n.readSingle(ctx, query, map[string]any{"from": from, "to": to})
	if err != nil {
		return nil, fmt.Errorf("querying trace path %s -> %s: %w", from, to, err)
	}
	if record == nil {
		return nil, nil
	}

	pathValue, _ := record.Get("path")
	hashesValue, _ := record.Get("tx_hashes")
	edgesValue, _ := record.Get("edges")
	hopsValue, _ := record.Get("hops")

	return &models.AddressTrace{
		From:              from,
		To:                to,
		Hops:              toInt(hopsValue),
		Path:              toStringSlice(pathValue),
		TransactionHashes: toStringSlice(hashesValue),
		Edges:             toGraphEdges(edgesValue),
	}, nil
}

// TopHubs returns the highest-degree accounts. COUNT {} on a single typed hop is
// answered from Neo4j's stored degree counts rather than by walking relationships.
func (n *Neo4j) TopHubs(ctx context.Context, limit int) ([]*models.HubSummary, error) {
	if limit <= 0 {
		limit = 10
	}

	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	hubsAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, `
			MATCH (acct:Account)
			WITH acct,
			     COUNT { (acct)-[:SENT|TRANSFERRED]->() } AS outgoing_count,
			     COUNT { (acct)<-[:SENT|TRANSFERRED]-() } AS incoming_count
			WITH acct, outgoing_count, incoming_count, outgoing_count + incoming_count AS degree
			WHERE degree > 0
			RETURN acct.address AS address,
			       coalesce(acct.is_contract, false) AS is_contract,
			       outgoing_count, incoming_count, degree
			ORDER BY degree DESC, address ASC
			LIMIT $limit
		`, map[string]any{"limit": limit})
		if err != nil {
			return nil, err
		}

		var hubs []*models.HubSummary
		for result.Next(readCtx) {
			record := result.Record()
			addressValue, _ := record.Get("address")
			isContractValue, _ := record.Get("is_contract")
			outgoingValue, _ := record.Get("outgoing_count")
			incomingValue, _ := record.Get("incoming_count")
			degreeValue, _ := record.Get("degree")

			hubs = append(hubs, &models.HubSummary{
				Address:       fmt.Sprint(addressValue),
				IsContract:    toBool(isContractValue),
				OutgoingCount: toInt(outgoingValue),
				IncomingCount: toInt(incomingValue),
				Degree:        toInt(degreeValue),
				IsHub:         true,
			})
		}
		return hubs, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("querying top hubs: %w", err)
	}
	if hubsAny == nil {
		return nil, nil
	}
	return hubsAny.([]*models.HubSummary), nil
}

// ---------------------------------------------------------------------------
// Schema and duplicate repair
// ---------------------------------------------------------------------------

// DuplicateAccountSummary returns the number of duplicate address groups and extra nodes.
func (n *Neo4j) DuplicateAccountSummary(ctx context.Context) (int, int, error) {
	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	summaryAny, err := session.ExecuteRead(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(ctx, `
			MATCH (acct:Account)
			WHERE acct.address IS NOT NULL
			WITH acct.address AS address, count(*) AS c
			WHERE c > 1
			RETURN count(*) AS duplicate_groups, coalesce(sum(c - 1), 0) AS extra_nodes
		`, nil)
		if err != nil {
			return nil, err
		}
		if !result.Next(ctx) {
			return [2]int{}, result.Err()
		}
		record := result.Record()
		groups, _ := record.Get("duplicate_groups")
		extra, _ := record.Get("extra_nodes")
		return [2]int{toInt(groups), toInt(extra)}, result.Err()
	})
	if err != nil {
		return 0, 0, fmt.Errorf("loading duplicate account summary: %w", err)
	}
	if summaryAny == nil {
		return 0, 0, nil
	}
	summary := summaryAny.([2]int)
	return summary[0], summary[1], nil
}

// RepairDuplicateAccounts repairs duplicate Account nodes in batches and returns totals.
func (n *Neo4j) RepairDuplicateAccounts(ctx context.Context, batchSize int) (int, int, error) {
	if batchSize <= 0 {
		batchSize = 100
	}

	repairedGroups, repairedNodes := 0, 0
	for ctx.Err() == nil {
		groups, err := n.duplicateAccountGroups(ctx, batchSize)
		if err != nil {
			return repairedGroups, repairedNodes, err
		}
		if len(groups) == 0 {
			return repairedGroups, repairedNodes, nil
		}

		for _, group := range groups {
			deleted, err := n.repairAccountGroup(ctx, group.address, group.nodeIDs)
			if err != nil {
				return repairedGroups, repairedNodes, err
			}
			if deleted == 0 {
				continue
			}
			repairedGroups++
			repairedNodes += deleted
			if repairedGroups <= 5 || repairedGroups%25 == 0 {
				log.Printf("[neo4j] merged duplicate account %s (%d nodes removed, groups repaired=%d)",
					group.address, deleted, repairedGroups)
			}
		}
	}

	return repairedGroups, repairedNodes, fmt.Errorf("repairing duplicate account nodes: %w", ctx.Err())
}

func (n *Neo4j) ensureSchema(ctx context.Context) error {
	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	repairedGroups, repairedNodes := 0, 0
	for ctx.Err() == nil {
		_, err := session.ExecuteWrite(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
			result, err := txn.Run(ctx, `
				CREATE CONSTRAINT account_address_unique IF NOT EXISTS
				FOR (acct:Account)
				REQUIRE acct.address IS UNIQUE
			`, nil)
			if err != nil {
				return nil, err
			}
			_, err = result.Consume(ctx)
			return nil, err
		})
		if err == nil {
			if repairedGroups > 0 {
				log.Printf("[neo4j] repaired %d duplicate account groups (%d nodes) before enforcing schema",
					repairedGroups, repairedNodes)
			}
			return nil
		}

		address, ok := duplicateAccountAddress(err)
		if !ok {
			return fmt.Errorf("creating account address constraint: %w", err)
		}
		deleted, repairErr := n.repairDuplicateAccountAddress(ctx, address)
		if repairErr != nil {
			return fmt.Errorf("repairing duplicate account nodes for %s: %w", address, repairErr)
		}
		if deleted == 0 {
			return fmt.Errorf("creating account address constraint: %w", err)
		}
		repairedGroups++
		repairedNodes += deleted
	}

	return fmt.Errorf("creating account address constraint: context ended before duplicate repair completed: %w", ctx.Err())
}

func (n *Neo4j) repairAccountGroup(ctx context.Context, address string, nodeIDs []int64) (int, error) {
	address = NormalizeAddress(address)
	if address == "" || len(nodeIDs) == 0 {
		return 0, nil
	}

	sort.Slice(nodeIDs, func(i, j int) bool { return nodeIDs[i] < nodeIDs[j] })
	keepID := nodeIDs[0]
	duplicateIDs := append([]int64(nil), nodeIDs[1:]...)
	if len(duplicateIDs) == 0 {
		return 0, nil
	}

	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(ctx, `
			MATCH (keep:Account) WHERE id(keep) = $keep_id
			UNWIND $duplicate_ids AS duplicate_id
			MATCH (dup:Account) WHERE id(dup) = duplicate_id
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (dup)-[r:SENT]->(target:Account)
				WITH keep, r, target WHERE r IS NOT NULL
				MERGE (keep)-[merged:SENT {hash: r.hash}]->(target)
				SET merged += properties(r)
				RETURN count(*) AS moved_sent_out
			}
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (source:Account)-[r:SENT]->(dup)
				WITH keep, source, r WHERE r IS NOT NULL
				MERGE (source)-[merged:SENT {hash: r.hash}]->(keep)
				SET merged += properties(r)
				RETURN count(*) AS moved_sent_in
			}
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (dup)-[r:TRANSFERRED]->(target:Account)
				WITH keep, r, target WHERE r IS NOT NULL
				MERGE (keep)-[merged:TRANSFERRED {tx_hash: r.tx_hash, log_index: r.log_index}]->(target)
				SET merged += properties(r)
				RETURN count(*) AS moved_transfers_out
			}
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (source:Account)-[r:TRANSFERRED]->(dup)
				WITH keep, source, r WHERE r IS NOT NULL
				MERGE (source)-[merged:TRANSFERRED {tx_hash: r.tx_hash, log_index: r.log_index}]->(keep)
				SET merged += properties(r)
				RETURN count(*) AS moved_transfers_in
			}
			SET keep.address = $address,
			    keep.is_contract = coalesce(keep.is_contract, false) OR coalesce(dup.is_contract, false)
			WITH dup
			DETACH DELETE dup
		`, map[string]any{"keep_id": keepID, "duplicate_ids": duplicateIDs, "address": address})
		if err != nil {
			return nil, err
		}
		_, err = result.Consume(ctx)
		return nil, err
	})
	if err != nil {
		return 0, fmt.Errorf("repairing account node group for %s: %w", address, err)
	}
	return len(duplicateIDs), nil
}

func (n *Neo4j) repairDuplicateAccountAddress(ctx context.Context, address string) (int, error) {
	nodeIDs, err := n.accountNodeIDsByAddress(ctx, address)
	if err != nil {
		return 0, err
	}
	return n.repairAccountGroup(ctx, address, nodeIDs)
}

func (n *Neo4j) duplicateAccountGroups(ctx context.Context, limit int) ([]accountDuplicateGroup, error) {
	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	groupsAny, err := session.ExecuteRead(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(ctx, `
			MATCH (acct:Account)
			WHERE acct.address IS NOT NULL
			WITH acct.address AS address, collect(id(acct)) AS node_ids
			WHERE size(node_ids) > 1
			RETURN address, node_ids
			ORDER BY size(node_ids) DESC, address ASC
			LIMIT $limit
		`, map[string]any{"limit": limit})
		if err != nil {
			return nil, err
		}

		var groups []accountDuplicateGroup
		for result.Next(ctx) {
			record := result.Record()
			addressValue, _ := record.Get("address")
			idsValue, _ := record.Get("node_ids")
			address := NormalizeAddress(fmt.Sprint(addressValue))
			var ids []int64
			if raw, ok := idsValue.([]any); ok {
				for _, id := range raw {
					ids = append(ids, toInt64(id))
				}
			}
			if address != "" && len(ids) > 1 {
				groups = append(groups, accountDuplicateGroup{address: address, nodeIDs: ids})
			}
		}
		return groups, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("loading duplicate account groups: %w", err)
	}
	if groupsAny == nil {
		return nil, nil
	}
	return groupsAny.([]accountDuplicateGroup), nil
}

func (n *Neo4j) accountNodeIDsByAddress(ctx context.Context, address string) ([]int64, error) {
	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	idsAny, err := session.ExecuteRead(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(ctx, `
			MATCH (acct:Account {address: $address})
			RETURN id(acct) AS node_id ORDER BY node_id
		`, map[string]any{"address": NormalizeAddress(address)})
		if err != nil {
			return nil, err
		}
		var ids []int64
		for result.Next(ctx) {
			value, _ := result.Record().Get("node_id")
			ids = append(ids, toInt64(value))
		}
		return ids, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("loading account node ids for %s: %w", address, err)
	}
	if idsAny == nil {
		return nil, nil
	}
	return idsAny.([]int64), nil
}

func duplicateAccountAddress(err error) (string, bool) {
	const marker = "property `address` = '"
	message := err.Error()
	start := strings.Index(message, marker)
	if start == -1 {
		return "", false
	}
	start += len(marker)
	end := strings.Index(message[start:], "'")
	if end == -1 {
		return "", false
	}
	address := NormalizeAddress(message[start : start+end])
	return address, address != ""
}

// ---------------------------------------------------------------------------
// Value conversion helpers
// ---------------------------------------------------------------------------

func clamp(v, lo, hi int) int {
	return max(lo, min(hi, v))
}

func toStringSlice(value any) []string {
	switch v := value.(type) {
	case []string:
		return append([]string(nil), v...)
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, fmt.Sprint(item))
		}
		return out
	case nil:
		return nil
	default:
		return []string{fmt.Sprint(v)}
	}
}

func toInt(value any) int {
	return int(toInt64(value))
}

func toInt64(value any) int64 {
	switch v := value.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case int32:
		return int64(v)
	default:
		return 0
	}
}

func toBool(value any) bool {
	v, ok := value.(bool)
	return ok && v
}

func toGraphNodes(value any) []models.GraphNode {
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	nodes := make([]models.GraphNode, 0, len(raw))
	for _, item := range raw {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		nodes = append(nodes, models.GraphNode{
			ID:         fmt.Sprint(entry["id"]),
			Label:      fmt.Sprint(entry["id"]),
			IsContract: toBool(entry["is_contract"]),
		})
	}
	return nodes
}

func toGraphEdges(value any) []models.GraphEdge {
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	edges := make([]models.GraphEdge, 0, len(raw))
	for _, item := range raw {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		edge := models.GraphEdge{
			Kind:      fmt.Sprint(entry["kind"]),
			Hash:      fmt.Sprint(entry["hash"]),
			From:      fmt.Sprint(entry["from"]),
			To:        fmt.Sprint(entry["to"]),
			Value:     fmt.Sprint(entry["value"]),
			Timestamp: parseGraphTime(entry["timestamp"]),
		}
		if token, ok := entry["token"].(string); ok {
			edge.Token = token
		}
		if logIndex, ok := entry["log_index"].(int64); ok {
			li := int(logIndex)
			edge.LogIndex = &li
		}
		edges = append(edges, edge)
	}
	return edges
}

func parseGraphTime(value any) time.Time {
	switch v := value.(type) {
	case time.Time:
		return v
	case string:
		if parsed, err := time.Parse(time.RFC3339Nano, v); err == nil {
			return parsed
		}
	}
	return time.Time{}
}
