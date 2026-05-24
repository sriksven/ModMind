import type { ContentItem, LanguageDetectionResult, OverrideRecord, SubredditRule, UserHistory, WeeklyStats } from "../types.js";
import { getLanguageDisplayName } from "./languageCodes.js";
import { truncateToTokenLimit } from "./formatters.js";

function formatRules(rules: SubredditRule[]): string {
  return rules.map((rule) => `${rule.id}. ${rule.name}: ${rule.description}`).join("\n");
}

export function buildEvaluationPrompt(content: ContentItem, rules: SubredditRule[], userHistory?: UserHistory): string {
  const historyBlock = userHistory
    ? `\nUser history:\n- prior flags: ${userHistory.flagCount}\n- recent actions: ${JSON.stringify(userHistory.actions.slice(-5))}\n`
    : "";

  return [
    "You are ModMind, an assistant for Reddit moderators.",
    "Evaluate the submitted content against the subreddit rules.",
    "IMPORTANT: Default to approving. Only flag content if it clearly and specifically violates one of the listed rules.",
    "If you are uncertain, return shouldFlag: false, confidence: 0, and suggestedAction: approve.",
    "Return JSON only with these fields: shouldFlag, confidence, suggestedAction, violatedRules, reason, draftReply.",
    "suggestedAction must be one of approve, remove, hold, escalate.",
    "",
    "Subreddit rules:",
    formatRules(rules),
    historyBlock,
    "Content:",
    `Type: ${content.kind}`,
    `Title: ${truncateToTokenLimit(content.title ?? "", 300)}`,
    `Body: ${truncateToTokenLimit(content.body ?? "", 900)}`,
    "",
    "Keep the reason plain-English and useful to a human moderator. Draft replies should be polite and concise."
  ].join("\n");
}

export function buildMultilingualEvaluationPrompt(
  content: ContentItem,
  translatedRules: SubredditRule[],
  detectedLanguage: LanguageDetectionResult,
  userHistory?: UserHistory
): string {
  const languageName = getLanguageDisplayName(detectedLanguage.detected);
  return [
    `Evaluate this ${content.kind} written in ${languageName}.`,
    `The subreddit rules have been translated to ${languageName}. Respond in English.`,
    buildEvaluationPrompt(content, translatedRules, userHistory),
    "",
    "Also include bilingualReply with english and native fields. The native field must be written in the user's language."
  ].join("\n");
}

export function buildTranslationPrompt(rules: SubredditRule[], targetLanguage: string): string {
  return [
    `Translate these Reddit rules to ${getLanguageDisplayName(targetLanguage)}.`,
    "Translate literally, preserve rule IDs and structure, and do not add interpretation.",
    "Return JSON only as an array of objects with id, name, and description.",
    JSON.stringify(rules)
  ].join("\n");
}

export function buildDraftReplyPrompt(rule: SubredditRule, postTitle: string, targetLanguage: string): string {
  return [
    `Draft a polite Reddit removal reply for a violation of rule "${rule.name}".`,
    `Post title: ${postTitle}`,
    `Return JSON only: {"english":"...","native":"..."}.`,
    `The native reply must be in ${getLanguageDisplayName(targetLanguage)}.`
  ].join("\n");
}

export const buildBilingualReplyPrompt = buildDraftReplyPrompt;

export function buildDigestPrompt(stats: WeeklyStats, subredditName: string): string {
  return [
    `Analyze this weekly moderation activity for r/${subredditName}.`,
    "Use a neutral professional tone. Return JSON only with patternParagraph, topInsight, overrideWarnings, and recommendations.",
    "Flag any rule with override rate above 40% as potentially unclear.",
    "Mention volume spikes if a day has at least 3x average daily volume.",
    "Keep patternParagraph between 3 and 5 sentences and recommendations to at most 2 items.",
    JSON.stringify(stats)
  ].join("\n");
}

export function buildRuleGapPrompt(overrides: OverrideRecord[], existingRules: SubredditRule[], dismissedTopics: string[]): string {
  return [
    "Analyze moderator overrides to identify missing rules, vague rules, or AI error patterns.",
    "Be conservative. Only suggest a rule gap when at least 5 overrides support the same pattern.",
    "Do not duplicate existing rules and do not suggest dismissed topics.",
    "Match the subreddit's existing rule style.",
    "Return JSON only as an array with id, type, cluster, supportingOverrideCount, affectedRuleId, proposedRuleText, proposedAmendment, estimatedWeeklyImpact, examplePostTitles, confidence.",
    "",
    `Existing rules: ${JSON.stringify(existingRules)}`,
    `Dismissed topics: ${JSON.stringify(dismissedTopics)}`,
    `Overrides: ${JSON.stringify(overrides.map((override) => ({ ...override, body: override.body.slice(0, 500) })))}`
  ].join("\n");
}
