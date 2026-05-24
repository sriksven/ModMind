import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIResponsesClient } from "../../src/ai/client.js";

describe("OpenAIResponsesClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads output_text from a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ output_text: "hello" })
      }))
    );

    await expect(new OpenAIResponsesClient("key", "model").generate("prompt")).resolves.toBe("hello");
  });

  it("reads nested output text when output_text is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ output: [{ content: [{ text: "nested" }] }] })
      }))
    );

    await expect(new OpenAIResponsesClient("key", "model").generate("prompt")).resolves.toBe("nested");
  });

  it("throws for missing keys, HTTP errors, and empty text", async () => {
    await expect(new OpenAIResponsesClient("", "model").generate("prompt")).rejects.toThrow("Missing OpenAI");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(new OpenAIResponsesClient("key", "model").generate("prompt")).rejects.toThrow("500");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await expect(new OpenAIResponsesClient("key", "model").generate("prompt")).rejects.toThrow("no text");
  });
});
