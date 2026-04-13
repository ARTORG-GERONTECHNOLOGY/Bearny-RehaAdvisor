export class SessionCache {
  constructor(private readonly storageKey: string) {}

  get<T = unknown>(cacheKey: string): T | null {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return null;
      const store = JSON.parse(raw) as Record<string, unknown>;
      return (store[cacheKey] as T) ?? null;
    } catch {
      return null;
    }
  }

  set(cacheKey: string, data: unknown): void {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      let store: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(raw ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          store = parsed as Record<string, unknown>;
        }
      } catch {
        /* corrupted — start fresh */
      }

      store[cacheKey] = data;
      sessionStorage.setItem(this.storageKey, JSON.stringify(store));
    } catch {
      /* storage quota — ignore */
    }
  }

  remove(cacheKey: string): void {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return;
      const store = JSON.parse(raw) as Record<string, unknown>;
      delete store[cacheKey];
      sessionStorage.setItem(this.storageKey, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }
}
