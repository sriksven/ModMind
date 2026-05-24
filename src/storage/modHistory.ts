import type { KeyValueStore, ModHistoryAction, SuggestedAction, UserHistory } from "../types.js";
import { STORAGE_KEYS } from "../utils/constants.js";
import { getJson, setJson } from "./redisAdapter.js";

const MAX_ACTIONS = 20;

export async function getUserHistory(store: KeyValueStore, username: string): Promise<UserHistory> {
  return (
    (await getJson<UserHistory>(store, STORAGE_KEYS.userHistory(username))) ?? {
      username,
      flagCount: 0,
      actions: []
    }
  );
}

export async function logAction(
  store: KeyValueStore,
  username: string,
  postId: string,
  action: string,
  rule?: string,
  timestamp = Date.now()
): Promise<UserHistory> {
  const history = await getUserHistory(store, username);
  const next: UserHistory = {
    ...history,
    flagCount: history.flagCount + 1,
    lastSeen: timestamp,
    actions: capActions([...history.actions, { postId, action, rule, timestamp }])
  };
  await setJson(store, STORAGE_KEYS.userHistory(username), next);
  return next;
}

export async function logOverride(
  store: KeyValueStore,
  username: string,
  postId: string,
  modAction: string,
  aiSuggestion: SuggestedAction,
  rule?: string,
  timestamp = Date.now()
): Promise<UserHistory> {
  const history = await getUserHistory(store, username);
  const next: UserHistory = {
    ...history,
    lastSeen: timestamp,
    actions: capActions([...history.actions, { postId, action: modAction, rule, timestamp, aiSuggestion }])
  };
  await setJson(store, STORAGE_KEYS.userHistory(username), next);
  return next;
}

function capActions(actions: ModHistoryAction[]): ModHistoryAction[] {
  return actions.slice(Math.max(0, actions.length - MAX_ACTIONS));
}
