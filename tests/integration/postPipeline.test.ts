import { beforeEach, describe, expect, it } from "vitest";
import { StaticAIClient } from "../../src/ai/client.js";
import { getWeeklyStats } from "../../src/storage/evaluationLog.js";
import { MemoryStore } from "../../src/storage/redisAdapter.js";
import { handlePostSubmit } from "../../src/triggers/onPostSubmit.js";
import { cleanPost, spanishPost, spamPost } from "../fixtures/samplePosts.js";
import { sampleRules } from "../fixtures/sampleRules.js";

describe("post pipeline", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("evaluates and flags a violating post", async () => {
    const result = await handlePostSubmit({
      store,
      content: spamPost,
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({ shouldFlag: true, confidence: 96, suggestedAction: "hold", violatedRules: ["No spam"], reason: "Spam", draftReply: "" })
      )
    });
    expect(result.action).toBe("hold");
    expect((await getWeeklyStats(store, "modmind")).evaluated).toBe(1);
  });

  it("deduplicates rapid identical submissions", async () => {
    const aiClient = new StaticAIClient(
      JSON.stringify({ shouldFlag: false, confidence: 5, suggestedAction: "approve", violatedRules: [], reason: "Clean", draftReply: "" })
    );
    await handlePostSubmit({ store, content: spamPost, rules: sampleRules, aiClient });
    const duplicate = await handlePostSubmit({ store, content: spamPost, rules: sampleRules, aiClient });
    expect(duplicate.duplicate).toBe(true);
    expect((await getWeeklyStats(store, "modmind")).evaluated).toBe(1);
  });

  it("does not hold high-confidence approve decisions", async () => {
    const result = await handlePostSubmit({
      store,
      content: cleanPost,
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({ shouldFlag: false, confidence: 100, suggestedAction: "approve", violatedRules: [], reason: "Clean", draftReply: "" })
      )
    });

    expect(result.result?.shouldFlag).toBe(false);
    expect(result.action).toBe("none");
  });

  it("detects Spanish and uses multilingual result", async () => {
    const result = await handlePostSubmit({
      store,
      content: spanishPost,
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({
          shouldFlag: true,
          confidence: 80,
          suggestedAction: "remove",
          violatedRules: ["No spam"],
          reason: "Spam",
          draftReply: "",
          bilingualReply: { english: "Removed.", native: "Eliminado." }
        })
      )
    });
    expect(result.result?.detectedLanguage?.detected).toBe("es");
    expect(result.result?.bilingualReply?.native).toBe("Eliminado.");
  });
});
