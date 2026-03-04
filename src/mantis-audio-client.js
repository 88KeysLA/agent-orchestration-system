/**
 * Mantis Audio Integration for Villa
 * Direct audio streaming with hi-fi/Atmos support
 */

const VillaClient = require('./villa-client');

class MantisAudioClient {
  constructor(villaUrl = 'http://192.168.0.60:8406') {
    this.villaUrl = villaUrl.replace(/\/$/, '');
    this.villa = new VillaClient(villaUrl);
  }

  async play(options = {}) {
    const { url, file, volume = 0.8, codec, bitrate, spatialAudio } = options;
    
    if (!url && !file) {
      throw new Error('Either url or file must be provided');
    }

    // Use direct audio streaming API for hi-fi/Atmos
    return this._streamAudio({
      url: url || file,
      volume,
      codec,           // 'atmos', 'flac', 'aac', 'mp3'
      bitrate,         // 320, 1411, etc.
      spatialAudio     // true/false
    });
  }

  async pause() {
    return this._fetch('/api/audio/stream/pause', { method: 'POST' });
  }

  async resume() {
    return this._fetch('/api/audio/stream/resume', { method: 'POST' });
  }

  async stop() {
    return this._fetch('/api/audio/stream/stop', { method: 'POST' });
  }

  async setVolume(volume) {
    return this._fetch('/api/audio/stream/volume', {
      method: 'POST',
      body: JSON.stringify({ volume })
    });
  }

  async getStatus() {
    return this._fetch('/api/audio/stream/status');
  }

  async _streamAudio(params) {
    return this._fetch('/api/audio/stream', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  async _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const res = await fetch(`${this.villaUrl}${path}`, {
      ...options,
      headers
    });
    if (!res.ok) throw new Error(`Villa audio API error: ${res.status}`);
    return res.json();
  }
}

module.exports = MantisAudioClient;
