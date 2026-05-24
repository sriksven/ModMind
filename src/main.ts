import { Devvit, SettingScope } from "@devvit/public-api";
import { OpenAIResponsesClient } from "./ai/client.js";
import { runRuleGapDetectorJob } from "./jobs/ruleGapDetector.js";
import { runRuleSyncJob } from "./jobs/ruleSync.js";
import { runWeeklyDigestJob } from "./jobs/weeklyDigest.js";
import { logModAction } from "./storage/evaluationLog.js";
import { incrementMetric, recordCalibration } from "./storage/llmMetrics.js";
import { MemoryStore } from "./storage/redisAdapter.js";
import { getRules } from "./storage/subredditRules.js";
import { handleCommentSubmit } from "./triggers/onCommentSubmit.js";
import { handlePostSubmit, type PipelineResult } from "./triggers/onPostSubmit.js";
import type { AppSettings, ContentItem, KeyValueStore, SubredditRule } from "./types.js";
import { DEFAULT_SETTINGS } from "./utils/constants.js";
import { renderSuggestionCard } from "./ui/suggestionCard.js";

const devvit = Devvit as any;

devvit.configure?.({
  redditAPI: true,
  redis: true,
  http: true
});

devvit.addSettings?.([
  {
    type: "string",
    name: "openaiApiKey",
    label: "OpenAI API key",
    scope: SettingScope.Installation,
    helpText: "OpenAI API key used for ModMind AI calls. For test installs only; rotate before public release."
  },
  {
    type: "string",
    name: "aiModel",
    label: "AI model",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.aiModel
  },
  {
    type: "number",
    name: "flagThreshold",
    label: "Flag threshold",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.flagThreshold
  },
  {
    type: "number",
    name: "autoHoldThreshold",
    label: "Auto-hold threshold",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.autoHoldThreshold
  },
  {
    type: "boolean",
    name: "evaluateComments",
    label: "Evaluate comments",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.evaluateComments
  },
  {
    type: "boolean",
    name: "digestEnabled",
    label: "Weekly digest enabled",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.digestEnabled
  },
  {
    type: "boolean",
    name: "ruleGapEnabled",
    label: "Monthly rule gap detector enabled",
    scope: SettingScope.Installation,
    defaultValue: DEFAULT_SETTINGS.ruleGapEnabled
  },
  {
    type: "string",
    name: "disabledLanguages",
    label: "Disabled language codes",
    scope: SettingScope.Installation,
    defaultValue: ""
  },
  {
    type: "number",
    name: "userRateLimitPerHour",
    label: "Max evaluations per user per hour",
    scope: SettingScope.Installation,
    defaultValue: 5
  },
  {
    type: "boolean",
    name: "digestAlertEnabled",
    label: "Send mod mail alerts for activity spikes",
    scope: SettingScope.Installation,
    defaultValue: true
  }
]);

const localStore = new MemoryStore();

export function buildAIClient(settings: Partial<AppSettings>): OpenAIResponsesClient | undefined {
  if (!settings.openaiApiKey) return undefined;
  return new OpenAIResponsesClient(settings.openaiApiKey, settings.aiModel ?? DEFAULT_SETTINGS.aiModel);
}

export async function fetchSubredditRules(_subredditName: string): Promise<SubredditRule[]> {
  return [];
}

export async function submitModOnlyPost(title: string, body: string): Promise<string> {
  return `local_${Buffer.from(`${title}:${body.length}`).toString("base64url").slice(0, 12)}`;
}

devvit.addTrigger?.({
  events: ["PostSubmit"],
  onEvent: async (event: any, context: any) => {
    console.log("ModMind PostSubmit trigger received", {
      postId: event.post?.id,
      subreddit: event.subreddit?.name ?? context.subredditName
    });
    await runPostPipeline(event, context);
  }
});

devvit.addTrigger?.({
  events: ["CommentSubmit"],
  onEvent: async (event: any, context: any) => {
    console.log("ModMind CommentSubmit trigger received", {
      commentId: event.comment?.id,
      subreddit: event.subreddit?.name ?? context.subredditName
    });
    await runCommentPipeline(event, context);
  }
});

devvit.addSchedulerJob?.({
  name: "daily_rule_sync",
  onRun: async (_event: unknown, context: any) => {
    const subredditName = await getRuntimeSubredditName(context);
    await runRuleSyncJob(getRuntimeStore(context), subredditName, (name) => fetchSubredditRulesFromReddit(context, name));
  }
});

devvit.addSchedulerJob?.({
  name: "weekly_digest",
  onRun: async (_event: unknown, context: any) => {
    const settings = await getRuntimeSettings(context);
    const subredditName = await getRuntimeSubredditName(context);
    const sendMessage = (to: string, subject: string, text: string) =>
      context.reddit?.sendPrivateMessage?.({ to, subject, text });
    await runWeeklyDigestJob(
      getRuntimeStore(context),
      subredditName,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings),
      sendMessage,
      (settings as any)?.digestAlertEnabled ?? true
    );
  }
});

devvit.addSchedulerJob?.({
  name: "monthly_rule_gap_detector",
  onRun: async (_event: unknown, context: any) => {
    const settings = await getRuntimeSettings(context);
    const subredditName = await getRuntimeSubredditName(context);
    const rules = await fetchSubredditRulesFromReddit(context, subredditName);
    await runRuleGapDetectorJob(
      getRuntimeStore(context),
      subredditName,
      rules,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings)
    );
  }
});

devvit.addMenuItem?.({
  label: "Run ModMind weekly digest",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event: unknown, context: any) => {
    const settings = await getRuntimeSettings(context);
    const subredditName = await getRuntimeSubredditName(context);
    const sendMessage = (to: string, subject: string, text: string) =>
      context.reddit?.sendPrivateMessage?.({ to, subject, text });
    const result = await runWeeklyDigestJob(
      getRuntimeStore(context),
      subredditName,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings),
      sendMessage,
      (settings as any)?.digestAlertEnabled ?? true,
      Date.now()
    );
    context.ui?.showToast?.(result.posted ? "ModMind digest posted." : `Digest skipped: ${result.reason ?? "not needed"}`);
  }
});

devvit.addMenuItem?.({
  label: "Run ModMind rule gap analysis",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event: unknown, context: any) => {
    const settings = await getRuntimeSettings(context);
    const subredditName = await getRuntimeSubredditName(context);
    const rules = await fetchSubredditRulesFromReddit(context, subredditName);
    const result = await runRuleGapDetectorJob(
      getRuntimeStore(context),
      subredditName,
      rules,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings),
      Date.now(),
      true
    );
    context.ui?.showToast?.(result.posted ? "ModMind rule gap analysis posted." : `Rule gap analysis skipped: ${result.reason ?? "not needed"}`);
  }
});

devvit.addMenuItem?.({
  label: "ModMind: Override flag",
  location: "post",
  forUserType: "moderator",
  onPress: handleOverrideFlagPress
});

export async function handleOverrideFlagPress(event: any, context: any): Promise<void> {
  const postId = ensureThingId("t3_", event.targetId ?? event.post?.id ?? event.id);
  const subredditName = await getRuntimeSubredditName(context);
  const store = getRuntimeStore(context);
  const modUsername = context.user?.username ?? context.user?.name ?? context.userId ?? "unknown";
  const timestamp = Date.now();

  await store.set(
    `override:${postId}`,
    JSON.stringify({
      postId,
      subredditName,
      modUsername,
      overriddenAt: timestamp,
      action: "approved"
    })
  );
  await logModAction(store, subredditName, postId, "overridden", modUsername, "approved", timestamp);

  // Record calibration: mod overrode = AI was wrong
  try {
    const { getEvaluationRecord } = await import("./storage/evaluationLog.js");
    const evalRecord = await getEvaluationRecord(store, subredditName, postId);
    if (evalRecord?.result?.confidence) {
      const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 1;
      await recordCalibration(store, subredditName, week, evalRecord.result.confidence, false);
    }
  } catch (err) {
    console.error("ModMind failed to record calibration on override", { error: err });
  }

  await context.reddit?.approve?.(postId);
  context.ui?.showToast?.("ModMind flag overridden. Post approved.");
  console.log("ModMind override logged", { postId, subredditName, modUsername });
}

export function adaptPostEvent(event: any): ContentItem {
  return {
    id: ensureThingId("t3_", event.post?.id ?? event.id),
    kind: "post",
    subredditName: event.subreddit?.name ?? event.subredditName,
    authorName: event.author?.name ?? event.authorName ?? "unknown",
    title: event.post?.title ?? event.title ?? "",
    body: event.post?.selftext ?? event.post?.body ?? event.body ?? "",
    createdAt: event.post?.createdAt ? event.post.createdAt * 1000 : Date.now(),
    permalink: event.post?.permalink,
    nativeLanguage: event.post?.languageCode
  };
}

export function adaptCommentEvent(event: any): ContentItem {
  return {
    id: ensureThingId("t1_", event.comment?.id ?? event.id),
    kind: "comment",
    subredditName: event.subreddit?.name ?? event.subredditName,
    authorName: event.author?.name ?? event.comment?.author ?? event.authorName ?? "unknown",
    title: event.post?.title ?? "",
    body: event.comment?.body ?? event.body ?? "",
    createdAt: event.comment?.createdAt ? event.comment.createdAt * 1000 : Date.now(),
    permalink: event.comment?.permalink,
    nativeLanguage: event.comment?.languageCode,
    parentRemoved: Boolean(event.post?.deleted || event.post?.spam)
  };
}

async function runPostPipeline(event: any, context: any): Promise<void> {
  const settings = await getRuntimeSettings(context);
  const content = adaptPostEvent(event);
  if (shouldIgnoreContent(content, context)) {
    console.log("ModMind ignored post", { postId: content.id, authorName: content.authorName, reason: "app-authored or generated content" });
    return;
  }
  const store = getRuntimeStore(context);
  const rules = await getRules(store, content.subredditName, (name) => fetchSubredditRulesFromReddit(context, name));
  const result = await handlePostSubmit({ store, content, rules, aiClient: buildAIClient(settings), settings });
  console.log("ModMind post pipeline completed", {
    postId: content.id,
    evaluated: result.evaluated,
    duplicate: result.duplicate,
    action: result.action,
    shouldFlag: result.result?.shouldFlag,
    confidence: result.result?.confidence,
    hasOpenAIKey: Boolean(settings.openaiApiKey)
  });
  await applyRuntimeAction(context, content, result);
}

async function runCommentPipeline(event: any, context: any): Promise<void> {
  const settings = await getRuntimeSettings(context);
  const content = adaptCommentEvent(event);
  if (shouldIgnoreContent(content, context)) {
    console.log("ModMind ignored comment", { commentId: content.id, authorName: content.authorName, reason: "app-authored or generated content" });
    return;
  }
  const store = getRuntimeStore(context);
  const rules = await getRules(store, content.subredditName, (name) => fetchSubredditRulesFromReddit(context, name));

  // Check for mod explanation quality feedback
  const isModerator = event.author?.isOp === false && event.isModeratorApproved;
  const body = (content.body ?? "").trim();
  if (isModerator && (body === "👍" || body === "👎" || body.toLowerCase() === "good" || body.toLowerCase() === "bad" || body === "+1" || body === "-1")) {
    try {
      const parentId = event.comment?.parentId ?? event.parentId;
      const isReplyToModMind = parentId?.startsWith("t1_") && (await isModMindComment(store, parentId));
      if (isReplyToModMind) {
        const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 1;
        if (body === "👍" || body.toLowerCase() === "good" || body === "+1") {
          await incrementMetric(store, content.subredditName, week, "explanationThumbsUp", 1);
          console.log("ModMind explanation rated helpful", { commentId: content.id });
        } else {
          await incrementMetric(store, content.subredditName, week, "explanationThumbsDown", 1);
          console.log("ModMind explanation rated unhelpful", { commentId: content.id });
        }
        return; // Don't evaluate the mod's own reaction
      }
    } catch (error) {
      console.error("ModMind failed to process mod explanation feedback", { error });
    }
  }

  const result = await handleCommentSubmit({ store, content, rules, aiClient: buildAIClient(settings), settings });
  console.log("ModMind comment pipeline completed", {
    commentId: content.id,
    evaluated: result.evaluated,
    duplicate: result.duplicate,
    action: result.action,
    shouldFlag: result.result?.shouldFlag,
    confidence: result.result?.confidence,
    hasOpenAIKey: Boolean(settings.openaiApiKey)
  });
  await applyRuntimeAction(context, content, result);
}

async function isModMindComment(store: KeyValueStore, commentId: string): Promise<boolean> {
  const val = await store.get(`modmind-comment:${commentId}`).catch(() => null);
  return Boolean(val);
}

async function markModMindComment(store: KeyValueStore, commentId: string): Promise<void> {
  await store.set(`modmind-comment:${commentId}`, "1", { ttlSeconds: 7 * 24 * 60 * 60 });
}

async function applyRuntimeAction(context: any, content: ContentItem, pipelineResult: PipelineResult): Promise<void> {
  if (!pipelineResult.result || !pipelineResult.evaluated || pipelineResult.duplicate) {
    console.log("ModMind skipped runtime action", { contentId: content.id, reason: "not evaluated or duplicate" });
    return;
  }
  if (!pipelineResult.result.shouldFlag) {
    console.log("ModMind skipped runtime action", { contentId: content.id, reason: "not flagged" });
    return;
  }

  const cardText = renderSuggestionCard(pipelineResult.result);
  const body = cardText;

  const store = getRuntimeStore(context);
  const subredditName = content.subredditName;
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) + 1;

  try {
    if (pipelineResult.action === "hold") {
      await context.reddit?.remove?.(content.id, pipelineResult.result.violatedRules.some((rule: string) => /spam/iu.test(rule)));
    }

    if (content.kind === "post") {
      const post = await context.reddit?.getPostById?.(content.id);
      const comment = await post?.addComment?.({ text: body, runAs: "APP" });
      await comment?.distinguish?.(false);
      if (comment?.id) {
        await markModMindComment(store, comment.id);
      }
      console.log("ModMind posted suggestion comment", { postId: content.id });
      
      await incrementMetric(store, subredditName, week, "pipelineSuccess", 1);
      return;
    }

    const comment = await context.reddit?.getCommentById?.(content.id);
    const reply = await comment?.reply?.({ text: body, runAs: "APP" });
    await reply?.distinguish?.(false);
    if (reply?.id) {
      await markModMindComment(store, reply.id);
    }
    console.log("ModMind posted suggestion reply", { commentId: content.id });
    
    await incrementMetric(store, subredditName, week, "pipelineSuccess", 1);
  } catch (error) {
    console.error("ModMind failed to apply runtime action", { contentId: content.id, error });
    await incrementMetric(store, subredditName, week, "pipelinePartial", 1);
  }
}

async function fetchSubredditRulesFromReddit(context: any, subredditName: string): Promise<SubredditRule[]> {
  try {
    const rules = await context.reddit?.getRules?.(subredditName);
    const mapped = (rules ?? []).map((rule: any, index: number) => ({
      id: String(index + 1),
      name: rule.shortName ?? rule.name ?? `Rule ${index + 1}`,
      description: rule.description ?? rule.violationReason ?? ""
    }));
    return mapped.length > 0 ? mapped : defaultPlaytestRules();
  } catch (error) {
    console.error("ModMind failed to fetch subreddit rules; using fallback playtest rules", { subredditName, error });
    return defaultPlaytestRules();
  }
}

async function submitModOnlyPostToReddit(context: any, subredditName: string, title: string, body: string): Promise<string> {
  const post = await context.reddit?.submitPost?.({
    subredditName,
    title,
    text: body,
    sendreplies: false,
    runAs: "APP"
  });
  if (post?.sticky) await post.sticky(1);
  return post?.id ?? `local_${Date.now()}`;
}

async function getRuntimeSettings(context: any): Promise<AppSettings> {
  const values = ((await context.settings?.getAll?.()?.catch((error: unknown) => {
    console.error("ModMind runtime settings getAll failed", { error });
    return {};
  })) ?? {}) as Partial<AppSettings> & { disabledLanguages?: string | string[] };
  const merged = {
    ...DEFAULT_SETTINGS,
    ...values,
    disabledLanguages:
      typeof values.disabledLanguages === "string"
        ? values.disabledLanguages.split(",").map((code: string) => code.trim()).filter(Boolean)
        : values.disabledLanguages ?? []
  };
  console.log("ModMind runtime settings loaded", {
    merged: {
      aiModel: merged.aiModel,
      flagThreshold: merged.flagThreshold,
      autoHoldThreshold: merged.autoHoldThreshold,
      evaluateComments: merged.evaluateComments,
      digestEnabled: merged.digestEnabled,
      ruleGapEnabled: merged.ruleGapEnabled,
      disabledLanguages: merged.disabledLanguages,
      hasOpenAIKey: Boolean(merged.openaiApiKey),
      openaiApiKey: merged.openaiApiKey ? "sk-***" + merged.openaiApiKey.slice(-4) : "missing"
    }
  });
  return merged;
}

function getRuntimeStore(context: any): KeyValueStore {
  if (!context.redis) return localStore;
  return {
    get: async (key) => context.redis.get(key),
    set: async (key, value, options) => {
      if (options?.ttlSeconds) {
        await context.redis.set(key, value, { expiration: new Date(Date.now() + options.ttlSeconds * 1000) });
        return;
      }
      await context.redis.set(key, value);
    },
    del: async (key) => {
      await context.redis.del(key);
    }
  };
}

async function getRuntimeSubredditName(context: any): Promise<string> {
  if (context.subredditName) return context.subredditName;
  return context.reddit?.getCurrentSubredditName?.() ?? "modmindtest";
}

function ensureThingId(prefix: "t1_" | "t3_", id: string | undefined): string {
  if (!id) return `${prefix}unknown`;
  return id.startsWith("t1_") || id.startsWith("t3_") ? id : `${prefix}${id}`;
}

function shouldIgnoreContent(content: ContentItem, context: any): boolean {
  const appNames = new Set(
    [context.appSlug, context.appName, "modmind-f4lcon46", "ModMind"]
      .filter(Boolean)
      .map((name: string) => name.toLowerCase())
  );
  if (appNames.has(content.authorName.toLowerCase())) return true;
  return `${content.title ?? ""}\n${content.body ?? ""}`.includes("ModMind moderation suggestion");
}

function defaultPlaytestRules(): SubredditRule[] {
  return [
    { id: "1", name: "Be civil", description: "No harassment, hate, threats, or personal attacks." },
    { id: "2", name: "No spam", description: "No scams, repeated promotions, or low-effort self-promotion." },
    { id: "3", name: "Stay on topic", description: "Posts and comments must be relevant to the community." }
  ];
}

export default Devvit;
