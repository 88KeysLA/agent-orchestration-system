# Mantis Audio Integration

## Overview

The audio portal now uses **Mantis** for high-fidelity audio streaming instead of Spotify. This provides:

- **FLAC streaming** (lossless, CD quality or higher)
- **Higher bitrates** (up to 9216 kbps for 24-bit/192kHz)
- **Local streaming** (no external API dependencies)
- **Spatial audio support** (Atmos/DTS:X passthrough)

## Architecture

```
┌─────────────────┐
│  Audio Portal   │
│   (Browser)     │
└────────┬────────┘
         │ /api/jukebox/preview/:trackId?mantis=true
         ▼
┌─────────────────┐
│  Portal Server  │
│  (Node.js)      │
└────────┬────────┘
         │ /api/music/stream/:trackId
         ▼
┌─────────────────┐
│  Mantis Service │
│  192.168.0.60   │
│  Port 8406      │
└─────────────────┘
```

## Configuration

### Music Service Config

Located in `src/music-service-config.js`:

```javascript
mantis: {
  enabled: true,
  priority: 1,
  audioQuality: {
    codec: 'flac',        // mp3, aac, flac, alac
    bitrate: 1411,        // CD quality (16-bit/44.1kHz)
    spatialAudio: false   // Enable for Atmos/DTS:X
  },
  endpoint: 'http://192.168.0.60:8406'
}
```

### Audio Quality Presets

| Preset | Codec | Bitrate | Sample Rate | Bit Depth |
|--------|-------|---------|-------------|-----------|
| Standard | MP3 | 320 kbps | 44.1 kHz | - |
| CD Quality | FLAC | 1411 kbps | 44.1 kHz | 16-bit |
| Hi-Res | FLAC | 2304 kbps | 96 kHz | 24-bit |
| Studio | FLAC | 9216 kbps | 192 kHz | 24-bit |

## API Endpoints

### Preview/Stream Track

```http
GET /api/jukebox/preview/:trackId?mantis=true
```

**Response Headers:**
- `X-Audio-Source`: `mantis` or `spotify`
- `X-Audio-Codec`: `flac`, `mp3`, etc.
- `Content-Type`: `audio/flac` or `audio/mpeg`

### Direct Mantis Stream

```http
GET /api/music/stream/:trackId?codec=flac&bitrate=1411
```

**Query Parameters:**
- `codec`: Audio codec (default: `flac`)
- `bitrate`: Target bitrate in kbps (default: `1411`)

### Stream Status

```http
GET /api/audio/stream/status
```

**Response:**
```json
{
  "active": true,
  "stream": {
    "url": "...",
    "codec": "flac",
    "bitrate": 1411,
    "device": "media_player.anthem_740"
  },
  "capabilities": {
    "hiRes": true,
    "maxBitrate": 9216,
    "codecs": ["mp3", "aac", "flac", "alac", "atmos", "dts-x"],
    "spatialAudio": true
  }
}
```

## Usage

### Jukebox Module

The jukebox automatically requests Mantis audio:

```javascript
// In src/portal/modules/jukebox.js
async function loadPreview(trackId) {
  const res = await fetch(`/api/jukebox/preview/${trackId}?mantis=true`);
  // Returns FLAC if available, falls back to Spotify MP3
}
```

### Programmatic Control

```javascript
const MantisAudioClient = require('./src/mantis-audio-client');
const client = new MantisAudioClient('http://192.168.0.60:8406');

// Play with high quality
await client.play({
  url: 'spotify:track:...',
  codec: 'flac',
  bitrate: 9216,
  spatialAudio: true,
  volume: 0.8
});

// Control playback
await client.pause();
await client.resume();
await client.setVolume(0.5);
await client.stop();
```

### Change Audio Quality

```javascript
const musicServiceConfig = require('./src/music-service-config');

// Set to studio quality
musicServiceConfig.setAudioQuality('mantis', {
  codec: 'flac',
  bitrate: 9216,
  spatialAudio: true
});
```

## Testing

Run the integration test:

```bash
node test-mantis-audio.js
```

This verifies:
1. Mantis service configuration
2. Connection to Mantis endpoint
3. Audio quality settings
4. Streaming endpoint availability

## Troubleshooting

### No audio in portal

1. Check Mantis is running:
   ```bash
   curl http://192.168.0.60:8406/api/audio/stream/status
   ```

2. Check browser console for audio source:
   ```
   [Jukebox] Loading <trackId> from mantis (FLAC)
   ```

3. Verify network access to Mantis:
   ```bash
   ping 192.168.0.60
   ```

### Falls back to Spotify

If you see `from spotify (MP3)` in console:
- Mantis endpoint is unreachable
- Track not available in Mantis catalog
- Timeout connecting to Mantis (3s limit)

### Audio quality issues

Check the response headers:
```bash
curl -I "http://localhost:8406/api/jukebox/preview/TRACK_ID?mantis=true"
```

Look for:
- `X-Audio-Source: mantis`
- `X-Audio-Codec: flac`
- `Content-Type: audio/flac`

## Performance

### Bandwidth Requirements

| Quality | Bitrate | 30s Preview | Full Track (3min) |
|---------|---------|-------------|-------------------|
| MP3 | 320 kbps | ~1.2 MB | ~7.2 MB |
| FLAC CD | 1411 kbps | ~5.3 MB | ~31.8 MB |
| FLAC Hi-Res | 2304 kbps | ~8.6 MB | ~51.8 MB |
| FLAC Studio | 9216 kbps | ~34.6 MB | ~207.4 MB |

### Caching

- Preview URLs cached in memory (500 track limit)
- Cache cleared on server restart
- Browser caches audio for 1 hour (`Cache-Control: max-age=3600`)

## Future Enhancements

- [ ] Adaptive bitrate based on network conditions
- [ ] Mantis catalog search integration
- [ ] Playlist sync with Mantis
- [ ] Offline caching for frequently played tracks
- [ ] Real-time audio analysis from FLAC stream
- [ ] Multi-room sync via Mantis
