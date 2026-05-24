import { beforeEach, describe, expect, it } from "vitest";
import { getCurrentWeek, getWeeklyStats, logEvaluation, logModAction, rotateWeek } from "../../../src/storage/evaluationLog.js";
import { MemoryStore } from "../../../src/storage/redisAdapter.js";
import { cleanEvaluation, spamEvaluation } from "../../fixtures/sampleEvaluations.js";

describe("evaluationLog", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("stores evaluations and increments weekly stats idempotently", async () => {
    await logEvaluation(store, "modmind", "p1", spamEvaluation, "post");
    await logEvaluation(store, "modmind", "p1", spamEvaluation, "post");
    const stats = await getWeeklyStats(store, "modmind");
    expect(stats.evaluated).toBe(1);
    expect(stats.flagged).toBe(1);
    expect(stats.ruleBreakdown["No spam"].violations).toBe(1);
  });

  it("tracks accepted and overridden actions", async () => {
    await logEvaluation(store, "modmind", "p1", spamEvaluation, "post");
    await logModAction(store, "modmind", "p1", "overridden", "mod", "approve");
    const stats = await getWeeklyStats(store, "modmind");
    expect(stats.overridden).toBe(1);
    expect(stats.overrideDetails).toHaveLength(1);
    expect(stats.languageBreakdown.en.overridden).toBe(1);
  });

  it("keeps previous week stats after rotation", async () => {
    await logEvaluation(store, "modmind", "p1", cleanEvaluation, "comment");
    const week = await getCurrentWeek(store, "modmind");
    await rotateWeek(store, "modmind");
    expect((await getWeeklyStats(store, "modmind", week)).commentsEvaluated).toBe(1);
    expect(await getCurrentWeek(store, "modmind")).toBe(2);
  });
});
