export const DEFAULT_SETTINGS = {
  aiModel: "gpt-4.1-mini",
  flagThreshold: 75,
  autoHoldThreshold: 92,
  evaluateComments: true,
  digestEnabled: true,
  digestDay: "monday",
  digestHour: 9,
  ruleGapEnabled: true,
  disabledLanguages: [] as string[]
};

export const TTL = {
  subredditRulesSeconds: 60 * 60 * 24,
  translatedRulesSeconds: 60 * 60 * 24 * 7,
  evaluationRecordSeconds: 60 * 60 * 24 * 120
};

export const STORAGE_KEYS = {
  userHistory: (username: string) => `user:${username}:actions`,
  subredditRules: (name: string) => `subreddit:${name}:rules`,
  translatedRules: (name: string, languageCode: string) => `subreddit:${name}:rules:${languageCode}`,
  currentWeek: (name: string) => `eval:${name}:weekIndex`,
  evaluation: (name: string, week: number, postId: string) => `eval:${name}:${week}:${postId}`,
  weeklyStats: (name: string, week: number) => `eval:${name}:weeklyStats:${week}`,
  digestState: (name: string) => `digest:${name}:state`,
  ruleGapState: (name: string) => `rulegap:${name}:state`
};

export const FULL_SUPPORT_LANGUAGE_CODES = [
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "nl",
  "pl",
  "ru",
  "ja",
  "ko",
  "zh-CN",
  "ar",
  "hi",
  "tr",
  "sv"
];

export const FALLBACK_FLAG_REASON =
  "ModMind could not confidently evaluate this item. It was left for manual review.";
