import { describe, expect, it } from "vitest";
import {
  buildBilingualReplyPrompt,
  buildEvaluationPrompt,
  buildMultilingualEvaluationPrompt,
  buildTranslationPrompt
} from "../../../src/utils/prompts.js";
import { spanishPost, spamPost } from "../../fixtures/samplePosts.js";
import { sampleRules } from "../../fixtures/sampleRules.js";

describe("prompts", () => {
  it("includes rules, content, JSON-only instruction, and optional history", () => {
    const prompt = buildEvaluationPrompt(spamPost, sampleRules, { username: "u", flagCount: 5, actions: [] });
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("No spam");
    expect(prompt).toContain(spamPost.title);
    expect(prompt).toContain("prior flags: 5");
  });

  it("builds multilingual and translation prompts", () => {
    expect(buildMultilingualEvaluationPrompt(spanishPost, sampleRules, { detected: "es", confidence: 90, script: "latin", isEnglish: false })).toContain("Spanish");
    expect(buildTranslationPrompt(sampleRules, "es")).toContain("Spanish");
    expect(buildBilingualReplyPrompt(sampleRules[0], "title", "es")).toContain("english");
  });
});
