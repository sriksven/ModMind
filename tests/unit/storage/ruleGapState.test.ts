import { beforeEach, describe, expect, it } from "vitest";
import { approveSuggestion, dismissSuggestion, getDismissedTopics, getRuleGapState, storeSuggestions } from "../../../src/storage/ruleGapState.js";
import { MemoryStore } from "../../../src/storage/redisAdapter.js";
import type { RuleGapResult } from "../../../src/types.js";

const suggestion: RuleGapResult = {
  id: "s1",
  type: "missing_rule",
  cluster: "marketplace",
  supportingOverrideCount: 6,
  affectedRuleId: null,
  proposedRuleText: "No marketplace posts.",
  proposedAmendment: null,
  estimatedWeeklyImpact: 2,
  examplePostTitles: ["a", "b"],
  confidence: "medium"
};

describe("ruleGapState", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("stores, approves, and dismisses suggestions", async () => {
    await storeSuggestions(store, "modmind", [suggestion]);
    expect((await getRuleGapState(store, "modmind")).pendingSuggestions).toHaveLength(1);
    await approveSuggestion(store, "modmind", "s1");
    expect((await getRuleGapState(store, "modmind")).approvedRules).toHaveLength(1);

    await storeSuggestions(store, "modmind", [suggestion]);
    await dismissSuggestion(store, "modmind", "s1");
    expect(await getDismissedTopics(store, "modmind")).toEqual(["s1"]);
  });

  it("ignores missing IDs", async () => {
    await expect(approveSuggestion(store, "modmind", "missing")).resolves.toMatchObject({ approvedRules: [] });
  });
});
