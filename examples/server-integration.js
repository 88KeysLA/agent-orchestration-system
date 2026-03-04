/**
 * Server Integration Example
 * Shows how to integrate music service configuration with the main server
 */

const express = require('express');
const musicConfig = require('../src/music-service-config');
const setupMusicServiceRoutes = require('../src/music-service-routes');

// Mock MCP client for demonstration
class MockMCPClient {
  async callTool(toolName, params) {
    console.log(`[MCP] Calling tool: ${toolName}`, params);
    return { success: true, tool: toolName, params };
  }
}

// Create Express app
const app = express();
app.use(express.json());

// Initialize MCP client (in real app, this would be your actual MCP client)
const mcpClient = new MockMCPClient();

// Enable music services
console.log('🎵 Initializing music services...');
musicConfig.enableService('amazonMusic');
musicConfig.enableService('mantis');
console.log(`   Active service: ${musicConfig.activeService}`);
console.log(`   Available: ${musicConfig.getAvailableServices().map(s => s.name).join(', ')}\n`);

// Setup music service routes
setupMusicServiceRoutes(app, mcpClient);

// Add a simple status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    musicService: {
      active: musicConfig.activeService,
      available: musicConfig.getAvailableServices().map(s => s.name)
    }
  });
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /api/status');
  console.log('  GET  /api/music/services');
  console.log('  POST /api/music/services/switch');
  console.log('  POST /api/music/services/enable');
  console.log('  POST /api/music/play');
  console.log('  POST /api/music/search');
  console.log('\nExample requests:');
  console.log('  curl http://localhost:3001/api/music/services');
  console.log('  curl -X POST http://localhost:3001/api/music/services/switch -H "Content-Type: application/json" -d \'{"service":"mantis"}\'');
  console.log('  curl -X POST http://localhost:3001/api/music/play -H "Content-Type: application/json" -d \'{"contentId":"track-123","contentType":"track"}\'');
  console.log('\nPress Ctrl+C to stop');
});
