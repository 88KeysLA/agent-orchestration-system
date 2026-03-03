/**
 * Udio Adapter — Villa Romanza Music Platform
 *
 * AI music generation via Udio v1.5 (through udioapi.pro proxy).
 * Generation-only adapter: no search/browse, only prompt-based creation.
 * Generated tracks are downloaded to local storage for Sonos playback.
 */

const { MusicAdapter } = require('./adapter-base');
const fs = require('fs');
const path = require('path');
const os = require('os');

const UDIO_API_BASE = 'https://api.udioapi.pro/api/v1/generate';

class UdioAdapter extends MusicAdapter {
  /**
   * @param {Object} opts
   * @param {string} opts.apiKey - UDIO_API_KEY for udioapi.pro proxy
   * @param {string} [opts.musicDir] - Directory for downloaded tracks
   */
  constructor({ apiKey, musicDir } = {}) {
    super('udio', 'Udio');
    this.apiKey = apiKey || '';
    this.musicDir = musicDir || path.join(os.homedir(), 'generated-music');
  }

  /** @returns {boolean} Whether an API key is configured */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Search is not supported — Udio is generation-only.
   * @returns {Promise<import('./adapter-base').MusicItem[]>}
   */
  async search() {
    return [];
  }

  /**
   * Generate a new track from a text prompt.
   * @param {string} prompt - Description of the music to generate
   * @param {Object} [opts]
   * @param {string} [opts.style] - Musical style/genre hint
   * @param {number} [opts.duration] - Duration in seconds (default 30)
   * @returns {Promise<{jobId: string}>}
   */
  async generate(prompt, { style, duration } = {}) {
    const body = {
      prompt,
      model: 'udio-v1.5',
      duration: duration || 30,
      style: style || '',
    };

    const res = await fetch(UDIO_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`udio: generate failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const jobId = (json.data && (json.data.id || json.data.taskId)) || '';

    if (!jobId) {
      throw new Error('udio: no job ID in response');
    }

    return { jobId };
  }

  /**
   * Check the status of a generation job.
   * @param {string} jobId - Job ID from generate()
   * @returns {Promise<{status: 'processing'|'complete'|'failed', tracks: Array<{title: string, audioUrl: string, imageUrl: string, duration: number}>}>}
   */
  async getJobStatus(jobId) {
    const url = `${UDIO_API_BASE}/status?id=${encodeURIComponent(jobId)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`udio: getJobStatus failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const data = json.data || {};

    let status;
    if (data.status === 'SUCCESS') {
      status = 'complete';
    } else if (data.status === 'PENDING' || data.status === 'PROCESSING') {
      status = 'processing';
    } else {
      status = 'failed';
    }

    const tracks = Array.isArray(data.tracks)
      ? data.tracks.map(t => ({
          title: t.title || '',
          audioUrl: t.audioUrl || t.audio_url || '',
          imageUrl: t.imageUrl || t.image_url || '',
          duration: t.duration || 0,
        }))
      : [];

    return { status, tracks };
  }

  /**
   * Download a generated track to local storage.
   * @param {string} url - Remote MP3 URL
   * @param {string} filename - Local filename (e.g. 'track-001.mp3')
   * @returns {Promise<string>} Local file path
   */
  async downloadTrack(url, filename) {
    if (!fs.existsSync(this.musicDir)) {
      fs.mkdirSync(this.musicDir, { recursive: true });
    }

    const filePath = path.join(this.musicDir, filename);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`udio: download failed (${res.status}): ${url}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return filePath;
  }
}

module.exports = { UdioAdapter };
