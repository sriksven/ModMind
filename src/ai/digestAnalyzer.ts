import type { AIClient, DigestSummary, WeeklyStats } from "../types.js";
import { calculateAccuracy, parseJsonSafe } from "../utils/formatters.js";
import { buildDigestPrompt } from "../utils/prompts.js";

export async function analyzeWeek(stats: WeeklyStats, subredditName: string, aiClient?: AIClient): Promise<DigestSummary> {
  if (stats.evaluated < 5) {
    return {
      topInsight: "Quiet moderation week",
      patternParagraph: "Fewer than five items were evaluated, so there is not enough activity to identify a reliable pattern.",
      overrideWarnings: [],
      recommendations: []
    };
  }

  if (!aiClient) return fallbackDigest(stats);

  try {
    const raw = await aiClient.generate(buildDigestPrompt(stats, subredditName), { maxTokens: 800, temperature: 0.2 });
    const parsed = parseJsonSafe<Partial<DigestSummary>>(raw);
    if (!parsed) return fallbackDigest(stats);

    return {
      topInsight: singleSentence(parsed.topInsight ?? fallbackDigest(stats).topInsight),
      patternParagraph: parsed.patternParagraph ?? fallbackDigest(stats).patternParagraph,
      overrideWarnings: Array.isArray(parsed.overrideWarnings) ? parsed.overrideWarnings : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 2) : []
    };
  } catch {
    return fallbackDigest(stats);
  }
}

function fallbackDigest(stats: WeeklyStats): DigestSummary {
  const accuracy = calculateAccuracy(stats);
  const warnings = Object.entries(stats.ruleBreakdown)
    .filter(([, rule]) => rule.accepted + rule.overridden > 0 && rule.overridden / (rule.accepted + rule.overridden) > 0.4)
    .map(([rule]) => `${rule} had an override rate above 40%.`);

  return {
    topInsight: `${stats.evaluated} items evaluated with ${accuracy}% accepted accuracy`,
    patternParagraph: `ModMind evaluated ${stats.postsEvaluated} posts and ${stats.commentsEvaluated} comments this week. Moderators accepted ${stats.accepted} suggestions and overrode ${stats.overridden}. The calculated accepted accuracy was ${accuracy}%.`,
    overrideWarnings: warnings,
    recommendations: warnings.length > 0 ? ["Review high-override rules for unclear wording."] : []
  };
}

function singleSentence(text: string): string {
  return text.replace(/\s+/gu, " ").split(/[.!?]\s/u)[0].trim();
}
