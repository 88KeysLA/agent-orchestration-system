/**
 * Villa Audio Streaming API
 * Direct audio streaming with hi-fi/Atmos passthrough via Home Assistant
 */

function setupAudioStreamingRoutes(app) {
  let currentStream = null;
  let haClient = null;

  // Initialize HA client if available
  try {
    const HAContextProvider = require('./ha-context-provider');
    if (global.haContextProvider) {
      haClient = global.haContextProvider;
    }
  } catch (err) {
    console.log('HA client not available for audio streaming');
  }

  // Stream audio with metadata preservation
  app.post('/api/audio/stream', async (req, res) => {
    try {
      const { url, volume = 0.8, codec, bitrate, spatialAudio, device } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL required' });
      }

      // Store stream metadata
      currentStream = {
        url,
        volume,
        codec: codec || detectCodec(url),
        bitrate: bitrate || null,
        spatialAudio: spatialAudio || false,
        device: device || 'media_player.anthem_740',  // Default to main AVR
        state: 'playing',
        startedAt: Date.now()
      };

      // Play via Home Assistant if available
      if (haClient) {
        await haClient.callService('media_player', 'play_media', {
          entity_id: currentStream.device,
          media_content_id: url,
          media_content_type: 'music'
        });

        // Set volume
        await haClient.callService('media_player', 'volume_set', {
          entity_id: currentStream.device,
          volume_level: volume
        });

        res.json({
          success: true,
          stream: currentStream,
          message: `Streaming ${currentStream.codec.toUpperCase()} to ${currentStream.device}`
        });
      } else {
        res.json({
          success: true,
          stream: currentStream,
          message: 'Audio streaming API ready - HA integration pending'
        });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get available AVRs
  app.get('/api/audio/devices', async (req, res) => {
    try {
      if (!haClient) {
        return res.json({ devices: [] });
      }

      const states = await haClient.getStates();
      const mediaPlayers = states.filter(s => 
        s.entity_id.startsWith('media_player.') &&
        (s.entity_id.includes('anthem') || s.entity_id.includes('avr'))
      );

      const devices = mediaPlayers.map(s => ({
        entity_id: s.entity_id,
        name: s.attributes.friendly_name || s.entity_id,
        state: s.state,
        volume: s.attributes.volume_level,
        source: s.attributes.source,
        supportedFeatures: s.attributes.supported_features
      }));

      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Sonos system status (fed from MRX SLM)
  app.get('/api/audio/sonos-status', async (req, res) => {
    try {
      if (!haClient) {
        return res.json({ available: false });
      }

      const states = await haClient.getStates();
      const sonosDevices = states.filter(s => 
        s.entity_id.startsWith('media_player.') &&
        s.entity_id.includes('sonos')
      );

      res.json({
        available: true,
        count: sonosDevices.length,
        devices: sonosDevices.map(s => ({
          entity_id: s.entity_id,
          name: s.attributes.friendly_name,
          state: s.state,
          grouped: s.attributes.group_members?.length > 1
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pause stream
  app.post('/api/audio/stream/pause', async (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }

    if (haClient) {
      await haClient.callService('media_player', 'media_pause', {
        entity_id: currentStream.device
      });
    }

    currentStream.state = 'paused';
    res.json({ success: true, state: 'paused' });
  });

  // Resume stream
  app.post('/api/audio/stream/resume', async (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }

    if (haClient) {
      await haClient.callService('media_player', 'media_play', {
        entity_id: currentStream.device
      });
    }

    currentStream.state = 'playing';
    res.json({ success: true, state: 'playing' });
  });

  // Stop stream
  app.post('/api/audio/stream/stop', async (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }

    if (haClient) {
      await haClient.callService('media_player', 'media_stop', {
        entity_id: currentStream.device
      });
    }

    currentStream.state = 'stopped';
    const stream = currentStream;
    currentStream = null;
    res.json({ success: true, stream });
  });

  // Set volume
  app.post('/api/audio/stream/volume', async (req, res) => {
    const { volume } = req.body;
    if (volume === undefined || volume < 0 || volume > 1) {
      return res.status(400).json({ error: 'Volume must be 0-1' });
    }

    if (currentStream && haClient) {
      await haClient.callService('media_player', 'volume_set', {
        entity_id: currentStream.device,
        volume_level: volume
      });
      currentStream.volume = volume;
    }

    res.json({ success: true, volume });
  });

  // Get status
  app.get('/api/audio/stream/status', (req, res) => {
    res.json({
      active: !!currentStream,
      stream: currentStream,
      haAvailable: !!haClient,
      capabilities: {
        hiRes: true,
        maxBitrate: 9216, // 24-bit/192kHz FLAC
        codecs: ['mp3', 'aac', 'flac', 'alac', 'atmos', 'dts-x'],
        spatialAudio: true,
        devices: ['anthem_740', 'anthem_540', 'anthem_halfrack']
      }
    });
  });
}

function detectCodec(url) {
  const ext = url.split('.').pop().toLowerCase().split('?')[0];
  const codecMap = {
    'mp3': 'mp3',
    'aac': 'aac',
    'm4a': 'aac',
    'flac': 'flac',
    'alac': 'alac',
    'wav': 'wav',
    'ec3': 'atmos',
    'eac3': 'atmos'
  };
  return codecMap[ext] || 'unknown';
}

module.exports = setupAudioStreamingRoutes;
