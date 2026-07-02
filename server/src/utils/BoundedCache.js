export class BoundedCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return item.data;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  set(key, data, ttlMs) {
    if (this.cache.size >= this.maxSize) {
      // Evict the oldest key (Map keys() iterator is in insertion order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  delete(key) {
    this.cache.delete(key);
  }
}
