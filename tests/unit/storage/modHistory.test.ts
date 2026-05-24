import { beforeEach, describe, expect, it } from "vitest";
import { getUserHistory, logAction, logOverride } from "../../../src/storage/modHistory.js";
import { MemoryStore } from "../../../src/storage/redisAdapter.js";

describe("modHistory", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns empty history for new users", async () => {
    await expect(getUserHistory(store, "alice")).resolves.toMatchObject({ username: "alice", flagCount: 0, actions: [] });
  });

  it("logs actions with FIFO cap", async () => {
    for (let index = 0; index < 21; index += 1) {
      await logAction(store, "alice", `p${index}`, "remove");
    }
    const history = await getUserHistory(store, "alice");
    expect(history.flagCount).toBe(21);
    expect(history.actions).toHaveLength(20);
    expect(history.actions[0].postId).toBe("p1");
  });

  it("logs overrides without incrementing flag count", async () => {
    await logAction(store, "alice", "p1", "remove");
    await logOverride(store, "alice", "p1", "approve", "remove");
    const history = await getUserHistory(store, "alice");
    expect(history.flagCount).toBe(1);
    expect(history.actions[1].aiSuggestion).toBe("remove");
  });
});
