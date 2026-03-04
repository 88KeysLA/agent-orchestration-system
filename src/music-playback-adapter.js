/**
 * Music Playback Adapter
 * Unified interface for playing audio across different music services
 */

const musicConfig = require('./music-service-config');

class MusicPlaybackAdapter {
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
  }

  async play(contentId, options = {}) {
    const service = musicConfig.getActiveService();
    if (!service) {
      throw new Error('No active music service configured');
    }

    switch (musicConfig.activeService) {
      case 'amazonMusic':
        return this.playAmazonMusic(contentId, options);
      case 'mantis':
        return this.playMantis(contentId, options);
      default:
        throw new Error(`Playback not implemented for ${service.name}`);
    }
  }

  async playAmazonMusic(contentId, options) {
    if (!this.mcpClient) {
      throw new Error('MCP client not available');
    }

    const params = {
      contentId,
      contentType: options.contentType || 'track'
    };

    return await this.mcpClient.callTool('initiate_alexa_playback', params);
  }

  async playMantis(contentId, options) {
    // Mantis MCP integration
    if (!this.mcpClient) {
      throw new Error('MCP client not available');
    }

    // TODO: Implement Mantis-specific playback when MCP tools are available
    throw new Error('Mantis playback not yet implemented');
  }

  async search(query, options = {}) {
    const service = musicConfig.getActiveService();
    if (!service) {
      throw new Error('No active music service configured');
    }

    if (!musicConfig.hasCapability('search')) {
      throw new Error(`${service.name} does not support search`);
    }

    switch (musicConfig.activeService) {
      case 'amazonMusic':
        return this.searchAmazonMusic(query, options);
      default:
        throw new Error(`Search not implemented for ${service.name}`);
    }
  }

  async searchAmazonMusic(query, options) {
    if (!this.mcpClient) {
      throw new Error('MCP client not available');
    }

    const params = {
      searchQueries: [{
        searchText: query,
        types: options.types || ['track', 'album', 'artist'],
        limit: options.limit || 10
      }]
    };

    return await this.mcpClient.callTool('search', params);
  }

  getServiceInfo() {
    return {
      active: musicConfig.activeService,
      service: musicConfig.getActiveService(),
      available: musicConfig.getAvailableServices()
    };
  }
}

module.exports = MusicPlaybackAdapter;
