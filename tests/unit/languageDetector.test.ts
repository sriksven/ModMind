import { describe, expect, it } from "vitest";
import { detectLanguage, getSupportedTier, isRTL, stripRedditFormatting } from "../../src/ai/languageDetector.js";
import { sampleLanguages } from "../fixtures/sampleLanguages.js";

describe("languageDetector", () => {
  it("detects major non-Latin scripts", async () => {
    expect(await detectLanguage(sampleLanguages.ar)).toMatchObject({ detected: "ar", script: "arabic", isEnglish: false });
    expect(await detectLanguage(sampleLanguages.ja)).toMatchObject({ detected: "ja", script: "cjk" });
    expect(await detectLanguage(sampleLanguages.ko)).toMatchObject({ detected: "ko", script: "cjk" });
    expect(await detectLanguage(sampleLanguages.zh)).toMatchObject({ detected: "zh-CN", script: "cjk" });
    expect(await detectLanguage(sampleLanguages.ru)).toMatchObject({ detected: "ru", script: "cyrillic" });
    expect(await detectLanguage(sampleLanguages.hi)).toMatchObject({ detected: "hi", script: "devanagari" });
  });

  it("detects English and Spanish Latin text", async () => {
    expect(await detectLanguage(sampleLanguages.es)).toMatchObject({ detected: "es" });
    expect(await detectLanguage(sampleLanguages.en)).toMatchObject({ detected: "en", isEnglish: true });
  });

  it("handles short and emoji-only posts", async () => {
    expect((await detectLanguage("hola")).confidence).toBeLessThan(60);
    expect(await detectLanguage("😀🔥")).toMatchObject({ detected: "unknown", confidence: 0 });
  });

  it("strips Reddit formatting before detection", () => {
    expect(stripRedditFormatting("**Hola** [mundo](https://example.com)")).toBe("Hola mundo");
  });

  it("reports tiers and RTL languages", () => {
    expect(getSupportedTier("es")).toBe("full");
    expect(getSupportedTier("he")).toBe("fallback");
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("en")).toBe(false);
  });
});
