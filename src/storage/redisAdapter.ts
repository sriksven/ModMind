import type { KeyValueStore } from "../types.js";

interface StoredValue {
  value: string;
  expiresAt?: number;
}

export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, StoredValue>();

  async get(key: string): Promise<string | undefined> {
    const stored = this.values.get(key);
    if (!stored) return undefined;
    if (stored.expiresAt && stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return stored.value;
  }

  async set(key: string, value: string, options: { ttlSeconds?: number } = {}): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: options.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : undefined
    });
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*")}$`, "u");
    const result: string[] = [];
    for (const key of this.values.keys()) {
      if ((await this.get(key)) !== undefined && regex.test(key)) result.push(key);
    }
    return result;
  }
}

export async function getJson<T>(store: KeyValueStore, key: string): Promise<T | undefined> {
  const raw = await store.get(key);
  if (!raw) return undefined;
  return JSON.parse(raw) as T;
}

export async function setJson<T>(store: KeyValueStore, key: string, value: T, options?: { ttlSeconds?: number }): Promise<void> {
  await store.set(key, JSON.stringify(value), options);
}
