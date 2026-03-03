/**
 * Music Adapter Base — Villa Romanza Music Platform
 *
 * Base class for all music service adapters (Spotify, Apple Music, Amazon, AI generators).
 * Defines the MusicItem schema and adapter interface.
 */

/**
 * @typedef {Object} MusicItem
 * @property {string} id - Unique identifier (service-specific)
 * @property {string} title - Track/album/playlist name
 * @property {string} artist - Artist name
 * @property {string} [album] - Album name
 * @property {string} [albumArt] - Album art URL
 * @property {'track'|'album'|'playlist'|'station'|'generated'} type - Item type
 * @property {number} [duration] - Duration in seconds
 * @property {string} service - Service name (spotify, apple_music, amazon, suno, udio)
 * @property {string} uri - Playback URI for Sonos
 * @property {boolean} playable - Whether item can be played directly
 */

class MusicAdapter {
  /**
   * @param {string} name - Machine name (e.g. 'spotify')
   * @param {string} displayName - Human name (e.g. 'Spotify')
   */
  constructor(name, displayName) {
    this.name = name;
    this.displayName = displayName;
  }

  /** @returns {boolean} Whether this adapter is configured and available */
  isAvailable() {
    return false;
  }

  /**
   * Search for music items
   * @param {string} query - Search query
   * @param {Object} [opts]
   * @param {number} [opts.limit=20] - Max results
   * @param {string} [opts.type] - Filter by type (track, album, playlist)
   * @returns {Promise<MusicItem[]>}
   */
  async search(query, opts = {}) {
    throw new Error(`${this.name}: search() not implemented`);
  }

  /**
   * Get playback info for a specific item
   * @param {string} itemId - Service-specific item ID
   * @returns {Promise<{contentType: string, contentId: string, metadata?: Object}>}
   */
  async getPlaybackInfo(itemId) {
    throw new Error(`${this.name}: getPlaybackInfo() not implemented`);
  }

  /**
   * Create a MusicItem from raw data
   * @param {Object} raw
   * @returns {MusicItem}
   */
  createItem(raw) {
    return {
      id: raw.id || '',
      title: raw.title || 'Unknown',
      artist: raw.artist || 'Unknown',
      album: raw.album || '',
      albumArt: raw.albumArt || '',
      type: raw.type || 'track',
      duration: raw.duration || 0,
      service: this.name,
      uri: raw.uri || '',
      playable: raw.playable !== false,
    };
  }
}

module.exports = { MusicAdapter };
