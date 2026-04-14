package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"forensic-listener/models"
	"forensic-listener/store"
)

type Server struct {
	pg     *store.Postgres
	graph  *store.Neo4j
	vector *store.Vector
	config Config
}

func NewServer(pg *store.Postgres, graph *store.Neo4j, vector *store.Vector, config Config) *Server {
	if config.AllowedOrigin == "" {
		config.AllowedOrigin = "*"
	}
	if config.StreamInterval <= 0 {
		config.StreamInterval = 2 * time.Second
	}

	return &Server{
		pg:     pg,
		graph:  graph,
		vector: vector,
		config: config,
	}
}

func (s *Server) Run(ctx context.Context, addr string) error {
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
	router.Get("/accounts/{address}/profile", s.handleAccountProfile)
	router.Get("/accounts/{address}/behavior", s.handleAccountBehavior)
	router.Get("/accounts/{address}/similar", s.handleSimilarAccounts)
	router.Get("/accounts/{address}/velocity", s.handleAddressVelocity)
	router.Get("/accounts/{address}", s.handleAccount)
	router.Get("/addresses/top", s.handleTopAddresses)
	router.Get("/addresses/{address}/graph", s.handleAddressGraph)
	router.Get("/addresses/{address}/trace", s.handleAddressTrace)
	router.Get("/entities/hubs", s.handleHubEntities)
	router.Get("/contracts/recent", s.handleRecentContracts)
	router.Get("/contracts/{address}/similar", s.handleSimilarContracts)
	router.Get("/contracts/{address}", s.handleContractDetail)
	router.Get("/flags", s.handleRecentFlags)
	router.Get("/forensics/circular", s.handleCircularFlows)
	router.Get("/stats/overview", s.handleOverviewStats)
	router.Get("/stats/enrichment", s.handleEnrichmentStats)
	router.Get("/stats/flags", s.handleFlagSeries)
	router.Get("/stats/network", s.handleNetworkMetrics)
	router.Get("/stream/events", s.handleEventStream)

	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("[api] listening on %s", addr)
	err := server.ListenAndServe()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serving api on %s: %w", addr, err)
	}

	return nil
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"stores": []string{"postgres", "neo4j", "pgvector"},
	})
}

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service":   "forensic-listener-api",
		"status":    "ok",
		"dashboard": "Serve the Next.js frontend from /web separately.",
	})
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
	tx, err := s.pg.TransactionByHash(r.Context(), chi.URLParam(r, "hash"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tx)
}

func (s *Server) handleTransactionFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := s.pg.FlagsForTransaction(r.Context(), chi.URLParam(r, "hash"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	enrichFlags(flags)
	writeJSON(w, http.StatusOK, flags)
}

func (s *Server) handleAccount(w http.ResponseWriter, r *http.Request) {
	account, err := s.pg.GetAccount(r.Context(), chi.URLParam(r, "address"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (s *Server) handleAccountProfile(w http.ResponseWriter, r *http.Request) {
	profile, err := s.pg.GetAccountProfile(r.Context(), chi.URLParam(r, "address"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) handleAccountBehavior(w http.ResponseWriter, r *http.Request) {
	if s.vector == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "vector store not configured"})
		return
	}

	profile, err := s.vector.AccountBehavior(r.Context(), chi.URLParam(r, "address"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (s *Server) handleSimilarAccounts(w http.ResponseWriter, r *http.Request) {
	if s.vector == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "vector store not configured"})
		return
	}

	matches, err := s.vector.SimilarAccounts(
		r.Context(),
		chi.URLParam(r, "address"),
		parseLimit(r, 8, 25),
	)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, matches)
}

func (s *Server) handleAddressVelocity(w http.ResponseWriter, r *http.Request) {
	points, err := s.pg.AddressVelocity(
		r.Context(),
		chi.URLParam(r, "address"),
		parseBucket(r),
		parseHours(r),
	)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, points)
}

func (s *Server) handleTopAddresses(w http.ResponseWriter, r *http.Request) {
	addresses, err := s.pg.TopAddresses(r.Context(), parseLimit(r, 20, 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, addresses)
}

func (s *Server) handleAddressGraph(w http.ResponseWriter, r *http.Request) {
	if s.graph == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "neo4j store not configured"})
		return
	}

	address := chi.URLParam(r, "address")
	graph, err := s.graph.AddressGraph(
		r.Context(),
		address,
		parseDepth(r),
		parseLimit(r, 50, 200),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if graph == nil {
		graph, err = s.fallbackAddressGraph(r.Context(), address)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if graph == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "address graph not found"})
			return
		}
	}
	if err := s.enrichAddressGraph(r.Context(), graph); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, graph)
}

func (s *Server) fallbackAddressGraph(ctx context.Context, address string) (*models.AddressGraph, error) {
	if s.pg == nil {
		return nil, nil
	}

	profile, err := s.pg.GetAccountProfile(ctx, address)
	if err != nil {
		var notFoundErr *store.NotFoundError
		if errors.As(err, &notFoundErr) {
			return nil, nil
		}
		return nil, err
	}

	return &models.AddressGraph{
		Center: profile.Address,
		Nodes: []models.GraphNode{
			{
				ID:         profile.Address,
				Label:      profile.Address,
				IsContract: profile.IsContract,
				EntityType: profile.EntityType,
				EntityName: profile.EntityName,
				RiskLevel:  profile.RiskLevel,
				IsHub:      profile.IsHub,
				Degree:     0,
			},
		},
		Edges: []models.GraphEdge{},
	}, nil
}

func (s *Server) handleAddressTrace(w http.ResponseWriter, r *http.Request) {
	if s.graph == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "neo4j store not configured"})
		return
	}

	target := r.URL.Query().Get("to")
	if target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing trace target in query parameter 'to'"})
		return
	}

	trace, err := s.graph.TracePath(
		r.Context(),
		chi.URLParam(r, "address"),
		target,
		parseTraceDepth(r),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if trace == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no path found"})
		return
	}

	writeJSON(w, http.StatusOK, trace)
}

func (s *Server) handleHubEntities(w http.ResponseWriter, r *http.Request) {
	if s.graph == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "neo4j store not configured"})
		return
	}

	hubs, err := s.graph.TopHubs(r.Context(), parseLimit(r, 8, 50))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.enrichHubSummaries(r.Context(), hubs); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, hubs)
}

func (s *Server) handleRecentContracts(w http.ResponseWriter, r *http.Request) {
	contracts, err := s.pg.RecentContracts(r.Context(), parseLimit(r, 20, 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, contracts)
}

func (s *Server) handleSimilarContracts(w http.ResponseWriter, r *http.Request) {
	if s.vector == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "vector store not configured"})
		return
	}

	matches, err := s.vector.SimilarContracts(
		r.Context(),
		chi.URLParam(r, "address"),
		parseLimit(r, 10, 50),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, matches)
}

func (s *Server) handleContractDetail(w http.ResponseWriter, r *http.Request) {
	detail, err := s.pg.ContractDetail(r.Context(), chi.URLParam(r, "address"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
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
	if s.graph == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "neo4j store not configured"})
		return
	}

	flows, err := s.graph.RecentCircularFlows(r.Context(), parseLimit(r, 20, 100))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, flows)
}

func (s *Server) handleOverviewStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.pg.OverviewStats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
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
	bucket := parseBucket(r)
	hours := parseHours(r)

	series, err := s.pg.FlagSeries(r.Context(), bucket, hours)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, series)
}

func (s *Server) handleNetworkMetrics(w http.ResponseWriter, r *http.Request) {
	points, err := s.pg.NetworkMetrics(r.Context(), parseBucket(r), parseHours(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, points)
}

func (s *Server) handleEventStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	send := func() error {
		snapshot, err := s.buildSnapshot(r.Context())
		if err != nil {
			return err
		}

		payload, err := json.Marshal(snapshot)
		if err != nil {
			return fmt.Errorf("encoding stream snapshot: %w", err)
		}

		if _, err := fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload); err != nil {
			return fmt.Errorf("writing stream snapshot: %w", err)
		}
		flusher.Flush()
		return nil
	}

	if err := send(); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	ticker := time.NewTicker(s.config.StreamInterval)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			if err := send(); err != nil {
				log.Printf("[api] event stream closed: %v", err)
				return
			}
		}
	}
}

func (s *Server) buildSnapshot(ctx context.Context) (*models.StreamSnapshot, error) {
	overview, err := s.pg.OverviewStats(ctx)
	if err != nil {
		return nil, err
	}

	enrichment, err := s.pg.EnrichmentStatus(ctx)
	if err != nil {
		return nil, err
	}

	recentTransactions, err := s.pg.RecentTransactions(ctx, 10)
	if err != nil {
		return nil, err
	}

	recentFlags, err := s.pg.RecentFlags(ctx, 10)
	if err != nil {
		return nil, err
	}
	enrichFlags(recentFlags)

	return &models.StreamSnapshot{
		Timestamp:          time.Now().UTC(),
		Overview:           overview,
		Enrichment:         enrichment,
		RecentTransactions: recentTransactions,
		RecentFlags:        recentFlags,
	}, nil
}

func parseLimit(r *http.Request, fallback, max int) int {
	raw := r.URL.Query().Get("limit")
	if raw == "" {
		return fallback
	}

	limit, err := strconv.Atoi(raw)
	if err != nil || limit <= 0 {
		return fallback
	}
	if limit > max {
		return max
	}
	return limit
}

func parseHours(r *http.Request) int {
	raw := r.URL.Query().Get("hours")
	if raw == "" {
		return 24
	}

	hours, err := strconv.Atoi(raw)
	if err != nil || hours <= 0 {
		return 24
	}
	if hours > 24*30 {
		return 24 * 30
	}
	return hours
}

func parseDepth(r *http.Request) int {
	raw := r.URL.Query().Get("depth")
	if raw == "" {
		return 2
	}

	depth, err := strconv.Atoi(raw)
	if err != nil || depth <= 0 {
		return 2
	}
	if depth > 3 {
		return 3
	}
	return depth
}

func parseTraceDepth(r *http.Request) int {
	raw := r.URL.Query().Get("depth")
	if raw == "" {
		return 3
	}

	depth, err := strconv.Atoi(raw)
	if err != nil || depth <= 0 {
		return 3
	}
	if depth > 4 {
		return 4
	}
	return depth
}

func parseBucket(r *http.Request) string {
	switch r.URL.Query().Get("bucket") {
	case "minute", "day":
		return r.URL.Query().Get("bucket")
	default:
		return "hour"
	}
}

func writeStoreError(w http.ResponseWriter, err error) {
	var notFound *store.NotFoundError
	if errors.As(err, &notFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}

	writeError(w, http.StatusInternalServerError, err)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("[api] encoding response: %v", err)
	}
}

func (s *Server) enrichAddressGraph(ctx context.Context, graph *models.AddressGraph) error {
	if graph == nil || s.pg == nil || len(graph.Nodes) == 0 {
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
	riskLevels, err := s.pg.AddressRiskByAddresses(ctx, addresses)
	if err != nil {
		return err
	}

	degrees := make(map[string]int, len(graph.Nodes))
	for _, edge := range graph.Edges {
		degrees[edge.From]++
		degrees[edge.To]++
	}

	for idx := range graph.Nodes {
		node := &graph.Nodes[idx]
		node.Degree = degrees[node.ID]

		if entity, ok := entities[node.ID]; ok {
			node.EntityName = entity.Name
			if entity.EntityType != "" {
				node.EntityType = entity.EntityType
			}
			if entity.RiskLevel != "" && entity.RiskLevel != "none" {
				node.RiskLevel = entity.RiskLevel
			}
			node.IsHub = node.IsHub || entity.IsHub
		}

		if risk, ok := riskLevels[node.ID]; ok && risk != "" && risk != "none" {
			node.RiskLevel = risk
		}
		if node.EntityType == "" {
			if node.IsContract {
				node.EntityType = "contract"
			} else {
				node.EntityType = "wallet"
			}
		}
		if node.RiskLevel == "" {
			node.RiskLevel = "none"
		}
		if node.Degree >= 4 {
			node.IsHub = true
		}
	}

	return nil
}

func (s *Server) enrichHubSummaries(ctx context.Context, hubs []*models.HubSummary) error {
	if len(hubs) == 0 || s.pg == nil {
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
	riskLevels, err := s.pg.AddressRiskByAddresses(ctx, addresses)
	if err != nil {
		return err
	}

	for _, hub := range hubs {
		if entity, ok := entities[hub.Address]; ok {
			hub.EntityName = entity.Name
			hub.EntityType = entity.EntityType
			hub.RiskLevel = entity.RiskLevel
			hub.IsHub = hub.IsHub || entity.IsHub
			hub.UpdatedAt = entity.UpdatedAt
		}
		if hub.EntityType == "" {
			if hub.IsContract {
				hub.EntityType = "contract"
			} else {
				hub.EntityType = "wallet"
			}
		}
		if risk, ok := riskLevels[hub.Address]; ok && risk != "" && risk != "none" {
			hub.RiskLevel = risk
		}
		if hub.RiskLevel == "" {
			hub.RiskLevel = "none"
		}
		hub.IsHub = true
	}

	return nil
}
