import type { AIClient, KeyValueStore, WeeklyStats } from "../types.js";
import { analyzeWeek } from "../ai/digestAnalyzer.js";
import { getDigestState, updateDigestState } from "../storage/digestState.js";
import { getCurrentWeek, getWeeklyStats, rotateWeek } from "../storage/evaluationLog.js";
import { buildDigestPost } from "../utils/formatters.js";

export interface WeeklyDigestResult {
  posted: boolean;
  reason?: string;
  postId?: string;
  body?: string;
  stats?: WeeklyStats;
}

export async function runWeeklyDigestJob(
  store: KeyValueStore,
  subredditName: string,
  postDigest: (title: string, body: string) => Promise<string>,
  aiClient?: AIClient,
  now = Date.now()
): Promise<WeeklyDigestResult> {
  const state = await getDigestState(store, subredditName);
  if (!state.enabled) return { posted: false, reason: "Digest disabled" };
  if (state.lastRun && now - state.lastRun < 6 * 24 * 60 * 60 * 1000) {
    return { posted: false, reason: "Digest already ran in the last 6 days" };
  }

  const week = await getCurrentWeek(store, subredditName);
  const stats = await getWeeklyStats(store, subredditName, week);
  const summary = await analyzeWeek(stats, subredditName, aiClient);
  const body = buildDigestPost(stats, summary);
  const title = `ModMind Weekly Digest: ${summary.topInsight}`;
  const postId = await postDigest(title, body);

  await rotateWeek(store, subredditName);
  await updateDigestState(store, subredditName, {
    lastRun: now,
    lastPostId: postId,
    summaries: [{ postId, title, createdAt: now }, ...state.summaries].slice(0, 3)
  });

  return { posted: true, postId, body, stats };
}
