import type { EvaluationResult } from "../types.js";
import { formatConfidence } from "../utils/formatters.js";
import { getLanguageDisplayName } from "../utils/languageCodes.js";

export function renderSuggestionCard(result: EvaluationResult): string {
  const language = result.detectedLanguage?.detected ?? "en";
  const lines: string[] = [
    `ModMind Suggestion: ${result.suggestedAction.toUpperCase()}`,
    `Confidence: ${formatConfidence(result.confidence)} | Language: ${getLanguageDisplayName(language)}`,
    ""
  ];

  if (result.violatedRules && result.violatedRules.length > 0) {
    lines.push(`Rule violated: ${result.violatedRules.join(", ")}`);
  }

  lines.push(`Reason: ${result.reason}`);

  if (result.draftReply) {
    lines.push("");
    lines.push("Draft reply:");
    lines.push(result.draftReply);
  }

  if (result.bilingualReply) {
    lines.push("");
    lines.push("Native reply:");
    lines.push(result.bilingualReply.native);
  }

  lines.push("");
  lines.push("A human moderator should confirm this action.");

  return lines.join("\n");
}
