# Music Service Integration

Multi-service music streaming adapter for the Agent Orchestration System. Supports switching between Amazon Music, Mantis, and other streaming services with a unified API.

## Features

- **Multi-service support**: Amazon Music, Mantis, Spotify (extensible)
- **Priority-based selection**: Automatic fallback to available services
- **Capability detection**: Check if service supports playback, search, playlists, etc.
- **Unified API**: Same interface regardless of backend service
- **MCP integration**: Works with Model Context Protocol tools

## Quick Start

```javascript
const musicConfig = require('./src/music-service-config');
const MusicPlaybackAdapter = require('./src/music-playback-adapter');

// Enable services
musicConfig.enableService('amazonMusic');
musicConfig.enableService('mantis');

// Switch active service
musicConfig.setActiveService('mantis');

// Create adapter with MCP client
const adapter = new MusicPlaybackAdapter(mcpClient);

// Play content
await adapter.play('track-id', { contentType: 'track' });

// Search
const results = await adapter.search('Beatles', { 
  types: ['artist', 'album'],
  limit: 10 
});
```

## Configuration

### Available Services

| Service | Priority | Capabilities | Status |
|---------|----------|--------------|--------|
| Amazon Music | 1 | playback, search, playlists, recommendations | ✅ Ready |
| Mantis | 2 | playback, audio_control | 🚧 Pending MCP tools |
| Spotify | 3 | playback, search, playlists | 📋 Planned |

### Service Configuration

```javascript
const musicConfig = require('./src/music-service-config');

// Check active service
console.log(musicConfig.activeService); // 'amazonMusic'

// Get service details
const service = musicConfig.getActiveService();
console.log(service.name); // 'Amazon Music'
console.log(service.capabilities); // ['playback', 'search', ...]

// Check capability
if (musicConfig.hasCapability('search')) {
  // Service supports search
}

// List available services
const available = musicConfig.getAvailableServices();
// Returns services sorted by priority
```

## API Routes

When integrated with the server, these REST endpoints are available:

### GET `/api/music/services`
Get current service configuration

**Response:**
```json
{
  "active": "amazonMusic",
  "activeService": {
    "name": "Amazon Music",
    "enabled": true,
    "capabilities": ["playback", "search", "playlists"]
  },
  "available": [...]
}
```

### POST `/api/music/services/switch`
Switch active service

**Request:**
```json
{
  "service": "mantis"
}
```

### POST `/api/music/services/enable`
Enable a service

**Request:**
```json
{
  "service": "mantis"
}
```

### POST `/api/music/play`
Play content

**Request:**
```json
{
  "contentId": "track-123",
  "contentType": "track",
  "options": {}
}
```

### POST `/api/music/search`
Search for content

**Request:**
```json
{
  "query": "Beatles",
  "types": ["artist", "album"],
  "limit": 10
}
```

## Amazon Music Integration

Uses Amazon Music MCP tools:
- `initiate_alexa_playback` - Play content on Alexa devices
- `search` - Search catalog
- `get_track`, `get_album`, `get_artist` - Get metadata
- `get_playlist`, `create_playlist` - Playlist management
- `get_user_playlists` - User library access

## Mantis Integration

To integrate Mantis MCP:

1. Add Mantis MCP tools to `musicConfig.services.mantis.mcpTools`
2. Implement `playMantis()` method in `MusicPlaybackAdapter`
3. Enable the service: `musicConfig.enableService('mantis')`

Example:
```javascript
async playMantis(contentId, options) {
  // Call Mantis MCP tool
  return await this.mcpClient.callTool('mantis_play', {
    id: contentId,
    ...options
  });
}
```

## Testing

```bash
# Run tests
npm run test:music-service

# Run demo
npm run demo:music-service
```

## Server Integration

Add to your server setup:

```javascript
const setupMusicServiceRoutes = require('./src/music-service-routes');

// In server initialization
setupMusicServiceRoutes(app, mcpClient);
```

## Architecture

```
┌─────────────────────────────────────┐
│   Music Playback Adapter            │
│   (Unified Interface)                │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│ Amazon      │  │  Mantis    │
│ Music MCP   │  │  MCP       │
└─────────────┘  └────────────┘
```

## Adding New Services

1. Add service config to `music-service-config.js`:
```javascript
newService: {
  name: 'New Service',
  enabled: false,
  priority: 4,
  capabilities: ['playback'],
  mcpTools: ['new_service_play']
}
```

2. Implement playback method in `MusicPlaybackAdapter`:
```javascript
async playNewService(contentId, options) {
  return await this.mcpClient.callTool('new_service_play', {
    contentId,
    ...options
  });
}
```

3. Add case to `play()` switch statement

## Environment Variables

None required - configuration is in-memory and can be persisted via API calls.

## License

MIT
