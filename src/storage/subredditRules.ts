import type { AIClient, KeyValueStore, SubredditRule } from "../types.js";
import { STORAGE_KEYS, TTL } from "../utils/constants.js";
import { parseJsonSafe } from "../utils/formatters.js";
import { buildTranslationPrompt } from "../utils/prompts.js";
import { getJson, setJson } from "./redisAdapter.js";

interface CachedRules {
  rules: SubredditRule[];
  fetchedAt: number;
}

export type RuleFetcher = (subredditName: string) => Promise<SubredditRule[]>;

export async function getRules(store: KeyValueStore, subredditName: string, fetchRules: RuleFetcher): Promise<SubredditRule[]> {
  const key = STORAGE_KEYS.subredditRules(subredditName);
  const cached = await getJson<CachedRules>(store, key);
  if (cached && Date.now() - cached.fetchedAt < TTL.subredditRulesSeconds * 1000) return cached.rules;

  try {
    return await refreshRules(store, subredditName, fetchRules);
  } catch {
    return cached?.rules ?? [];
  }
}

export async function refreshRules(store: KeyValueStore, subredditName: string, fetchRules: RuleFetcher): Promise<SubredditRule[]> {
  const rules = await fetchRules(subredditName);
  await setJson(store, STORAGE_KEYS.subredditRules(subredditName), { rules, fetchedAt: Date.now() }, { ttlSeconds: TTL.subredditRulesSeconds });
  return rules;
}

export async function cacheTranslatedRules(
  store: KeyValueStore,
  subredditName: string,
  languageCode: string,
  rules: SubredditRule[]
): Promise<void> {
  await setJson(store, STORAGE_KEYS.translatedRules(subredditName, languageCode), { rules, fetchedAt: Date.now() }, { ttlSeconds: TTL.translatedRulesSeconds });
}

export async function getTranslatedRules(
  store: KeyValueStore,
  subredditName: string,
  languageCode: string,
  rules: SubredditRule[],
  aiClient?: AIClient
): Promise<SubredditRule[]> {
  if (languageCode === "en") return rules;
  const key = STORAGE_KEYS.translatedRules(subredditName, languageCode);
  const cached = await getJson<CachedRules>(store, key);
  if (cached) return cached.rules;
  if (!aiClient) return rules;

  try {
    const raw = await aiClient.generate(buildTranslationPrompt(rules, languageCode), { maxTokens: 1000, temperature: 0 });
    const translated = parseJsonSafe<SubredditRule[]>(raw);
    if (!Array.isArray(translated)) return rules;
    await cacheTranslatedRules(store, subredditName, languageCode, translated);
    return translated;
  } catch {
    return rules;
  }
}
