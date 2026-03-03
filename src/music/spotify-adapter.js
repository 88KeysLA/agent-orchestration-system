/**
 * Spotify Web API Adapter — Villa Romanza Music Platform
 *
 * Client Credentials auth flow for search and metadata.
 * Env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 * Zero external dependencies — uses native fetch.
 */

const { MusicAdapter } = require('./adapter-base');

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_REFRESH_MARGIN_S = 60;

class SpotifyAdapter extends MusicAdapter {
  constructor() {
    super('spotify', 'Spotify');
    this._accessToken = null;
    this._tokenExpiresAt = 0; // epoch seconds
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  /**
   * Returns true when both credential env vars are present.
   * @returns {boolean}
   */
  isAvailable() {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  }

  /**
   * Obtain or refresh the Client Credentials access token.
   * Automatically called before every API request.
   * @returns {Promise<string>} access token
   */
  async _ensureToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this._accessToken && now < this._tokenExpiresAt - TOKEN_REFRESH_MARGIN_S) {
      return this._accessToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('spotify: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`spotify: token request failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    this._accessToken = data.access_token;
    this._tokenExpiresAt = now + (data.expires_in || 3600);
    return this._accessToken;
  }

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  /**
   * Authenticated GET against the Spotify Web API.
   * @param {string} path - API path (e.g. '/search')
   * @param {Record<string, string>} params - Query parameters
   * @returns {Promise<Object>} parsed JSON body
   */
  async _apiGet(path, params = {}) {
    const token = await this._ensureToken();
    const qs = new URLSearchParams(params).toString();
    const url = `${API_BASE}${path}${qs ? '?' + qs : ''}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`spotify: API ${path} failed (${res.status}): ${text}`);
    }

    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * Map a Spotify track object to a MusicItem.
   * @param {Object} track - Spotify track object
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapTrack(track) {
    return this.createItem({
      id: track.id,
      title: track.name,
      artist: track.artists?.[0]?.name || 'Unknown',
      album: track.album?.name || '',
      albumArt: track.album?.images?.[0]?.url || '',
      duration: Math.round((track.duration_ms || 0) / 1000),
      uri: track.uri,
      type: 'track',
      playable: true,
    });
  }

  /**
   * Map a Spotify album object to a MusicItem.
   * @param {Object} album - Spotify simplified album object
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapAlbum(album) {
    return this.createItem({
      id: album.id,
      title: album.name,
      artist: album.artists?.[0]?.name || 'Unknown',
      album: album.name,
      albumArt: album.images?.[0]?.url || '',
      duration: 0,
      uri: album.uri,
      type: 'album',
      playable: true,
    });
  }

  /**
   * Map a Spotify playlist object to a MusicItem.
   * @param {Object} playlist - Spotify simplified playlist object
   * @returns {import('./adapter-base').MusicItem}
   */
  _mapPlaylist(playlist) {
    return this.createItem({
      id: playlist.id,
      title: playlist.name,
      artist: playlist.owner?.display_name || 'Unknown',
      album: '',
      albumArt: playlist.images?.[0]?.url || '',
      duration: 0,
      uri: playlist.uri,
      type: 'playlist',
      playable: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  /**
   * Search the Spotify catalog.
   * @param {string} query - Search query
   * @param {Object} [opts]
   * @param {number} [opts.limit=20] - Max results per type
   * @param {string} [opts.type] - Comma-separated types: track, album, playlist
   * @returns {Promise<import('./adapter-base').MusicItem[]>}
   */
  async search(query, opts = {}) {
    if (!query) return [];

    const limit = opts.limit || 20;
    const type = opts.type || 'track,album,playlist';

    try {
      const data = await this._apiGet('/search', {
        q: query,
        type,
        limit: String(limit),
      });

      const results = [];

      if (data.tracks?.items) {
        for (const track of data.tracks.items) {
          results.push(this._mapTrack(track));
        }
      }

      if (data.albums?.items) {
        for (const album of data.albums.items) {
          results.push(this._mapAlbum(album));
        }
      }

      if (data.playlists?.items) {
        for (const playlist of data.playlists.items) {
          if (playlist) results.push(this._mapPlaylist(playlist));
        }
      }

      return results;
    } catch (err) {
      throw new Error(`spotify: search failed: ${err.message}`);
    }
  }

  /**
   * Get playback info for a Spotify track.
   * @param {string} itemId - Spotify track ID
   * @returns {Promise<{contentType: string, contentId: string, metadata?: Object}>}
   */
  async getPlaybackInfo(itemId) {
    if (!itemId) {
      throw new Error('spotify: getPlaybackInfo requires an itemId');
    }

    try {
      const data = await this._apiGet(`/tracks/${itemId}`);
      return {
        contentType: 'music',
        contentId: `spotify:track:${itemId}`,
        metadata: {
          title: data.name,
          artist: data.artists?.[0]?.name || 'Unknown',
          album: data.album?.name || '',
          albumArt: data.album?.images?.[0]?.url || '',
          duration: Math.round((data.duration_ms || 0) / 1000),
        },
      };
    } catch (err) {
      throw new Error(`spotify: getPlaybackInfo failed for ${itemId}: ${err.message}`);
    }
  }
}

module.exports = { SpotifyAdapter };
