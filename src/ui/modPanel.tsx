import type { DigestState, RuleGapState, WeeklyStats } from "../types.js";
import { calculateAccuracy } from "../utils/formatters.js";

export function renderModPanel(stats: WeeklyStats, digestState: DigestState, ruleGapState: RuleGapState): string {
  return [
    "# ModMind",
    "",
    "## Overview",
    `Evaluated this week: ${stats.evaluated}`,
    `Accuracy: ${calculateAccuracy(stats)}%`,
    "",
    "## Digest",
    `Weekly digest: ${digestState.enabled ? "enabled" : "disabled"}`,
    ...digestState.summaries.map((summary) => `- ${summary.title}`),
    "",
    "## Rule Health",
    `Pending suggestions: ${ruleGapState.pendingSuggestions.length}`,
    `Approved ModMind rules: ${ruleGapState.approvedRules.length}`,
    "",
    "## Languages",
    ...Object.entries(stats.languageBreakdown).map(([language, values]) => `- ${language}: ${values.evaluated} evaluated`)
  ].join("\n");
}
