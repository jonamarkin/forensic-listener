package api

import "forensic-listener/models"

type flagExplanation struct {
	WhyFlagged   string
	TriggerLogic string
	Confidence   string
	Provenance   string
	NextAction   string
}

var defaultFlagExplanation = flagExplanation{
	WhyFlagged:   "A configured forensic heuristic observed behavior that diverges from the platform's normal pattern expectations.",
	TriggerLogic: "Raised when the detector for this flag type reports suspicious behavior for the transaction or address under review.",
	Confidence:   "medium",
	Provenance:   "Forensic Listener heuristic engine",
	NextAction:   "Review the surrounding transactions, linked entities, and graph context before escalating.",
}

var flagExplanationCatalog = map[string]flagExplanation{
	"circular_flow": {
		WhyFlagged:   "Value appears to leave an address and then return to the origin through a short multi-hop path.",
		TriggerLogic: "Raised when graph traversal finds a bounded return path back to the same address within the configured circular-flow depth.",
		Confidence:   "medium",
		Provenance:   "Neo4j circular-flow detector",
		NextAction:   "Inspect the full path in Flow Canvas and compare hop timing, counterparties, and value symmetry.",
	},
	"similar_bytecode": {
		WhyFlagged:   "The contract bytecode strongly resembles another contract family already observed in the dataset.",
		TriggerLogic: "Raised when bytecode vector similarity crosses the configured nearest-neighbor threshold for suspicious contract families.",
		Confidence:   "medium",
		Provenance:   "pgvector contract-similarity matcher",
		NextAction:   "Open the contract intelligence route, inspect the nearest matches, and compare source or decompiled behavior.",
	},
	"velocity_spike": {
		WhyFlagged:   "The address is transacting much faster than its recent historical baseline.",
		TriggerLogic: "Raised when short-window transaction counts exceed baseline activity by the configured spike ratio and minimum event count.",
		Confidence:   "medium",
		Provenance:   "PostgreSQL velocity baseline query",
		NextAction:   "Compare the address dossier's recent velocity buckets and counterparties before escalation.",
	},
	"high_value_transfer": {
		WhyFlagged:   "A transfer amount exceeded the configured high-value threshold for manual review.",
		TriggerLogic: "Raised when transfer value crosses the detector's configured value threshold.",
		Confidence:   "low",
		Provenance:   "Transaction enrichment rules",
		NextAction:   "Validate the entity labels on sender and recipient and inspect any linked contracts or flags.",
	},
	"hub_interaction": {
		WhyFlagged:   "The address is interacting with a highly connected hub or curated entity of interest.",
		TriggerLogic: "Raised when a transaction touches a node labeled as a hub, bridge, exchange, mixer, or other monitored entity.",
		Confidence:   "low",
		Provenance:   "Entity-label enrichment and graph degree analysis",
		NextAction:   "Check the entity label, the transaction purpose, and whether the interaction is typical for this address.",
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
	flag.Confidence = explanation.Confidence
	flag.Provenance = explanation.Provenance
	flag.NextAction = explanation.NextAction
}

func enrichFlags(flags []*models.ForensicFlag) {
	for _, flag := range flags {
		enrichFlag(flag)
	}
}
