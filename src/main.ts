import { Devvit, SettingScope } from "@devvit/public-api";
import { OpenAIResponsesClient } from "./ai/client.js";
import { runRuleGapDetectorJob } from "./jobs/ruleGapDetector.js";
import { runRuleSyncJob } from "./jobs/ruleSync.js";
import { runWeeklyDigestJob } from "./jobs/weeklyDigest.js";
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
    await runWeeklyDigestJob(
      getRuntimeStore(context),
      subredditName,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings)
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
    const result = await runWeeklyDigestJob(
      getRuntimeStore(context),
      subredditName,
      (title, body) => submitModOnlyPostToReddit(context, subredditName, title, body),
      buildAIClient(settings),
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
  const body = [
    "ModMind moderation suggestion",
    "",
    cardText,
    "",
    "A human moderator should confirm this action before relying on it outside playtest."
  ].join("\n");

  try {
    if (pipelineResult.action === "hold") {
      await context.reddit?.remove?.(content.id, pipelineResult.result.violatedRules.some((rule: string) => /spam/iu.test(rule)));
    }

    if (content.kind === "post") {
      const post = await context.reddit?.getPostById?.(content.id);
      const comment = await post?.addComment?.({ text: body, runAs: "APP" });
      await comment?.distinguish?.(false);
      console.log("ModMind posted suggestion comment", { postId: content.id });
      return;
    }

    const comment = await context.reddit?.getCommentById?.(content.id);
    const reply = await comment?.reply?.({ text: body, runAs: "APP" });
    await reply?.distinguish?.(false);
    console.log("ModMind posted suggestion reply", { commentId: content.id });
  } catch (error) {
    console.error("ModMind failed to apply runtime action", { contentId: content.id, error });
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
  const values = ((await context.settings?.getAll?.()?.catch(() => ({}))) ?? {}) as Partial<AppSettings> & { disabledLanguages?: string | string[] };
  return {
    ...DEFAULT_SETTINGS,
    ...values,
    disabledLanguages:
      typeof values.disabledLanguages === "string"
        ? values.disabledLanguages.split(",").map((code: string) => code.trim()).filter(Boolean)
        : values.disabledLanguages ?? []
  };
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
