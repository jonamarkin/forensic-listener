package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"forensic-listener/models"
)

// minBehaviorSample excludes accounts with too little history to have a meaningful
// behaviour profile from similarity results.
const minBehaviorSample = 3

// Vector is the pgvector-backed similarity store. It shares the PostgreSQL pool, so
// nearest-neighbour results can be joined with labels and risk in the same query.
type Vector struct {
	pool *pgxpool.Pool
}

func NewVector(pool *pgxpool.Pool) *Vector {
	return &Vector{pool: pool}
}

// ---------------------------------------------------------------------------
// Contract bytecode
// ---------------------------------------------------------------------------

// UpsertContract stores bytecode, its v2 embedding and its clone-family skeleton hash.
func (v *Vector) UpsertContract(ctx context.Context, address string, bytecode []byte) error {
	address = NormalizeAddress(address)
	if address == "" || len(bytecode) == 0 {
		return nil
	}

	_, err := v.pool.Exec(ctx, `
		INSERT INTO contract_vectors (address, bytecode, embedding, skeleton_hash, embedded_at)
		VALUES ($1, $2, $3::vector, $4, NOW())
		ON CONFLICT (address) DO UPDATE
		SET bytecode = EXCLUDED.bytecode,
		    embedding = EXCLUDED.embedding,
		    skeleton_hash = EXCLUDED.skeleton_hash,
		    embedded_at = NOW()
	`, address, bytecode, vectorLiteral(EmbedBytecode(bytecode)), SkeletonHash(bytecode))
	if err != nil {
		return fmt.Errorf("upserting contract vector for %s: %w", address, err)
	}
	return nil
}

// ReembedMissing embeds stored bytecode that has no v2 embedding yet (after migration 000010).
func (v *Vector) ReembedMissing(ctx context.Context, batch int) (int, error) {
	rows, err := v.pool.Query(ctx, `
		SELECT address, bytecode FROM contract_vectors
		WHERE embedding IS NULL AND bytecode IS NOT NULL AND OCTET_LENGTH(bytecode) > 0
		LIMIT $1
	`, batch)
	if err != nil {
		return 0, fmt.Errorf("loading contracts to re-embed: %w", err)
	}

	type pending struct {
		address  string
		bytecode []byte
	}
	var todo []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.address, &p.bytecode); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scanning contract to re-embed: %w", err)
		}
		todo = append(todo, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, p := range todo {
		if err := v.UpsertContract(ctx, p.address, p.bytecode); err != nil {
			return 0, err
		}
	}
	return len(todo), nil
}

// HasEmbedding reports whether a contract's bytecode has already been analysed, so
// enrichment skips the eth_getCode call for contracts it has seen before.
func (v *Vector) HasEmbedding(ctx context.Context, address string) (bool, error) {
	var exists bool
	err := v.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM contract_vectors WHERE address = $1 AND embedding IS NOT NULL)
	`, NormalizeAddress(address)).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking contract vector for %s: %w", address, err)
	}
	return exists, nil
}

func (v *Vector) MarkFlagged(ctx context.Context, address string, flagged bool) error {
	_, err := v.pool.Exec(ctx, `UPDATE contract_vectors SET flagged = $2 WHERE address = $1`, NormalizeAddress(address), flagged)
	if err != nil {
		return fmt.Errorf("marking contract %s flagged=%t: %w", address, flagged, err)
	}
	return nil
}

// SimilarContracts returns the nearest neighbours of a stored contract. The query
// vector is a scalar subquery so the HNSW index can serve the ORDER BY; risk is
// looked up only for the rows that survive the LIMIT.
func (v *Vector) SimilarContracts(ctx context.Context, address string, limit int) ([]*models.ContractSimilarity, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 8
	}

	rows, err := v.pool.Query(ctx, `
		SELECT nn.address, COALESCE(ke.name, ''), address_risk_level(nn.address),
		       nn.similarity, nn.same_skeleton, nn.flagged
		FROM (
			SELECT cv.address,
			       1 - (cv.embedding <=> (SELECT embedding FROM contract_vectors WHERE address = $1)) AS similarity,
			       cv.skeleton_hash IS NOT DISTINCT FROM (SELECT skeleton_hash FROM contract_vectors WHERE address = $1) AS same_skeleton,
			       cv.flagged
			FROM contract_vectors cv
			WHERE cv.address <> $1 AND cv.embedding IS NOT NULL
			ORDER BY cv.embedding <=> (SELECT embedding FROM contract_vectors WHERE address = $1)
			LIMIT $2
		) nn
		LEFT JOIN known_entities ke ON ke.address = nn.address
		WHERE nn.similarity IS NOT NULL
		ORDER BY nn.similarity DESC
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying similar contracts for %s: %w", address, err)
	}
	return scanSimilarities(rows)
}

// FindSimilarBytecode ranks stored contracts against freshly fetched bytecode.
func (v *Vector) FindSimilarBytecode(ctx context.Context, address string, bytecode []byte, limit int) ([]*models.ContractSimilarity, error) {
	if len(bytecode) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		limit = 5
	}

	rows, err := v.pool.Query(ctx, `
		SELECT nn.address, COALESCE(ke.name, ''), address_risk_level(nn.address),
		       nn.similarity, nn.same_skeleton, nn.flagged
		FROM (
			SELECT address,
			       1 - (embedding <=> $1::vector) AS similarity,
			       skeleton_hash = $3 AS same_skeleton,
			       flagged
			FROM contract_vectors
			WHERE address <> $2 AND embedding IS NOT NULL
			ORDER BY embedding <=> $1::vector
			LIMIT $4
		) nn
		LEFT JOIN known_entities ke ON ke.address = nn.address
		ORDER BY nn.similarity DESC
	`, vectorLiteral(EmbedBytecode(bytecode)), NormalizeAddress(address), SkeletonHash(bytecode), limit)
	if err != nil {
		return nil, fmt.Errorf("querying bytecode neighbours for %s: %w", address, err)
	}
	return scanSimilarities(rows)
}

func scanSimilarities(rows pgx.Rows) ([]*models.ContractSimilarity, error) {
	defer rows.Close()
	matches := make([]*models.ContractSimilarity, 0)
	for rows.Next() {
		m := &models.ContractSimilarity{}
		if err := rows.Scan(&m.Address, &m.EntityName, &m.RiskLevel, &m.Similarity, &m.SameSkeleton, &m.Flagged); err != nil {
			return nil, fmt.Errorf("scanning contract similarity: %w", err)
		}
		m.Similarity = math.Max(0, math.Min(1, m.Similarity))
		matches = append(matches, m)
	}
	return matches, rows.Err()
}

// ---------------------------------------------------------------------------
// Account behaviour
// ---------------------------------------------------------------------------

// RebuildBehaviors recomputes behaviour vectors for addresses active since `since`,
// skipping any refreshed in the last ten minutes. Called by the maintenance loop,
// never by an API request.
func (v *Vector) RebuildBehaviors(ctx context.Context, since time.Time, limit int) (int, error) {
	rows, err := v.pool.Query(ctx, `
		SELECT x.address
		FROM (
			SELECT from_address AS address FROM transactions WHERE timestamp >= $1
			UNION ALL
			SELECT to_address FROM transactions WHERE timestamp >= $1 AND to_address IS NOT NULL
		) x
		LEFT JOIN account_behavior_vectors ab ON ab.address = x.address
		WHERE ab.updated_at IS NULL OR ab.updated_at < NOW() - INTERVAL '10 minutes'
		GROUP BY x.address
		ORDER BY COUNT(*) DESC
		LIMIT $2
	`, since, limit)
	if err != nil {
		return 0, fmt.Errorf("selecting addresses for behaviour rebuild: %w", err)
	}

	var addresses []string
	for rows.Next() {
		var address string
		if err := rows.Scan(&address); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scanning address for behaviour rebuild: %w", err)
		}
		addresses = append(addresses, address)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	rebuilt := 0
	for _, address := range addresses {
		if ctx.Err() != nil {
			return rebuilt, ctx.Err()
		}
		if err := v.RebuildAccountBehavior(ctx, address); err != nil {
			return rebuilt, err
		}
		rebuilt++
	}
	return rebuilt, nil
}

// RebuildAccountBehavior computes the eleven raw behaviour features for one address
// in SQL, then stores them with their scaled vector(11) embedding.
func (v *Vector) RebuildAccountBehavior(ctx context.Context, address string) error {
	address = NormalizeAddress(address)

	var sent, received, uniqueCounterparties, lastHour, lastDay int64
	var avgSentWei, avgGasPriceWei, contractCallRatio, nightRatio, weekendRatio, spanHours float64

	err := v.pool.QueryRow(ctx, `
		WITH related AS (
			SELECT
				from_address = $1 AS outgoing,
				value::double precision AS value,
				gas_price::double precision AS gas_price,
				CASE WHEN from_address = $1 THEN to_address ELSE from_address END AS counterparty,
				OCTET_LENGTH(COALESCE(data, '\x'::bytea)) > 0 AS has_calldata,
				timestamp
			FROM transactions
			WHERE from_address = $1 OR to_address = $1
		)
		SELECT
			COUNT(*) FILTER (WHERE outgoing),
			COUNT(*) FILTER (WHERE NOT outgoing),
			COALESCE(AVG(value) FILTER (WHERE outgoing), 0),
			COALESCE(AVG(gas_price) FILTER (WHERE outgoing), 0),
			COUNT(DISTINCT counterparty),
			COALESCE(AVG(CASE WHEN has_calldata THEN 1.0 ELSE 0.0 END) FILTER (WHERE outgoing), 0),
			COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour'),
			COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours'),
			COALESCE(AVG(CASE WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 0 AND 5 THEN 1.0 ELSE 0.0 END), 0),
			COALESCE(AVG(CASE WHEN EXTRACT(ISODOW FROM timestamp) IN (6, 7) THEN 1.0 ELSE 0.0 END), 0),
			COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600.0, 0)
		FROM related
	`, address).Scan(
		&sent, &received, &avgSentWei, &avgGasPriceWei, &uniqueCounterparties,
		&contractCallRatio, &lastHour, &lastDay, &nightRatio, &weekendRatio, &spanHours,
	)
	if err != nil {
		return fmt.Errorf("computing behaviour features for %s: %w", address, err)
	}

	total := sent + received
	if total == 0 {
		return nil
	}

	balance, diversity, burst := 0.0, 0.0, 0.0
	balance = float64(sent-received) / float64(total)
	diversity = float64(uniqueCounterparties) / float64(total)
	if lastDay > 0 {
		burst = float64(lastHour) / float64(lastDay)
	}

	features := map[string]float64{
		"sent_count":             float64(sent),
		"received_count":         float64(received),
		"send_receive_balance":   balance,
		"avg_sent_eth":           avgSentWei / 1e18,
		"avg_gas_price_gwei":     avgGasPriceWei / 1e9,
		"counterparty_diversity": diversity,
		"contract_call_ratio":    contractCallRatio,
		"recent_burst_ratio":     burst,
		"night_ratio":            nightRatio,
		"weekend_ratio":          weekendRatio,
		"active_span_hours":      spanHours,
	}
	featuresJSON, err := json.Marshal(features)
	if err != nil {
		return fmt.Errorf("encoding behaviour features for %s: %w", address, err)
	}

	_, err = v.pool.Exec(ctx, `
		INSERT INTO account_behavior_vectors (address, embedding, features, sample_size, updated_at)
		VALUES ($1, $2::vector, $3::jsonb, $4, NOW())
		ON CONFLICT (address) DO UPDATE
		SET embedding = EXCLUDED.embedding,
		    features = EXCLUDED.features,
		    sample_size = EXCLUDED.sample_size,
		    updated_at = NOW()
	`, address, vectorLiteral(EmbedBehavior(features)), string(featuresJSON), total)
	if err != nil {
		return fmt.Errorf("upserting behaviour vector for %s: %w", address, err)
	}
	return nil
}

// AccountBehavior reads the stored behaviour profile. It never writes.
func (v *Vector) AccountBehavior(ctx context.Context, address string) (*models.AccountBehaviorProfile, error) {
	address = NormalizeAddress(address)

	profile := &models.AccountBehaviorProfile{}
	var featuresJSON []byte
	err := v.pool.QueryRow(ctx, `
		SELECT ab.address, ab.features, ab.sample_size, ab.updated_at,
		       COALESCE(ke.name, ''), COALESCE(ke.entity_type, ''),
		       address_risk_level(ab.address), a.is_contract
		FROM account_behavior_vectors ab
		JOIN accounts a ON a.address = ab.address
		LEFT JOIN known_entities ke ON ke.address = ab.address
		WHERE ab.address = $1
	`, address).Scan(
		&profile.Address, &featuresJSON, &profile.SampleSize, &profile.UpdatedAt,
		&profile.EntityName, &profile.EntityType, &profile.RiskLevel, &profile.IsContract,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "behaviour profile", ID: address}
		}
		return nil, fmt.Errorf("querying behaviour profile for %s: %w", address, err)
	}

	if err := json.Unmarshal(featuresJSON, &profile.Features); err != nil {
		return nil, fmt.Errorf("decoding behaviour features for %s: %w", address, err)
	}
	if profile.EntityType == "" {
		profile.EntityType = defaultEntityType(profile.IsContract)
	}
	return profile, nil
}

// SimilarAccounts returns the nearest behavioural neighbours of an address.
func (v *Vector) SimilarAccounts(ctx context.Context, address string, limit int) ([]*models.SimilarAccountMatch, error) {
	source, err := v.AccountBehavior(ctx, address)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 8
	}

	rows, err := v.pool.Query(ctx, `
		SELECT nn.address, nn.similarity, nn.features, nn.sample_size,
		       COALESCE(ke.name, ''), COALESCE(ke.entity_type, ''),
		       address_risk_level(nn.address), a.is_contract
		FROM (
			SELECT address,
			       1 - (embedding <=> (SELECT embedding FROM account_behavior_vectors WHERE address = $1)) AS similarity,
			       features, sample_size
			FROM account_behavior_vectors
			WHERE address <> $1 AND sample_size >= $3
			ORDER BY embedding <=> (SELECT embedding FROM account_behavior_vectors WHERE address = $1)
			LIMIT $2
		) nn
		JOIN accounts a ON a.address = nn.address
		LEFT JOIN known_entities ke ON ke.address = nn.address
		ORDER BY nn.similarity DESC
	`, source.Address, limit, minBehaviorSample)
	if err != nil {
		return nil, fmt.Errorf("querying similar accounts for %s: %w", address, err)
	}
	defer rows.Close()

	matches := make([]*models.SimilarAccountMatch, 0)
	for rows.Next() {
		m := &models.SimilarAccountMatch{}
		var featuresJSON []byte
		if err := rows.Scan(&m.Address, &m.Similarity, &featuresJSON, &m.SampleSize,
			&m.EntityName, &m.EntityType, &m.RiskLevel, &m.IsContract); err != nil {
			return nil, fmt.Errorf("scanning similar account for %s: %w", address, err)
		}

		target := make(map[string]float64)
		if err := json.Unmarshal(featuresJSON, &target); err != nil {
			return nil, fmt.Errorf("decoding behaviour features for %s: %w", m.Address, err)
		}
		if m.EntityType == "" {
			m.EntityType = defaultEntityType(m.IsContract)
		}
		m.Similarity = math.Max(0, math.Min(1, m.Similarity))
		m.Highlights = behaviorHighlights(source.Features, target)
		matches = append(matches, m)
	}
	return matches, rows.Err()
}

func vectorLiteral(vector []float64) string {
	var b strings.Builder
	b.Grow(len(vector) * 10)
	b.WriteByte('[')
	for i, value := range vector {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(value, 'f', 6, 64))
	}
	b.WriteByte(']')
	return b.String()
}
