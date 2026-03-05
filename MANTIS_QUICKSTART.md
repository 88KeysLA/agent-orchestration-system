# Mantis Audio - Quick Start

## Setup (One Time)

```bash
# 1. Set API key
export VILLA_API_KEY="your-key"

# 2. Run setup script
cd agent-orchestration-system
./setup-mantis.sh
```

## Start Portal

```bash
cd agent-orchestration-system
npm start
```

## Verify It's Working

### Browser Console
Open jukebox and look for:
```
[Jukebox] Loading <trackId> from mantis (FLAC)
```

### Network Tab
Check response headers:
```
X-Audio-Source: mantis
X-Audio-Codec: flac
Content-Type: audio/flac
```

## Change Audio Quality

```javascript
const config = require('./src/music-service-config');

// Studio quality (24-bit/192kHz)
config.setAudioQuality('mantis', {
  codec: 'flac',
  bitrate: 9216,
  spatialAudio: true
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Error | Set `VILLA_API_KEY` environment variable |
| Falls back to Spotify | Check Mantis is running at 192.168.0.60:8406 |
| No audio | Check browser console for errors |
| Low quality | Verify `X-Audio-Codec: flac` in network tab |

## Audio Quality Comparison

| Source | Codec | Bitrate | Quality |
|--------|-------|---------|---------|
| Spotify | MP3 | 320 kbps | Lossy |
| Mantis (default) | FLAC | 1411 kbps | CD Lossless |
| Mantis (hi-res) | FLAC | 2304 kbps | 96kHz/24-bit |
| Mantis (studio) | FLAC | 9216 kbps | 192kHz/24-bit |

## Key Files

- `src/portal-api.js` - Preview endpoint
- `src/audio-streaming-routes.js` - Streaming API
- `src/music-service-config.js` - Configuration
- `MANTIS_AUDIO_INTEGRATION.md` - Full docs
