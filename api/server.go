package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"forensic-listener/client"
	"forensic-listener/forensics"
	"forensic-listener/models"
	"forensic-listener/store"
)

// IngestionStatus is implemented by the ingestion engine's status tracker.
type IngestionStatus interface {
	Snapshot() models.IngestionStatus
}

type Deps struct {
	Postgres  *store.Postgres
	Graph     *store.Neo4j
	Vector    *store.Vector
	Node      *client.Client
	Anomaly   *forensics.AnomalyDetector
	Ingestion IngestionStatus
}

type Server struct {
	pg        *store.Postgres
	graph     *store.Neo4j
	vector    *store.Vector
	node      *client.Client
	anomaly   *forensics.AnomalyDetector
	ingestion IngestionStatus
	config    Config
	hub       *snapshotHub

	cacheMu sync.Mutex
	cache   map[string]cachedValue
}

type cachedValue struct {
	value   any
	expires time.Time
}

func NewServer(deps Deps, config Config) *Server {
	if config.AllowedOrigin == "" {
		config.AllowedOrigin = "*"
	}
	if config.StreamInterval <= 0 {
		config.StreamInterval = 2 * time.Second
	}

	return &Server{
		pg:        deps.Postgres,
		graph:     deps.Graph,
		vector:    deps.Vector,
		node:      deps.Node,
		anomaly:   deps.Anomaly,
		ingestion: deps.Ingestion,
		config:    config,
		hub:       newSnapshotHub(),
		cache:     make(map[string]cachedValue),
	}
}

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(corsMiddleware(s.config.AllowedOrigin))
	router.Use(authMiddleware(s.config.AuthToken))
	router.Use(newRateLimiter(s.config.RateLimitPerMinute).middleware)

	router.Get("/", s.handleRoot)
	router.Get("/health", s.handleHealth)

	router.Get("/transactions", s.handleRecentTransactions)
	router.Get("/transactions/{hash}", s.handleTransactionByHash)
	router.Get("/transactions/{hash}/flags", s.handleTransactionFlags)
	router.Get("/transactions/{hash}/token-transfers", s.handleTransactionTokenTransfers)

	router.Get("/accounts/{address}", s.handleAccount)
	router.Get("/accounts/{address}/profile", s.handleAccountProfile)
	router.Get("/accounts/{address}/behavior", s.handleAccountBehavior)
	router.Get("/accounts/{address}/similar", s.handleSimilarAccounts)
	router.Get("/accounts/{address}/velocity", s.handleAddressVelocity)

	router.Get("/addresses/top", s.handleTopAddresses)
	router.Get("/addresses/{address}/graph", s.handleAddressGraph)
	router.Get("/addresses/{address}/trace", s.handleAddressTrace)

	router.Get("/entities/hubs", s.handleHubEntities)
	router.Post("/entities/{address}", s.handleLabelEntity)

	router.Get("/contracts/recent", s.handleRecentContracts)
	router.Get("/contracts/{address}", s.handleContractDetail)
	router.Get("/contracts/{address}/similar", s.handleSimilarContracts)

	router.Get("/flags", s.handleRecentFlags)
	router.Get("/forensics/circular", s.handleCircularFlows)

	router.Get("/stats/overview", s.handleOverviewStats)
	router.Get("/stats/enrichment", s.handleEnrichmentStats)
	router.Get("/stats/flags", s.handleFlagSeries)
	router.Get("/stats/network", s.handleNetworkMetrics)
	router.Get("/stream/events", s.handleEventStream)

	return router
}

func (s *Server) Run(ctx context.Context, addr string) error {
	go s.runSnapshots(ctx)

	server := &http.Server{
		Addr:              addr,
		Handler:           s.Router(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("[api] listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serving api on %s: %w", addr, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service":   "forensic-listener-api",
		"status":    "ok",
		"dashboard": "Serve the Next.js frontend from /web separately.",
	})
}

// handleHealth pings every store and the node, and reports feed freshness.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	check := func(name string, fn func(context.Context) error) models.StoreHealth {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		started := time.Now()
		err := fn(ctx)
		h := models.StoreHealth{Name: name, OK: err == nil, LatencyMs: float64(time.Since(started).Microseconds()) / 1000}
		if err != nil {
			h.Error = err.Error()
		}
		return h
	}

	stores := []models.StoreHealth{
		check("postgresql", s.pg.Ping),
		check("pgvector", func(ctx context.Context) error {
			var version string
			return s.pg.Pool().QueryRow(ctx, `SELECT extversion FROM pg_extension WHERE extname = 'vector'`).Scan(&version)
		}),
	}
	if s.graph != nil {
		stores = append(stores, check("neo4j", s.graph.Ping))
	} else {
		stores = append(stores, models.StoreHealth{Name: "neo4j", OK: false, Error: "disabled or unavailable at startup"})
	}
	if s.node != nil {
		stores = append(stores, check("ethereum node", func(ctx context.Context) error {
			_, err := s.node.BlockNumber(ctx)
			return err
		}))
	}

	health := models.Health{Status: "ok", Stores: stores}
	if s.ingestion != nil {
		health.Ingestion = s.ingestion.Snapshot()
	}
	status := http.StatusOK
	for _, st := range stores {
		if !st.OK {
			health.Status = "degraded"
		}
	}
	if !stores[0].OK {
		health.Status = "down"
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, health)
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

var txHashPattern = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)

func requireHash(w http.ResponseWriter, r *http.Request) (string, bool) {
	hash := chi.URLParam(r, "hash")
	if !txHashPattern.MatchString(hash) {
		writeMessage(w, http.StatusBadRequest, "invalid transaction hash: expected 0x followed by 64 hex characters")
		return "", false
	}
	return hash, true
}

func requireAddress(w http.ResponseWriter, value string) (string, bool) {
	if !common.IsHexAddress(strings.TrimSpace(value)) {
		writeMessage(w, http.StatusBadRequest, "invalid address: expected 0x followed by 40 hex characters")
		return "", false
	}
	return store.NormalizeAddress(value), true
}

func (s *Server) handleRecentTransactions(w http.ResponseWriter, r *http.Request) {
	txs, err := s.pg.RecentTransactions(r.Context(), parseLimit(r, 50, 200))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, txs)
}

func (s *Server) handleTransactionByHash(w http.ResponseWriter, r *http.Request) {
	hash, ok := requireHash(w, r)
	if !ok {
		return
	}
	tx, err := s.pg.TransactionByHash(r.Context(), hash)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tx)
}

func (s *Server) handleTransactionFlags(w http.ResponseWriter, r *http.Request) {
	hash, ok := requireHash(w, r)
	if !ok {
		return
	}
	flags, err := s.pg.FlagsForTransaction(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	enrichFlags(flags)
	writeJSON(w, http.StatusOK, flags)
}

func (s *Server) handleTransactionTokenTransfers(w http.ResponseWriter, r *http.Request) {
	hash, ok := requireHash(w, r)
	if !ok {
		return
	}
	transfers, err := s.pg.TokenTransfersForTransaction(r.Context(), hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, transfers)
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

func (s *Server) handleAccount(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	account, err := s.pg.GetAccount(r.Context(), address)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (s *Server) handleAccountProfile(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	profile, err := s.pg.GetAccountProfile(r.Context(), address)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	enrichFlags(profile.Flags)

	// Balance is not stored; it is read from the node at request time.
	if s.node != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		if balance, err := s.node.BalanceAt(ctx, address); err == nil {
			value := balance.String()
			profile.Balance = &value
		}
		cancel()
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) handleAccountBehavior(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	profile, err := s.vector.AccountBehavior(r.Context(), address)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) handleSimilarAccounts(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	matches, err := s.vector.SimilarAccounts(r.Context(), address, parseLimit(r, 8, 25))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, matches)
}

func (s *Server) handleAddressVelocity(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	points, err := s.pg.AddressVelocity(r.Context(), address, parseIntParam(r, "hours", 72, 1, 168))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, points)
}

func (s *Server) handleTopAddresses(w http.ResponseWriter, r *http.Request) {
	limit := parseLimit(r, 20, 100)
	addresses, err := cached(s, fmt.Sprintf("top:%d", limit), 30*time.Second, func() ([]*models.AddressActivity, error) {
		return s.pg.TopAddresses(r.Context(), limit)
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, addresses)
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

func (s *Server) requireGraph(w http.ResponseWriter) bool {
	if s.graph == nil {
		writeMessage(w, http.StatusServiceUnavailable, "graph features are unavailable: Neo4j is not connected")
		return false
	}
	return true
}

func (s *Server) handleAddressGraph(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok || !s.requireGraph(w) {
		return
	}

	graph, err := s.graph.AddressGraph(r.Context(), address,
		parseIntParam(r, "depth", 2, 1, 3), parseLimit(r, 60, 150), r.URL.Query().Get("flows"))
	if err != nil {
		writeGraphError(w, err)
		return
	}
	if graph == nil {
		// Known to PostgreSQL but not yet projected into Neo4j (or never transacted).
		profile, err := s.pg.GetAccountProfile(r.Context(), address)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		graph = &models.AddressGraph{
			Center: profile.Address,
			Nodes:  []models.GraphNode{{ID: profile.Address, Label: profile.Address, IsContract: profile.IsContract}},
			Edges:  []models.GraphEdge{},
		}
	}
	if err := s.enrichGraphNodes(r.Context(), graph); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

func (s *Server) handleAddressTrace(w http.ResponseWriter, r *http.Request) {
	from, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok || !s.requireGraph(w) {
		return
	}
	to, ok := requireAddress(w, r.URL.Query().Get("to"))
	if !ok {
		return
	}
	if from == to {
		writeMessage(w, http.StatusBadRequest, "trace start and destination must be different addresses")
		return
	}

	trace, err := s.graph.TracePath(r.Context(), from, to, parseIntParam(r, "depth", 4, 1, 6), r.URL.Query().Get("flows"))
	if err != nil {
		writeGraphError(w, err)
		return
	}
	if trace == nil {
		writeMessage(w, http.StatusNotFound, "no directed path found within the hop limit")
		return
	}
	writeJSON(w, http.StatusOK, trace)
}

func (s *Server) handleHubEntities(w http.ResponseWriter, r *http.Request) {
	if !s.requireGraph(w) {
		return
	}
	limit := parseLimit(r, 8, 50)
	hubs, err := cached(s, fmt.Sprintf("hubs:%d", limit), 30*time.Second, func() ([]*models.HubSummary, error) {
		hubs, err := s.graph.TopHubs(r.Context(), limit)
		if err != nil {
			return nil, err
		}
		return hubs, s.enrichHubSummaries(r.Context(), hubs)
	})
	if err != nil {
		writeGraphError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hubs)
}

var (
	allowedEntityTypes = map[string]bool{
		"wallet": true, "exchange": true, "mixer": true, "bridge": true, "dex": true, "token": true,
		"stablecoin": true, "contract": true, "scam": true, "sanctioned": true, "other": true,
	}
	allowedRiskLevels = map[string]bool{"none": true, "low": true, "medium": true, "high": true}
)

// handleLabelEntity records an investigator's label. Labelling a contract medium or
// high risk immediately flags stored contracts from the same code family.
func (s *Server) handleLabelEntity(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}

	var body struct {
		Name       string `json:"name"`
		EntityType string `json:"entity_type"`
		RiskLevel  string `json:"risk_level"`
		IsHub      bool   `json:"is_hub"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		writeMessage(w, http.StatusBadRequest, "request body must be JSON with name, entity_type and risk_level")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	switch {
	case body.Name == "" || len(body.Name) > 80:
		writeMessage(w, http.StatusBadRequest, "name is required and must be at most 80 characters")
		return
	case !allowedEntityTypes[body.EntityType]:
		writeMessage(w, http.StatusBadRequest, "entity_type must be one of: wallet, exchange, mixer, bridge, dex, token, stablecoin, contract, scam, sanctioned, other")
		return
	case !allowedRiskLevels[body.RiskLevel]:
		writeMessage(w, http.StatusBadRequest, "risk_level must be one of: none, low, medium, high")
		return
	}

	entity, err := s.pg.UpsertKnownEntity(r.Context(), &models.KnownEntity{
		Address: address, Name: body.Name, EntityType: body.EntityType, RiskLevel: body.RiskLevel, IsHub: body.IsHub,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	flagged, err := s.anomaly.PropagateLabel(r.Context(), address, body.RiskLevel)
	if err != nil {
		log.Printf("[api] propagating label for %s: %v", address, err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"entity": entity, "flagged_similar_contracts": flagged})
}

// ---------------------------------------------------------------------------
// Contracts and flags
// ---------------------------------------------------------------------------

func (s *Server) handleRecentContracts(w http.ResponseWriter, r *http.Request) {
	contracts, err := s.pg.RecentContracts(r.Context(), parseLimit(r, 20, 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, contracts)
}

func (s *Server) handleContractDetail(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	detail, err := s.pg.ContractDetail(r.Context(), address)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleSimilarContracts(w http.ResponseWriter, r *http.Request) {
	address, ok := requireAddress(w, chi.URLParam(r, "address"))
	if !ok {
		return
	}
	matches, err := s.vector.SimilarContracts(r.Context(), address, parseLimit(r, 8, 25))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, matches)
}

func (s *Server) handleRecentFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := s.pg.RecentFlags(r.Context(), parseLimit(r, 50, 200))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	enrichFlags(flags)
	writeJSON(w, http.StatusOK, flags)
}

func (s *Server) handleCircularFlows(w http.ResponseWriter, r *http.Request) {
	flows, err := s.pg.RecentCircularFlows(r.Context(), parseLimit(r, 20, 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, flows)
}

// ---------------------------------------------------------------------------
// Statistics and stream
// ---------------------------------------------------------------------------

func (s *Server) handleOverviewStats(w http.ResponseWriter, _ *http.Request) {
	_, snapshot, _ := s.hub.current()
	if snapshot == nil {
		writeMessage(w, http.StatusServiceUnavailable, "statistics are still being computed; retry in a few seconds")
		return
	}
	writeJSON(w, http.StatusOK, snapshot.Overview)
}

func (s *Server) handleEnrichmentStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.pg.EnrichmentStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleFlagSeries(w http.ResponseWriter, r *http.Request) {
	bucket := "hour"
	if r.URL.Query().Get("bucket") == "day" {
		bucket = "day"
	}
	series, err := s.pg.FlagSeries(r.Context(), bucket, parseIntParam(r, "hours", 24, 1, 720))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, series)
}

func (s *Server) handleNetworkMetrics(w http.ResponseWriter, r *http.Request) {
	points, err := s.pg.NetworkMetrics(r.Context(), parseIntParam(r, "hours", 24, 1, 720))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, points)
}

func (s *Server) handleEventStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeMessage(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	var lastSent []byte
	for {
		payload, _, changed := s.hub.current()
		if payload != nil && (lastSent == nil || &payload[0] != &lastSent[0]) {
			if _, err := fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
			lastSent = payload
		}

		select {
		case <-r.Context().Done():
			return
		case <-changed:
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// ---------------------------------------------------------------------------
// Enrichment of graph results with relational labels
// ---------------------------------------------------------------------------

func (s *Server) enrichGraphNodes(ctx context.Context, graph *models.AddressGraph) error {
	if graph == nil || len(graph.Nodes) == 0 {
		return nil
	}

	addresses := make([]string, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		addresses = append(addresses, node.ID)
	}
	entities, err := s.pg.KnownEntitiesByAddresses(ctx, addresses)
	if err != nil {
		return err
	}
	risk, err := s.pg.AddressRiskByAddresses(ctx, addresses)
	if err != nil {
		return err
	}

	degrees := make(map[string]int, len(graph.Nodes))
	for _, edge := range graph.Edges {
		degrees[edge.From]++
		degrees[edge.To]++
	}

	for i := range graph.Nodes {
		node := &graph.Nodes[i]
		node.Degree = degrees[node.ID]
		node.RiskLevel = "none"
		if level, ok := risk[node.ID]; ok {
			node.RiskLevel = level
		}
		if entity, ok := entities[node.ID]; ok {
			node.EntityName = entity.Name
			node.EntityType = entity.EntityType
			node.IsHub = entity.IsHub
		}
		if node.EntityType == "" {
			node.EntityType = map[bool]string{true: "contract", false: "wallet"}[node.IsContract]
		}
	}
	return nil
}

func (s *Server) enrichHubSummaries(ctx context.Context, hubs []*models.HubSummary) error {
	if len(hubs) == 0 {
		return nil
	}
	addresses := make([]string, 0, len(hubs))
	for _, hub := range hubs {
		addresses = append(addresses, hub.Address)
	}
	entities, err := s.pg.KnownEntitiesByAddresses(ctx, addresses)
	if err != nil {
		return err
	}
	risk, err := s.pg.AddressRiskByAddresses(ctx, addresses)
	if err != nil {
		return err
	}

	for _, hub := range hubs {
		hub.RiskLevel = "none"
		if level, ok := risk[hub.Address]; ok {
			hub.RiskLevel = level
		}
		if entity, ok := entities[hub.Address]; ok {
			hub.EntityName = entity.Name
			hub.EntityType = entity.EntityType
			hub.UpdatedAt = entity.UpdatedAt
		}
		if hub.EntityType == "" {
			hub.EntityType = map[bool]string{true: "contract", false: "wallet"}[hub.IsContract]
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func cached[T any](s *Server, key string, ttl time.Duration, load func() (T, error)) (T, error) {
	s.cacheMu.Lock()
	if entry, ok := s.cache[key]; ok && time.Now().Before(entry.expires) {
		s.cacheMu.Unlock()
		return entry.value.(T), nil
	}
	s.cacheMu.Unlock()

	value, err := load()
	if err != nil {
		return value, err
	}
	s.cacheMu.Lock()
	s.cache[key] = cachedValue{value: value, expires: time.Now().Add(ttl)}
	s.cacheMu.Unlock()
	return value, nil
}

func parseLimit(r *http.Request, fallback, max int) int {
	return parseIntParam(r, "limit", fallback, 1, max)
}

func parseIntParam(r *http.Request, name string, fallback, min, max int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < min {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}

func writeStoreError(w http.ResponseWriter, err error) {
	var notFound *store.NotFoundError
	if errors.As(err, &notFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}

// writeGraphError distinguishes a Neo4j timeout from other failures so the UI can
// say "the query timed out" instead of implying nothing is stored.
func writeGraphError(w http.ResponseWriter, err error) {
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
		writeMessage(w, http.StatusGatewayTimeout, "graph query timed out; try fewer hops or a less connected address")
		return
	}
	writeError(w, http.StatusInternalServerError, err)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeMessage(w, status, err.Error())
}

func writeMessage(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("[api] encoding response: %v", err)
	}
}
