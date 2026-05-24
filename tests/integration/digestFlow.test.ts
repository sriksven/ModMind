import { beforeEach, describe, expect, it, vi } from "vitest";
import { logEvaluation, logModAction } from "../../src/storage/evaluationLog.js";
import { updateDigestState } from "../../src/storage/digestState.js";
import { MemoryStore } from "../../src/storage/redisAdapter.js";
import { runWeeklyDigestJob } from "../../src/jobs/weeklyDigest.js";
import { spamEvaluation } from "../fixtures/sampleEvaluations.js";

describe("digest flow", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("posts digest and rotates week", async () => {
    for (let index = 0; index < 7; index += 1) {
      await logEvaluation(store, "modmind", `p${index}`, spamEvaluation, "post");
      await logModAction(store, "modmind", `p${index}`, "accepted", "mod");
    }
    const postDigest = vi.fn(async () => "digest_1");
    const result = await runWeeklyDigestJob(store, "modmind", postDigest);
    expect(result.posted).toBe(true);
    expect(result.body).toContain("Weekly ModMind Digest");
  });

  it("aborts when disabled or recently run", async () => {
    await updateDigestState(store, "modmind", { enabled: false });
    await expect(runWeeklyDigestJob(store, "modmind", async () => "x")).resolves.toMatchObject({ posted: false });

    await updateDigestState(store, "other", { lastRun: Date.now() });
    await expect(runWeeklyDigestJob(store, "other", async () => "x")).resolves.toMatchObject({ posted: false });
  });
});
