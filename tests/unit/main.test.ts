import { describe, expect, it } from "vitest";
import { handleOverrideFlagPress } from "../../src/main.js";
import { getOverridesForPastDays, getWeeklyStats, logEvaluation } from "../../src/storage/evaluationLog.js";
import { MemoryStore } from "../../src/storage/redisAdapter.js";
import type { EvaluationResult } from "../../src/types.js";

describe("main runtime menu handlers", () => {
  it("approves and logs a moderator override for a flagged post", async () => {
    const store = new MemoryStore();
    const postId = "t3_post1";
    const approved: string[] = [];
    const toasts: string[] = [];
    const result: EvaluationResult = {
      shouldFlag: true,
      confidence: 96,
      suggestedAction: "hold",
      violatedRules: ["No spam"],
      reason: "Spam.",
      draftReply: "",
      createdAt: Date.now()
    };

    await logEvaluation(store, "modmind", postId, result, "post", "Title", "Body");
    await handleOverrideFlagPress(
      { targetId: "post1" },
      {
        subredditName: "modmind",
        user: { username: "mod_a" },
        redis: store,
        reddit: {
          approve: async (id: string) => {
            approved.push(id);
          }
        },
        ui: {
          showToast: (message: string) => {
            toasts.push(message);
          }
        }
      }
    );

    const overrideMarker = JSON.parse((await store.get(`override:${postId}`)) ?? "{}") as { action?: string; modUsername?: string };
    const stats = await getWeeklyStats(store, "modmind");
    const overrides = await getOverridesForPastDays(store, "modmind", 30);

    expect(approved).toEqual([postId]);
    expect(toasts).toEqual(["ModMind flag overridden. Post approved."]);
    expect(overrideMarker).toMatchObject({ action: "approved", modUsername: "mod_a" });
    expect(stats.overridden).toBe(1);
    expect(stats.overrideDetails[0]).toMatchObject({ postId, modAction: "approved", modUsername: "mod_a" });
    expect(overrides[0]).toMatchObject({ postId, modAction: "approved", modUsername: "mod_a" });
  });
});
