/**
 * Music Service API Routes
 * REST endpoints for managing music service configuration and playback
 */

const musicConfig = require('./music-service-config');
const MusicPlaybackAdapter = require('./music-playback-adapter');

function setupMusicServiceRoutes(app, mcpClient) {
  const adapter = new MusicPlaybackAdapter(mcpClient);

  // Get current service configuration
  app.get('/api/music/services', (req, res) => {
    res.json({
      active: musicConfig.activeService,
      activeService: musicConfig.getActiveService(),
      available: musicConfig.getAvailableServices()
    });
  });

  // Switch active service
  app.post('/api/music/services/switch', (req, res) => {
    try {
      const { service } = req.body;
      musicConfig.setActiveService(service);
      res.json({ 
        success: true, 
        active: musicConfig.activeService,
        service: musicConfig.getActiveService()
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Enable a service
  app.post('/api/music/services/enable', (req, res) => {
    try {
      const { service } = req.body;
      musicConfig.enableService(service);
      res.json({ 
        success: true,
        enabled: service,
        available: musicConfig.getAvailableServices()
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Play content
  app.post('/api/music/play', async (req, res) => {
    try {
      const { contentId, contentType, options } = req.body;
      const result = await adapter.play(contentId, { contentType, ...options });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search
  app.post('/api/music/search', async (req, res) => {
    try {
      const { query, types, limit } = req.body;
      const result = await adapter.search(query, { types, limit });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = setupMusicServiceRoutes;
