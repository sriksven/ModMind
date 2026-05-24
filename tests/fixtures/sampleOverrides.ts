import type { OverrideRecord } from "../../src/types.js";

export const sampleOverrides: OverrideRecord[] = Array.from({ length: 20 }, (_, index) => ({
  postId: `override_${index}`,
  title: `Borderline marketplace post ${index}`,
  body: "A post that moderators allowed despite the AI marking it as spam.",
  aiSuggestion: "remove",
  modAction: "approve",
  rule: "No spam",
  modUsername: index < 10 ? "mod_a" : "mod_b",
  timestamp: Date.now()
}));
