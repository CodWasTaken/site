type EdgeCache = Pick<Cache, "match" | "put" | "delete">;

export const createNoopEdgeCache = (): EdgeCache => ({
  async match(): Promise<undefined> {
    return undefined;
  },
  async put(): Promise<void> {
    return undefined;
  },
  async delete(): Promise<boolean> {
    return false;
  },
});

export function installVercelRuntimeCompatibility(): void {
  const runtime = globalThis as typeof globalThis & {
    caches?: CacheStorage & { default?: EdgeCache };
  };
  const existing = runtime.caches;
  if (existing?.default) return;

  const defaultCache = createNoopEdgeCache();
  if (existing) {
    Object.defineProperty(existing, "default", {
      configurable: true,
      enumerable: false,
      value: defaultCache,
      writable: false,
    });
    return;
  }

  Object.defineProperty(runtime, "caches", {
    configurable: true,
    enumerable: false,
    value: { default: defaultCache },
    writable: false,
  });
}
