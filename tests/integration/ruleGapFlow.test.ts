import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRuleGapDetectorJob } from "../../src/jobs/ruleGapDetector.js";
import { logEvaluation, logModAction } from "../../src/storage/evaluationLog.js";
import { MemoryStore } from "../../src/storage/redisAdapter.js";
import { spamEvaluation } from "../fixtures/sampleEvaluations.js";
import { sampleRules } from "../fixtures/sampleRules.js";

describe("rule gap flow", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("posts not-enough-data note", async () => {
    const post = vi.fn(async () => "gap_1");
    const result = await runRuleGapDetectorJob(store, "modmind", sampleRules, post);
    expect(result.reason).toBe("Not enough data");
    expect(post).toHaveBeenCalled();
  });

  it("posts suggestions for clustered overrides", async () => {
    for (let index = 0; index < 20; index += 1) {
      await logEvaluation(store, "modmind", `p${index}`, spamEvaluation, "post", `Marketplace ${index}`, "body");
      await logModAction(store, "modmind", `p${index}`, "overridden", index < 10 ? "mod_a" : "mod_b", "approve");
    }
    const result = await runRuleGapDetectorJob(store, "modmind", sampleRules, async () => "gap_2");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
