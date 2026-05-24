import type { EvaluationResult } from "../types.js";
import { formatConfidence } from "../utils/formatters.js";
import { getLanguageDisplayName } from "../utils/languageCodes.js";

export function renderSuggestionCard(result: EvaluationResult): string {
  const language = result.detectedLanguage?.detected ?? "en";
  return [
    `ModMind suggestion: ${result.suggestedAction.toUpperCase()}`,
    `Confidence: ${formatConfidence(result.confidence)}`,
    `Language: ${getLanguageDisplayName(language)}`,
    `Reason: ${result.reason}`,
    result.draftReply ? `Draft reply: ${result.draftReply}` : "",
    result.bilingualReply ? `Native reply: ${result.bilingualReply.native}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
