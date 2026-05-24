import type { DigestSummary, WeeklyStats } from "../types.js";
import { buildDigestPost, calculateAccuracy } from "../utils/formatters.js";

export function renderDigestPost(stats: WeeklyStats, summary: DigestSummary): string {
  const health = calculateAccuracy(stats) >= 85 ? "green" : calculateAccuracy(stats) >= 70 ? "yellow" : "red";
  return [`Health: ${health}`, "", buildDigestPost(stats, summary)].join("\n");
}
