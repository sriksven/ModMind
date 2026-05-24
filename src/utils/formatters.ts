import type { DigestSummary, EvaluationResult, WeeklyStats } from "../types.js";

export function stripMarkdownJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/iu, "")
    .replace(/```$/u, "")
    .trim();
}

export function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(stripMarkdownJsonFence(raw)) as T;
  } catch {
    return null;
  }
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().split(/\s+/u).join(" ").length / 4);
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (estimateTokenCount(text) <= maxTokens) return text;
  const targetChars = Math.max(0, maxTokens * 4);
  const candidate = text.slice(0, targetChars);
  const lastSpace = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, lastSpace > 0 ? lastSpace : targetChars).trim()}...`;
}

export function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  const lastSpace = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, lastSpace > 0 ? lastSpace : maxChars).trim()}...`;
}

export function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return "-";
  return `${normalizeConfidenceScale(confidence)}%`;
}

export function calculateAccuracy(stats: Pick<WeeklyStats, "accepted" | "overridden">): number {
  const total = stats.accepted + stats.overridden;
  if (total === 0) return 100;
  return Math.round((stats.accepted / total) * 100);
}

export function buildDigestPost(stats: WeeklyStats, summary: DigestSummary): string {
  if (stats.evaluated < 5) {
    return [
      "# Weekly ModMind Digest",
      "",
      "Quiet week: fewer than 5 items were evaluated.",
      "",
      `Total evaluated: ${stats.evaluated}`
    ].join("\n");
  }

  const topRules = Object.entries(stats.ruleBreakdown)
    .sort(([, a], [, b]) => b.violations - a.violations)
    .slice(0, 5)
    .map(([rule, ruleStats], index) => {
      const total = ruleStats.accepted + ruleStats.overridden;
      const acceptance = total === 0 ? 0 : Math.round((ruleStats.accepted / total) * 100);
      return `${index + 1}. ${rule}: ${ruleStats.violations} violations, ${acceptance}% accepted`;
    });

  const languages = Object.entries(stats.languageBreakdown)
    .sort(([, a], [, b]) => b.evaluated - a.evaluated)
    .map(([language, languageStats]) => `- ${language}: ${languageStats.evaluated} evaluated, ${languageStats.flagged} flagged`);

  return [
    "# Weekly ModMind Digest",
    "",
    `## ${summary.topInsight}`,
    "",
    "## Volume",
    `- Posts evaluated: ${stats.postsEvaluated}`,
    `- Comments evaluated: ${stats.commentsEvaluated}`,
    `- Auto-held: ${stats.autoHeld}`,
    `- Flagged for review: ${stats.flagged}`,
    `- Passed: ${stats.passed}`,
    "",
    "## AI Performance",
    `- Accepted: ${stats.accepted}`,
    `- Overridden: ${stats.overridden}`,
    `- Accuracy: ${calculateAccuracy(stats)}%`,
    "",
    "## Top Violated Rules",
    ...(topRules.length > 0 ? topRules : ["No rule violations logged."]),
    "",
    "## Pattern Summary",
    summary.patternParagraph,
    "",
    "## Language Breakdown",
    ...(languages.length > 0 ? languages : ["- English: 0 evaluated"]),
    "",
    "## Override Warnings",
    ...(summary.overrideWarnings.length > 0 ? summary.overrideWarnings.map((warning) => `- ${warning}`) : ["No high-override rules detected."]),
    "",
    "## Recommendations",
    ...(summary.recommendations.length > 0 ? summary.recommendations.map((item) => `- ${item}`) : ["No immediate changes recommended."])
  ].join("\n");
}

export function normalizeEvaluation(raw: Partial<EvaluationResult>): EvaluationResult {
  return {
    shouldFlag: Boolean(raw.shouldFlag),
    confidence: clampConfidence(raw.confidence ?? 0),
    suggestedAction: raw.suggestedAction ?? "approve",
    violatedRules: Array.isArray(raw.violatedRules) ? raw.violatedRules : [],
    reason: raw.reason ?? "No reason provided.",
    draftReply: raw.draftReply ?? "",
    bilingualReply: raw.bilingualReply,
    detectedLanguage: raw.detectedLanguage,
    createdAt: raw.createdAt ?? Date.now()
  };
}

export function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(100, normalizeConfidenceScale(confidence)));
}

export function normalizeConfidenceScale(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  const scaled = confidence > 0 && confidence <= 1 ? confidence * 100 : confidence;
  return Math.round(scaled);
}
