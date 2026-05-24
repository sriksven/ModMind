import { describe, expect, it } from "vitest";
import { StaticAIClient } from "../../src/ai/client.js";
import { evaluateContent } from "../../src/ai/evaluator.js";
import type { UserHistory } from "../../src/types.js";
import { cleanPost, spanishPost, spamPost } from "../fixtures/samplePosts.js";
import { sampleRules } from "../fixtures/sampleRules.js";

describe("evaluator", () => {
  it("returns a high-confidence violation from valid AI JSON", async () => {
    const result = await evaluateContent({
      content: spamPost,
      rules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({
          shouldFlag: true,
          confidence: 88,
          suggestedAction: "remove",
          violatedRules: ["No spam"],
          reason: "Promotional spam.",
          draftReply: "Removed for spam."
        })
      )
    });

    expect(result.shouldFlag).toBe(true);
    expect(result.confidence).toBe(88);
    expect(result.suggestedAction).toBe("remove");
  });

  it("returns clean fallback when AI is missing or malformed", async () => {
    const noClient = await evaluateContent({ content: cleanPost, rules: sampleRules });
    expect(noClient.shouldFlag).toBe(false);

    const malformed = await evaluateContent({ content: cleanPost, rules: sampleRules, aiClient: new StaticAIClient("not json") });
    expect(malformed.shouldFlag).toBe(false);
  });

  it("boosts confidence for repeat offenders", async () => {
    const history: UserHistory = { username: "x", flagCount: 10, actions: [] };
    const result = await evaluateContent({
      content: spamPost,
      rules: sampleRules,
      userHistory: history,
      aiClient: new StaticAIClient(
        JSON.stringify({ shouldFlag: false, confidence: 70, suggestedAction: "remove", violatedRules: ["No spam"], reason: "Spam", draftReply: "" })
      )
    });
    expect(result.confidence).toBe(82);
    expect(result.shouldFlag).toBe(true);
  });

  it("does not flag low-confidence hold suggestions below threshold", async () => {
    const result = await evaluateContent({
      content: cleanPost,
      rules: sampleRules,
      flagThreshold: 85,
      aiClient: new StaticAIClient(
        JSON.stringify({
          shouldFlag: false,
          confidence: 40,
          suggestedAction: "hold",
          violatedRules: [],
          reason: "Uncertain.",
          draftReply: ""
        })
      )
    });

    expect(result.shouldFlag).toBe(false);
    expect(result.suggestedAction).toBe("hold");
  });

  it("uses multilingual output for supported non-English posts", async () => {
    const result = await evaluateContent({
      content: spanishPost,
      rules: sampleRules,
      translatedRules: sampleRules,
      aiClient: new StaticAIClient(
        JSON.stringify({
          shouldFlag: true,
          confidence: 80,
          suggestedAction: "remove",
          violatedRules: ["No spam"],
          reason: "Promotional.",
          draftReply: "Removed.",
          bilingualReply: { english: "Removed.", native: "Eliminado." }
        })
      )
    });
    expect(result.detectedLanguage?.detected).toBe("es");
    expect(result.bilingualReply?.native).toBe("Eliminado.");
  });
});
