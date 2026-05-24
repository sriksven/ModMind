import { beforeEach, describe, expect, it } from "vitest";
import { StaticAIClient } from "../../src/ai/client.js";
import { logAction } from "../../src/storage/modHistory.js";
import { MemoryStore } from "../../src/storage/redisAdapter.js";
import { handleCommentSubmit } from "../../src/triggers/onCommentSubmit.js";
import type { ContentItem } from "../../src/types.js";
import { sampleRules } from "../fixtures/sampleRules.js";

const comment: ContentItem = {
  id: "c1",
  kind: "comment",
  subredditName: "modmind",
  authorName: "commenter",
  body: "buy my spam product",
  createdAt: Date.now(),
  authorAccountAgeDays: 5
};

describe("comment pipeline", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("evaluates comments when enabled", async () => {
    const result = await handleCommentSubmit({
      store,
      content: comment,
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({ shouldFlag: true, confidence: 80, suggestedAction: "remove", violatedRules: ["No spam"], reason: "Spam", draftReply: "" })
      )
    });
    expect(result.evaluated).toBe(true);
  });

  it("skips disabled comments, removed parents, and old clean accounts", async () => {
    await expect(handleCommentSubmit({ store, content: comment, rules: sampleRules, settings: { evaluateComments: false } })).resolves.toMatchObject({
      evaluated: false
    });
    await expect(handleCommentSubmit({ store, content: { ...comment, parentRemoved: true }, rules: sampleRules })).resolves.toMatchObject({ evaluated: false });
    await expect(handleCommentSubmit({ store, content: { ...comment, id: "c2", authorAccountAgeDays: 40 }, rules: sampleRules })).resolves.toMatchObject({
      evaluated: false
    });
  });

  it("skips ModMind-generated suggestion comments", async () => {
    await expect(
      handleCommentSubmit({
        store,
        content: {
          ...comment,
          id: "c_modmind",
          authorName: "modmind-f4lcon46",
          body: "ModMind moderation suggestion\n\nModMind suggestion: REMOVE"
        },
        rules: sampleRules
      })
    ).resolves.toMatchObject({ evaluated: false, action: "none" });
  });

  it("evaluates old accounts with prior flags", async () => {
    await logAction(store, "commenter", "old", "remove");
    const result = await handleCommentSubmit({
      store,
      content: { ...comment, id: "c3", authorAccountAgeDays: 40 },
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({ shouldFlag: true, confidence: 80, suggestedAction: "remove", violatedRules: ["No spam"], reason: "Spam", draftReply: "" })
      )
    });
    expect(result.evaluated).toBe(true);
  });
});
