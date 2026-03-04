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
    // Mantis routes through Villa server (no local server needed)
    if (!this.mcpClient) {
      throw new Error('MCP client not available');
    }

    // If Mantis MCP tools are available, use them
    const service = musicConfig.services.mantis;
    if (service.mcpTools.length > 0) {
      return await this.mcpClient.callTool(service.mcpTools[0], {
        contentId,
        ...options
      });
    }

    // Fallback: route through Villa server
    const MantisAudioClient = require('./mantis-audio-client');
    const mantis = new MantisAudioClient(options.villaUrl || 'http://192.168.0.60:8406');
    
    return await mantis.play({
      url: contentId,
      volume: options.volume || 0.8
    });
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
