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

// Neo4j stores address relationships for graph-style investigations.
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
)

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

// EnsureSchema enforces the graph constraints required by the application.
func (n *Neo4j) EnsureSchema(ctx context.Context) error {
	return n.ensureSchema(ctx)
}

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
			RETURN count(*) AS duplicate_groups,
			       coalesce(sum(c - 1), 0) AS extra_nodes
		`, nil)
		if err != nil {
			return nil, err
		}
		if !result.Next(ctx) {
			return [2]int{}, result.Err()
		}

		record := result.Record()
		duplicateGroupsValue, _ := record.Get("duplicate_groups")
		extraNodesValue, _ := record.Get("extra_nodes")
		return [2]int{
			toInt(duplicateGroupsValue),
			toInt(extraNodesValue),
		}, result.Err()
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

	repairedGroups := 0
	repairedNodes := 0

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
				log.Printf(
					"[neo4j] repair-only mode merged duplicate account address %s (%d duplicate nodes removed, groups repaired=%d)",
					group.address,
					deleted,
					repairedGroups,
				)
			}
		}

		remainingGroups, remainingNodes, err := n.DuplicateAccountSummary(ctx)
		if err != nil {
			return repairedGroups, repairedNodes, err
		}
		log.Printf(
			"[neo4j] repair-only batch complete (%d groups repaired total, %d nodes removed total, %d groups remaining, %d extra nodes remaining)",
			repairedGroups,
			repairedNodes,
			remainingGroups,
			remainingNodes,
		)
	}

	return repairedGroups, repairedNodes, fmt.Errorf("repairing duplicate account nodes: %w", ctx.Err())
}

// SaveTransaction upserts accounts and the directed transfer edge between them.
func (n *Neo4j) SaveTransaction(ctx context.Context, tx *models.Transaction) error {
	fromAddress := NormalizeAddress(tx.From)
	toAddress := NormalizeAddress(tx.To)
	if toAddress == "" {
		return nil
	}

	writeCtx, cancel := context.WithTimeout(ctx, neo4jWriteTimeout)
	defer cancel()

	session := n.driver.NewSession(writeCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(writeCtx)

	timestamp := tx.Timestamp.Format(time.RFC3339Nano)
	query := `
		MERGE (from:Account {address: $from})
		  ON CREATE SET from.first_seen = datetime($timestamp)
		SET from.last_seen = datetime($timestamp)

		MERGE (to:Account {address: $to})
		  ON CREATE SET to.first_seen = datetime($timestamp)
		SET to.last_seen = datetime($timestamp)

		MERGE (from)-[sent:SENT {hash: $hash}]->(to)
		SET sent.value = $value,
		    sent.gas = $gas,
		    sent.gas_price = $gas_price,
		    sent.nonce = $nonce,
		    sent.block_number = $block_number,
		    sent.timestamp = datetime($timestamp)
	`

	_, err := session.ExecuteWrite(writeCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(writeCtx, query, map[string]any{
			"from":         fromAddress,
			"to":           toAddress,
			"hash":         tx.Hash,
			"value":        tx.Value,
			"gas":          int64(tx.Gas),
			"gas_price":    tx.GasPrice,
			"nonce":        int64(tx.Nonce),
			"block_number": int64(tx.BlockNumber),
			"timestamp":    timestamp,
		})
		if err != nil {
			return nil, err
		}
		_, err = result.Consume(writeCtx)
		return nil, err
	})
	if err != nil {
		return fmt.Errorf("saving transaction %s to neo4j: %w", tx.Hash, err)
	}

	return nil
}

// MarkContract flips the graph node into contract mode for downstream analysis.
func (n *Neo4j) MarkContract(ctx context.Context, address string) error {
	address = NormalizeAddress(address)
	if address == "" {
		return nil
	}

	writeCtx, cancel := context.WithTimeout(ctx, neo4jWriteTimeout)
	defer cancel()

	session := n.driver.NewSession(writeCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(writeCtx)

	_, err := session.ExecuteWrite(writeCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(writeCtx, `
			MERGE (acct:Account {address: $address})
			SET acct.is_contract = true
		`, map[string]any{"address": address})
		if err != nil {
			return nil, err
		}
		_, err = result.Consume(writeCtx)
		return nil, err
	})
	if err != nil {
		return fmt.Errorf("marking contract %s in neo4j: %w", address, err)
	}

	return nil
}

// FindReturnPath checks whether the destination already links back to the sender.
func (n *Neo4j) FindReturnPath(ctx context.Context, from, to string, maxHops int) (*models.CircularFlow, error) {
	from = NormalizeAddress(from)
	to = NormalizeAddress(to)
	if from == "" || to == "" || maxHops < 1 {
		return nil, nil
	}

	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	// Neo4j's shortestPath() raises an error when the start and end nodes are the
	// same, so use a bounded variable-length pattern and choose the shortest match.
	query := fmt.Sprintf(`
		MATCH (dst:Account {address: $to}), (src:Account {address: $from})
		MATCH p = (dst)-[:SENT*1..%d]->(src)
		RETURN [n IN nodes(p) | n.address] AS path,
		       [r IN relationships(p) | r.hash] AS tx_hashes,
		       length(p) AS hops
		ORDER BY length(p) ASC
		LIMIT 1
	`, maxHops)

	recordAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, query, map[string]any{
			"from": from,
			"to":   to,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(readCtx) {
			return nil, result.Err()
		}

		return result.Record(), result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("querying circular path %s -> %s: %w", from, to, err)
	}
	if recordAny == nil {
		return nil, nil
	}

	record := recordAny.(*neo4j.Record)
	pathValue, _ := record.Get("path")
	hashesValue, _ := record.Get("tx_hashes")
	hopsValue, _ := record.Get("hops")

	return &models.CircularFlow{
		Path:              toStringSlice(pathValue),
		TransactionHashes: toStringSlice(hashesValue),
		Hops:              toInt(hopsValue),
	}, nil
}

// RecentCircularFlows returns a sample of cycles already present in the graph.
func (n *Neo4j) RecentCircularFlows(ctx context.Context, limit int) ([]*models.CircularFlow, error) {
	if limit <= 0 {
		limit = 20
	}

	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	flowsAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, `
			MATCH p=(start:Account)-[:SENT*2..3]->(start)
			RETURN [n IN nodes(p) | n.address] AS path,
			       [r IN relationships(p) | r.hash] AS tx_hashes,
			       length(p) AS hops
			LIMIT $limit
		`, map[string]any{"limit": limit})
		if err != nil {
			return nil, err
		}

		var flows []*models.CircularFlow
		for result.Next(readCtx) {
			record := result.Record()

			pathValue, _ := record.Get("path")
			hashesValue, _ := record.Get("tx_hashes")
			hopsValue, _ := record.Get("hops")

			flows = append(flows, &models.CircularFlow{
				Path:              toStringSlice(pathValue),
				TransactionHashes: toStringSlice(hashesValue),
				Hops:              toInt(hopsValue),
			})
		}

		return flows, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("querying recent circular flows: %w", err)
	}

	if flowsAny == nil {
		return nil, nil
	}

	return flowsAny.([]*models.CircularFlow), nil
}

// AddressGraph returns a graph neighborhood around a focal address.
func (n *Neo4j) AddressGraph(ctx context.Context, address string, depth, limit int) (*models.AddressGraph, error) {
	address = NormalizeAddress(address)
	if address == "" {
		return nil, nil
	}
	if depth < 1 {
		depth = 1
	}
	if depth > 3 {
		depth = 3
	}
	if limit <= 0 {
		limit = 50
	}

	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	query := fmt.Sprintf(`
		MATCH (center:Account {address: $address})
		OPTIONAL MATCH p=(center)-[:SENT*1..%d]-(other:Account)
		WITH collect(DISTINCT p)[..$limit] AS paths, center
		CALL {
			WITH paths
			UNWIND [p IN paths WHERE p IS NOT NULL] AS p
			UNWIND nodes(p) AS n
			RETURN collect(DISTINCT {
				id: n.address,
				label: n.address,
				is_contract: coalesce(n.is_contract, false)
			}) AS nodes
		}
		CALL {
			WITH paths
			UNWIND [p IN paths WHERE p IS NOT NULL] AS p
			UNWIND relationships(p) AS r
			RETURN collect(DISTINCT {
				hash: r.hash,
				from: startNode(r).address,
				to: endNode(r).address,
				value: r.value,
				timestamp: toString(r.timestamp)
			}) AS edges
		}
		RETURN center.address AS center, nodes, edges
	`, depth)

	graphAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, query, map[string]any{
			"address": address,
			"limit":   limit,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(readCtx) {
			return nil, result.Err()
		}

		record := result.Record()
		centerValue, _ := record.Get("center")
		nodesValue, _ := record.Get("nodes")
		edgesValue, _ := record.Get("edges")

		return &models.AddressGraph{
			Center: fmt.Sprint(centerValue),
			Nodes:  toGraphNodes(nodesValue),
			Edges:  toGraphEdges(edgesValue),
		}, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("querying address graph for %s: %w", address, err)
	}
	if graphAny == nil {
		return nil, nil
	}

	return graphAny.(*models.AddressGraph), nil
}

// TracePath returns the shortest directed path between two addresses up to maxHops.
func (n *Neo4j) TracePath(ctx context.Context, from, to string, maxHops int) (*models.AddressTrace, error) {
	from = NormalizeAddress(from)
	to = NormalizeAddress(to)
	if from == "" || to == "" || maxHops < 1 {
		return nil, nil
	}
	if maxHops > 4 {
		maxHops = 4
	}

	readCtx, cancel := context.WithTimeout(ctx, neo4jReadTimeout)
	defer cancel()

	session := n.driver.NewSession(readCtx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(readCtx)

	query := fmt.Sprintf(`
		MATCH (src:Account {address: $from}), (dst:Account {address: $to})
		MATCH p = (src)-[:SENT*1..%d]->(dst)
		RETURN [n IN nodes(p) | n.address] AS path,
		       [r IN relationships(p) | r.hash] AS tx_hashes,
		       [r IN relationships(p) | {
		           hash: r.hash,
		           from: startNode(r).address,
		           to: endNode(r).address,
		           value: r.value,
		           timestamp: toString(r.timestamp)
		       }] AS edges,
		       length(p) AS hops
		ORDER BY length(p) ASC
		LIMIT 1
	`, maxHops)

	traceAny, err := session.ExecuteRead(readCtx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(readCtx, query, map[string]any{
			"from": from,
			"to":   to,
		})
		if err != nil {
			return nil, err
		}
		if !result.Next(readCtx) {
			return nil, result.Err()
		}

		record := result.Record()
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
		}, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("querying trace path %s -> %s: %w", from, to, err)
	}
	if traceAny == nil {
		return nil, nil
	}

	return traceAny.(*models.AddressTrace), nil
}

// TopHubs returns the highest-degree accounts in the transaction graph.
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
			CALL {
				WITH acct
				OPTIONAL MATCH (acct)-[out:SENT]->()
				RETURN count(out) AS outgoing_count
			}
			CALL {
				WITH acct
				OPTIONAL MATCH ()-[incoming:SENT]->(acct)
				RETURN count(incoming) AS incoming_count
			}
			WITH acct, outgoing_count, incoming_count, outgoing_count + incoming_count AS degree
			WHERE degree > 0
			RETURN acct.address AS address,
			       coalesce(acct.is_contract, false) AS is_contract,
			       outgoing_count,
			       incoming_count,
			       degree
			ORDER BY degree DESC, outgoing_count DESC, incoming_count DESC, address ASC
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

func (n *Neo4j) ensureSchema(ctx context.Context) error {
	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	repairedGroups := 0
	repairedNodes := 0

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
				log.Printf(
					"[neo4j] repaired %d duplicate account groups and removed %d nodes before enforcing schema",
					repairedGroups,
					repairedNodes,
				)
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
		if repairedGroups <= 5 || repairedGroups%25 == 0 {
			log.Printf(
				"[neo4j] repaired duplicate account address %s (%d duplicate nodes removed, groups repaired=%d)",
				address,
				deleted,
				repairedGroups,
			)
		}
	}

	return fmt.Errorf("creating account address constraint: context ended before duplicate repair completed: %w", ctx.Err())
}

func (n *Neo4j) repairAccountGroup(ctx context.Context, address string, nodeIDs []int64) (int, error) {
	address = NormalizeAddress(address)
	if address == "" || len(nodeIDs) == 0 {
		return 0, nil
	}

	sort.Slice(nodeIDs, func(i, j int) bool {
		return nodeIDs[i] < nodeIDs[j]
	})

	keepID := nodeIDs[0]
	duplicateIDs := append([]int64(nil), nodeIDs[1:]...)

	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		if len(duplicateIDs) == 0 {
			result, err := txn.Run(ctx, `
				MATCH (keep:Account)
				WHERE id(keep) = $keep_id
				SET keep.address = $address
			`, map[string]any{
				"keep_id": keepID,
				"address": address,
			})
			if err != nil {
				return nil, err
			}
			_, err = result.Consume(ctx)
			return nil, err
		}

		result, err := txn.Run(ctx, `
			MATCH (keep:Account)
			WHERE id(keep) = $keep_id
			UNWIND $duplicate_ids AS duplicate_id
			MATCH (dup:Account)
			WHERE id(dup) = duplicate_id
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (dup)-[r:SENT]->(target:Account)
				WITH keep, r, target
				WHERE r IS NOT NULL
				MERGE (keep)-[merged:SENT {hash: r.hash}]->(target)
				SET merged += properties(r)
				RETURN count(*) AS moved_outgoing
			}
			CALL {
				WITH keep, dup
				OPTIONAL MATCH (source:Account)-[r:SENT]->(dup)
				WITH keep, source, r
				WHERE r IS NOT NULL
				MERGE (source)-[merged:SENT {hash: r.hash}]->(keep)
				SET merged += properties(r)
				RETURN count(*) AS moved_incoming
			}
			SET keep.address = $address,
			    keep.is_contract = coalesce(keep.is_contract, false) OR coalesce(dup.is_contract, false),
			    keep.first_seen = CASE
			    	WHEN keep.first_seen IS NULL THEN dup.first_seen
			    	WHEN dup.first_seen IS NULL THEN keep.first_seen
			    	WHEN dup.first_seen < keep.first_seen THEN dup.first_seen
			    	ELSE keep.first_seen
			    END,
			    keep.last_seen = CASE
			    	WHEN keep.last_seen IS NULL THEN dup.last_seen
			    	WHEN dup.last_seen IS NULL THEN keep.last_seen
			    	WHEN dup.last_seen > keep.last_seen THEN dup.last_seen
			    	ELSE keep.last_seen
			    END
			WITH dup
			DETACH DELETE dup
		`, map[string]any{
			"keep_id":       keepID,
			"duplicate_ids": duplicateIDs,
			"address":       address,
		})
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
	if limit <= 0 {
		limit = 100
	}

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
			nodeIDsValue, _ := record.Get("node_ids")

			address := NormalizeAddress(fmt.Sprint(addressValue))
			if address == "" {
				continue
			}

			var nodeIDs []int64
			switch ids := nodeIDsValue.(type) {
			case []any:
				nodeIDs = make([]int64, 0, len(ids))
				for _, id := range ids {
					nodeIDs = append(nodeIDs, toInt64(id))
				}
			case []int64:
				nodeIDs = append(nodeIDs, ids...)
			}

			if len(nodeIDs) <= 1 {
				continue
			}

			groups = append(groups, accountDuplicateGroup{
				address: address,
				nodeIDs: nodeIDs,
			})
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
	address = NormalizeAddress(address)
	if address == "" {
		return nil, nil
	}

	session := n.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	nodeIDsAny, err := session.ExecuteRead(ctx, func(txn neo4j.ManagedTransaction) (any, error) {
		result, err := txn.Run(ctx, `
			MATCH (acct:Account {address: $address})
			RETURN id(acct) AS node_id
			ORDER BY node_id ASC
		`, map[string]any{"address": address})
		if err != nil {
			return nil, err
		}

		var nodeIDs []int64
		for result.Next(ctx) {
			record := result.Record()
			nodeIDValue, _ := record.Get("node_id")
			nodeIDs = append(nodeIDs, toInt64(nodeIDValue))
		}

		return nodeIDs, result.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("loading account node ids for %s: %w", address, err)
	}
	if nodeIDsAny == nil {
		return nil, nil
	}

	return nodeIDsAny.([]int64), nil
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
	default:
		if v == nil {
			return nil
		}
		return []string{fmt.Sprint(v)}
	}
}

func toInt(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case int32:
		return int(v)
	default:
		return 0
	}
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
			Label:      fmt.Sprint(entry["label"]),
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
		edges = append(edges, models.GraphEdge{
			Hash:      fmt.Sprint(entry["hash"]),
			From:      fmt.Sprint(entry["from"]),
			To:        fmt.Sprint(entry["to"]),
			Value:     fmt.Sprint(entry["value"]),
			Timestamp: parseGraphTime(entry["timestamp"]),
		})
	}
	return edges
}

func toBool(value any) bool {
	v, ok := value.(bool)
	return ok && v
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
