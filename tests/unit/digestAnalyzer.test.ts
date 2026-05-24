import { describe, expect, it } from "vitest";
import { StaticAIClient } from "../../src/ai/client.js";
import { analyzeWeek } from "../../src/ai/digestAnalyzer.js";
import { emptyWeeklyStats } from "../../src/storage/evaluationLog.js";

describe("digestAnalyzer", () => {
  it("returns a quiet summary for low volume", async () => {
    const summary = await analyzeWeek(emptyWeeklyStats(), "modmind");
    expect(summary.topInsight).toContain("Quiet");
  });

  it("flags high override rules in fallback mode", async () => {
    const stats = emptyWeeklyStats();
    Object.assign(stats, { evaluated: 10, postsEvaluated: 10, accepted: 1, overridden: 4 });
    stats.ruleBreakdown["Rule 2"] = { violations: 5, accepted: 1, overridden: 4 };
    const summary = await analyzeWeek(stats, "modmind");
    expect(summary.overrideWarnings[0]).toContain("Rule 2");
  });

  it("normalizes AI summary shape", async () => {
    const stats = emptyWeeklyStats();
    Object.assign(stats, { evaluated: 10, postsEvaluated: 10 });
    const summary = await analyzeWeek(
      stats,
      "modmind",
      new StaticAIClient(
        JSON.stringify({
          topInsight: "Spam dropped. Second sentence.",
          patternParagraph: "One. Two. Three.",
          overrideWarnings: [],
          recommendations: ["Review rule 2", "Check translations", "Extra"]
        })
      )
    );
    expect(summary.topInsight).toBe("Spam dropped");
    expect(summary.recommendations).toHaveLength(2);
  });
});
