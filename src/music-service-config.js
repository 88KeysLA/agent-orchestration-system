/**
 * Music Service Configuration
 * Manages multiple music streaming services (Amazon Music, Spotify, etc.)
 */

class MusicServiceConfig {
  constructor() {
    this.services = {
      mantis: {
        name: 'Mantis',
        enabled: false,
        priority: 1,
        capabilities: ['playback', 'audio_control', 'local_audio'],
        mcpTools: [] // To be populated when Mantis MCP is available
      },
      amazonMusic: {
        name: 'Amazon Music',
        enabled: false,
        priority: 2,
        capabilities: ['playback', 'search', 'playlists', 'recommendations'],
        mcpTools: [
          'initiate_alexa_playback',
          'search',
          'get_track',
          'get_album',
          'get_artist',
          'get_playlist',
          'create_playlist',
          'get_user_playlists'
        ]
      },
      spotify: {
        name: 'Spotify',
        enabled: false,
        priority: 3,
        capabilities: ['playback', 'search', 'playlists'],
        mcpTools: [] // Future integration
      }
    };
    
    this.activeService = null;
  }

  setActiveService(serviceName) {
    if (!this.services[serviceName]) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    if (!this.services[serviceName].enabled) {
      throw new Error(`Service not enabled: ${serviceName}`);
    }
    this.activeService = serviceName;
    return this.services[serviceName];
  }

  enableService(serviceName) {
    if (!this.services[serviceName]) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    this.services[serviceName].enabled = true;
    if (!this.activeService) {
      this.activeService = serviceName;
    }
  }

  getActiveService() {
    return this.activeService ? this.services[this.activeService] : null;
  }

  getAvailableServices() {
    return Object.entries(this.services)
      .filter(([_, config]) => config.enabled)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name, config]) => ({ name, ...config }));
  }

  hasCapability(capability) {
    const service = this.getActiveService();
    return service?.capabilities.includes(capability) || false;
  }
}

module.exports = new MusicServiceConfig();
