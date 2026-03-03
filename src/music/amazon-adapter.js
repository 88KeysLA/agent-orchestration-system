/**
 * Amazon Music Adapter — Villa Romanza Music Platform
 *
 * Provides Amazon Music playback via Sonos favorites catalog.
 * Catalog entries come from audio_sources.yaml (pre-loaded at startup).
 * Each entry maps to a Sonos favorite URI for direct playback.
 */

const { MusicAdapter } = require('./adapter-base');

class AmazonAdapter extends MusicAdapter {
  /**
   * @param {Object} opts
   * @param {Array<{name: string, source_type: string, uri: string, mood: string, tags: string[]}>} opts.catalog
   *   Array of audio source entries from audio_sources.yaml
   */
  constructor({ catalog = [] } = {}) {
    super('amazon', 'Amazon Music');
    this.catalog = catalog;
  }

  /** @returns {boolean} Always true — local catalog is always available */
  isAvailable() {
    return true;
  }

  /**
   * Search the catalog by name, tags, and mood fields (case-insensitive).
   * @param {string} query - Search query
   * @param {Object} [opts]
   * @param {number} [opts.limit=20] - Max results
   * @returns {Promise<import('./adapter-base').MusicItem[]>}
   */
  async search(query, opts = {}) {
    const limit = opts.limit || 20;
    const q = query.toLowerCase();

    const matches = [];

    for (let i = 0; i < this.catalog.length; i++) {
      const entry = this.catalog[i];

      const nameMatch = (entry.name || '').toLowerCase().includes(q);
      const moodMatch = (entry.mood || '').toLowerCase().includes(q);
      const tagsMatch = Array.isArray(entry.tags)
        && entry.tags.some(t => t.toLowerCase().includes(q));

      if (nameMatch || moodMatch || tagsMatch) {
        matches.push(this.createItem({
          id: String(i),
          title: entry.name,
          artist: entry.source_type || 'amazon',
          type: 'station',
          uri: entry.uri || '',
          playable: true,
        }));
      }

      if (matches.length >= limit) break;
    }

    return matches;
  }

  /**
   * Get playback info for a catalog item by index.
   * Items with 'FV:' URIs are Sonos favorite_item_id references;
   * all others are treated as generic music URIs.
   * @param {string} itemId - Catalog index as string
   * @returns {Promise<{contentType: string, contentId: string}>}
   */
  async getPlaybackInfo(itemId) {
    const idx = parseInt(itemId, 10);
    const entry = this.catalog[idx];

    if (!entry) {
      throw new Error(`amazon: catalog item ${itemId} not found`);
    }

    const uri = entry.uri || '';

    if (uri.startsWith('FV:')) {
      return { contentType: 'favorite_item_id', contentId: uri };
    }

    return { contentType: 'music', contentId: uri };
  }
}

module.exports = { AmazonAdapter };
