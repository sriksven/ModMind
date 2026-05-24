import { beforeEach, describe, expect, it } from "vitest";
import { getDigestState, isDigestEnabled, updateDigestState } from "../../../src/storage/digestState.js";
import { MemoryStore } from "../../../src/storage/redisAdapter.js";

describe("digestState", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("defaults enabled and persists updates", async () => {
    expect(await isDigestEnabled(store, "modmind")).toBe(true);
    await updateDigestState(store, "modmind", { enabled: false, lastRun: 123, lastPostId: "abc" });
    expect(await getDigestState(store, "modmind")).toMatchObject({ enabled: false, lastRun: 123, lastPostId: "abc" });
  });
});
