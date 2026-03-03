/**
 * Suno Adapter — Villa Romanza Music Platform
 *
 * AI music generation via Suno v5 (through sunoapi.org proxy).
 * Generation-only adapter: no search/browse, only prompt-based creation.
 * Generated tracks are downloaded to local storage for Sonos playback.
 */

const { MusicAdapter } = require('./adapter-base');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SUNO_API_BASE = 'https://apibox.erweima.ai/api/v1/generate';

class SunoAdapter extends MusicAdapter {
  /**
   * @param {Object} opts
   * @param {string} opts.apiKey - SUNO_API_KEY for sunoapi.org proxy
   * @param {string} [opts.musicDir] - Directory for downloaded tracks
   */
  constructor({ apiKey, musicDir } = {}) {
    super('suno', 'Suno');
    this.apiKey = apiKey || '';
    this.musicDir = musicDir || path.join(os.homedir(), 'generated-music');
  }

  /** @returns {boolean} Whether an API key is configured */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Search is not supported — Suno is generation-only.
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
   * @param {number} [opts.duration] - Desired duration in seconds
   * @param {boolean} [opts.instrumental] - Instrumental only (no vocals)
   * @returns {Promise<{jobId: string}>}
   */
  async generate(prompt, { style, duration, instrumental } = {}) {
    const body = {
      prompt,
      style: style || undefined,
      title: prompt.substring(0, 80),
      customMode: !!style,
      instrumental: !!instrumental,
      model: 'V4',
    };

    const res = await fetch(SUNO_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`suno: generate failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const taskId = json.data && json.data.taskId;

    if (!taskId) {
      throw new Error('suno: no taskId in response');
    }

    return { jobId: taskId };
  }

  /**
   * Check the status of a generation job.
   * @param {string} jobId - Task ID from generate()
   * @returns {Promise<{status: 'processing'|'complete'|'failed', tracks: Array<{title: string, audioUrl: string, imageUrl: string, duration: number}>}>}
   */
  async getJobStatus(jobId) {
    const url = `${SUNO_API_BASE}/record-info?taskId=${encodeURIComponent(jobId)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`suno: getJobStatus failed (${res.status}): ${text}`);
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
      throw new Error(`suno: download failed (${res.status}): ${url}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return filePath;
  }
}

module.exports = { SunoAdapter };
