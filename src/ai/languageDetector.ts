import type { AIClient, LanguageDetectionResult } from "../types.js";
import {
  getLanguageDisplayName,
  getScriptForLanguage,
  getSupportedTier,
  isRTL as languageIsRTL,
  normalizeLanguageCode,
  SCRIPT_RANGES
} from "../utils/languageCodes.js";

const SPANISH_HINTS = /\b(el|la|los|las|que|para|porque|gracias|hola|esto|una|con)\b/iu;
const PORTUGUESE_HINTS = /\b(olá|porque|voc[eê]|para|uma|com|não|obrigad[oa])\b/iu;
const FRENCH_HINTS = /\b(bonjour|merci|avec|pour|dans|une|pas|est|les)\b/iu;
const GERMAN_HINTS = /\b(der|die|das|und|nicht|mit|für|ist|ein)\b/iu;
const ENGLISH_HINTS = /\b(the|and|for|that|this|with|from|you|are|post)\b/iu;

export async function detectLanguage(text: string, nativeLanguage?: string, aiClient?: AIClient): Promise<LanguageDetectionResult> {
  const native = normalizeLanguageCode(nativeLanguage);
  if (native !== "unknown") {
    return result(native, 92);
  }

  const cleaned = stripRedditFormatting(text);
  if (!/[A-Za-z\p{Script=Han}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(cleaned)) {
    return result("unknown", 0);
  }

  const heuristic = detectByScript(cleaned) ?? detectLatinLanguage(cleaned);
  if (heuristic) return heuristic;

  if (aiClient) {
    try {
      const aiResponse = await aiClient.generate(
        `Detect the language of this Reddit text. Return only an ISO 639-1 code, or zh-CN when Simplified Chinese. Text: ${cleaned.slice(0, 500)}`,
        { maxTokens: 20, temperature: 0 }
      );
      const code = normalizeLanguageCode(aiResponse.replace(/[^A-Za-z-]/gu, ""));
      return result(code, code === "unknown" ? 20 : 75);
    } catch {
      return result("en", 40);
    }
  }

  return result("en", cleaned.split(/\s+/u).length < 4 ? 45 : 65);
}

export function isRTL(languageCode: string): boolean {
  return languageIsRTL(languageCode);
}

export { getLanguageDisplayName, getSupportedTier };

export function stripRedditFormatting(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*_~`>#]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function detectByScript(text: string): LanguageDetectionResult | null {
  if (SCRIPT_RANGES.arabic.test(text)) return result("ar", 95);
  if (SCRIPT_RANGES.devanagari.test(text)) return result("hi", 95);
  if (SCRIPT_RANGES.korean.test(text)) return result("ko", 95);
  if (/[\u3040-\u30ff]/u.test(text)) return result("ja", 95);
  if (/[\u4e00-\u9fff]/u.test(text)) return result("zh-CN", 88);
  if (SCRIPT_RANGES.cyrillic.test(text)) return result("ru", 80);
  if (SCRIPT_RANGES.hebrew.test(text)) return result("he", 80);
  return null;
}

function detectLatinLanguage(text: string): LanguageDetectionResult | null {
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  const confidence = wordCount < 4 ? 55 : 78;
  if (SPANISH_HINTS.test(text)) return result("es", confidence);
  if (PORTUGUESE_HINTS.test(text)) return result("pt", confidence);
  if (FRENCH_HINTS.test(text)) return result("fr", confidence);
  if (GERMAN_HINTS.test(text)) return result("de", confidence);
  if (ENGLISH_HINTS.test(text)) return result("en", confidence);
  return null;
}

function result(code: string, confidence: number): LanguageDetectionResult {
  const normalized = normalizeLanguageCode(code);
  return {
    detected: normalized,
    confidence,
    script: getScriptForLanguage(normalized),
    isEnglish: normalized === "en"
  };
}
