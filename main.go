package main

import (
	"context"
	"embed"
	"log"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"forensic-listener/api"
	"forensic-listener/client"
	"forensic-listener/forensics"
	"forensic-listener/ingestion"
	"forensic-listener/store"
)

// Migrations are compiled into the binary, so it can start from any directory.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	postgresURL := envOrDefault("POSTGRES_URL", "postgres://forensic:forensic@localhost:5432/blockchain")
	migrationsURL := envOrDefault("POSTGRES_MIGRATIONS_URL", "pgx5://forensic:forensic@localhost:5432/blockchain")
	neo4jURL := envOrDefault("NEO4J_URL", "bolt://localhost:7687")
	neo4jUser := envOrDefault("NEO4J_USER", "neo4j")
	neo4jPassword := envOrDefault("NEO4J_PASSWORD", "forensic123")
	ethWSURL := envOrDefault("ETH_WS_URL", "ws://localhost:8546")
	apiAddr := envOrDefault("API_ADDR", ":8080")
	apiToken := os.Getenv("API_AUTH_TOKEN")
	apiAllowedOrigin := envOrDefault("API_ALLOW_ORIGIN", "*")
	apiRateLimit := envOrDefaultInt("API_RATE_LIMIT_RPM", 0)
	startupTimeout := time.Duration(envOrDefaultInt("STARTUP_TIMEOUT_SECONDS", 45)) * time.Second
	disableNeo4j := os.Getenv("DISABLE_NEO4J") == "1"
	requireNeo4j := os.Getenv("REQUIRE_NEO4J") == "1"
	ingestBlocks := os.Getenv("DISABLE_BLOCK_INGEST") != "1"

	if os.Getenv("NEO4J_REPAIR_ONLY") == "1" {
		runNeo4jRepair(ctx, neo4jURL, neo4jUser, neo4jPassword, startupTimeout, envOrDefaultInt("NEO4J_REPAIR_BATCH_SIZE", 100))
		return
	}

	log.Println("Starting forensic listener...")

	log.Println("[startup] running migrations")
	if err := store.RunMigrations(migrationsFS, migrationsURL); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	pgCtx, cancelPg := context.WithTimeout(ctx, startupTimeout)
	pg, err := store.NewPostgres(pgCtx, postgresURL)
	cancelPg()
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pg.Close()
	log.Println("[startup] postgres ready (pgvector shares this pool)")

	seedCtx, cancelSeed := context.WithTimeout(ctx, startupTimeout)
	seeded, err := pg.SeedKnownEntities(seedCtx)
	cancelSeed()
	if err != nil {
		log.Fatalf("known entities: %v", err)
	}
	log.Printf("[startup] known entity seeds applied (%d changed)", seeded)

	vector := store.NewVector(pg.Pool())

	var graph *store.Neo4j
	if disableNeo4j {
		log.Println("[startup] neo4j disabled by DISABLE_NEO4J=1")
	} else {
		neoCtx, cancelNeo := context.WithTimeout(ctx, startupTimeout)
		graph, err = store.NewNeo4j(neoCtx, neo4jURL, neo4jUser, neo4jPassword)
		cancelNeo()
		if err != nil {
			if requireNeo4j {
				log.Fatalf("neo4j: %v", err)
			}
			log.Printf("[startup] neo4j unavailable, continuing without graph features: %v", err)
			graph = nil
		} else {
			defer graph.Close()
			log.Println("[startup] neo4j ready")
		}
	}

	ethCtx, cancelEth := context.WithTimeout(ctx, startupTimeout)
	node, err := client.New(ethCtx, ethWSURL)
	cancelEth()
	if err != nil {
		log.Fatalf("ethereum node: %v", err)
	}
	defer node.Close()
	log.Printf("[startup] ethereum node connected at %s", ethWSURL)

	circular := forensics.NewCircularDetector(graph, pg)
	anomaly := forensics.NewAnomalyDetector(vector, pg, pg)

	engine := ingestion.NewEngine(ingestion.Config{
		Client:       node,
		Postgres:     pg,
		Graph:        graph,
		Vector:       vector,
		Circular:     circular,
		Anomaly:      anomaly,
		IngestBlocks: ingestBlocks,
	})

	srv := api.NewServer(api.Deps{
		Postgres:  pg,
		Graph:     graph,
		Vector:    vector,
		Node:      node,
		Anomaly:   anomaly,
		Ingestion: engine.Status(),
	}, api.Config{
		AuthToken:          apiToken,
		AllowedOrigin:      apiAllowedOrigin,
		RateLimitPerMinute: apiRateLimit,
	})

	var wg sync.WaitGroup
	wg.Go(func() { engine.Run(ctx) })
	wg.Go(func() {
		if err := srv.Run(ctx, apiAddr); err != nil {
			log.Printf("api: %v", err)
			cancel()
		}
	})

	<-ctx.Done()
	log.Println("Shutting down gracefully...")
	wg.Wait()
}

func runNeo4jRepair(ctx context.Context, url, user, password string, timeout time.Duration, batchSize int) {
	log.Println("Starting Neo4j repair-only mode...")

	connectCtx, cancel := context.WithTimeout(ctx, timeout)
	graph, err := store.NewNeo4jWithoutSchema(connectCtx, url, user, password)
	cancel()
	if err != nil {
		log.Fatalf("neo4j: %v", err)
	}
	defer graph.Close()

	groups, extra, err := graph.DuplicateAccountSummary(ctx)
	if err != nil {
		log.Fatalf("neo4j duplicate summary: %v", err)
	}
	log.Printf("[repair] found %d duplicate account groups and %d extra nodes", groups, extra)

	repairedGroups, repairedNodes, err := graph.RepairDuplicateAccounts(ctx, batchSize)
	if err != nil {
		log.Fatalf("neo4j repair: %v", err)
	}
	log.Printf("[repair] repaired %d groups, removed %d nodes", repairedGroups, repairedNodes)

	if err := graph.EnsureSchema(ctx); err != nil {
		log.Fatalf("neo4j schema: %v", err)
	}
	log.Println("[repair] duplicate cleanup complete and schema enforced")
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envOrDefaultInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
