import type { AIClient, AppSettings, ContentItem, EvaluationResult, KeyValueStore, SubredditRule } from "../types.js";
import { DEFAULT_SETTINGS } from "../utils/constants.js";
import { detectLanguage } from "../ai/languageDetector.js";
import { evaluateContent } from "../ai/evaluator.js";
import { getTranslatedRules } from "../storage/subredditRules.js";
import { logEvaluation } from "../storage/evaluationLog.js";
import { getUserHistory, logAction } from "../storage/modHistory.js";

export interface PipelineResult {
  evaluated: boolean;
  duplicate: boolean;
  result?: EvaluationResult;
  action: "none" | "flag" | "hold" | "manual_review";
}

export interface PostPipelineOptions {
  store: KeyValueStore;
  content: ContentItem;
  rules: SubredditRule[];
  aiClient?: AIClient;
  settings?: Partial<AppSettings>;
}

export async function handlePostSubmit(options: PostPipelineOptions): Promise<PipelineResult> {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const duplicateKey = `dedupe:${options.content.subredditName}:${options.content.id}`;
  if (await options.store.get(duplicateKey)) {
    return { evaluated: false, duplicate: true, action: "none" };
  }
  await options.store.set(duplicateKey, "1", { ttlSeconds: 60 });

  const text = `${options.content.title ?? ""}\n${options.content.body ?? ""}`;
  const language = await detectLanguage(text, options.content.nativeLanguage, options.aiClient);
  const translatedRules = await getTranslatedRules(
    options.store,
    options.content.subredditName,
    language.detected,
    options.rules,
    options.aiClient
  );
  const userHistory = await getUserHistory(options.store, options.content.authorName);
  const result = await evaluateContent({
    content: options.content,
    rules: options.rules,
    translatedRules,
    userHistory,
    aiClient: options.aiClient,
    language,
    flagThreshold: settings.flagThreshold
  });

  await logEvaluation(
    options.store,
    options.content.subredditName,
    options.content.id,
    result,
    "post",
    options.content.title ?? "",
    options.content.body ?? ""
  );

  if (result.shouldFlag) {
    await logAction(options.store, options.content.authorName, options.content.id, result.suggestedAction, result.violatedRules[0]);
  }

  return {
    evaluated: true,
    duplicate: false,
    result,
    action: result.suggestedAction === "hold" || result.confidence >= settings.autoHoldThreshold ? "hold" : result.shouldFlag ? "flag" : "none"
  };
}
