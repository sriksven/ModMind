import type { DigestState, KeyValueStore } from "../types.js";
import { STORAGE_KEYS } from "../utils/constants.js";
import { getJson, setJson } from "./redisAdapter.js";

export async function getDigestState(store: KeyValueStore, subredditName: string): Promise<DigestState> {
  return (
    (await getJson<DigestState>(store, STORAGE_KEYS.digestState(subredditName))) ?? {
      enabled: true,
      summaries: []
    }
  );
}

export async function updateDigestState(store: KeyValueStore, subredditName: string, state: Partial<DigestState>): Promise<DigestState> {
  const current = await getDigestState(store, subredditName);
  const next = { ...current, ...state };
  await setJson(store, STORAGE_KEYS.digestState(subredditName), next);
  return next;
}

export async function isDigestEnabled(store: KeyValueStore, subredditName: string): Promise<boolean> {
  return (await getDigestState(store, subredditName)).enabled;
}
