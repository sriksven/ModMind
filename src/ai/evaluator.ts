import type { AIClient, ContentItem, EvaluationResult, KeyValueStore, LanguageDetectionResult, SubredditRule, UserHistory } from "../types.js";
import { FALLBACK_FLAG_REASON } from "../utils/constants.js";
import { normalizeEvaluation, parseJsonSafe } from "../utils/formatters.js";
import { getSupportedTier } from "../utils/languageCodes.js";
import { buildEvaluationPrompt, buildMultilingualEvaluationPrompt } from "../utils/prompts.js";
import { detectLanguage } from "./languageDetector.js";
import { recordLatency, recordConfidence, incrementMetric } from "../storage/llmMetrics.js";

export interface EvaluateContentOptions {
  content: ContentItem;
  rules: SubredditRule[];
  userHistory?: UserHistory;
  aiClient?: AIClient;
  translatedRules?: SubredditRule[];
  language?: LanguageDetectionResult;
  flagThreshold?: number;
  store?: KeyValueStore;
  subredditName?: string;
}

function detectHallucinatedRules(
  citedRules: string[],
  actualRules: SubredditRule[]
): { valid: string[]; hallucinated: string[] } {
  const validNames = actualRules.map(r => r.name.toLowerCase());
  const validDescWords = new Set(
    actualRules.flatMap(r => r.description.toLowerCase().split(/\s+/))
  );

  const valid: string[] = [];
  const hallucinated: string[] = [];

  for (const cited of citedRules) {
    const citedLower = cited.toLowerCase();
    const matches = validNames.some(name =>
      name.includes(citedLower) ||
      citedLower.includes(name) ||
      citedLower.split(/\s+/).some(word => validDescWords.has(word))
    );
    if (matches) {
      valid.push(cited);
    } else {
      hallucinated.push(cited);
    }
  }

  return { valid, hallucinated };
}

function scoreFaithfulness(reason: string, content: ContentItem): number {
  const postText = `${content.title ?? ""} ${content.body ?? ""}`.toLowerCase();
  const postWords = new Set(
    postText.split(/\s+/).filter(w => w.length > 3)
  );

  const reasonWords = reason.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (reasonWords.length === 0) return 0;

  const grounded = reasonWords.filter(w => postWords.has(w)).length;
  return Math.round((grounded / reasonWords.length) * 100);
}

function scoreContextualPrecision(
  citedRules: string[],
  actualRules: SubredditRule[]
): number {
  if (citedRules.length === 0) return 100;
  const validNames = actualRules.map(r => r.name.toLowerCase());
  const validCitations = citedRules.filter(cited =>
    validNames.some(name => name.includes(cited.toLowerCase()) || cited.toLowerCase().includes(name))
  ).length;
  return Math.round((validCitations / citedRules.length) * 100);
}

const TOXIC_REPLY_PATTERNS = [
  /you\s+clearly/gi,
  /obviously\s+you/gi,
  /as\s+anyone\s+can\s+see/gi,
  /this\s+is\s+simply/gi,
  /it\s+should\s+be\s+obvious/gi,
  /you\s+should\s+know\s+better/gi,
  /your\s+(behavior|conduct)\s+is\s+(unacceptable|disgraceful)/gi,
  /this\s+kind\s+of\s+(behavior|content)\s+will\s+not\s+be\s+tolerated/gi,
  /we\s+don't\s+tolerate/gi,
];

const SAFE_FALLBACK_REPLY = "Your post has been removed for violating community rules. Please review the community guidelines before posting again. Thank you for understanding.";

function rewriteToxicReply(reply: string): { rewritten: string; wasToxic: boolean } {
  if (!reply) return { rewritten: SAFE_FALLBACK_REPLY, wasToxic: false };

  const isToxic = TOXIC_REPLY_PATTERNS.some(pattern => pattern.test(reply));

  if (isToxic) {
    return { rewritten: SAFE_FALLBACK_REPLY, wasToxic: true };
  }

  return { rewritten: reply, wasToxic: false };
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function evaluateContent(options: EvaluateContentOptions): Promise<EvaluationResult> {
  const language =
    options.language ??
    (await detectLanguage(`${options.content.title ?? ""}\n${options.content.body ?? ""}`, options.content.nativeLanguage, options.aiClient));

  if (language.confidence < 60) {
    return safeEvaluation("approve", false, 0, "Language detection was inconclusive.", language);
  }

  if (getSupportedTier(language.detected) !== "full") {
    return safeEvaluation("escalate", true, 65, `Unsupported language (${language.detected}); manual review recommended.`, language);
  }

  if (!options.aiClient) {
    return safeEvaluation("approve", false, 0, "AI client is not configured.", language);
  }

  const isMultilingual = !language.isEnglish;
  const prompt = isMultilingual
    ? buildMultilingualEvaluationPrompt(options.content, options.translatedRules ?? options.rules, language, options.userHistory)
    : buildEvaluationPrompt(options.content, options.rules, options.userHistory);

  const callStart = Date.now();
  const currentWeek = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 1;

  try {
    const raw = await options.aiClient.generate(prompt, { maxTokens: 900, temperature: 0.1 });
    const latencyMs = Date.now() - callStart;
    const tokensEstimated = estimateTokenCount(prompt);

    const parsed = parseJsonSafe<Partial<EvaluationResult>>(raw);
    if (!parsed) return safeEvaluation("approve", false, 0, "AI returned an unreadable response.", language);

    const normalized = normalizeEvaluation({ ...parsed, detectedLanguage: language });

    // Hallucination detection
    const { valid, hallucinated } = detectHallucinatedRules(normalized.violatedRules, options.rules);
    if (hallucinated.length > 0) {
      console.warn("ModMind hallucinated rules detected", {
        contentId: options.content.id,
        hallucinated,
        actualRules: options.rules.map(r => r.name)
      });
      if (options.store && options.subredditName) {
        await incrementMetric(options.store, options.subredditName, currentWeek, "hallucinatedRulesCount", hallucinated.length);
      }
    }

    // Use only verified rules
    normalized.violatedRules = valid;

    // Suppress flag if all rules hallucinated and low confidence
    if (valid.length === 0 && hallucinated.length > 0 && normalized.confidence < 90) {
      normalized.shouldFlag = false;
      normalized.reason += " (No valid rule violation confirmed — flagging suppressed.)";
    }

    // Faithfulness scoring
    const faithfulnessScore = scoreFaithfulness(normalized.reason, options.content);
    if (faithfulnessScore < 15) {
      console.warn("ModMind low faithfulness detected", {
        contentId: options.content.id,
        reason: normalized.reason,
        faithfulnessScore
      });
      if (options.store && options.subredditName) {
        await incrementMetric(options.store, options.subredditName, currentWeek, "lowFaithfulnessCount", 1);
      }
      normalized.reason += ` [Note: AI explanation had low grounding score (${faithfulnessScore}%) — review carefully.]`;
    }

    // Toxicity rewrite
    const { rewritten, wasToxic } = rewriteToxicReply(normalized.draftReply);
    if (wasToxic) {
      console.warn("ModMind toxic reply rewritten", { contentId: options.content.id });
      if (options.store && options.subredditName) {
        await incrementMetric(options.store, options.subredditName, currentWeek, "toxicRepliesRewritten", 1);
      }
      normalized.draftReply = rewritten;
    }

    // Contextual precision
    const precision = scoreContextualPrecision(normalized.violatedRules, options.rules);

    // Record metrics
    if (options.store && options.subredditName) {
      await recordLatency(options.store, options.subredditName, currentWeek, latencyMs);
      await recordConfidence(options.store, options.subredditName, currentWeek, normalized.confidence);
      await incrementMetric(options.store, options.subredditName, currentWeek, "totalCalls", 1);
      await incrementMetric(options.store, options.subredditName, currentWeek, "totalTokensEstimated", tokensEstimated);

      const estimatedCostUsd = (tokensEstimated / 1000) * 0.0004;
      await incrementMetric(options.store, options.subredditName, currentWeek, "estimatedCostUsd", estimatedCostUsd);
    }

    console.log("ModMind AI call completed", {
      latencyMs,
      contentId: options.content.id,
      language: language.detected,
      tokensEstimated,
      faithfulnessScore,
      contextualPrecision: precision
    });

    const repeatBoost = Math.min(12, Math.floor((options.userHistory?.flagCount ?? 0) / 5) * 6);
    const boosted = normalizeEvaluation({ ...normalized, confidence: normalized.confidence + repeatBoost });
    
    // A/B threshold testing
    let threshold = options.flagThreshold ?? 75;
    if (options.store && options.subredditName) {
      const { getABGroup } = await import("../storage/abTestState.js");
      const group = getABGroup(options.content.id);
      if (group === "B") {
        threshold = Math.max(50, threshold - 10);
      }
    }
    
    const recommendsAction = boosted.suggestedAction !== "approve";

    return {
      ...boosted,
      shouldFlag: recommendsAction && (boosted.shouldFlag || boosted.confidence >= threshold)
    };
  } catch (error) {
    const latencyMs = Date.now() - callStart;
    if (options.store && options.subredditName) {
      await incrementMetric(options.store, options.subredditName, currentWeek, "failedCalls", 1);
      await recordLatency(options.store, options.subredditName, currentWeek, latencyMs);
    }
    console.error("ModMind AI call failed", { latencyMs, error });
    return safeEvaluation("approve", false, 0, FALLBACK_FLAG_REASON, language);
  }
}

function safeEvaluation(
  suggestedAction: EvaluationResult["suggestedAction"],
  shouldFlag: boolean,
  confidence: number,
  reason: string,
  detectedLanguage?: LanguageDetectionResult
): EvaluationResult {
  return {
    shouldFlag,
    confidence,
    suggestedAction,
    violatedRules: [],
    reason,
    draftReply: "",
    detectedLanguage,
    createdAt: Date.now()
  };
}
