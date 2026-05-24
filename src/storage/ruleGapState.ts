import type { KeyValueStore, RuleGapResult, RuleGapState } from "../types.js";
import { STORAGE_KEYS } from "../utils/constants.js";
import { getJson, setJson } from "./redisAdapter.js";

export async function getRuleGapState(store: KeyValueStore, subredditName: string): Promise<RuleGapState> {
  return (
    (await getJson<RuleGapState>(store, STORAGE_KEYS.ruleGapState(subredditName))) ?? {
      pendingSuggestions: [],
      approvedRules: [],
      dismissedSuggestions: []
    }
  );
}

export async function storeSuggestions(store: KeyValueStore, subredditName: string, suggestions: RuleGapResult[]): Promise<RuleGapState> {
  const current = await getRuleGapState(store, subredditName);
  const next = { ...current, pendingSuggestions: suggestions };
  await setJson(store, STORAGE_KEYS.ruleGapState(subredditName), next);
  return next;
}

export async function approveSuggestion(store: KeyValueStore, subredditName: string, suggestionId: string): Promise<RuleGapState> {
  const current = await getRuleGapState(store, subredditName);
  const suggestion = current.pendingSuggestions.find((item) => item.id === suggestionId);
  if (!suggestion) return current;
  const next = {
    ...current,
    pendingSuggestions: current.pendingSuggestions.filter((item) => item.id !== suggestionId),
    approvedRules: [...current.approvedRules, suggestion]
  };
  await setJson(store, STORAGE_KEYS.ruleGapState(subredditName), next);
  return next;
}

export async function dismissSuggestion(store: KeyValueStore, subredditName: string, suggestionId: string): Promise<RuleGapState> {
  const current = await getRuleGapState(store, subredditName);
  const suggestion = current.pendingSuggestions.find((item) => item.id === suggestionId);
  if (!suggestion) return current;
  const next = {
    ...current,
    pendingSuggestions: current.pendingSuggestions.filter((item) => item.id !== suggestionId),
    dismissedSuggestions: [...current.dismissedSuggestions, suggestion]
  };
  await setJson(store, STORAGE_KEYS.ruleGapState(subredditName), next);
  return next;
}

export async function getDismissedTopics(store: KeyValueStore, subredditName: string): Promise<string[]> {
  const state = await getRuleGapState(store, subredditName);
  return state.dismissedSuggestions.map((suggestion) => suggestion.id);
}

export async function updateRuleGapLastRun(store: KeyValueStore, subredditName: string, lastRun: number): Promise<RuleGapState> {
  const current = await getRuleGapState(store, subredditName);
  const next = { ...current, lastRun };
  await setJson(store, STORAGE_KEYS.ruleGapState(subredditName), next);
  return next;
}
