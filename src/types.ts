export type SuggestedAction = "approve" | "remove" | "hold" | "escalate";

export interface SubredditRule {
  id: string;
  name: string;
  description: string;
}

export interface UserHistory {
  username: string;
  flagCount: number;
  lastSeen?: number;
  actions: ModHistoryAction[];
}

export interface ModHistoryAction {
  postId: string;
  action: string;
  rule?: string;
  timestamp: number;
  aiSuggestion?: SuggestedAction;
}

export interface LanguageDetectionResult {
  detected: string;
  confidence: number;
  script: string;
  isEnglish: boolean;
}

export interface BilingualReply {
  english: string;
  native: string;
}

export interface EvaluationResult {
  shouldFlag: boolean;
  confidence: number;
  suggestedAction: SuggestedAction;
  violatedRules: string[];
  reason: string;
  draftReply: string;
  bilingualReply?: BilingualReply;
  detectedLanguage?: LanguageDetectionResult;
  createdAt: number;
}

export interface ContentItem {
  id: string;
  kind: "post" | "comment";
  subredditName: string;
  authorName: string;
  title?: string;
  body?: string;
  createdAt: number;
  permalink?: string;
  nativeLanguage?: string;
  authorAccountAgeDays?: number;
  parentRemoved?: boolean;
}

export interface ModActionRecord {
  postId: string;
  action: "accepted" | "overridden" | "ignored";
  modUsername?: string;
  modAction?: string;
  timestamp: number;
}

export interface EvaluationRecord {
  postId: string;
  subredditName: string;
  result: EvaluationResult;
  contentKind: "post" | "comment";
  contentTitle?: string;
  contentBody?: string;
  modAction?: ModActionRecord;
  timestamp: number;
}

export interface RuleStats {
  violations: number;
  accepted: number;
  overridden: number;
}

export interface OverrideDetail {
  postId: string;
  aiSuggestion: SuggestedAction;
  modAction: string;
  rule: string;
  modUsername?: string;
  timestamp: number;
}

export interface WeeklyStats {
  evaluated: number;
  postsEvaluated: number;
  commentsEvaluated: number;
  flagged: number;
  autoHeld: number;
  passed: number;
  accepted: number;
  overridden: number;
  ruleBreakdown: Record<string, RuleStats>;
  overrideDetails: OverrideDetail[];
  languageBreakdown: Record<string, { evaluated: number; flagged: number; overridden: number }>;
  dailyVolume: Record<string, number>;
  dailyAvgConfidence?: Record<string, number>;
  modActionsByMod?: Record<string, { accepted: number; overridden: number; total: number }>;
}

export interface DigestSummary {
  patternParagraph: string;
  topInsight: string;
  overrideWarnings: string[];
  recommendations: string[];
}

export interface DigestState {
  lastRun?: number;
  lastPostId?: string;
  enabled: boolean;
  summaries: Array<{ postId: string; title: string; createdAt: number }>;
}

export interface OverrideRecord {
  postId: string;
  title: string;
  body: string;
  aiSuggestion: SuggestedAction;
  modAction: string;
  rule: string;
  modUsername?: string;
  timestamp: number;
}

export interface RuleGapResult {
  id: string;
  type: "missing_rule" | "vague_rule" | "ai_error_pattern";
  cluster: string;
  supportingOverrideCount: number;
  affectedRuleId: string | null;
  proposedRuleText: string;
  proposedAmendment: string | null;
  estimatedWeeklyImpact: number;
  examplePostTitles: string[];
  confidence: "high" | "medium" | "low";
  singleModBias?: boolean;
}

export interface RuleGapState {
  lastRun?: number;
  pendingSuggestions: RuleGapResult[];
  approvedRules: RuleGapResult[];
  dismissedSuggestions: RuleGapResult[];
}

export interface AppSettings {
  openaiApiKey?: string;
  aiModel: string;
  flagThreshold: number;
  autoHoldThreshold: number;
  evaluateComments: boolean;
  digestEnabled: boolean;
  digestDay: string;
  digestHour: number;
  ruleGapEnabled: boolean;
  disabledLanguages: string[];
}

export interface AIClient {
  generate(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void>;
  del?(key: string): Promise<void>;
  keys?(pattern: string): Promise<string[]>;
}
