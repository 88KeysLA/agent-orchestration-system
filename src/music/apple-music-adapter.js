/**
 * Apple Music Adapter — Villa Romanza Music Platform
 *
 * MusicKit API adapter using JWT (ES256) authentication.
 * Zero dependencies — uses only Node.js built-in crypto and https modules.
 *
 * Required env vars:
 *   APPLE_MUSIC_KEY_ID      — Key ID from Apple Developer portal
 *   APPLE_MUSIC_TEAM_ID     — Team ID from Apple Developer portal
 *   APPLE_MUSIC_PRIVATE_KEY — ES256 private key (PEM format, can include \n literals)
 */

const crypto = require('crypto');
const https = require('https');
const { MusicAdapter } = require('./adapter-base');

const API_BASE = 'https://api.music.apple.com';
const TOKEN_TTL_SECONDS = 15777000; // ~6 months (Apple max)
const TOKEN_CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours — regenerate well before expiry

class AppleMusicAdapter extends MusicAdapter {
  constructor() {
    super('apple_music', 'Apple Music');
    this._cachedToken = null;
    this._tokenExpiry = 0;
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  /**
   * Build a base64url string from a Buffer or string.
   * @param {Buffer|string} input
   * @returns {string}
   */
  _base64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf.toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Generate an ES256 JWT for the MusicKit API.
   * @returns {string} Signed JWT
   */
  _generateToken() {
    const keyId = process.env.APPLE_MUSIC_KEY_ID;
    const teamId = process.env.APPLE_MUSIC_TEAM_ID;
    let privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

    if (!keyId || !teamId || !privateKey) {
      throw new Error('apple_music: missing APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID, or APPLE_MUSIC_PRIVATE_KEY');
    }

    // Support env vars where newlines are stored as literal \n
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: 'ES256',
      kid: keyId,
    };

    const payload = {
      iss: teamId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    };

    const headerB64 = this._base64url(JSON.stringify(header));
    const payloadB64 = this._base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = crypto.sign(
      'sha256',
      Buffer.from(signingInput),
      { key: privateKey, dsaEncoding: 'ieee-p1363' },
    );

    return `${signingInput}.${this._base64url(signature)}`;
  }

  /**
   * Return a valid developer token, using a cached value when possible.
   * Token is regenerated every 12 hours even though it is valid for ~6 months,
   * keeping the window for clock-skew or revocation small.
   * @returns {string}
   */
  _getToken() {
    const now = Date.now();
    if (this._cachedToken && now < this._tokenExpiry) {
      return this._cachedToken;
    }
    this._cachedToken = this._generateToken();
    this._tokenExpiry = now + TOKEN_CACHE_MS;
    return this._cachedToken;
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  /**
   * Make an authenticated GET request to the Apple Music API.
   * @param {string} path - API path (e.g. /v1/catalog/us/search)
   * @param {Record<string,string>} params - Query params
   * @returns {Promise<Object>} Parsed JSON response
   */
  _request(path, params = {}) {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams(params).toString();
      const fullPath = qs ? `${path}?${qs}` : path;

      const options = {
        hostname: 'api.music.apple.com',
        path: fullPath,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this._getToken()}`,
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`apple_music: API ${res.statusCode} — ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`apple_music: failed to parse response — ${err.message}`));
          }
        });
      });

      req.on('error', (err) => reject(new Error(`apple_music: request failed — ${err.message}`)));
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('apple_music: request timed out (10s)'));
      });
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve an Apple Music artwork URL template to a concrete 300x300 URL.
   * @param {Object} [artwork]
   * @returns {string}
   */
  _artworkUrl(artwork) {
    if (!artwork || !artwork.url) return '';
    return artwork.url.replace('{w}', '300').replace('{h}', '300');
  }

  /**
   * Map a song resource to a MusicItem.
   * @param {Object} song - Apple Music song resource
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapSong(song) {
    const a = song.attributes || {};
    return this.createItem({
      id: song.id,
      title: a.name || 'Unknown',
      artist: a.artistName || 'Unknown',
      album: a.albumName || '',
      albumArt: this._artworkUrl(a.artwork),
      duration: a.durationInMillis ? Math.round(a.durationInMillis / 1000) : 0,
      uri: a.url || '',
      type: 'track',
    });
  }

  /**
   * Map an album resource to a MusicItem.
   * @param {Object} album - Apple Music album resource
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapAlbum(album) {
    const a = album.attributes || {};
    return this.createItem({
      id: album.id,
      title: a.name || 'Unknown',
      artist: a.artistName || 'Unknown',
      album: a.name || '',
      albumArt: this._artworkUrl(a.artwork),
      duration: 0,
      uri: a.url || '',
      type: 'album',
    });
  }

  /**
   * Map a playlist resource to a MusicItem.
   * @param {Object} playlist - Apple Music playlist resource
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapPlaylist(playlist) {
    const a = playlist.attributes || {};
    return this.createItem({
      id: playlist.id,
      title: a.name || 'Unknown',
      artist: a.curatorName || 'Apple Music',
      album: '',
      albumArt: this._artworkUrl(a.artwork),
      duration: 0,
      uri: a.url || '',
      type: 'playlist',
    });
  }

  // ---------------------------------------------------------------------------
  // Public API (MusicAdapter interface)
  // ---------------------------------------------------------------------------

  /** @returns {boolean} */
  isAvailable() {
    return !!(
      process.env.APPLE_MUSIC_KEY_ID &&
      process.env.APPLE_MUSIC_TEAM_ID &&
      process.env.APPLE_MUSIC_PRIVATE_KEY
    );
  }

  /**
   * Search Apple Music catalog.
   * @param {string} query
   * @param {Object} [opts]
   * @param {number} [opts.limit=20]
   * @param {string} [opts.type] - 'track', 'album', or 'playlist' (maps to Apple types)
   * @returns {Promise<MusicItem[]>}
   */
  async search(query, opts = {}) {
    if (!query) return [];

    const limit = opts.limit || 20;

    // Map generic type filter to Apple Music types
    const typeMap = {
      track: 'songs',
      album: 'albums',
      playlist: 'playlists',
    };
    const types = opts.type && typeMap[opts.type]
      ? typeMap[opts.type]
      : 'songs,albums,playlists';

    const data = await this._request('/v1/catalog/us/search', {
      term: query,
      types,
      limit: String(limit),
    });

    const results = [];

    if (data.results) {
      // Songs
      if (data.results.songs && data.results.songs.data) {
        for (const song of data.results.songs.data) {
          results.push(this._mapSong(song));
        }
      }

      // Albums
      if (data.results.albums && data.results.albums.data) {
        for (const album of data.results.albums.data) {
          results.push(this._mapAlbum(album));
        }
      }

      // Playlists
      if (data.results.playlists && data.results.playlists.data) {
        for (const playlist of data.results.playlists.data) {
          results.push(this._mapPlaylist(playlist));
        }
      }
    }

    return results;
  }

  /**
   * Get playback info for a song by its Apple Music ID.
   * @param {string} itemId
   * @returns {Promise<{contentType: string, contentId: string, metadata?: Object}>}
   */
  async getPlaybackInfo(itemId) {
    if (!itemId) {
      throw new Error('apple_music: getPlaybackInfo() requires an itemId');
    }

    return {
      contentType: 'music',
      contentId: `https://music.apple.com/us/song/${itemId}`,
    };
  }
}

module.exports = { AppleMusicAdapter };
