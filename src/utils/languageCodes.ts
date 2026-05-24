import { FULL_SUPPORT_LANGUAGE_CODES } from "./constants.js";

export type SupportedTier = "full" | "fallback" | "unknown";

export interface LanguageInfo {
  code: string;
  name: string;
  script: string;
  rtl?: boolean;
  tier: SupportedTier;
}

export const LANGUAGE_INFO: Record<string, LanguageInfo> = {
  en: { code: "en", name: "English", script: "latin", tier: "full" },
  es: { code: "es", name: "Spanish", script: "latin", tier: "full" },
  pt: { code: "pt", name: "Portuguese", script: "latin", tier: "full" },
  fr: { code: "fr", name: "French", script: "latin", tier: "full" },
  de: { code: "de", name: "German", script: "latin", tier: "full" },
  it: { code: "it", name: "Italian", script: "latin", tier: "full" },
  nl: { code: "nl", name: "Dutch", script: "latin", tier: "full" },
  pl: { code: "pl", name: "Polish", script: "latin", tier: "full" },
  ru: { code: "ru", name: "Russian", script: "cyrillic", tier: "full" },
  ja: { code: "ja", name: "Japanese", script: "cjk", tier: "full" },
  ko: { code: "ko", name: "Korean", script: "cjk", tier: "full" },
  "zh-CN": { code: "zh-CN", name: "Chinese Simplified", script: "cjk", tier: "full" },
  ar: { code: "ar", name: "Arabic", script: "arabic", rtl: true, tier: "full" },
  hi: { code: "hi", name: "Hindi", script: "devanagari", tier: "full" },
  tr: { code: "tr", name: "Turkish", script: "latin", tier: "full" },
  sv: { code: "sv", name: "Swedish", script: "latin", tier: "full" },
  he: { code: "he", name: "Hebrew", script: "hebrew", rtl: true, tier: "fallback" },
  fa: { code: "fa", name: "Persian", script: "arabic", rtl: true, tier: "fallback" },
  ur: { code: "ur", name: "Urdu", script: "arabic", rtl: true, tier: "fallback" },
  uk: { code: "uk", name: "Ukrainian", script: "cyrillic", tier: "fallback" }
};

export const SCRIPT_RANGES = {
  arabic: /[\u0600-\u06FF]/u,
  cyrillic: /[\u0400-\u04FF]/u,
  devanagari: /[\u0900-\u097F]/u,
  cjk: /[\u3040-\u30ff\u3400-\u9fff]/u,
  korean: /[\uac00-\ud7af]/u,
  hebrew: /[\u0590-\u05FF]/u
};

export function getLanguageDisplayName(languageCode: string): string {
  return LANGUAGE_INFO[languageCode]?.name ?? languageCode;
}

export function isRTL(languageCode: string): boolean {
  return Boolean(LANGUAGE_INFO[languageCode]?.rtl);
}

export function getSupportedTier(languageCode: string): SupportedTier {
  if (FULL_SUPPORT_LANGUAGE_CODES.includes(languageCode)) return "full";
  if (LANGUAGE_INFO[languageCode]) return LANGUAGE_INFO[languageCode].tier;
  return languageCode === "unknown" ? "unknown" : "fallback";
}

export function getScriptForLanguage(languageCode: string): string {
  return LANGUAGE_INFO[languageCode]?.script ?? "unknown";
}

export function normalizeLanguageCode(code?: string): string {
  if (!code) return "unknown";
  const normalized = code.trim();
  if (normalized.toLowerCase() === "zh-cn" || normalized.toLowerCase() === "zh") return "zh-CN";
  return normalized.toLowerCase();
}
