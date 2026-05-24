import type { KeyValueStore } from "../types.js";
import { refreshRules, type RuleFetcher } from "../storage/subredditRules.js";

export async function runRuleSyncJob(store: KeyValueStore, subredditName: string, fetchRules: RuleFetcher): Promise<number> {
  const rules = await refreshRules(store, subredditName, fetchRules);
  return rules.length;
}
