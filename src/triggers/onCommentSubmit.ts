import type { AppSettings, ContentItem } from "../types.js";
import { getUserHistory } from "../storage/modHistory.js";
import { DEFAULT_SETTINGS } from "../utils/constants.js";
import { handlePostSubmit, type PipelineResult, type PostPipelineOptions } from "./onPostSubmit.js";

export async function handleCommentSubmit(options: PostPipelineOptions): Promise<PipelineResult> {
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  if (!settings.evaluateComments) return { evaluated: false, duplicate: false, action: "none" };
  if (options.content.parentRemoved) return { evaluated: false, duplicate: false, action: "none" };

  const content: ContentItem = { ...options.content, kind: "comment" };
  const history = await getUserHistory(options.store, content.authorName);
  if ((content.authorAccountAgeDays ?? 0) > 30 && history.flagCount === 0) {
    return { evaluated: false, duplicate: false, action: "none" };
  }

  return handlePostSubmit({ ...options, content });
}
