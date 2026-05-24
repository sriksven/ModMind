import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaticAIClient } from "../../../src/ai/client.js";
import { getRules, getTranslatedRules } from "../../../src/storage/subredditRules.js";
import { MemoryStore } from "../../../src/storage/redisAdapter.js";
import { sampleRules } from "../../fixtures/sampleRules.js";

describe("subredditRules", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("fetches and caches rules", async () => {
    const fetchRules = vi.fn(async () => sampleRules);
    expect(await getRules(store, "modmind", fetchRules)).toHaveLength(3);
    expect(await getRules(store, "modmind", fetchRules)).toHaveLength(3);
    expect(fetchRules).toHaveBeenCalledTimes(1);
  });

  it("returns stale cache if refresh fails", async () => {
    const fetchRules = vi.fn(async () => sampleRules);
    await getRules(store, "modmind", fetchRules);
    await store.set("subreddit:modmind:rules", JSON.stringify({ rules: sampleRules, fetchedAt: 0 }));
    const stale = await getRules(store, "modmind", vi.fn(async () => Promise.reject(new Error("fail"))));
    expect(stale).toHaveLength(3);
  });

  it("translates and caches rules", async () => {
    const ai = new StaticAIClient(JSON.stringify([{ id: "1", name: "Sin spam", description: "No publicar spam." }]));
    expect((await getTranslatedRules(store, "modmind", "es", sampleRules, ai))[0].name).toBe("Sin spam");
    expect((await getTranslatedRules(store, "modmind", "es", sampleRules))[0].name).toBe("Sin spam");
  });
});
