import type { AIClient, KeyValueStore, WeeklyStats } from "../types.js";
import { analyzeWeek } from "../ai/digestAnalyzer.js";
import { getDigestState, updateDigestState } from "../storage/digestState.js";
import { getCurrentWeek, getWeeklyStats, rotateWeek } from "../storage/evaluationLog.js";
import { getMetrics } from "../storage/llmMetrics.js";
import { getCalibrationNotes, storeCalibrationNotes, dismissCalibrationNote, type CalibrationNote } from "../storage/ruleGapState.js";
import { buildDigestPost, buildConfidenceTrend, buildLeaderboard, buildLLMMetricsSection } from "../utils/formatters.js";

export interface WeeklyDigestResult {
  posted: boolean;
  reason?: string;
  postId?: string;
  body?: string;
  stats?: WeeklyStats;
}

function detectPoorlyCalibratedRules(
  ruleBreakdown: WeeklyStats["ruleBreakdown"]
): CalibrationNote[] {
  const notes: CalibrationNote[] = [];

  for (const [ruleName, ruleStats] of Object.entries(ruleBreakdown)) {
    const total = ruleStats.accepted + ruleStats.overridden;
    if (total < 5) continue;

    const overrideRate = ruleStats.overridden / total;
    if (overrideRate > 0.4) {
      notes.push({
        ruleName,
        overrideRate: Math.round(overrideRate * 100),
        totalDecisions: total,
        suggestion: overrideRate > 0.7
          ? `Consider clarifying the wording of "${ruleName}" — the AI misidentified violations ${Math.round(overrideRate * 100)}% of the time.`
          : `"${ruleName}" has a ${Math.round(overrideRate * 100)}% override rate. You may want to lower the flag sensitivity for this rule.`,
        detectedAt: Date.now(),
        dismissed: false
      });
    }
  }

  return notes;
}

async function checkAndAlertVolumeSpike(
  sendMessage: (to: string, subject: string, text: string) => Promise<void>,
  subredditName: string,
  stats: WeeklyStats,
  alertEnabled: boolean
): Promise<void> {
  if (!alertEnabled) return;

  const dailyVolumes = Object.entries(stats.dailyVolume);
  if (dailyVolumes.length === 0) return;

  const total = dailyVolumes.reduce((sum, [, v]) => sum + v, 0);
  const avgDaily = total / 7;
  const [spikeDay, spikeCount] = dailyVolumes.reduce(
    (max, [day, count]) => count > max[1] ? [day, count] : max,
    ["", 0]
  );

  const SPIKE_MULTIPLIER = 3;
  if (spikeCount > avgDaily * SPIKE_MULTIPLIER) {
    const message = [
      `ModMind detected an unusual activity spike on ${spikeDay}.`,
      ``,
      `- Posts evaluated on ${spikeDay}: ${spikeCount}`,
      `- Average daily posts this week: ${Math.round(avgDaily)}`,
      `- Spike ratio: ${Math.round(spikeCount / avgDaily)}x normal`,
      ``,
      `You may want to review the mod queue and check for coordinated activity.`,
      ``,
      `This alert was sent automatically by ModMind.`
    ].join("\n");

    try {
      await sendMessage(`/r/${subredditName}`, `ModMind Alert: Unusual activity spike detected in r/${subredditName}`, message);
      console.log("ModMind volume spike alert sent", { subredditName, spikeDay, spikeCount, avgDaily });
    } catch (error) {
      console.error("ModMind failed to send volume spike alert", { error });
    }
  }
}

export async function runWeeklyDigestJob(
  store: KeyValueStore,
  subredditName: string,
  postDigest: (title: string, body: string) => Promise<string>,
  aiClient?: AIClient,
  sendMessage?: (to: string, subject: string, text: string) => Promise<void>,
  alertEnabled: boolean = true,
  now = Date.now()
): Promise<WeeklyDigestResult> {
  const state = await getDigestState(store, subredditName);
  if (!state.enabled) return { posted: false, reason: "Digest disabled" };
  if (state.lastRun && now - state.lastRun < 6 * 24 * 60 * 60 * 1000) {
    return { posted: false, reason: "Digest already ran in the last 6 days" };
  }

  const week = await getCurrentWeek(store, subredditName);
  const stats = await getWeeklyStats(store, subredditName, week);
  const metrics = await getMetrics(store, subredditName, week);
  const summary = await analyzeWeek(stats, subredditName, aiClient);

  // Build base digest
  let body = buildDigestPost(stats, summary);

  // Add confidence trend
  body += "\n\n" + buildConfidenceTrend(stats.dailyVolume, stats.dailyAvgConfidence ?? {});

  // Add leaderboard if we have mod actions
  if (stats.modActionsByMod && Object.keys(stats.modActionsByMod).length > 0) {
    body += "\n\n" + buildLeaderboard(stats.modActionsByMod);
  }

  // Add LLM metrics section
  if (metrics.totalCalls > 0) {
    body += "\n\n" + buildLLMMetricsSection(metrics);
  }

  // Detect and display calibration notes
  const poorlyCalibrated = detectPoorlyCalibratedRules(stats.ruleBreakdown);
  const existingNotes = await getCalibrationNotes(store, subredditName);
  
  // Auto-dismiss notes if override rate dropped below 30%
  for (const note of existingNotes) {
    if (!note.dismissed) {
      const currentRule = stats.ruleBreakdown[note.ruleName];
      if (currentRule) {
        const currentRate = currentRule.overridden / (currentRule.accepted + currentRule.overridden);
        if (currentRate < 0.3) {
          await dismissCalibrationNote(store, subredditName, note.ruleName);
        }
      }
    }
  }

  // Store new calibration notes
  const allNotes = [
    ...existingNotes.filter(n => n.dismissed),
    ...poorlyCalibrated
  ];
  if (allNotes.length > 0) {
    await storeCalibrationNotes(store, subredditName, allNotes);
    
    const activeNotes = allNotes.filter(n => !n.dismissed);
    if (activeNotes.length > 0) {
      body += "\n\n## Rule Calibration Alerts\n\n";
      for (const note of activeNotes) {
        const icon = note.overrideRate > 70 ? "⚠️" : "ℹ️";
        body += `${icon} Rule: ${note.ruleName} (${note.overrideRate}% override rate, ${note.totalDecisions} decisions)\n`;
        body += `   ${note.suggestion}\n\n`;
      }
    }
  }

  const title = `ModMind Weekly Digest: ${summary.topInsight}`;
  const postId = await postDigest(title, body);

  // Send volume spike alert if configured
  if (sendMessage) {
    await checkAndAlertVolumeSpike(sendMessage, subredditName, stats, alertEnabled);
  }

  await rotateWeek(store, subredditName);
  await updateDigestState(store, subredditName, {
    lastRun: now,
    lastPostId: postId,
    summaries: [{ postId, title, createdAt: now }, ...state.summaries].slice(0, 3)
  });

  return { posted: true, postId, body, stats };
}
