/**
 * Unified Music Service — Villa Romanza Music Platform
 *
 * Aggregates all music adapters (Spotify, Apple Music, Amazon, AI generators)
 * into a single search/play interface for the Portal.
 */

class UnifiedMusicService {
  constructor() {
    /** @type {Map<string, import('./adapter-base').MusicAdapter>} */
    this.adapters = new Map();
    /** @type {Map<string, Object>} generators (Suno, Udio, etc.) */
    this.generators = new Map();
  }

  /**
   * Register a search/playback adapter
   * @param {import('./adapter-base').MusicAdapter} adapter
   */
  registerAdapter(adapter) {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Register an AI generation adapter
   * @param {import('./adapter-base').MusicAdapter} adapter
   */
  registerGenerator(adapter) {
    this.generators.set(adapter.name, adapter);
  }

  /**
   * List available services with status
   * @returns {{ services: Array<{ name: string, displayName: string, available: boolean, type: string }> }}
   */
  getAvailableServices() {
    const services = [];
    for (const [, adapter] of this.adapters) {
      services.push({
        name: adapter.name,
        displayName: adapter.displayName,
        available: adapter.isAvailable(),
        type: 'streaming',
      });
    }
    for (const [, gen] of this.generators) {
      services.push({
        name: gen.name,
        displayName: gen.displayName,
        available: gen.isAvailable(),
        type: 'generation',
      });
    }
    return { services };
  }

  /**
   * Search a single service
   * @param {string} serviceName
   * @param {string} query
   * @param {Object} [opts]
   * @returns {Promise<{ service: string, results: import('./adapter-base').MusicItem[] }>}
   */
  async search(serviceName, query, opts = {}) {
    const adapter = this.adapters.get(serviceName);
    if (!adapter) throw new Error(`Unknown service: ${serviceName}`);
    if (!adapter.isAvailable()) throw new Error(`${serviceName} is not available`);
    const results = await adapter.search(query, opts);
    return { service: serviceName, results };
  }

  /**
   * Search all available services in parallel
   * @param {string} query
   * @param {Object} [opts]
   * @returns {Promise<{ results: Object<string, import('./adapter-base').MusicItem[]>, errors: Object<string, string> }>}
   */
  async searchAll(query, opts = {}) {
    const results = {};
    const errors = {};
    const available = [...this.adapters.values()].filter(a => a.isAvailable());

    const settled = await Promise.allSettled(
      available.map(async (adapter) => {
        const items = await adapter.search(query, opts);
        return { name: adapter.name, items };
      })
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results[result.value.name] = result.value.items;
      } else {
        const name = result.reason?.adapter || 'unknown';
        errors[name] = result.reason?.message || 'Search failed';
      }
    }

    return { results, errors };
  }

  /**
   * Get playback info for a specific item on a specific service
   * @param {string} serviceName
   * @param {string} itemId
   * @returns {Promise<{ contentType: string, contentId: string }>}
   */
  async getPlaybackInfo(serviceName, itemId) {
    const adapter = this.adapters.get(serviceName);
    if (!adapter) throw new Error(`Unknown service: ${serviceName}`);
    return adapter.getPlaybackInfo(itemId);
  }

  /**
   * Get a generator adapter by name
   * @param {string} name
   * @returns {Object|undefined}
   */
  getGenerator(name) {
    return this.generators.get(name);
  }

  /**
   * List available generators
   * @returns {Array<{ name: string, displayName: string, available: boolean }>}
   */
  getAvailableGenerators() {
    return [...this.generators.values()].map(g => ({
      name: g.name,
      displayName: g.displayName,
      available: g.isAvailable(),
    }));
  }
}

module.exports = { UnifiedMusicService };
