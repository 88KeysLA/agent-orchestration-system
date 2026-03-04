# Portal Integration Status

## Current State

### ✅ What's Working:
1. **Music service routes added to server** (`server.js`)
   - GET `/api/music/services` - Check active service
   - POST `/api/music/play` - Play audio
   - POST `/api/music/services/switch` - Switch services
   - Mantis enabled by default (priority 1)

2. **Backend fully integrated**
   - Routes hooked up in `server.js`
   - Mantis routes through Villa
   - All tests passing (24/24)

### 🔄 What Needs Connection:

The **existing portal music module** (`src/portal/modules/music.js`) uses:
- Sonos-specific endpoints (`/api/music/sonos/*`)
- Different music system (UnifiedMusicService)

The **new music service system** provides:
- Multi-service support (Mantis/Amazon Music)
- `/api/music/services` and `/api/music/play` endpoints

## Two Options:

### Option 1: Keep Separate (Current)
- Portal continues using Sonos system
- New endpoints available for other clients
- No portal changes needed

### Option 2: Integrate Portal
Update portal to use new music service:

```javascript
// In music.js, add service switcher
async function switchMusicService(service) {
  await VP.apiFetch('/api/music/services/switch', {
    method: 'POST',
    body: JSON.stringify({ service })
  });
}

// Update play to use new endpoint
async function playViaService(url) {
  await VP.apiFetch('/api/music/play', {
    method: 'POST',
    body: JSON.stringify({ 
      contentId: url,
      options: { volume: 0.8 }
    })
  });
}
```

## Recommendation

**Keep separate for now** because:
- Portal's Sonos system is working
- New system is for Mantis/Amazon Music
- Different use cases (Sonos speakers vs general audio)
- Can integrate later if needed

## What Works Right Now

```bash
# Start server
node server.js

# Check music service (Mantis active)
curl http://localhost:8406/api/music/services

# Play audio via Mantis (routes to Villa)
curl -X POST http://localhost:8406/api/music/play \
  -H "Content-Type: application/json" \
  -d '{"contentId": "http://example.com/song.mp3"}'
```

Portal continues using its existing Sonos integration.
New music service available for other clients/agents.
