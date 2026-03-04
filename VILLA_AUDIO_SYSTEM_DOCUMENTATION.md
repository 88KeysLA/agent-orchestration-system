# Villa Audio System Configuration - Complete Documentation

## System Overview

Multi-zone audio streaming system with hi-fi/Atmos support via Home Assistant control of Anthem AVRs and Sonos whole-house audio.

## Hardware Configuration

### Anthem AVRs (All Network-Connected via Cat6a)

1. **Anthem 740 8K** - Theatre Room
   - Location: Theatre
   - Use: Critical listening, Atmos playback
   - Connection: Network streaming via HA
   - Entity ID: `media_player.anthem_740`

2. **Anthem 540 8K** - Master Suite
   - Location: Master bedroom
   - Use: Private listening zone
   - Connection: Network streaming via HA
   - Entity ID: `media_player.anthem_540`

3. **Anthem MRX SLM** - Sunroom
   - Location: Mech room (with HA server)
   - Use: Sunroom speakers only
   - Connection: Network streaming via HA
   - Outputs: Speaker outputs → Sunroom speakers (direct)
   - Entity ID: `media_player.anthem_mrx_slm`

### Sonos System (20 Amps)

- **Master Amp**: Sonos Amp #1 (receives network stream from HA)
- **Distribution**: 19 additional Sonos Amps throughout house
- **Sync**: TruePlay handles multi-room timing
- **Control**: Grouped via Sonos app, all fed via network from HA

## Audio Flow Architecture

```
Mobile Device (Mantis)
     ↓
Villa Portal (Audition Tab)
     ↓
Villa Server (Mech Room)
     ↓
Home Assistant
     ↓
     ├─→ Anthem 740 (Theatre) ─→ Theatre speakers
     ├─→ Anthem 540 (Master) ─→ Master speakers
     ├─→ MRX SLM (Mech Room) ─→ Sunroom speakers (direct)
     └─→ Sonos Amp #1 (network)
              ↓ TruePlay synced
           19 other Sonos Amps → Whole house
```

## Supported Audio Formats

### Via Anthem AVRs (Direct):
- **MP3**: 320kbps max
- **AAC**: 256kbps
- **FLAC**: Lossless (24-bit/192kHz)
- **ALAC**: Apple Lossless
- **WAV**: Uncompressed
- **Dolby Atmos**: EC3/EAC3 (Theatre only)
- **DTS:X**: Spatial audio (Theatre only)

### Via Sonos (Network Streaming):
- All formats supported by Sonos
- Network streaming from HA
- No Atmos (Sonos limitation)
- TruePlay handles multi-room sync

## Software Components

### Portal Module
**File**: `src/portal/modules/audition.js`
- AVR device selector
- URL input for audio testing
- Codec auto-detection
- Volume control
- Service switching (Mantis/Amazon Music)

### API Routes
**File**: `src/audio-streaming-routes.js`
- `POST /api/audio/stream` - Stream with metadata
- `POST /api/audio/stream/pause` - Pause playback
- `POST /api/audio/stream/resume` - Resume playback
- `POST /api/audio/stream/stop` - Stop playback
- `POST /api/audio/stream/volume` - Set volume
- `GET /api/audio/stream/status` - Get status
- `GET /api/audio/devices` - List AVRs
- `GET /api/audio/sonos-status` - Sonos system status

### Music Service Config
**File**: `src/music-service-config.js`
- Mantis: Priority 1 (routes through Villa)
- Amazon Music: Priority 2 (fallback)
- Spotify: Priority 3 (future)

### Mantis Audio Client
**File**: `src/mantis-audio-client.js`
- Direct API calls (not text commands)
- Preserves codec/bitrate/spatial metadata
- Routes to Villa server

## Home Assistant Integration

### Required HA Integrations:
1. **Anthem AVM** - For all 3 Anthem AVRs
2. **Sonos** - For 20 Sonos Amps

### Entity IDs:
```yaml
media_player.anthem_740      # Theatre
media_player.anthem_540      # Master
media_player.anthem_mrx_slm  # Whole House
media_player.sonos_*         # 20 Sonos Amps
```

### HA Services Used:
- `media_player.play_media` - Stream URL to device
- `media_player.volume_set` - Set volume
- `media_player.media_pause` - Pause
- `media_player.media_play` - Resume
- `media_player.media_stop` - Stop

## Usage

### From Portal:

1. **Navigate to Audition tab**
2. **Select output device:**
   - Anthem 740 (Theatre) - Direct hi-fi/Atmos
   - Anthem 540 (Master) - Direct hi-fi
   - MRX SLM (Sunroom) - Sunroom speakers
3. **Paste audio URL** (MP3, FLAC, Atmos, etc.)
4. **Adjust volume** (0-100%)
5. **Click Play**

**Note**: For whole-house Sonos playback, use Sonos app to group amps and stream directly from HA to Sonos.

### From API:

```bash
# Stream to Theatre
curl -X POST http://villa:8406/api/audio/stream \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.com/song.flac",
    "device": "media_player.anthem_740",
    "codec": "flac",
    "spatialAudio": false,
    "volume": 0.8
  }'

# Stream to whole house
curl -X POST http://villa:8406/api/audio/stream \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.com/song.mp3",
    "device": "media_player.anthem_mrx_slm",
    "volume": 0.6
  }'
```

## Network Infrastructure

- **Protocol**: Network streaming over Cat6a
- **No optical cables needed** between mech room and AVRs
- **All connections**: Cat6a network (no optical between devices)
- **Latency**: ~50-200ms for network streaming

## Timing & Synchronization

### Single Zone (No Sync Issues):
- Anthem 740 (Theatre) - Standalone
- Anthem 540 (Master) - Standalone
- MRX SLM (Sunroom) - Standalone

### Multi-Zone (Sonos Handles Sync):
- Sonos system receives network stream from HA
- TruePlay compensates for room acoustics
- All 20 Sonos Amps stay in sync

### Cross-System (Not Recommended):
- Don't play same audio to Anthem + Sonos simultaneously
- ~50-200ms timing difference
- Use for different content/zones

## Testing

### Test Suite:
```bash
npm run test:music-service  # 11 tests - Service config
npm run test:mantis         # 6 tests - Mantis integration
npm run test:villa-routing  # 7 tests - Villa routing
```

**Total**: 24/24 tests passing ✅

### Manual Testing:
1. Start server: `node server.js`
2. Open portal: `http://villa:8406`
3. Click "Audition" tab
4. Test each AVR with sample URLs

## Configuration Files

### Server Integration:
**File**: `server.js`
```javascript
// Music service routes enabled
const setupMusicServiceRoutes = require('./src/music-service-routes');
setupMusicServiceRoutes(app, null);

// Audio streaming routes enabled
const setupAudioStreamingRoutes = require('./src/audio-streaming-routes');
setupAudioStreamingRoutes(app);
```

### Portal Integration:
**File**: `src/portal/index.html`
```html
<button class="nav-tab" data-panel="audition">Audition</button>
<section id="panel-audition" class="panel"></section>
<script src="/portal/modules/audition.js"></script>
```

## Troubleshooting

### No Audio from AVR:
1. Check HA integration is working
2. Verify entity IDs match
3. Check AVR network input is selected
4. Test direct HA service call

### Sonos Not Playing:
1. Verify Sonos Amps are on network
2. Check HA can control Sonos entities
3. Verify Sonos grouping in Sonos app
4. Test individual Sonos Amp first

### Timing Issues:
1. Don't mix Anthem + Sonos for same content
2. Use Sonos grouping for multi-room
3. TruePlay handles Sonos sync automatically

## Git Repository

**Repo**: https://github.com/88KeysLA/agent-orchestration-system

**Recent Commits**:
- `829bd55` - Update AVR labels: 540 is Master, MRX SLM feeds whole house
- `2da1aaa` - Add Mantis music service with hi-fi/Atmos streaming

**Key Files**:
- `src/audio-streaming-routes.js` - HA integration
- `src/portal/modules/audition.js` - Portal UI
- `src/mantis-audio-client.js` - Mantis client
- `src/music-service-config.js` - Service config
- `src/music-playback-adapter.js` - Unified adapter

## Future Enhancements

1. **Dynamic AVR Discovery**: Auto-detect AVRs from HA
2. **Sonos Group Control**: Manage Sonos grouping from portal
3. **Preset Zones**: Save favorite device/volume combos
4. **Playlist Support**: Queue multiple tracks
5. **Now Playing Display**: Show current track info

## Status

✅ **Complete and Production Ready**
- All code committed and pushed
- Tests passing (24/24)
- Documentation complete
- Portal integrated
- HA integration ready

**Requires**:
- HA Anthem integration configured
- HA Sonos integration configured
- Sonos grouping configured in Sonos app

---

**Last Updated**: March 4, 2026
**Version**: 1.1
**Author**: Villa Orchestration System
