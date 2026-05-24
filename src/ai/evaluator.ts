import type { AIClient, ContentItem, EvaluationResult, LanguageDetectionResult, SubredditRule, UserHistory } from "../types.js";
import { FALLBACK_FLAG_REASON } from "../utils/constants.js";
import { normalizeEvaluation, parseJsonSafe } from "../utils/formatters.js";
import { getSupportedTier } from "../utils/languageCodes.js";
import { buildEvaluationPrompt, buildMultilingualEvaluationPrompt } from "../utils/prompts.js";
import { detectLanguage } from "./languageDetector.js";

export interface EvaluateContentOptions {
  content: ContentItem;
  rules: SubredditRule[];
  userHistory?: UserHistory;
  aiClient?: AIClient;
  translatedRules?: SubredditRule[];
  language?: LanguageDetectionResult;
  flagThreshold?: number;
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

  try {
    const raw = await options.aiClient.generate(prompt, { maxTokens: 900, temperature: 0.1 });
    const parsed = parseJsonSafe<Partial<EvaluationResult>>(raw);
    if (!parsed) return safeEvaluation("approve", false, 0, "AI returned an unreadable response.", language);

    const normalized = normalizeEvaluation({ ...parsed, detectedLanguage: language });
    const repeatBoost = Math.min(12, Math.floor((options.userHistory?.flagCount ?? 0) / 5) * 6);
    const boosted = normalizeEvaluation({ ...normalized, confidence: normalized.confidence + repeatBoost });
    const threshold = options.flagThreshold ?? 75;

    return {
      ...boosted,
      shouldFlag: boosted.shouldFlag || boosted.confidence >= threshold
    };
  } catch {
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
