import crypto from "node:crypto";
import type { AIClient, OverrideRecord, RuleGapResult, SubredditRule } from "../types.js";
import { parseJsonSafe } from "../utils/formatters.js";
import { buildRuleGapPrompt } from "../utils/prompts.js";

export async function analyzeGaps(
  overrides: OverrideRecord[],
  existingRules: SubredditRule[],
  dismissed: string[],
  aiClient?: AIClient
): Promise<RuleGapResult[]> {
  if (overrides.length === 0) return [];
  if (!aiClient) return heuristicGapAnalysis(overrides, dismissed);

  try {
    const raw = await aiClient.generate(buildRuleGapPrompt(overrides, existingRules, dismissed), { maxTokens: 2000, temperature: 0.1 });
    const parsed = parseJsonSafe<RuleGapResult[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return cleanSuggestions(parsed, dismissed, overrides);
  } catch {
    return heuristicGapAnalysis(overrides, dismissed);
  }
}

export function dedupeRuleGaps(results: RuleGapResult[]): RuleGapResult[] {
  const byCluster = new Map<string, RuleGapResult>();
  for (const result of results) {
    const key = result.cluster.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
    const existing = byCluster.get(key);
    if (!existing || result.supportingOverrideCount > existing.supportingOverrideCount) {
      byCluster.set(key, result);
    }
  }
  return [...byCluster.values()];
}

function cleanSuggestions(results: RuleGapResult[], dismissed: string[], overrides: OverrideRecord[]): RuleGapResult[] {
  const dismissedSet = new Set(dismissed.map((item) => item.toLowerCase()));
  return results
    .filter((result) => result.confidence !== "low")
    .filter((result) => !dismissedSet.has(result.id.toLowerCase()) && !dismissedSet.has(result.cluster.toLowerCase()))
    .filter((result) => result.supportingOverrideCount >= 5)
    .map((result) => ({
      ...result,
      id: result.id || crypto.randomUUID(),
      examplePostTitles: result.examplePostTitles.slice(0, 3),
      singleModBias: new Set(overrides.map((override) => override.modUsername).filter(Boolean)).size === 1
    }));
}

function heuristicGapAnalysis(overrides: OverrideRecord[], dismissed: string[]): RuleGapResult[] {
  const groups = new Map<string, OverrideRecord[]>();
  for (const override of overrides) {
    const key = override.rule || "unknown rule";
    groups.set(key, [...(groups.get(key) ?? []), override]);
  }

  return [...groups.entries()]
    .filter(([topic, records]) => records.length >= 5 && !dismissed.includes(topic))
    .map(([topic, records]) => ({
      id: crypto.randomUUID(),
      type: "vague_rule" as const,
      cluster: `Repeated overrides around ${topic}`,
      supportingOverrideCount: records.length,
      affectedRuleId: topic,
      proposedRuleText: "",
      proposedAmendment: `Clarify when ${topic} should trigger removal versus moderator review.`,
      estimatedWeeklyImpact: Math.max(1, Math.round(records.length / 4)),
      examplePostTitles: records.slice(0, 3).map((record) => record.title),
      confidence: records.length >= 10 ? "high" : "medium",
      singleModBias: new Set(records.map((record) => record.modUsername).filter(Boolean)).size === 1
    }));
}
