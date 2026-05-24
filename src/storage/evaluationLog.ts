import type { EvaluationRecord, EvaluationResult, KeyValueStore, ModActionRecord, OverrideRecord, WeeklyStats } from "../types.js";
import { STORAGE_KEYS, TTL } from "../utils/constants.js";
import { getJson, setJson } from "./redisAdapter.js";

export function emptyWeeklyStats(): WeeklyStats {
  return {
    evaluated: 0,
    postsEvaluated: 0,
    commentsEvaluated: 0,
    flagged: 0,
    autoHeld: 0,
    passed: 0,
    accepted: 0,
    overridden: 0,
    ruleBreakdown: {},
    overrideDetails: [],
    languageBreakdown: {},
    dailyVolume: {}
  };
}

export async function getCurrentWeek(store: KeyValueStore, subredditName: string): Promise<number> {
  const raw = await store.get(STORAGE_KEYS.currentWeek(subredditName));
  if (!raw) {
    await store.set(STORAGE_KEYS.currentWeek(subredditName), "1");
    return 1;
  }
  return Number(raw);
}

export async function rotateWeek(store: KeyValueStore, subredditName: string): Promise<number> {
  const next = (await getCurrentWeek(store, subredditName)) + 1;
  await store.set(STORAGE_KEYS.currentWeek(subredditName), String(next));
  return next;
}

export async function logEvaluation(
  store: KeyValueStore,
  subredditName: string,
  postId: string,
  result: EvaluationResult,
  contentKind: "post" | "comment" = "post",
  contentTitle = "",
  contentBody = "",
  timestamp = Date.now()
): Promise<void> {
  const week = await getCurrentWeek(store, subredditName);
  const key = STORAGE_KEYS.evaluation(subredditName, week, postId);
  const existing = await getJson<EvaluationRecord>(store, key);
  if (existing) return;

  const record: EvaluationRecord = { postId, subredditName, result, contentKind, contentTitle, contentBody, timestamp };
  await setJson(store, key, record, { ttlSeconds: TTL.evaluationRecordSeconds });

  const stats = await getWeeklyStats(store, subredditName, week);
  applyEvaluationToStats(stats, result, contentKind, timestamp);
  await setJson(store, STORAGE_KEYS.weeklyStats(subredditName, week), stats);
}

export async function logModAction(
  store: KeyValueStore,
  subredditName: string,
  postId: string,
  action: "accepted" | "overridden",
  modUsername: string,
  modAction: string = action,
  timestamp = Date.now()
): Promise<void> {
  const week = await getCurrentWeek(store, subredditName);
  const key = STORAGE_KEYS.evaluation(subredditName, week, postId);
  const record = await getJson<EvaluationRecord>(store, key);
  if (!record || record.modAction) return;

  const modRecord: ModActionRecord = { postId, action, modUsername, modAction, timestamp };
  await setJson(store, key, { ...record, modAction: modRecord }, { ttlSeconds: TTL.evaluationRecordSeconds });

  const stats = await getWeeklyStats(store, subredditName, week);
  applyModActionToStats(stats, record.result, modRecord);
  await setJson(store, STORAGE_KEYS.weeklyStats(subredditName, week), stats);

  if (modRecord.action === "overridden") {
    await appendOverrideIndex(store, subredditName, record, modRecord);
  }
}

export async function getWeeklyStats(store: KeyValueStore, subredditName: string, week?: number): Promise<WeeklyStats> {
  const targetWeek = week ?? (await getCurrentWeek(store, subredditName));
  return (await getJson<WeeklyStats>(store, STORAGE_KEYS.weeklyStats(subredditName, targetWeek))) ?? emptyWeeklyStats();
}

export async function getOverridesForPastDays(store: KeyValueStore, subredditName: string, days: number): Promise<OverrideRecord[]> {
  const indexed = await getJson<OverrideRecord[]>(store, `eval:${subredditName}:overrides`);
  if (indexed) {
    const minTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;
    return indexed.filter((record) => record.timestamp >= minTimestamp);
  }

  if (!store.keys) return [];
  const minTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;
  const keys = await store.keys(`eval:${subredditName}:*:*`);
  const records = await Promise.all(keys.map((key) => getJson<EvaluationRecord>(store, key)));
  return records
    .filter((record): record is EvaluationRecord => Boolean(record?.modAction && record.modAction.action === "overridden" && record.timestamp >= minTimestamp))
    .map((record) => ({
      postId: record.postId,
      title: record.contentTitle ?? "",
      body: (record.contentBody ?? "").slice(0, 500),
      aiSuggestion: record.result.suggestedAction,
      modAction: record.modAction?.modAction ?? "overridden",
      rule: record.result.violatedRules[0] ?? "unknown",
      modUsername: record.modAction?.modUsername,
      timestamp: record.modAction?.timestamp ?? record.timestamp
    }));
}

async function appendOverrideIndex(
  store: KeyValueStore,
  subredditName: string,
  record: EvaluationRecord,
  modRecord: ModActionRecord
): Promise<void> {
  const key = `eval:${subredditName}:overrides`;
  const current = (await getJson<OverrideRecord[]>(store, key)) ?? [];
  const next = [
    ...current,
    {
      postId: record.postId,
      title: record.contentTitle ?? "",
      body: (record.contentBody ?? "").slice(0, 500),
      aiSuggestion: record.result.suggestedAction,
      modAction: modRecord.modAction ?? "overridden",
      rule: record.result.violatedRules[0] ?? "unknown",
      modUsername: modRecord.modUsername,
      timestamp: modRecord.timestamp
    }
  ].slice(-500);
  await setJson(store, key, next);
}

function applyEvaluationToStats(stats: WeeklyStats, result: EvaluationResult, contentKind: "post" | "comment", timestamp: number): void {
  stats.evaluated += 1;
  if (contentKind === "post") stats.postsEvaluated += 1;
  if (contentKind === "comment") stats.commentsEvaluated += 1;
  if (result.suggestedAction === "hold") stats.autoHeld += 1;
  else if (result.shouldFlag) stats.flagged += 1;
  else stats.passed += 1;

  for (const rule of result.violatedRules) {
    stats.ruleBreakdown[rule] ??= { violations: 0, accepted: 0, overridden: 0 };
    stats.ruleBreakdown[rule].violations += 1;
  }

  const language = result.detectedLanguage?.detected ?? "en";
  stats.languageBreakdown[language] ??= { evaluated: 0, flagged: 0, overridden: 0 };
  stats.languageBreakdown[language].evaluated += 1;
  if (result.shouldFlag) stats.languageBreakdown[language].flagged += 1;

  const day = new Date(timestamp).toISOString().slice(0, 10);
  stats.dailyVolume[day] = (stats.dailyVolume[day] ?? 0) + 1;
}

function applyModActionToStats(stats: WeeklyStats, result: EvaluationResult, modRecord: ModActionRecord): void {
  if (modRecord.action === "accepted") stats.accepted += 1;
  if (modRecord.action === "overridden") stats.overridden += 1;

  for (const rule of result.violatedRules.length > 0 ? result.violatedRules : ["unknown"]) {
    stats.ruleBreakdown[rule] ??= { violations: 0, accepted: 0, overridden: 0 };
    if (modRecord.action === "accepted") stats.ruleBreakdown[rule].accepted += 1;
    if (modRecord.action === "overridden") stats.ruleBreakdown[rule].overridden += 1;
  }

  if (modRecord.action === "overridden") {
    const language = result.detectedLanguage?.detected ?? "en";
    stats.languageBreakdown[language] ??= { evaluated: 0, flagged: 0, overridden: 0 };
    stats.languageBreakdown[language].overridden += 1;
    stats.overrideDetails.push({
      postId: modRecord.postId,
      aiSuggestion: result.suggestedAction,
      modAction: modRecord.modAction ?? "overridden",
      rule: result.violatedRules[0] ?? "unknown",
      modUsername: modRecord.modUsername,
      timestamp: modRecord.timestamp
    });
  }
}

export async function getEvaluationRecord(
  store: KeyValueStore,
  subredditName: string,
  postId: string,
  week?: number
): Promise<EvaluationRecord | undefined> {
  const w = week ?? (await getCurrentWeek(store, subredditName));
  const key = STORAGE_KEYS.evaluation(subredditName, w, postId);
  return getJson<EvaluationRecord>(store, key);
}
