import { describe, expect, it } from "vitest";
import { StaticAIClient } from "../../src/ai/client.js";
import { analyzeGaps, dedupeRuleGaps } from "../../src/ai/ruleGapAnalyzer.js";
import { sampleOverrides } from "../fixtures/sampleOverrides.js";
import { sampleRules } from "../fixtures/sampleRules.js";

describe("ruleGapAnalyzer", () => {
  it("returns heuristic suggestions for clustered overrides", async () => {
    const suggestions = await analyzeGaps(sampleOverrides, sampleRules, []);
    expect(suggestions[0]).toMatchObject({ type: "vague_rule", affectedRuleId: "No spam" });
  });

  it("filters low-confidence AI suggestions", async () => {
    const suggestions = await analyzeGaps(
      sampleOverrides,
      sampleRules,
      [],
      new StaticAIClient(
        JSON.stringify([
          {
            id: "low",
            type: "missing_rule",
            cluster: "x",
            supportingOverrideCount: 8,
            affectedRuleId: null,
            proposedRuleText: "x",
            proposedAmendment: null,
            estimatedWeeklyImpact: 2,
            examplePostTitles: ["a", "b"],
            confidence: "low"
          }
        ])
      )
    );
    expect(suggestions).toEqual([]);
  });

  it("deduplicates clusters", () => {
    const [first] = dedupeRuleGaps([
      { id: "1", type: "missing_rule", cluster: "Marketplace posts", supportingOverrideCount: 5, affectedRuleId: null, proposedRuleText: "", proposedAmendment: null, estimatedWeeklyImpact: 1, examplePostTitles: [], confidence: "medium" },
      { id: "2", type: "missing_rule", cluster: "Marketplace posts", supportingOverrideCount: 10, affectedRuleId: null, proposedRuleText: "", proposedAmendment: null, estimatedWeeklyImpact: 1, examplePostTitles: [], confidence: "high" }
    ]);
    expect(first.id).toBe("2");
  });
});
