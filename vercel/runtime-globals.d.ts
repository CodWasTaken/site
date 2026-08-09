export {};

declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}
