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

const embeddingDims = 128

var behaviorFeatureOrder = []string{
	"sent_count_log",
	"received_count_log",
	"send_receive_balance",
	"avg_sent_value_log",
	"avg_gas_price_log",
	"counterparty_diversity",
	"contract_call_ratio",
	"recent_burst_ratio",
	"night_ratio",
	"weekend_ratio",
	"active_span_log",
}

// Vector stores contract bytecode fingerprints inside pgvector.
type Vector struct {
	pool *pgxpool.Pool
}

func NewVector(ctx context.Context, connStr string) (*Vector, error) {
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("creating pgvector pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging pgvector pool: %w", err)
	}

	return &Vector{pool: pool}, nil
}

func (v *Vector) Close() {
	v.pool.Close()
}

// AccountBehavior rebuilds and returns a stored behavioral fingerprint for an address.
func (v *Vector) AccountBehavior(ctx context.Context, address string) (*models.AccountBehaviorProfile, error) {
	return v.rebuildAccountBehavior(ctx, address)
}

// SimilarAccounts returns the nearest behavioural matches for an address.
func (v *Vector) SimilarAccounts(ctx context.Context, address string, limit int) ([]*models.SimilarAccountMatch, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 6
	}

	bootstrapSize := limit * 12
	if bootstrapSize < 72 {
		bootstrapSize = 72
	}
	if err := v.bootstrapAccountBehaviors(ctx, bootstrapSize); err != nil {
		return nil, err
	}

	source, err := v.rebuildAccountBehavior(ctx, address)
	if err != nil {
		return nil, err
	}

	rows, err := v.pool.Query(ctx, `
		WITH query AS (
			SELECT embedding
			FROM account_behavior_vectors
			WHERE address = $1
		),
		risk AS (
			SELECT address,
			       CASE MAX(
			           CASE severity
			               WHEN 'high' THEN 3
			               WHEN 'medium' THEN 2
			               WHEN 'low' THEN 1
			               ELSE 0
			           END
			       )
			           WHEN 3 THEN 'high'
			           WHEN 2 THEN 'medium'
			           WHEN 1 THEN 'low'
			           ELSE 'none'
			       END AS risk_level
			FROM forensic_flags
			GROUP BY address
		)
		SELECT
			ab.address,
			1 - (ab.embedding <=> query.embedding) AS similarity,
			ab.features,
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			COALESCE(NULLIF(ke.risk_level, ''), risk.risk_level, 'none') AS risk_level,
			COALESCE(a.is_contract, FALSE)
		FROM account_behavior_vectors ab
		CROSS JOIN query
		JOIN accounts a ON a.address = ab.address
		LEFT JOIN known_entities ke ON ke.address = ab.address
		LEFT JOIN risk ON risk.address = ab.address
		WHERE ab.address <> $1
		ORDER BY ab.embedding <=> query.embedding
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying similar accounts for %s: %w", address, err)
	}
	defer rows.Close()

	var matches []*models.SimilarAccountMatch
	for rows.Next() {
		match := &models.SimilarAccountMatch{}
		var featuresJSON []byte
		if err := rows.Scan(
			&match.Address,
			&match.Similarity,
			&featuresJSON,
			&match.EntityName,
			&match.EntityType,
			&match.RiskLevel,
			&match.IsContract,
		); err != nil {
			return nil, fmt.Errorf("scanning similar account for %s: %w", address, err)
		}

		targetFeatures := make(map[string]float64)
		if len(featuresJSON) > 0 {
			if err := json.Unmarshal(featuresJSON, &targetFeatures); err != nil {
				return nil, fmt.Errorf("decoding behaviour features for %s: %w", match.Address, err)
			}
		}

		if match.EntityType == "" {
			if match.IsContract {
				match.EntityType = "contract"
			} else {
				match.EntityType = "wallet"
			}
		}
		if match.RiskLevel == "" {
			match.RiskLevel = "none"
		}
		match.Similarity = math.Max(0, math.Min(1, match.Similarity))
		match.Highlights = behaviorHighlights(source.Features, targetFeatures)
		matches = append(matches, match)
	}

	return matches, rows.Err()
}

// UpsertContract stores the latest bytecode and embedding for an address.
func (v *Vector) UpsertContract(ctx context.Context, address string, bytecode []byte) error {
	address = NormalizeAddress(address)
	if address == "" || len(bytecode) == 0 {
		return nil
	}

	_, err := v.pool.Exec(ctx, `
		INSERT INTO contract_vectors (address, bytecode, embedding)
		VALUES ($1, $2, $3::vector)
		ON CONFLICT (address) DO UPDATE
		SET bytecode = EXCLUDED.bytecode,
		    embedding = EXCLUDED.embedding
	`, address, bytecode, vectorLiteral(embedBytecode(bytecode)))
	if err != nil {
		return fmt.Errorf("upserting contract vector for %s: %w", address, err)
	}

	return nil
}

func (v *Vector) MarkFlagged(ctx context.Context, address string, flagged bool) error {
	address = NormalizeAddress(address)
	if address == "" {
		return nil
	}

	_, err := v.pool.Exec(ctx, `
		UPDATE contract_vectors
		SET flagged = $2
		WHERE address = $1
	`, address, flagged)
	if err != nil {
		return fmt.Errorf("marking contract %s flagged=%t: %w", address, flagged, err)
	}

	return nil
}

// SimilarContracts returns the nearest neighbours for an already-stored contract.
func (v *Vector) SimilarContracts(ctx context.Context, address string, limit int) ([]*models.ContractSimilarity, error) {
	address = NormalizeAddress(address)
	if limit <= 0 {
		limit = 5
	}

	rows, err := v.pool.Query(ctx, `
		SELECT cv.address,
		       1 - (cv.embedding <=> query.embedding) AS similarity,
		       cv.flagged
		FROM contract_vectors AS cv,
		     (SELECT embedding FROM contract_vectors WHERE address = $1) AS query
		WHERE cv.address <> $1
		ORDER BY cv.embedding <=> query.embedding
		LIMIT $2
	`, address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying similar contracts for %s: %w", address, err)
	}
	defer rows.Close()

	return scanSimilarities(rows)
}

// FindSimilarBytecode compares raw bytecode against already-stored contracts.
func (v *Vector) FindSimilarBytecode(ctx context.Context, address string, bytecode []byte, limit int) ([]*models.ContractSimilarity, error) {
	address = NormalizeAddress(address)
	if len(bytecode) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		limit = 5
	}

	rows, err := v.pool.Query(ctx, `
		SELECT address,
		       1 - (embedding <=> $1::vector) AS similarity,
		       flagged
		FROM contract_vectors
		WHERE address <> $2
		ORDER BY embedding <=> $1::vector
		LIMIT $3
	`, vectorLiteral(embedBytecode(bytecode)), address, limit)
	if err != nil {
		return nil, fmt.Errorf("querying bytecode neighbours for %s: %w", address, err)
	}
	defer rows.Close()

	return scanSimilarities(rows)
}

func scanSimilarities(rows pgx.Rows) ([]*models.ContractSimilarity, error) {
	var similarities []*models.ContractSimilarity
	for rows.Next() {
		match := &models.ContractSimilarity{}
		if err := rows.Scan(&match.Address, &match.Similarity, &match.Flagged); err != nil {
			return nil, fmt.Errorf("scanning contract similarity: %w", err)
		}
		similarities = append(similarities, match)
	}
	return similarities, rows.Err()
}

func embedBytecode(bytecode []byte) []float64 {
	vector := make([]float64, embeddingDims)
	if len(bytecode) == 0 {
		return vector
	}

	for idx, b := range bytecode {
		vector[int(b)%embeddingDims] += 1.0
		vector[(idx+int(b))%embeddingDims] += 0.25
		if idx > 0 {
			vector[(int(bytecode[idx-1])^int(b))%embeddingDims] += 0.5
		}
	}

	var norm float64
	for _, value := range vector {
		norm += value * value
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return vector
	}

	for idx := range vector {
		vector[idx] /= norm
	}

	return vector
}

func vectorLiteral(vector []float64) string {
	var builder strings.Builder
	builder.WriteByte('[')
	for idx, value := range vector {
		if idx > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.FormatFloat(value, 'f', 6, 64))
	}
	builder.WriteByte(']')
	return builder.String()
}

func (v *Vector) bootstrapAccountBehaviors(ctx context.Context, sample int) error {
	if sample <= 0 {
		sample = 72
	}

	var existing int
	if err := v.pool.QueryRow(ctx, `SELECT COUNT(*) FROM account_behavior_vectors`).Scan(&existing); err != nil {
		return fmt.Errorf("counting behaviour vectors: %w", err)
	}
	if existing >= sample {
		return nil
	}

	rows, err := v.pool.Query(ctx, `
		WITH activity AS (
			SELECT from_address AS address, COUNT(*) AS tx_count
			FROM transactions
			GROUP BY from_address
			UNION ALL
			SELECT to_address AS address, COUNT(*) AS tx_count
			FROM transactions
			WHERE to_address IS NOT NULL
			GROUP BY to_address
		)
		SELECT address
		FROM activity
		GROUP BY address
		ORDER BY SUM(tx_count) DESC
		LIMIT $1
	`, sample)
	if err != nil {
		return fmt.Errorf("querying active addresses for behaviour bootstrap: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var address string
		if err := rows.Scan(&address); err != nil {
			return fmt.Errorf("scanning active address for behaviour bootstrap: %w", err)
		}
		if _, err := v.rebuildAccountBehavior(ctx, address); err != nil {
			return err
		}
	}

	return rows.Err()
}

func (v *Vector) rebuildAccountBehavior(ctx context.Context, address string) (*models.AccountBehaviorProfile, error) {
	address = NormalizeAddress(address)
	if address == "" {
		return nil, &NotFoundError{Resource: "account", ID: address}
	}

	var exists bool
	var sentCount int64
	var receivedCount int64
	var avgSentValue float64
	var avgGasPrice float64
	var uniqueCounterparties int64
	var contractCallRatio float64
	var recentOneHour int64
	var recentTwentyFourHours int64
	var nightRatio float64
	var weekendRatio float64
	var activeSpanHours float64

	err := v.pool.QueryRow(ctx, `
		WITH related AS (
			SELECT
				CASE WHEN from_address = $1 THEN 'out' ELSE 'in' END AS direction,
				value::double precision AS value,
				gas_price::double precision AS gas_price,
				COALESCE(CASE WHEN from_address = $1 THEN to_address ELSE from_address END, '') AS counterparty,
				timestamp,
				CASE
					WHEN from_address = $1 AND OCTET_LENGTH(COALESCE(data, '\x'::bytea)) > 0 THEN 1.0
					ELSE 0.0
				END AS contract_call
			FROM transactions
			WHERE from_address = $1 OR to_address = $1
		)
		SELECT
			EXISTS(SELECT 1 FROM accounts WHERE address = $1),
			COUNT(*) FILTER (WHERE direction = 'out') AS sent_count,
			COUNT(*) FILTER (WHERE direction = 'in') AS received_count,
			COALESCE(AVG(value) FILTER (WHERE direction = 'out'), 0)::double precision AS avg_sent_value,
			COALESCE(AVG(gas_price) FILTER (WHERE direction = 'out'), 0)::double precision AS avg_gas_price,
			COUNT(DISTINCT counterparty) FILTER (WHERE counterparty <> '') AS unique_counterparties,
			COALESCE(AVG(contract_call), 0)::double precision AS contract_call_ratio,
			COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour') AS recent_one_hour,
			COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS recent_twenty_four_hours,
			COALESCE(
				AVG(
					CASE
						WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 0 AND 5 THEN 1.0
						ELSE 0.0
					END
				),
				0
			)::double precision AS night_ratio,
			COALESCE(
				AVG(
					CASE
						WHEN EXTRACT(DOW FROM timestamp) IN (0, 6) THEN 1.0
						ELSE 0.0
					END
				),
				0
			)::double precision AS weekend_ratio,
			COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 3600.0, 0)::double precision AS active_span_hours
		FROM related
	`, address).Scan(
		&exists,
		&sentCount,
		&receivedCount,
		&avgSentValue,
		&avgGasPrice,
		&uniqueCounterparties,
		&contractCallRatio,
		&recentOneHour,
		&recentTwentyFourHours,
		&nightRatio,
		&weekendRatio,
		&activeSpanHours,
	)
	if err != nil {
		return nil, fmt.Errorf("querying behaviour stats for %s: %w", address, err)
	}
	if !exists {
		return nil, &NotFoundError{Resource: "account", ID: address}
	}

	totalCount := sentCount + receivedCount
	sendReceiveBalance := 0.0
	counterpartyDiversity := 0.0
	recentBurstRatio := 0.0
	if totalCount > 0 {
		sendReceiveBalance = float64(sentCount-receivedCount) / float64(totalCount)
		counterpartyDiversity = float64(uniqueCounterparties) / float64(totalCount)
	}
	if recentTwentyFourHours > 0 {
		recentBurstRatio = float64(recentOneHour) / float64(recentTwentyFourHours)
	}

	features := map[string]float64{
		"sent_count_log":         math.Log1p(float64(sentCount)),
		"received_count_log":     math.Log1p(float64(receivedCount)),
		"send_receive_balance":   sendReceiveBalance,
		"avg_sent_value_log":     math.Log10(avgSentValue + 1),
		"avg_gas_price_log":      math.Log10(avgGasPrice + 1),
		"counterparty_diversity": counterpartyDiversity,
		"contract_call_ratio":    contractCallRatio,
		"recent_burst_ratio":     recentBurstRatio,
		"night_ratio":            nightRatio,
		"weekend_ratio":          weekendRatio,
		"active_span_log":        math.Log1p(activeSpanHours),
	}

	featuresJSON, err := json.Marshal(features)
	if err != nil {
		return nil, fmt.Errorf("encoding behaviour features for %s: %w", address, err)
	}

	updatedAt := time.Now().UTC()
	_, err = v.pool.Exec(ctx, `
		INSERT INTO account_behavior_vectors (address, embedding, features, updated_at)
		VALUES ($1, $2::vector, $3::jsonb, $4)
		ON CONFLICT (address) DO UPDATE
		SET embedding = EXCLUDED.embedding,
		    features = EXCLUDED.features,
		    updated_at = EXCLUDED.updated_at
	`, address, vectorLiteral(embedBehaviorFeatures(features)), string(featuresJSON), updatedAt)
	if err != nil {
		return nil, fmt.Errorf("upserting behaviour vector for %s: %w", address, err)
	}

	profile := &models.AccountBehaviorProfile{
		Address:    address,
		Features:   features,
		UpdatedAt:  updatedAt,
		SampleSize: totalCount,
	}

	var riskLevel string
	err = v.pool.QueryRow(ctx, `
		WITH risk AS (
			SELECT address,
			       CASE MAX(
			           CASE severity
			               WHEN 'high' THEN 3
			               WHEN 'medium' THEN 2
			               WHEN 'low' THEN 1
			               ELSE 0
			           END
			       )
			           WHEN 3 THEN 'high'
			           WHEN 2 THEN 'medium'
			           WHEN 1 THEN 'low'
			           ELSE 'none'
			       END AS risk_level
			FROM forensic_flags
			GROUP BY address
		)
		SELECT
			COALESCE(ke.name, ''),
			COALESCE(ke.entity_type, ''),
			COALESCE(NULLIF(ke.risk_level, ''), risk.risk_level, 'none') AS risk_level,
			COALESCE(a.is_contract, FALSE)
		FROM accounts a
		LEFT JOIN known_entities ke ON ke.address = a.address
		LEFT JOIN risk ON risk.address = a.address
		WHERE a.address = $1
	`, address).Scan(
		&profile.EntityName,
		&profile.EntityType,
		&riskLevel,
		&profile.IsContract,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, &NotFoundError{Resource: "account", ID: address}
		}
		return nil, fmt.Errorf("querying behaviour metadata for %s: %w", address, err)
	}

	if profile.EntityType == "" {
		if profile.IsContract {
			profile.EntityType = "contract"
		} else {
			profile.EntityType = "wallet"
		}
	}
	if riskLevel == "" {
		riskLevel = "none"
	}
	profile.RiskLevel = riskLevel

	return profile, nil
}

func embedBehaviorFeatures(features map[string]float64) []float64 {
	vector := make([]float64, embeddingDims)
	for idx, name := range behaviorFeatureOrder {
		if idx >= len(vector) {
			break
		}
		vector[idx] = features[name]
	}

	var norm float64
	for _, value := range vector {
		norm += value * value
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return vector
	}
	for idx := range vector {
		vector[idx] /= norm
	}
	return vector
}

func behaviorHighlights(source, target map[string]float64) []string {
	type featureDelta struct {
		label string
		diff  float64
	}

	labels := map[string]string{
		"sent_count_log":         "activity volume",
		"received_count_log":     "incoming volume",
		"send_receive_balance":   "send/receive balance",
		"avg_sent_value_log":     "transfer size",
		"avg_gas_price_log":      "gas price posture",
		"counterparty_diversity": "counterparty spread",
		"contract_call_ratio":    "contract-call ratio",
		"recent_burst_ratio":     "recent burstiness",
		"night_ratio":            "overnight activity",
		"weekend_ratio":          "weekend activity",
		"active_span_log":        "activity span",
	}

	deltas := make([]featureDelta, 0, len(behaviorFeatureOrder))
	for _, name := range behaviorFeatureOrder {
		deltas = append(deltas, featureDelta{
			label: labels[name],
			diff:  math.Abs(source[name] - target[name]),
		})
	}

	for i := 0; i < len(deltas); i += 1 {
		for j := i + 1; j < len(deltas); j += 1 {
			if deltas[j].diff < deltas[i].diff {
				deltas[i], deltas[j] = deltas[j], deltas[i]
			}
		}
	}

	highlights := make([]string, 0, 3)
	for _, delta := range deltas {
		if delta.label == "" {
			continue
		}
		highlights = append(highlights, "similar "+delta.label)
		if len(highlights) == 3 {
			break
		}
	}

	return highlights
}
