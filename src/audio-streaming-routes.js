/**
 * Villa Audio Streaming API
 * Direct audio streaming with hi-fi/Atmos passthrough
 */

function setupAudioStreamingRoutes(app) {
  let currentStream = null;

  // Stream audio with metadata preservation
  app.post('/api/audio/stream', async (req, res) => {
    try {
      const { url, volume = 0.8, codec, bitrate, spatialAudio } = req.body;

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
        state: 'playing',
        startedAt: Date.now()
      };

      // TODO: Implement actual audio streaming
      // For now, return metadata that would be used
      res.json({
        success: true,
        stream: currentStream,
        message: 'Audio streaming API ready - implement hardware integration'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pause stream
  app.post('/api/audio/stream/pause', (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }
    currentStream.state = 'paused';
    res.json({ success: true, state: 'paused' });
  });

  // Resume stream
  app.post('/api/audio/stream/resume', (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }
    currentStream.state = 'playing';
    res.json({ success: true, state: 'playing' });
  });

  // Stop stream
  app.post('/api/audio/stream/stop', (req, res) => {
    if (!currentStream) {
      return res.status(404).json({ error: 'No active stream' });
    }
    currentStream.state = 'stopped';
    const stream = currentStream;
    currentStream = null;
    res.json({ success: true, stream });
  });

  // Set volume
  app.post('/api/audio/stream/volume', (req, res) => {
    const { volume } = req.body;
    if (volume === undefined || volume < 0 || volume > 1) {
      return res.status(400).json({ error: 'Volume must be 0-1' });
    }
    if (currentStream) {
      currentStream.volume = volume;
    }
    res.json({ success: true, volume });
  });

  // Get status
  app.get('/api/audio/stream/status', (req, res) => {
    res.json({
      active: !!currentStream,
      stream: currentStream,
      capabilities: {
        hiRes: true,
        maxBitrate: 9216, // 24-bit/192kHz FLAC
        codecs: ['mp3', 'aac', 'flac', 'alac', 'atmos', 'dts-x'],
        spatialAudio: true
      }
    });
  });
}

function detectCodec(url) {
  const ext = url.split('.').pop().toLowerCase();
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
