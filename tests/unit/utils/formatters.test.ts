import { describe, expect, it } from "vitest";
import { buildDigestPost, formatConfidence, parseJsonSafe, truncateToTokenLimit } from "../../../src/utils/formatters.js";
import { emptyWeeklyStats } from "../../../src/storage/evaluationLog.js";

describe("formatters", () => {
  it("parses raw and fenced JSON safely", () => {
    expect(parseJsonSafe<{ ok: boolean }>("{\"ok\":true}")?.ok).toBe(true);
    expect(parseJsonSafe<{ ok: boolean }>("```json\n{\"ok\":true}\n```")?.ok).toBe(true);
    expect(parseJsonSafe("nope")).toBeNull();
  });

  it("truncates without cutting mid-word", () => {
    const text = "one two three four five six seven eight nine ten";
    expect(truncateToTokenLimit(text, 3)).not.toMatch(/thr\.\.\.$/u);
  });

  it("builds quiet digest and formats confidence", () => {
    expect(buildDigestPost(emptyWeeklyStats(), { topInsight: "x", patternParagraph: "y", overrideWarnings: [], recommendations: [] })).toContain("Quiet week");
    expect(formatConfidence(87)).toBe("87%");
    expect(formatConfidence(Number.NaN)).toBe("-");
  });
});
