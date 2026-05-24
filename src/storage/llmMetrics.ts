import type { KeyValueStore } from "../types.js";

export interface LLMWeeklyMetrics {
  // Volume
  totalCalls: number;
  totalTokensEstimated: number;
  estimatedCostUsd: number;

  // Reliability
  failedCalls: number;
  fallbacksTriggered: number;
  pipelineSuccess: number;
  pipelinePartial: number;
  pipelineFailed: number;

  // Quality
  confidenceSamples: number[];
  avgConfidence: number;
  confidenceCalibrationError: number;
  hallucinatedRulesCount: number;
  toxicRepliesRewritten: number;
  lowFaithfulnessCount: number;

  // Safety
  promptInjectionBlocked: number;
  rateLimitHits: number;

  // Performance
  latencySamples: number[];
  avgLatencyMs: number;
  p95LatencyMs: number;

  // Context quality
  avgContextualPrecision: number;
  avgRuleRelevanceScore: number;
  avgFaithfulnessScore: number;

  // Language
  languageBreakdown: Record<string, number>;

  // Mod feedback
  explanationThumbsUp: number;
  explanationThumbsDown: number;

  // Model metadata
  modelUsed: string;
  week: number;
  subredditName: string;
}

function getCurrentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function getMetricsKey(subredditName: string, week: number): string {
  return `llm:${subredditName}:metrics:${week}`;
}

function zeroMetrics(subredditName: string, week: number, modelUsed: string = "gpt-4.1-mini"): LLMWeeklyMetrics {
  return {
    totalCalls: 0,
    totalTokensEstimated: 0,
    estimatedCostUsd: 0,
    failedCalls: 0,
    fallbacksTriggered: 0,
    pipelineSuccess: 0,
    pipelinePartial: 0,
    pipelineFailed: 0,
    confidenceSamples: [],
    avgConfidence: 0,
    confidenceCalibrationError: 0,
    hallucinatedRulesCount: 0,
    toxicRepliesRewritten: 0,
    lowFaithfulnessCount: 0,
    promptInjectionBlocked: 0,
    rateLimitHits: 0,
    latencySamples: [],
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    avgContextualPrecision: 0,
    avgRuleRelevanceScore: 0,
    avgFaithfulnessScore: 0,
    languageBreakdown: {},
    explanationThumbsUp: 0,
    explanationThumbsDown: 0,
    modelUsed,
    week,
    subredditName
  };
}

function calculateP95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)];
}

function calculateAvg(samples: number[]): number {
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

export async function getMetrics(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  modelUsed: string = "gpt-4.1-mini"
): Promise<LLMWeeklyMetrics> {
  const key = getMetricsKey(subredditName, week);
  try {
    const stored = await store.get(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors, return zeroed
  }
  return zeroMetrics(subredditName, week, modelUsed);
}

export async function incrementMetric(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  field: keyof LLMWeeklyMetrics,
  amount: number
): Promise<void> {
  const metrics = await getMetrics(store, subredditName, week);
  const current = (metrics[field] as any) ?? 0;
  if (typeof current === "number") {
    (metrics[field] as any) = current + amount;
  }
  await store.set(getMetricsKey(subredditName, week), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function recordLatency(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  latencyMs: number
): Promise<void> {
  const metrics = await getMetrics(store, subredditName, week);
  metrics.latencySamples.push(latencyMs);
  metrics.avgLatencyMs = calculateAvg(metrics.latencySamples);
  metrics.p95LatencyMs = calculateP95(metrics.latencySamples);
  await store.set(getMetricsKey(subredditName, week), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function recordConfidence(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  confidence: number
): Promise<void> {
  const metrics = await getMetrics(store, subredditName, week);
  metrics.confidenceSamples.push(confidence);
  metrics.avgConfidence = calculateAvg(metrics.confidenceSamples);
  await store.set(getMetricsKey(subredditName, week), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function recordCalibration(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  confidence: number,
  modAccepted: boolean
): Promise<void> {
  const metrics = await getMetrics(store, subredditName, week);
  const calibrationError = modAccepted ? Math.abs(confidence - 100) : confidence;
  const currentError = metrics.confidenceCalibrationError ?? 0;
  const totalSamples = (metrics.confidenceSamples?.length ?? 0) + 1;
  metrics.confidenceCalibrationError = Math.round(
    (currentError * (totalSamples - 1) + calibrationError) / totalSamples
  );
  await store.set(getMetricsKey(subredditName, week), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function recordLanguage(
  store: KeyValueStore,
  subredditName: string,
  week: number,
  languageCode: string
): Promise<void> {
  const metrics = await getMetrics(store, subredditName, week);
  metrics.languageBreakdown[languageCode] = (metrics.languageBreakdown[languageCode] ?? 0) + 1;
  await store.set(getMetricsKey(subredditName, week), JSON.stringify(metrics), { ttlSeconds: 120 * 24 * 60 * 60 });
}

export async function getMetricsHistory(
  store: KeyValueStore,
  subredditName: string,
  weeks: number
): Promise<LLMWeeklyMetrics[]> {
  const current = getCurrentWeek();
  const history: LLMWeeklyMetrics[] = [];
  for (let i = 0; i < weeks; i++) {
    const week = current - i;
    try {
      const metrics = await getMetrics(store, subredditName, week);
      history.push(metrics);
    } catch {
      // Ignore errors for past weeks that may not exist
    }
  }
  return history;
}
