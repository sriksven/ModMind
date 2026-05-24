import type { AIClient, KeyValueStore, RuleGapResult, SubredditRule } from "../types.js";
import { analyzeGaps, dedupeRuleGaps } from "../ai/ruleGapAnalyzer.js";
import { getOverridesForPastDays } from "../storage/evaluationLog.js";
import { getDismissedTopics, getRuleGapState, storeSuggestions, updateRuleGapLastRun } from "../storage/ruleGapState.js";
import { renderRuleGapMarkdown } from "../ui/ruleGapPost.js";

export interface RuleGapJobResult {
  posted: boolean;
  reason?: string;
  postId?: string;
  suggestions: RuleGapResult[];
}

export async function runRuleGapDetectorJob(
  store: KeyValueStore,
  subredditName: string,
  existingRules: SubredditRule[],
  postGapAnalysis: (title: string, body: string) => Promise<string>,
  aiClient?: AIClient,
  now = Date.now(),
  force = false
): Promise<RuleGapJobResult> {
  const state = await getRuleGapState(store, subredditName);
  if (!force && state.lastRun && now - state.lastRun < 30 * 24 * 60 * 60 * 1000) {
    return { posted: false, reason: "Rule gap analysis already ran in the last 30 days", suggestions: [] };
  }

  const overrides = await getOverridesForPastDays(store, subredditName, 30);
  if (overrides.length < 20) {
    const body = "Not enough override data for a reliable rule gap analysis this month.";
    const postId = await postGapAnalysis("ModMind Rule Gap Analysis: Not enough data", body);
    await storeSuggestions(store, subredditName, []);
    const updated = await getRuleGapState(store, subredditName);
    await storeSuggestionsWithRun(store, subredditName, updated.pendingSuggestions, now);
    return { posted: true, postId, reason: "Not enough data", suggestions: [] };
  }

  const dismissed = await getDismissedTopics(store, subredditName);
  const batches = chunk(overrides, 50);
  const analyzed = await Promise.all(batches.map((batch) => analyzeGaps(batch, existingRules, dismissed, aiClient)));
  const suggestions = dedupeRuleGaps(analyzed.flat()).filter((suggestion) => suggestion.confidence !== "low");
  const postId = await postGapAnalysis(
    suggestions.length > 0 ? `ModMind found ${suggestions.length} potential rule gaps` : "ModMind Rule Gap Analysis: No significant gaps",
    suggestions.length > 0 ? renderRuleGapMarkdown(suggestions) : "No significant rule gaps detected this month."
  );

  await storeSuggestionsWithRun(store, subredditName, suggestions, now);
  return { posted: true, postId, suggestions };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function storeSuggestionsWithRun(
  store: KeyValueStore,
  subredditName: string,
  suggestions: RuleGapResult[],
  lastRun: number
): Promise<void> {
  await storeSuggestions(store, subredditName, suggestions);
  await updateRuleGapLastRun(store, subredditName, lastRun);
}
