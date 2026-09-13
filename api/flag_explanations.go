package api

import "forensic-listener/models"

// flagExplanation is fixed, per-detector context shown next to a flag. It describes
// how the detector works; it is not computed for the individual flag.
type flagExplanation struct {
	WhyFlagged   string
	TriggerLogic string
	Method       string
	Provenance   string
	NextAction   string
}

var defaultFlagExplanation = flagExplanation{
	WhyFlagged:   "A forensic rule matched this transaction or address.",
	TriggerLogic: "Raised by one of the enrichment detectors.",
	Method:       "rule-based",
	Provenance:   "Forensic Listener enrichment pipeline",
	NextAction:   "Review the surrounding transactions and counterparties before drawing conclusions.",
}

var flagExplanationCatalog = map[string]flagExplanation{
	"circular_flow": {
		WhyFlagged:   "Value left an address and came back to it through a chain of transfers, each happening after the previous one.",
		TriggerLogic: "When a transfer A → B is enriched, Neo4j searches for an earlier path B → … → A of at most 3 hops, within the previous 7 days, whose transfers are in time order. ETH transactions and ERC-20 transfers both count as hops.",
		Method:       "rule-based graph traversal",
		Provenance:   "Neo4j variable-length path query (FindReturnPath)",
		NextAction:   "Open each hop in the loop, compare timing and amounts, and label the addresses involved if the pattern is confirmed.",
	},
	"similar_bytecode": {
		WhyFlagged:   "This contract's code is structurally near-identical to a contract already labelled or flagged as risky.",
		TriggerLogic: "When a contract is first seen, its opcode-structure embedding is compared with stored contracts in pgvector. A cosine similarity of 85% or more to a medium- or high-risk contract raises this flag.",
		Method:       "rule-based vector similarity",
		Provenance:   "pgvector HNSW nearest-neighbour search over contract embeddings",
		NextAction:   "Compare both contracts on their contract pages, then check who deployed and funded them.",
	},
}

func enrichFlag(flag *models.ForensicFlag) {
	if flag == nil {
		return
	}
	explanation, ok := flagExplanationCatalog[flag.FlagType]
	if !ok {
		explanation = defaultFlagExplanation
	}
	flag.WhyFlagged = explanation.WhyFlagged
	flag.TriggerLogic = explanation.TriggerLogic
	flag.Confidence = explanation.Method
	flag.Provenance = explanation.Provenance
	flag.NextAction = explanation.NextAction
}

func enrichFlags(flags []*models.ForensicFlag) {
	for _, flag := range flags {
		enrichFlag(flag)
	}
}
