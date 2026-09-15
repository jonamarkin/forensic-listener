package store

import (
	"encoding/hex"
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"strings"
	"testing"
)

func loadRuntimeBytecode(t *testing.T) map[string][]byte {
	t.Helper()
	raw, err := os.ReadFile("../devnet/contracts/artifacts.json")
	if err != nil {
		t.Fatalf("reading compiled artifacts: %v", err)
	}
	var artifacts map[string]struct {
		DeployedBytecode string `json:"deployedBytecode"`
	}
	if err := json.Unmarshal(raw, &artifacts); err != nil {
		t.Fatalf("decoding artifacts: %v", err)
	}
	out := make(map[string][]byte, len(artifacts))
	for name, a := range artifacts {
		code, err := hex.DecodeString(strings.TrimPrefix(a.DeployedBytecode, "0x"))
		if err != nil {
			t.Fatalf("decoding %s bytecode: %v", name, err)
		}
		out[name] = code
	}
	return out
}

// legacyEmbedBytecode is the v1 model (byte histogram), kept only to show why it was replaced.
func legacyEmbedBytecode(bytecode []byte) []float64 {
	vector := make([]float64, 128)
	for idx, b := range bytecode {
		vector[int(b)%128] += 1.0
		vector[(idx+int(b))%128] += 0.25
		if idx > 0 {
			vector[(int(bytecode[idx-1])^int(b))%128] += 0.5
		}
	}
	return normalize(vector)
}

func minimalProxy(implementation byte) []byte {
	code, _ := hex.DecodeString("363d3d373d3d3d363d73")
	impl := make([]byte, 20)
	for i := range impl {
		impl[i] = implementation + byte(i)
	}
	tail, _ := hex.DecodeString("5af43d82803e903d91602b57fd5bf3")
	return append(append(code, impl...), tail...)
}

func TestEmbedBytecodeSeparatesContractFamilies(t *testing.T) {
	code := loadRuntimeBytecode(t)
	sweeper := code["Sweeper"]

	// A redeployment compiled with different metadata (e.g. another source path): only
	// the CBOR trailer differs, so it must be recognised as the same clone family.
	redeploy := append([]byte(nil), sweeper...)
	for i := len(redeploy) - 20; i < len(redeploy)-2; i++ {
		redeploy[i] ^= 0x5a
	}

	sim := func(a, b []byte) float64 { return cosine(EmbedBytecode(a), EmbedBytecode(b)) }
	legacy := func(a, b []byte) float64 { return cosine(legacyEmbedBytecode(a), legacyEmbedBytecode(b)) }

	rng := rand.New(rand.NewSource(7))
	blobA, blobB := make([]byte, 6000), make([]byte, 6000)
	rng.Read(blobA)
	rng.Read(blobB)

	type pair struct {
		name string
		a, b []byte
	}
	unrelated := []pair{
		{"Sweeper vs SimpleToken", sweeper, code["SimpleToken"]},
		{"Sweeper vs NameRegistry", sweeper, code["NameRegistry"]},
		{"Sweeper vs Vault", sweeper, code["Vault"]},
		{"SimpleToken vs NameRegistry", code["SimpleToken"], code["NameRegistry"]},
		{"SimpleToken vs Vault", code["SimpleToken"], code["Vault"]},
		{"Vault vs NameRegistry", code["Vault"], code["NameRegistry"]},
	}

	t.Logf("%-32s %8s %8s", "pair", "v2", "v1")
	cloneSim := sim(sweeper, redeploy)
	t.Logf("%-32s %8.3f %8.3f", "Sweeper vs redeploy (clone)", cloneSim, legacy(sweeper, redeploy))
	variantSim := sim(sweeper, code["SweeperV2"])
	t.Logf("%-32s %8.3f %8.3f", "Sweeper vs SweeperV2 (variant)", variantSim, legacy(sweeper, code["SweeperV2"]))
	maxUnrelated := 0.0
	for _, p := range unrelated {
		s := sim(p.a, p.b)
		maxUnrelated = math.Max(maxUnrelated, s)
		t.Logf("%-32s %8.3f %8.3f", p.name, s, legacy(p.a, p.b))
	}
	randomSim := sim(blobA, blobB)
	t.Logf("%-32s %8.3f %8.3f", "random 6KB vs random 6KB", randomSim, legacy(blobA, blobB))
	proxySim := sim(minimalProxy(0x10), minimalProxy(0x90))
	t.Logf("%-32s %8.3f %8.3f", "EIP-1167 proxies, other impls", proxySim, legacy(minimalProxy(0x10), minimalProxy(0x90)))

	if cloneSim < 0.999 {
		t.Errorf("clone similarity = %.3f, want >= 0.999", cloneSim)
	}
	if SkeletonHash(sweeper) != SkeletonHash(redeploy) {
		t.Errorf("clone should share a skeleton hash")
	}
	if SkeletonHash(minimalProxy(0x10)) != SkeletonHash(minimalProxy(0x90)) {
		t.Errorf("minimal proxies with different implementations should share a skeleton hash")
	}
	if variantSim <= maxUnrelated {
		t.Errorf("variant similarity %.3f should exceed every unrelated pair (max %.3f)", variantSim, maxUnrelated)
	}
	if randomSim > 0.3 {
		t.Errorf("random blobs similarity = %.3f, want <= 0.3", randomSim)
	}
	if maxUnrelated >= SimilarBytecodeThreshold {
		t.Errorf("unrelated contracts reach %.3f, at or above the flag threshold %.2f", maxUnrelated, SimilarBytecodeThreshold)
	}
	if variantSim < SimilarBytecodeThreshold {
		t.Logf("note: variant %.3f is below the flag threshold %.2f (reported as similar, not flagged)", variantSim, SimilarBytecodeThreshold)
	}
}

func TestStripMetadataKeepsCodeWithoutTrailer(t *testing.T) {
	code := []byte{0x60, 0x80, 0x60, 0x40, 0x52, 0x00}
	if got := stripMetadata(code); len(got) != len(code) {
		t.Fatalf("stripMetadata removed %d bytes from code without metadata", len(code)-len(got))
	}
}

func TestBehaviorScalingStaysInRange(t *testing.T) {
	extremes := []map[string]float64{
		{},
		{"sent_count": 1e9, "received_count": 1e9, "send_receive_balance": 5, "avg_sent_eth": 1e9,
			"avg_gas_price_gwei": 1e9, "counterparty_diversity": 3, "contract_call_ratio": 2,
			"recent_burst_ratio": 2, "night_ratio": 2, "weekend_ratio": 2, "active_span_hours": 1e9},
	}
	for _, features := range extremes {
		for i, v := range EmbedBehavior(features) {
			if v < -1 || v > 1 || math.IsNaN(v) {
				t.Fatalf("dimension %s = %v, want within [-1, 1]", behaviorFeatureOrder[i], v)
			}
		}
	}

	quiet := map[string]float64{"sent_count": 2, "received_count": 1, "avg_sent_eth": 0.01, "avg_gas_price_gwei": 2, "counterparty_diversity": 1, "active_span_hours": 1}
	busy := map[string]float64{"sent_count": 5000, "received_count": 9000, "send_receive_balance": -0.3, "avg_sent_eth": 40,
		"avg_gas_price_gwei": 60, "counterparty_diversity": 0.05, "contract_call_ratio": 0.9, "recent_burst_ratio": 0.4, "active_span_hours": 500}
	if s := cosine(EmbedBehavior(quiet), EmbedBehavior(busy)); s > 0.5 {
		t.Errorf("a quiet wallet and a busy hub score %.3f, want clearly dissimilar (<= 0.5)", s)
	}
}
