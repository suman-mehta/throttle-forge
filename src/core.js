export class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = Number(capacity);
    this.refillRate = Number(refillRatePerSec);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec > 0) {
      const addedTokens = elapsedSec * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + addedTokens);
      this.lastRefill = now;
    }
  }

  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        retryAfterMs: 0
      };
    }
    const missingTokens = tokens - this.tokens;
    const retryAfterMs = Math.ceil((missingTokens / this.refillRate) * 1000);
    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      retryAfterMs
    };
  }
}

export class LeakyBucket {
  constructor(capacity, leakRatePerSec) {
    this.capacity = Number(capacity);
    this.leakRate = Number(leakRatePerSec);
    this.water = 0;
    this.lastLeak = Date.now();
  }

  leak() {
    const now = Date.now();
    const elapsedSec = (now - this.lastLeak) / 1000;
    if (elapsedSec > 0) {
      const leaked = elapsedSec * this.leakRate;
      this.water = Math.max(0, this.water - leaked);
      this.lastLeak = now;
    }
  }

  consume(amount = 1) {
    this.leak();
    if (this.water + amount <= this.capacity) {
      this.water += amount;
      const available = Math.max(0, this.capacity - this.water);
      return {
        allowed: true,
        remaining: Math.floor(available),
        retryAfterMs: 0
      };
    }
    const excess = (this.water + amount) - this.capacity;
    const retryAfterMs = Math.ceil((excess / this.leakRate) * 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs
    };
  }
}

export class RateLimiterRegistry {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'token-bucket';
    this.capacity = Number(options.capacity || 10);
    this.rate = Number(options.rate || 5);
    this.ttlMs = Number(options.ttlMs || 60000);
    this.buckets = new Map();

    this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  getBucket(key) {
    let entry = this.buckets.get(key);
    if (!entry) {
      const instance = this.algorithm === 'leaky-bucket'
        ? new LeakyBucket(this.capacity, this.rate)
        : new TokenBucket(this.capacity, this.rate);
      entry = { instance, lastAccess: Date.now() };
      this.buckets.set(key, entry);
    } else {
      entry.lastAccess = Date.now();
    }
    return entry.instance;
  }

  consume(key, amount = 1) {
    const bucket = this.getBucket(key);
    return bucket.consume(amount);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.buckets.entries()) {
      if (now - entry.lastAccess > this.ttlMs) {
        this.buckets.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.buckets.clear();
  }
}
