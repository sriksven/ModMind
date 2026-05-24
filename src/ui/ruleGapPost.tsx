import type { RuleGapResult } from "../types.js";

export function renderRuleGapMarkdown(suggestions: RuleGapResult[]): string {
  return suggestions
    .map((suggestion, index) =>
      [
        `## ${index + 1}. ${labelForType(suggestion.type)}`,
        `Confidence: ${suggestion.confidence}`,
        `Cluster: ${suggestion.cluster}`,
        `Supporting overrides: ${suggestion.supportingOverrideCount}`,
        `Estimated impact: ~${suggestion.estimatedWeeklyImpact} posts/week`,
        suggestion.proposedRuleText ? `Proposed rule: ${suggestion.proposedRuleText}` : "",
        suggestion.proposedAmendment ? `Proposed amendment: ${suggestion.proposedAmendment}` : "",
        suggestion.examplePostTitles.length > 0 ? `Examples: ${suggestion.examplePostTitles.join("; ")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function labelForType(type: RuleGapResult["type"]): string {
  if (type === "missing_rule") return "New rule";
  if (type === "vague_rule") return "Clarification needed";
  return "AI calibration issue";
}
