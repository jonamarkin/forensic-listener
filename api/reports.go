package api

import (
	"fmt"
	"strings"
	"time"

	"forensic-listener/models"
)

func renderCaseReport(detail *models.InvestigationCaseDetail) string {
	if detail == nil {
		return ""
	}

	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("# Case %d: %s\n\n", detail.ID, detail.Title))
	builder.WriteString(fmt.Sprintf("- Status: %s\n", detail.Status))
	builder.WriteString(fmt.Sprintf("- Priority: %s\n", detail.Priority))
	builder.WriteString(fmt.Sprintf("- Owner: %s\n", detail.Owner))
	builder.WriteString(fmt.Sprintf("- Created: %s\n", detail.CreatedAt.UTC().Format(time.RFC3339)))
	builder.WriteString(fmt.Sprintf("- Updated: %s\n", detail.UpdatedAt.UTC().Format(time.RFC3339)))
	builder.WriteString(fmt.Sprintf("- Linked addresses: %d\n", detail.AddressCount))
	builder.WriteString(fmt.Sprintf("- Linked flags: %d (%d open)\n\n", detail.FlagCount, detail.OpenFlagCount))

	builder.WriteString("## Summary\n\n")
	if strings.TrimSpace(detail.Summary) == "" {
		builder.WriteString("No case summary has been recorded yet.\n\n")
	} else {
		builder.WriteString(detail.Summary)
		builder.WriteString("\n\n")
	}

	builder.WriteString("## Addresses\n\n")
	if len(detail.Addresses) == 0 {
		builder.WriteString("No addresses linked.\n\n")
	} else {
		for _, entry := range detail.Addresses {
			builder.WriteString(fmt.Sprintf("- `%s`", entry.Address))
			if entry.EntityName != "" {
				builder.WriteString(fmt.Sprintf(" (%s)", entry.EntityName))
			}
			builder.WriteString(fmt.Sprintf(" · role `%s` · type `%s` · risk `%s`", entry.Role, entry.EntityType, entry.RiskLevel))
			if entry.Note != "" {
				builder.WriteString(fmt.Sprintf(" · note: %s", entry.Note))
			}
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}

	builder.WriteString("## Linked Flags\n\n")
	if len(detail.Flags) == 0 {
		builder.WriteString("No forensic flags linked.\n")
		return builder.String()
	}

	for _, flag := range detail.Flags {
		builder.WriteString(fmt.Sprintf("### Flag %d: %s\n\n", flag.ID, flag.FlagType))
		builder.WriteString(fmt.Sprintf("- Severity: %s\n", flag.Severity))
		builder.WriteString(fmt.Sprintf("- Triage: %s\n", flag.TriageStatus))
		builder.WriteString(fmt.Sprintf("- Address: `%s`\n", flag.Address))
		if flag.TxHash != "" {
			builder.WriteString(fmt.Sprintf("- Transaction: `%s`\n", flag.TxHash))
		}
		builder.WriteString(fmt.Sprintf("- Detected: %s\n", flag.DetectedAt.UTC().Format(time.RFC3339)))
		if flag.Assignee != "" {
			builder.WriteString(fmt.Sprintf("- Assignee: %s\n", flag.Assignee))
		}
		if flag.WhyFlagged != "" {
			builder.WriteString(fmt.Sprintf("- Why flagged: %s\n", flag.WhyFlagged))
		}
		if flag.TriggerLogic != "" {
			builder.WriteString(fmt.Sprintf("- Trigger logic: %s\n", flag.TriggerLogic))
		}
		if flag.Confidence != "" {
			builder.WriteString(fmt.Sprintf("- Confidence: %s\n", flag.Confidence))
		}
		if flag.Provenance != "" {
			builder.WriteString(fmt.Sprintf("- Provenance: %s\n", flag.Provenance))
		}
		if flag.Description != "" {
			builder.WriteString(fmt.Sprintf("- Description: %s\n", flag.Description))
		}
		if flag.AnalystNote != "" {
			builder.WriteString(fmt.Sprintf("- Analyst note: %s\n", flag.AnalystNote))
		}
		builder.WriteString("\n")
	}

	return builder.String()
}
