package main

import (
	"context"
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

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(),
		os.Interrupt, syscall.SIGTERM)
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
	neo4jRepairOnly := envOrDefault("NEO4J_REPAIR_ONLY", "") == "1"
	neo4jRepairBatchSize := envOrDefaultInt("NEO4J_REPAIR_BATCH_SIZE", 100)
	startupTimeout := time.Duration(envOrDefaultInt("STARTUP_TIMEOUT_SECONDS", 45)) * time.Second
	disableNeo4j := envOrDefault("DISABLE_NEO4J", "") == "1"
	requireNeo4j := envOrDefault("REQUIRE_NEO4J", "") == "1"

	if neo4jRepairOnly {
		log.Println("Starting forensic listener Neo4j repair-only mode...")
		log.Printf("[repair] startup timeout set to %s", startupTimeout)
		log.Printf("[repair] connecting neo4j at %s", neo4jURL)

		neo4jCtx, cancelNeo4j := context.WithTimeout(ctx, startupTimeout)
		graph, err := store.NewNeo4jWithoutSchema(neo4jCtx, neo4jURL, neo4jUser, neo4jPassword)
		cancelNeo4j()
		if err != nil {
			log.Fatalf("neo4j: %v", err)
		}
		defer graph.Close()

		summaryCtx, cancelSummary := context.WithTimeout(ctx, startupTimeout)
		duplicateGroups, extraNodes, err := graph.DuplicateAccountSummary(summaryCtx)
		cancelSummary()
		if err != nil {
			log.Fatalf("neo4j duplicate summary: %v", err)
		}
		log.Printf("[repair] found %d duplicate account groups and %d extra nodes", duplicateGroups, extraNodes)

		repairCtx, cancelRepair := context.WithTimeout(ctx, startupTimeout)
		repairedGroups, repairedNodes, err := graph.RepairDuplicateAccounts(repairCtx, neo4jRepairBatchSize)
		cancelRepair()
		if err != nil {
			log.Fatalf("neo4j repair: %v", err)
		}
		log.Printf("[repair] repaired %d duplicate groups and removed %d duplicate nodes", repairedGroups, repairedNodes)

		postRepairCtx, cancelPostRepair := context.WithTimeout(ctx, startupTimeout)
		duplicateGroups, extraNodes, err = graph.DuplicateAccountSummary(postRepairCtx)
		cancelPostRepair()
		if err != nil {
			log.Fatalf("neo4j duplicate summary after repair: %v", err)
		}
		if duplicateGroups > 0 || extraNodes > 0 {
			log.Fatalf("neo4j repair incomplete: %d duplicate groups and %d extra nodes remain", duplicateGroups, extraNodes)
		}

		schemaCtx, cancelSchema := context.WithTimeout(ctx, startupTimeout)
		err = graph.EnsureSchema(schemaCtx)
		cancelSchema()
		if err != nil {
			log.Fatalf("neo4j schema: %v", err)
		}

		log.Println("[repair] neo4j duplicate cleanup complete and schema enforced")
		return
	}

	log.Println("Starting forensic listener...")
	log.Printf("[startup] startup timeout set to %s", startupTimeout)

	log.Println("[startup] running migrations")
	if err := store.RunMigrations(migrationsURL); err != nil {
		log.Fatalf("migrations: %v", err)
	}
	log.Println("[startup] migrations complete")

	log.Printf("[startup] connecting postgres at %s", postgresURL)
	postgresCtx, cancelPostgres := context.WithTimeout(ctx, startupTimeout)
	pg, err := store.NewPostgres(postgresCtx, postgresURL)
	cancelPostgres()
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pg.Close()
	log.Println("[startup] postgres ready")

	seedCtx, cancelSeed := context.WithTimeout(ctx, startupTimeout)
	seededEntities, err := pg.SeedKnownEntities(seedCtx)
	cancelSeed()
	if err != nil {
		log.Fatalf("known entities: %v", err)
	}
	if seededEntities > 0 {
		log.Printf("[startup] known entity seeds applied (%d rows inserted or refreshed)", seededEntities)
	} else {
		log.Println("[startup] known entity seeds already up to date")
	}

	log.Printf("[startup] connecting pgvector at %s", postgresURL)
	vectorCtx, cancelVector := context.WithTimeout(ctx, startupTimeout)
	vector, err := store.NewVector(vectorCtx, postgresURL)
	cancelVector()
	if err != nil {
		log.Fatalf("pgvector: %v", err)
	}
	defer vector.Close()
	log.Println("[startup] pgvector ready")

	var graph *store.Neo4j
	if disableNeo4j {
		log.Println("[startup] neo4j disabled by DISABLE_NEO4J=1")
	} else {
		log.Printf("[startup] connecting neo4j at %s", neo4jURL)
		neo4jCtx, cancelNeo4j := context.WithTimeout(ctx, startupTimeout)
		graph, err = store.NewNeo4j(neo4jCtx, neo4jURL, neo4jUser, neo4jPassword)
		cancelNeo4j()
		if err != nil {
			if requireNeo4j {
				log.Fatalf("neo4j: %v", err)
			}
			log.Printf("[startup] neo4j unavailable, continuing without graph features: %v", err)
		} else {
			defer graph.Close()
			log.Println("[startup] neo4j ready")
		}
	}

	log.Printf("[startup] connecting ethereum websocket at %s", ethWSURL)
	ethCtx, cancelEth := context.WithTimeout(ctx, startupTimeout)
	ethClient, err := client.New(ethCtx, ethWSURL)
	cancelEth()
	if err != nil {
		log.Fatalf("geth: %v", err)
	}
	defer ethClient.Close()
	log.Println("[startup] ethereum websocket ready")

	circular := forensics.NewCircularDetector(graph, pg)
	anomaly := forensics.NewAnomalyDetector(vector, pg)

	var wg sync.WaitGroup

	engine := ingestion.NewEngine(ethClient, pg, graph, vector, circular, anomaly)
	wg.Add(1)
	go func() {
		defer wg.Done()
		engine.Run(ctx)
	}()

	srv := api.NewServer(pg, graph, vector, api.Config{
		AuthToken:          apiToken,
		AllowedOrigin:      apiAllowedOrigin,
		RateLimitPerMinute: apiRateLimit,
	})
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := srv.Run(ctx, apiAddr); err != nil {
			log.Printf("api: %v", err)
			cancel()
		}
	}()

	<-ctx.Done()
	wg.Wait()
	log.Println("Shutting down gracefully...")
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
