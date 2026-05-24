import type { KeyValueStore } from "../types.js";

export interface ABTestMetrics {
  groupA: { evaluated: number; flagged: number; accepted: number; overridden: number; threshold: number };
  groupB: { evaluated: number; flagged: number; accepted: number; overridden: number; threshold: number };
  startedAt: number;
  totalEvaluations: number;
}

export function getABGroup(postId: string): "A" | "B" {
  const hash = postId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? "A" : "B";
}

function getABTestKey(subredditName: string): string {
  return `abtest:${subredditName}:state`;
}

function zeroABTestMetrics(thresholdA: number): ABTestMetrics {
  return {
    groupA: { evaluated: 0, flagged: 0, accepted: 0, overridden: 0, threshold: thresholdA },
    groupB: { evaluated: 0, flagged: 0, accepted: 0, overridden: 0, threshold: Math.max(50, thresholdA - 10) },
    startedAt: Date.now(),
    totalEvaluations: 0
  };
}

export async function getABTestState(store: KeyValueStore, subredditName: string, defaultThresholdA: number = 75): Promise<ABTestMetrics> {
  try {
    const stored = await store.get(getABTestKey(subredditName));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return zeroABTestMetrics(defaultThresholdA);
}

export async function recordABEvaluation(
  store: KeyValueStore,
  subredditName: string,
  postId: string,
  wasFlagged: boolean,
  wasAccepted: boolean
): Promise<void> {
  const metrics = await getABTestState(store, subredditName);
  const group = getABGroup(postId);
  const groupMetrics = group === "A" ? metrics.groupA : metrics.groupB;

  groupMetrics.evaluated++;
  if (wasFlagged) {
    groupMetrics.flagged++;
    if (wasAccepted) {
      groupMetrics.accepted++;
    } else {
      groupMetrics.overridden++;
    }
  }
  metrics.totalEvaluations++;

  await store.set(getABTestKey(subredditName), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function resetABTest(store: KeyValueStore, subredditName: string): Promise<void> {
  if (store.del) {
    await store.del(getABTestKey(subredditName));
  } else {
    // Fallback: set to empty string with short TTL
    await store.set(getABTestKey(subredditName), "", { ttlSeconds: 1 });
  }
}

export function calculatePrecision(group: ABTestMetrics["groupA"]): number {
  if (group.flagged === 0) return 100;
  return Math.round((group.accepted / group.flagged) * 100);
}

export function calculateFalsePositiveRate(group: ABTestMetrics["groupA"]): number {
  if (group.flagged === 0) return 0;
  return Math.round((group.overridden / group.flagged) * 100);
}

export function buildABTestReport(metrics: ABTestMetrics): string {
  const precisionA = calculatePrecision(metrics.groupA);
  const precisionB = calculatePrecision(metrics.groupB);
  const fprA = calculateFalsePositiveRate(metrics.groupA);
  const fprB = calculateFalsePositiveRate(metrics.groupB);
  const recommendation = precisionA >= precisionB ? "Group A" : "Group B";

  return [
    `## A/B Threshold Test Results (${metrics.totalEvaluations} evaluations)`,
    ``,
    `Group A (threshold: ${metrics.groupA.threshold}): ${metrics.groupA.evaluated} evaluations, ${metrics.groupA.flagged} flagged, ${metrics.groupA.accepted} accepted, ${metrics.groupA.overridden} overridden`,
    `  Precision: ${precisionA}% | False positive rate: ${fprA}%`,
    ``,
    `Group B (threshold: ${metrics.groupB.threshold}): ${metrics.groupB.evaluated} evaluations, ${metrics.groupB.flagged} flagged, ${metrics.groupB.accepted} accepted, ${metrics.groupB.overridden} overridden`,
    `  Precision: ${precisionB}% | False positive rate: ${fprB}%`,
    ``,
    `Recommendation: ${recommendation} (threshold ${recommendation === "Group A" ? metrics.groupA.threshold : metrics.groupB.threshold}) had better precision. Consider ${recommendation === "Group A" ? "keeping current threshold" : "lowering the threshold by 10"}.`
  ].join("\n");
}
