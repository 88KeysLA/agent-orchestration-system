/**
 * Music Service Configuration
 * Manages multiple music streaming services (Amazon Music, Spotify, etc.)
 */

class MusicServiceConfig {
  constructor() {
    this.services = {
      mantis: {
        name: 'Mantis',
        enabled: true,  // Enable by default
        priority: 1,
        capabilities: ['playback', 'audio_control', 'local_audio', 'hi_res'],
        audioQuality: {
          codec: 'flac',
          bitrate: 1411,  // CD quality (16-bit/44.1kHz)
          spatialAudio: false
        },
        endpoint: process.env.MANTIS_URL || 'http://192.168.0.60:8406',
        mcpTools: []
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
        enabled: true,
        priority: 3,
        capabilities: ['playback', 'search', 'playlists'],
        mcpTools: [],
        clientId: process.env.SPOTIFY_CLIENT_ID || '5e57282c6ea14e91896a865650d0f23e',
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '4ba8e2b07d914f839b619265ee121480'
      }
    };
    
    this.activeService = 'mantis';  // Default to Mantis
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

  setAudioQuality(serviceName, quality) {
    if (!this.services[serviceName]) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    if (!this.services[serviceName].audioQuality) {
      throw new Error(`Service ${serviceName} does not support audio quality settings`);
    }
    
    const validCodecs = ['mp3', 'aac', 'flac', 'alac'];
    if (quality.codec && !validCodecs.includes(quality.codec)) {
      throw new Error(`Invalid codec: ${quality.codec}`);
    }

    Object.assign(this.services[serviceName].audioQuality, quality);
    return this.services[serviceName].audioQuality;
  }

  getAudioQuality(serviceName) {
    const service = serviceName ? this.services[serviceName] : this.getActiveService();
    return service?.audioQuality || null;
  }
}

module.exports = new MusicServiceConfig();
