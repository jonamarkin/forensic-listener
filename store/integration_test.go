package store

// Integration tests against real PostgreSQL (with pgvector) and Neo4j.
//
//	FORENSIC_TEST_POSTGRES_URL=postgres://forensic:forensic@localhost:5432/postgres \
//	FORENSIC_TEST_NEO4J_URL=bolt://localhost:7687 \
//	go test ./store -v
//
// Each run creates and drops its own PostgreSQL database; Neo4j tests use random
// addresses and delete what they create. Without the variables the tests are skipped.

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5"

	"forensic-listener/models"
)

func randomAddress() string {
	b := make([]byte, 20)
	_, _ = rand.Read(b)
	return common.BytesToAddress(b).Hex()
}

func randomHash() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return common.BytesToHash(b).Hex()
}

func newTestPostgres(t *testing.T) *Postgres {
	t.Helper()
	adminURL := os.Getenv("FORENSIC_TEST_POSTGRES_URL")
	if adminURL == "" {
		t.Skip("set FORENSIC_TEST_POSTGRES_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()

	admin, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		t.Fatalf("connecting admin database: %v", err)
	}
	dbName := fmt.Sprintf("forensic_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+dbName); err != nil {
		t.Fatalf("creating test database: %v", err)
	}

	parsed, _ := url.Parse(adminURL)
	parsed.Path = "/" + dbName
	dbURL := parsed.String()
	parsed.Scheme = "pgx5"
	if err := RunMigrations(os.DirFS(".."), parsed.String()); err != nil {
		t.Fatalf("running migrations: %v", err)
	}

	pg, err := NewPostgres(ctx, dbURL)
	if err != nil {
		t.Fatalf("connecting test database: %v", err)
	}
	t.Cleanup(func() {
		pg.Close()
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+dbName+" WITH (FORCE)")
		_ = admin.Close(context.Background())
	})
	return pg
}

func pendingTx(from, to string, nonce uint64) *models.Transaction {
	return &models.Transaction{
		Hash: randomHash(), From: from, To: to, Value: "1000000000000000000", Gas: 21000,
		GasPrice: "30000000000", Type: 2, Nonce: nonce, Timestamp: time.Now().UTC(), Status: models.TxPending,
	}
}

func count(t *testing.T, pg *Postgres, query string, args ...any) int64 {
	t.Helper()
	var n int64
	if err := pg.pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count query %q: %v", query, err)
	}
	return n
}

// The original SaveTransaction locked sender then receiver, so concurrent A->B and
// B->A saves deadlocked and one transaction was silently dropped.
func TestSaveTransactionOppositeDirectionsUnderConcurrency(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()

	const pairs, rounds = 25, 8
	var wg sync.WaitGroup
	errs := make(chan error, pairs*rounds*2)
	start := make(chan struct{})

	for p := 0; p < pairs; p++ {
		a, b := randomAddress(), randomAddress()
		for r := 0; r < rounds; r++ {
			for _, tx := range []*models.Transaction{pendingTx(a, b, uint64(r)), pendingTx(b, a, uint64(r))} {
				wg.Add(1)
				go func(tx *models.Transaction) {
					defer wg.Done()
					<-start
					if err := pg.SaveTransaction(ctx, tx); err != nil {
						errs <- err
					}
				}(tx)
			}
		}
	}
	close(start)
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("SaveTransaction failed: %v", err)
	}
	if got, want := count(t, pg, `SELECT COUNT(*) FROM transactions`), int64(pairs*rounds*2); got != want {
		t.Fatalf("stored %d transactions, want %d (rows were lost)", got, want)
	}
	if got := count(t, pg, `SELECT COUNT(*) FROM enrichment_jobs WHERE status = 'pending'`); got != int64(pairs*rounds*2) {
		t.Fatalf("enqueued %d jobs, want %d", got, pairs*rounds*2)
	}
}

func TestClaimEnrichmentJobNeverDoubleClaims(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()

	const jobs = 150
	for i := 0; i < jobs; i++ {
		if err := pg.SaveTransaction(ctx, pendingTx(randomAddress(), randomAddress(), 0)); err != nil {
			t.Fatal(err)
		}
	}

	var mu sync.Mutex
	claimed := make(map[string]int)
	var wg sync.WaitGroup
	for w := 0; w < 8; w++ {
		wg.Go(func() {
			for {
				tx, err := pg.ClaimEnrichmentJob(ctx, time.Minute)
				if err != nil {
					t.Errorf("claim: %v", err)
					return
				}
				if tx == nil {
					return
				}
				mu.Lock()
				claimed[tx.Hash]++
				mu.Unlock()
			}
		})
	}
	wg.Wait()

	if len(claimed) != jobs {
		t.Fatalf("claimed %d distinct jobs, want %d", len(claimed), jobs)
	}
	for hash, n := range claimed {
		if n != 1 {
			t.Fatalf("job %s claimed %d times", hash, n)
		}
	}
}

func TestFailedJobsBackOffAndStop(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()
	tx := pendingTx(randomAddress(), randomAddress(), 0)
	if err := pg.SaveTransaction(ctx, tx); err != nil {
		t.Fatal(err)
	}

	for attempt := 1; attempt <= 3; attempt++ {
		if _, err := pg.pool.Exec(ctx, `UPDATE enrichment_jobs SET available_at = NOW() - INTERVAL '1 second'`); err != nil {
			t.Fatal(err)
		}
		claimed, err := pg.ClaimEnrichmentJob(ctx, time.Minute)
		if err != nil || claimed == nil {
			t.Fatalf("attempt %d: claim = %v, %v", attempt, claimed, err)
		}
		if err := pg.MarkEnrichmentFailed(ctx, tx.Hash, errors.New("neo4j down"), 3); err != nil {
			t.Fatal(err)
		}
	}

	var status string
	var delay float64
	if err := pg.pool.QueryRow(ctx, `SELECT status, EXTRACT(EPOCH FROM available_at - NOW()) FROM enrichment_jobs WHERE tx_hash = $1`, tx.Hash).Scan(&status, &delay); err != nil {
		t.Fatal(err)
	}
	if status != "failed" {
		t.Fatalf("after max attempts status = %q, want failed", status)
	}
	if delay < 30 {
		t.Fatalf("backoff after 3 attempts = %.0fs, want exponential (>= 30s)", delay)
	}
}

// A seeded label of "none" used to hide a high-severity flag.
func TestAddressRiskTakesTheWorseOfLabelAndFlags(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()

	cases := []struct {
		label, flag, want string
	}{
		{"none", "high", "high"},
		{"high", "", "high"},
		{"low", "medium", "medium"},
		{"", "", "none"},
	}
	for _, c := range cases {
		addr := randomAddress()
		tx := pendingTx(addr, randomAddress(), 0)
		if err := pg.SaveTransaction(ctx, tx); err != nil {
			t.Fatal(err)
		}
		if c.label != "" {
			if _, err := pg.UpsertKnownEntity(ctx, &models.KnownEntity{Address: addr, Name: "test", EntityType: "wallet", RiskLevel: c.label}); err != nil {
				t.Fatal(err)
			}
		}
		if c.flag != "" {
			if err := pg.SaveFlag(ctx, &models.ForensicFlag{TxHash: tx.Hash, Address: addr, FlagType: "circular_flow", Severity: c.flag, Description: "test"}); err != nil {
				t.Fatal(err)
			}
		}
		profile, err := pg.GetAccountProfile(ctx, addr)
		if err != nil {
			t.Fatal(err)
		}
		if profile.RiskLevel != c.want {
			t.Errorf("label=%q flag=%q: risk = %q, want %q", c.label, c.flag, profile.RiskLevel, c.want)
		}
	}
}

func TestSaveBlockPromotesReplacesDecodesAndHandlesReorg(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()

	sender, recipient, holder, token, created := randomAddress(), randomAddress(), randomAddress(), randomAddress(), randomAddress()
	seenPending := pendingTx(sender, recipient, 5)
	willBeReplaced := pendingTx(sender, recipient, 6)
	for _, tx := range []*models.Transaction{seenPending, willBeReplaced} {
		if err := pg.SaveTransaction(ctx, tx); err != nil {
			t.Fatal(err)
		}
	}

	replacement := pendingTx(sender, recipient, 6)
	neverSeen := pendingTx(holder, token, 0)
	neverSeen.Data = []byte{0xa9, 0x05, 0x9c, 0xbb}
	deployment := pendingTx(holder, "", 1)
	deployment.CreatedContract = created

	minedAt := time.Now().UTC().Truncate(time.Second)
	block := &models.MinedBlock{
		Block:        models.Block{Number: 100, Hash: randomHash(), ParentHash: randomHash(), MinedAt: minedAt, TxCount: 4, GasUsed: 90000},
		Transactions: []*models.Transaction{seenPending, replacement, neverSeen, deployment},
		Receipts: map[string]models.Receipt{
			seenPending.Hash: {GasUsed: 21000, EffectiveGasPrice: "20000000000", Status: 1},
			neverSeen.Hash:   {GasUsed: 50000, EffectiveGasPrice: "20000000000", Status: 1},
		},
		TokenTransfers: []*models.TokenTransfer{{
			TxHash: neverSeen.Hash, LogIndex: 0, BlockNumber: 100, Token: token, From: holder, To: recipient,
			Amount: "123456789000000000000000000000", MinedAt: minedAt,
		}},
	}

	if err := pg.SaveBlock(ctx, block); err != nil {
		t.Fatalf("SaveBlock: %v", err)
	}
	if err := pg.SaveBlock(ctx, block); err != nil {
		t.Fatalf("SaveBlock is not idempotent: %v", err)
	}

	status := func(hash string) (string, *int64) {
		var s string
		var n *int64
		if err := pg.pool.QueryRow(ctx, `SELECT status, block_number FROM transactions WHERE hash = $1`, hash).Scan(&s, &n); err != nil {
			t.Fatalf("status of %s: %v", hash, err)
		}
		return s, n
	}

	if s, n := status(seenPending.Hash); s != "mined" || n == nil || *n != 100 {
		t.Errorf("pending tx after block: status=%s block=%v, want mined in 100", s, n)
	}
	if s, _ := status(willBeReplaced.Hash); s != "replaced" {
		t.Errorf("same sender+nonce mined under another hash: status=%s, want replaced", s)
	}
	if s, _ := status(neverSeen.Hash); s != "mined" {
		t.Errorf("transaction only seen in block: status=%s, want mined", s)
	}
	if got := count(t, pg, `SELECT COUNT(*) FROM token_transfers WHERE tx_hash = $1 AND amount = 123456789000000000000000000000`, neverSeen.Hash); got != 1 {
		t.Errorf("token transfers stored = %d, want 1 with an exact 30-digit amount", got)
	}
	if got := count(t, pg, `SELECT COUNT(*) FROM accounts WHERE address = $1 AND is_contract`, NormalizeAddress(created)); got != 1 {
		t.Errorf("created contract not recorded as a contract account")
	}
	if got := count(t, pg, `SELECT COUNT(*) FROM enrichment_jobs WHERE tx_hash = $1 AND status = 'pending'`, deployment.Hash); got != 1 {
		t.Errorf("contract creation was not queued for enrichment")
	}

	reorged := *block
	reorged.Block.Hash = randomHash()
	reorged.Transactions = []*models.Transaction{replacement}
	reorged.TokenTransfers = nil
	if err := pg.SaveBlock(ctx, &reorged); err != nil {
		t.Fatalf("SaveBlock (reorg): %v", err)
	}
	if s, n := status(seenPending.Hash); s != "pending" || n != nil {
		t.Errorf("after reorg the orphaned tx is %s in block %v, want pending with no block", s, n)
	}
	if got := count(t, pg, `SELECT COUNT(*) FROM token_transfers WHERE block_number = 100`); got != 0 {
		t.Errorf("after reorg %d token transfers remain for the orphaned block, want 0", got)
	}
}

func TestNetworkMetricsAreZeroFilled(t *testing.T) {
	pg := newTestPostgres(t)
	ctx := context.Background()

	old := pendingTx(randomAddress(), randomAddress(), 0)
	old.Timestamp = time.Now().UTC().Add(-3 * time.Hour)
	recent := pendingTx(randomAddress(), randomAddress(), 0)
	for _, tx := range []*models.Transaction{old, recent} {
		if err := pg.SaveTransaction(ctx, tx); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pg.RefreshNetworkHourly(ctx, time.Now().Add(-6*time.Hour)); err != nil {
		t.Fatal(err)
	}

	points, err := pg.NetworkMetrics(ctx, 6)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 6 {
		t.Fatalf("got %d hourly points, want 6 (empty hours must be filled)", len(points))
	}
	var total int64
	for _, p := range points {
		total += p.TransactionCount
	}
	if total != 2 || points[len(points)-1].TransactionCount != 1 || points[len(points)-4].TransactionCount != 1 {
		t.Fatalf("unexpected distribution: %+v", points)
	}
}

func TestContractSimilarityFindsClonesNotStrangers(t *testing.T) {
	pg := newTestPostgres(t)
	vector := NewVector(pg.Pool())
	ctx := context.Background()
	code := loadRuntimeBytecode(t)

	clone := append([]byte(nil), code["Sweeper"]...)
	for i := len(clone) - 20; i < len(clone)-2; i++ {
		clone[i] ^= 0x33
	}
	contracts := map[string][]byte{
		"sweeper": code["Sweeper"], "clone": clone, "registry": code["NameRegistry"], "token": code["SimpleToken"],
	}
	addresses := map[string]string{}
	for name, bytecode := range contracts {
		addr := randomAddress()
		addresses[name] = NormalizeAddress(addr)
		if err := pg.UpsertAccount(ctx, addr, true); err != nil {
			t.Fatal(err)
		}
		if err := vector.UpsertContract(ctx, addr, bytecode); err != nil {
			t.Fatal(err)
		}
	}

	matches, err := vector.SimilarContracts(ctx, addresses["sweeper"], 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) == 0 || matches[0].Address != addresses["clone"] || !matches[0].SameSkeleton || matches[0].Similarity < 0.999 {
		t.Fatalf("top match = %+v, want the clone with similarity ~1 and same skeleton", matches)
	}
	for _, m := range matches[1:] {
		if m.Similarity >= SimilarBytecodeThreshold {
			t.Errorf("unrelated contract %s scored %.3f, at or above threshold", m.Address, m.Similarity)
		}
	}
}

// ---------------------------------------------------------------------------
// Neo4j
// ---------------------------------------------------------------------------

func newTestNeo4j(t *testing.T) *Neo4j {
	t.Helper()
	uri := os.Getenv("FORENSIC_TEST_NEO4J_URL")
	if uri == "" {
		t.Skip("set FORENSIC_TEST_NEO4J_URL to run Neo4j integration tests")
	}
	password := os.Getenv("FORENSIC_TEST_NEO4J_PASSWORD")
	if password == "" {
		password = "forensic123"
	}
	graph, err := NewNeo4j(context.Background(), uri, "neo4j", password)
	if err != nil {
		t.Fatalf("connecting neo4j: %v", err)
	}
	t.Cleanup(graph.Close)
	return graph
}

func cleanupGraph(t *testing.T, graph *Neo4j, addresses ...string) {
	t.Cleanup(func() {
		_ = graph.write(context.Background(), `
			UNWIND $addresses AS address
			MATCH (a:Account {address: address}) DETACH DELETE a
		`, map[string]any{"addresses": addresses})
	})
}

func sent(from, to string, at time.Time) *models.Transaction {
	tx := pendingTx(from, to, 0)
	tx.Timestamp = at
	return tx
}

func TestFindReturnPathRequiresTimeOrder(t *testing.T) {
	graph := newTestNeo4j(t)
	ctx := context.Background()
	now := time.Now().UTC()

	a, b, c := NormalizeAddress(randomAddress()), NormalizeAddress(randomAddress()), NormalizeAddress(randomAddress())
	x, y, z := NormalizeAddress(randomAddress()), NormalizeAddress(randomAddress()), NormalizeAddress(randomAddress())
	cleanupGraph(t, graph, a, b, c, x, y, z)

	// In order: A->B at t-3h, B->C at t-2h; C->A at t closes a 3-transfer loop.
	for _, tx := range []*models.Transaction{sent(a, b, now.Add(-3*time.Hour)), sent(b, c, now.Add(-2*time.Hour))} {
		if err := graph.SaveTransaction(ctx, tx); err != nil {
			t.Fatal(err)
		}
	}
	flow, err := graph.FindReturnPath(ctx, c, a, now.Add(-24*time.Hour), now, 3)
	if err != nil {
		t.Fatal(err)
	}
	if flow == nil || flow.Hops != 2 || flow.Path[0] != a || flow.Path[2] != c {
		t.Fatalf("ordered loop not found: %+v", flow)
	}

	// Out of order: Y->Z happened before X->Y, so value could not have flowed X->Y->Z.
	for _, tx := range []*models.Transaction{sent(y, z, now.Add(-3*time.Hour)), sent(x, y, now.Add(-2*time.Hour))} {
		if err := graph.SaveTransaction(ctx, tx); err != nil {
			t.Fatal(err)
		}
	}
	flow, err = graph.FindReturnPath(ctx, z, x, now.Add(-24*time.Hour), now, 3)
	if err != nil {
		t.Fatal(err)
	}
	if flow != nil {
		t.Fatalf("out-of-order chain reported as a loop: %+v", flow)
	}
}

// The original neighbourhood query collected every path before slicing and ran
// Neo4j out of heap at depth 3 on a well-connected address.
func TestAddressGraphStaysBoundedOnAHub(t *testing.T) {
	graph := newTestNeo4j(t)
	ctx := context.Background()

	hub := NormalizeAddress(randomAddress())
	all := []string{hub}
	rows := make([]map[string]any, 0, 2400)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for i := 0; i < 400; i++ {
		spoke := NormalizeAddress(randomAddress())
		all = append(all, spoke)
		rows = append(rows, map[string]any{"from": spoke, "to": hub, "hash": randomHash()})
		for j := 0; j < 5; j++ {
			leaf := NormalizeAddress(randomAddress())
			all = append(all, leaf)
			rows = append(rows, map[string]any{"from": leaf, "to": spoke, "hash": randomHash()})
		}
	}
	cleanupGraph(t, graph, all...)

	if err := graph.write(ctx, `
		UNWIND $rows AS row
		MERGE (f:Account {address: row.from})
		MERGE (t:Account {address: row.to})
		CREATE (f)-[:SENT {hash: row.hash, value: '1', timestamp: datetime($now)}]->(t)
	`, map[string]any{"rows": rows, "now": now}); err != nil {
		t.Fatal(err)
	}

	started := time.Now()
	result, err := graph.AddressGraph(ctx, hub, 3, 60, "all")
	if err != nil {
		t.Fatalf("AddressGraph on hub at depth 3: %v", err)
	}
	elapsed := time.Since(started)

	payload, _ := json.Marshal(result)
	t.Logf("depth 3 on a hub: %d nodes, %d edges, truncated=%t in %s (%d bytes)",
		len(result.Nodes), len(result.Edges), result.Truncated, elapsed, len(payload))
	if elapsed > 2*time.Second {
		t.Errorf("took %s, want well under the 3 s read timeout", elapsed)
	}
	if len(result.Edges) > 200 {
		t.Errorf("returned %d edges, want a bounded neighbourhood", len(result.Edges))
	}
}
