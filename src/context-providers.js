/**
 * ContextProvider - Pluggable context sources that influence task routing/execution
 *
 * A context provider is any object with:
 *   async getContext() -> { [key]: value }
 *
 * The ContextManager aggregates all providers and exposes a merged context snapshot.
 * Consumers (orchestrator, agents) can read context to modify behavior.
 *
 * Built-in providers:
 *   StaticProvider   - fixed key/value pairs
 *   TimeProvider     - time of day, day of week, hour
 *   PollingProvider  - fetches from a URL on an interval
 *   ComputedProvider - derives values from other providers
 *
 * Usage:
 *   const ctx = new ContextManager();
 *   ctx.add('time', new TimeProvider());
 *   ctx.add('load', new PollingProvider('http://192.168.0.60:8406/api/status', 30000));
 *   ctx.add('env', new StaticProvider({ region: 'villa', tier: 'production' }));
 *
 *   const snapshot = await ctx.getContext();
 *   // { time: { hour: 14, period: 'afternoon', ... }, load: { agents: 3 }, env: { region: 'villa' } }
 */

class ContextManager {
  constructor() {
    this._providers = new Map(); // name -> provider
    this._cache = new Map();     // name -> { value, ts }
    this._ttl = 5000;            // default cache TTL ms
  }

  add(name, provider, ttl) {
    this._providers.set(name, { provider, ttl: ttl || this._ttl });
    return this;
  }

  remove(name) {
    this._providers.delete(name);
    this._cache.delete(name);
    return this;
  }

  // Get merged context from all providers (cached per TTL)
  async getContext() {
    const result = {};
    await Promise.all(
      Array.from(this._providers.entries()).map(async ([name, { provider, ttl }]) => {
        const cached = this._cache.get(name);
        if (cached && Date.now() - cached.ts < ttl) {
          result[name] = cached.value;
          return;
        }
        try {
          const value = await provider.getContext();
          this._cache.set(name, { value, ts: Date.now() });
          result[name] = value;
        } catch {
          // Use stale cache on error, or skip
          result[name] = cached ? cached.value : null;
        }
      })
    );
    return result;
  }

  // Get a single provider's context
  async get(name) {
    const entry = this._providers.get(name);
    if (!entry) return null;
    const ctx = await this.getContext();
    return ctx[name];
  }

  get providers() {
    return [...this._providers.keys()];
  }

  // Stop all polling providers and clear cache
  shutdown() {
    for (const { provider } of this._providers.values()) {
      if (typeof provider.stop === 'function') provider.stop();
    }
    this._cache.clear();
  }
}

// --- Built-in Providers ---

class StaticProvider {
  constructor(data = {}) { this._data = data; }
  async getContext() { return { ...this._data }; }
  set(key, value) { this._data[key] = value; return this; }
}

class TimeProvider {
  async getContext() {
    const now = new Date();
    const hour = now.getHours();
    return {
      hour,
      minute: now.getMinutes(),
      dayOfWeek: now.getDay(), // 0=Sun
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      period: hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
    };
  }
}

class PollingProvider {
  constructor(url, intervalMs = 30000, transform) {
    this.url = url;
    this.intervalMs = intervalMs;
    this.transform = transform || (data => data);
    this._latest = null;
    this._timer = null;
  }

  async getContext() {
    if (!this._latest) await this._fetch(); // first call is synchronous
    return this._latest;
  }

  start() {
    this._timer = setInterval(() => this._fetch(), this.intervalMs);
    return this;
  }

  stop() {
    clearInterval(this._timer);
    return this;
  }

  async _fetch() {
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      this._latest = this.transform(data);
    } catch {
      // keep stale value
    }
  }
}

class ComputedProvider {
  constructor(deps, computeFn) {
    // deps: ContextManager or plain object of { name: provider }
    this._deps = deps;
    this._computeFn = computeFn; // async (context) => derivedValue
  }

  async getContext() {
    // If deps is a ContextManager, get its context; otherwise resolve plain providers
    const ctx = typeof this._deps.getContext === 'function'
      ? await this._deps.getContext()
      : Object.fromEntries(
          await Promise.all(
            Object.entries(this._deps).map(async ([k, p]) => [k, await p.getContext()])
          )
        );
    return this._computeFn(ctx);
  }
}

module.exports = { ContextManager, StaticProvider, TimeProvider, PollingProvider, ComputedProvider };
