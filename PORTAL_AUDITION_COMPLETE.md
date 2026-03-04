# Portal Audition Module - Complete! ✅

## What Was Built

A dedicated **Audition** tab in the Villa Portal for testing and comparing music streaming services.

## Features

### 1. Service Switcher
- Visual buttons for each service (Mantis, Amazon Music, etc.)
- Shows active service with green highlight
- Priority displayed on each button
- One-click switching between services

### 2. URL Playback
- Text input for any audio URL or file path
- Volume slider (0-100%)
- Play button with visual feedback
- Enter key support

### 3. Quick Tests
- Pre-loaded test URLs for instant audition
- MP3 and M4A format tests
- One-click playback

### 4. Status Display
- Real-time feedback on playback
- Success/error messages
- Service info panel

## How to Use

1. **Start server:**
   ```bash
   node server.js
   ```

2. **Open portal:**
   ```
   http://localhost:8406
   ```

3. **Click "Audition" tab**

4. **Test services:**
   - Click service button to switch (Mantis/Amazon Music)
   - Paste audio URL or use quick test buttons
   - Adjust volume slider
   - Click Play

5. **Compare:**
   - Switch between services
   - Play same URL on different services
   - Compare audio quality and latency

## Architecture

```
Portal Audition Tab
     ↓
GET /api/music/services (check active)
POST /api/music/services/switch (change service)
POST /api/music/play (play URL)
     ↓
Music Service Config (Mantis priority 1)
     ↓
Music Playback Adapter
     ↓
Mantis → Villa Server → Audio
Amazon Music → Alexa devices
```

## Files Created/Modified

**New:**
- `src/portal/modules/audition.js` - Audition module (300 lines)

**Modified:**
- `src/portal/index.html` - Added Audition tab and panel
- `server.js` - Music service routes enabled

## UI Features

- **Service Grid**: Visual service selector with active state
- **URL Input**: Full-width text input with placeholder
- **Volume Control**: Slider with percentage display
- **Play Button**: Large green button
- **Status Messages**: Success (green) / Error (red) with auto-fade
- **Quick Tests**: Pre-loaded test URLs
- **Service Info**: Shows active service and available services

## Test URLs Included

1. **MP3 Test**: Kangaroo MusiQue - RPG Theme
2. **M4A Test**: Phone ring sound

## Status

✅ **Portal integration complete**
✅ **All tests passing (24/24)**
✅ **Ready to audition**

## Next Steps

1. Start server: `node server.js`
2. Open portal: http://localhost:8406
3. Click "Audition" tab
4. Test Mantis vs Amazon Music!
