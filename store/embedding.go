package store

import (
	"hash/fnv"
	"math"
	"sort"

	"github.com/ethereum/go-ethereum/crypto"
)

const (
	bytecodeEmbeddingDims = 1024
	behaviorEmbeddingDims = 11

	// SimilarBytecodeThreshold is the cosine similarity at which two contracts are
	// treated as the same family for flagging. Calibrated in embedding_test.go against
	// compiled contracts: a modified variant scores 0.91, the most similar unrelated
	// pair 0.76, random bytes 0.03 and clones 1.0.
	SimilarBytecodeThreshold = 0.85
)

// opcodeSkeleton returns the contract's opcode sequence with PUSH operands and the
// Solidity/Vyper CBOR metadata trailer removed. Two deployments that differ only in
// embedded constants or compiler metadata share the same skeleton.
func opcodeSkeleton(code []byte) []byte {
	code = stripMetadata(code)
	ops := make([]byte, 0, len(code))
	for i := 0; i < len(code); i++ {
		op := code[i]
		ops = append(ops, op)
		if op >= 0x60 && op <= 0x7f { // PUSH1..PUSH32 carry 1..32 operand bytes
			i += int(op - 0x5f)
		}
	}
	return ops
}

// stripMetadata removes the CBOR-encoded metadata that compilers append to runtime
// code. Its length is stored big-endian in the final two bytes.
func stripMetadata(code []byte) []byte {
	if len(code) < 4 {
		return code
	}
	length := int(code[len(code)-2])<<8 | int(code[len(code)-1])
	start := len(code) - 2 - length
	if length == 0 || start < 0 {
		return code
	}
	switch code[start] {
	case 0xa1, 0xa2, 0xa3, 0xa4: // CBOR map with 1-4 entries
		return code[:start]
	}
	return code
}

// SkeletonHash identifies an exact clone family.
func SkeletonHash(code []byte) string {
	if len(code) == 0 {
		return ""
	}
	return crypto.Keccak256Hash(opcodeSkeleton(code)).Hex()
}

// EmbedBytecode builds a signed feature-hashing embedding of opcode 2- and 3-grams.
//
// Each distinct n-gram hashes to a bucket and a random sign, weighted by
// 1+ln(count). Shared n-grams add up coherently, while unrelated n-grams land with
// independent signs and cancel, so unrelated contracts score near 0 instead of
// converging on the same histogram (the flaw in the v1 byte-count model).
func EmbedBytecode(code []byte) []float64 {
	vector := make([]float64, bytecodeEmbeddingDims)
	ops := opcodeSkeleton(code)
	if len(ops) == 0 {
		return vector
	}

	counts := make(map[uint64]int)
	for n := 2; n <= 3; n++ {
		for i := 0; i+n <= len(ops); i++ {
			counts[ngramHash(ops[i:i+n])]++
		}
	}

	for h, c := range counts {
		idx := h % bytecodeEmbeddingDims
		weight := 1 + math.Log(float64(c))
		if h>>63 == 1 {
			weight = -weight
		}
		vector[idx] += weight
	}

	return normalize(vector)
}

func ngramHash(gram []byte) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte{byte(len(gram))})
	_, _ = h.Write(gram)
	return mix64(h.Sum64())
}

// mix64 is the SplitMix64 finalizer. FNV-1a leaves the high bits of short inputs
// poorly mixed, which made the "random" sign bit correlated across n-grams and let
// unrelated code add up coherently. After mixing, sign and bucket are independent.
func mix64(x uint64) uint64 {
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return x
}

// behaviorFeatureOrder fixes the dimension each feature occupies in vector(11).
var behaviorFeatureOrder = []string{
	"sent_count",
	"received_count",
	"send_receive_balance",
	"avg_sent_eth",
	"avg_gas_price_gwei",
	"counterparty_diversity",
	"contract_call_ratio",
	"recent_burst_ratio",
	"night_ratio",
	"weekend_ratio",
	"active_span_hours",
}

var behaviorFeatureLabels = map[string]string{
	"sent_count":             "sending volume",
	"received_count":         "receiving volume",
	"send_receive_balance":   "send/receive balance",
	"avg_sent_eth":           "transfer size",
	"avg_gas_price_gwei":     "fee level",
	"counterparty_diversity": "counterparty spread",
	"contract_call_ratio":    "contract-call share",
	"recent_burst_ratio":     "recent burstiness",
	"night_ratio":            "overnight activity",
	"weekend_ratio":          "weekend activity",
	"active_span_hours":      "activity span",
}

// scaleBehaviorFeature maps a raw, human-readable feature onto [-1, 1] with fixed,
// documented scales so that every dimension contributes comparably to cosine
// similarity and a typical value sits near 0 rather than at a shared positive bias.
func scaleBehaviorFeature(name string, v float64) float64 {
	unit := func(x float64) float64 { return math.Max(0, math.Min(1, x))*2 - 1 }
	switch name {
	case "sent_count", "received_count":
		return unit(math.Log1p(v) / math.Log1p(10_000))
	case "send_receive_balance":
		return math.Max(-1, math.Min(1, v))
	case "avg_sent_eth":
		return unit(math.Log10(v*1e18+1) / 22) // 1e22 wei = 10,000 ETH
	case "avg_gas_price_gwei":
		return unit(math.Log10(v*1e9+1) / 12) // 1e12 wei = 1,000 gwei
	case "active_span_hours":
		return unit(math.Log1p(v) / math.Log1p(720)) // 30 days
	default: // ratios already in [0, 1]
		return unit(v)
	}
}

// EmbedBehavior converts raw features into the stored vector(11).
func EmbedBehavior(features map[string]float64) []float64 {
	vector := make([]float64, behaviorEmbeddingDims)
	for i, name := range behaviorFeatureOrder {
		vector[i] = scaleBehaviorFeature(name, features[name])
	}
	return vector
}

// behaviorHighlights names the three scaled features on which two accounts agree most.
func behaviorHighlights(source, target map[string]float64) []string {
	type delta struct {
		label string
		diff  float64
	}
	deltas := make([]delta, 0, len(behaviorFeatureOrder))
	for _, name := range behaviorFeatureOrder {
		deltas = append(deltas, delta{
			label: behaviorFeatureLabels[name],
			diff:  math.Abs(scaleBehaviorFeature(name, source[name]) - scaleBehaviorFeature(name, target[name])),
		})
	}
	sort.SliceStable(deltas, func(i, j int) bool { return deltas[i].diff < deltas[j].diff })

	highlights := make([]string, 0, 3)
	for _, d := range deltas[:3] {
		highlights = append(highlights, "similar "+d.label)
	}
	return highlights
}

func normalize(vector []float64) []float64 {
	var norm float64
	for _, v := range vector {
		norm += v * v
	}
	if norm == 0 {
		return vector
	}
	norm = math.Sqrt(norm)
	for i := range vector {
		vector[i] /= norm
	}
	return vector
}

func cosine(a, b []float64) float64 {
	var dot, na, nb float64
	for i := range a {
		dot += a[i] * b[i]
		na += a[i] * a[i]
		nb += b[i] * b[i]
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / math.Sqrt(na*nb)
}
