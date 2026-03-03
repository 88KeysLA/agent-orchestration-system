/**
 * Amazon AI Adapter — Villa Romanza Music Platform
 *
 * Placeholder stub for Amazon's forthcoming AI music generation service.
 * Currently unavailable. Will be implemented when the API becomes accessible.
 */

const { MusicAdapter } = require('./adapter-base');

class AmazonAIAdapter extends MusicAdapter {
  constructor() {
    super('amazon_ai', 'Amazon AI');
  }

  /** @returns {boolean} Not yet available */
  isAvailable() {
    return false;
  }

  /** @returns {Promise<import('./adapter-base').MusicItem[]>} */
  async search() {
    return [];
  }

  /** @returns {Promise<{jobId: string}>} */
  async generate() {
    return {};
  }

  /** @returns {Promise<{contentType: string, contentId: string}>} */
  async getPlaybackInfo() {
    throw new Error('amazon_ai: not yet available');
  }
}

module.exports = { AmazonAIAdapter };
