import type { EvaluationResult } from "../../src/types.js";

export const spamEvaluation: EvaluationResult = {
  shouldFlag: true,
  confidence: 91,
  suggestedAction: "remove",
  violatedRules: ["No spam"],
  reason: "The post is promotional spam.",
  draftReply: "Your post was removed for spam.",
  detectedLanguage: { detected: "en", confidence: 90, script: "latin", isEnglish: true },
  createdAt: Date.now()
};

export const cleanEvaluation: EvaluationResult = {
  shouldFlag: false,
  confidence: 8,
  suggestedAction: "approve",
  violatedRules: [],
  reason: "No rule violation found.",
  draftReply: "",
  detectedLanguage: { detected: "en", confidence: 90, script: "latin", isEnglish: true },
  createdAt: Date.now()
};
