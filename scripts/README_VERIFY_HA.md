# HA Entity Verification Script

## Purpose
Verifies that Home Assistant entities match the documentation and auto-updates config files if needed.

## Usage

### Check entities (read-only)
```bash
npm run verify:ha
```

### Check and auto-update config files
```bash
npm run verify:ha -- --update
```

## What it checks

### Anthem AVRs (3 expected)
- `media_player.anthem_740` - Theatre
- `media_player.anthem_540` - Master
- `media_player.anthem_mrx_slm` - Sunroom

### Sonos System (20+ expected)
- All `media_player.sonos_*` entities

## What it does

1. **Connects to Home Assistant** via ha-context-provider
2. **Lists all media_player entities**
3. **Compares with documentation**
4. **Suggests alternatives** if entities not found
5. **Auto-updates files** (with --update flag):
   - `src/audio-streaming-routes.js`
   - `src/portal/modules/audition.js`
   - `VILLA_AUDIO_SYSTEM_DOCUMENTATION.md`

## Example Output

```
🔍 Verifying Home Assistant entities...

📺 Checking Anthem AVRs:
   ✅ media_player.anthem_740 - Anthem AVM 70
   ✅ media_player.anthem_540 - Anthem AVM 60
   ❌ media_player.anthem_mrx_slm - NOT FOUND
   💡 Possible alternatives:
      - media_player.anthem_slm (Anthem MRX SLM)

🔊 Checking Sonos system:
   ✅ Found 20 Sonos devices (expected 20)
      - media_player.sonos_living_room
      - media_player.sonos_kitchen
      ... and 18 more

============================================================
SUMMARY
============================================================
Anthem AVRs: 2/3 found
Sonos Amps: 20 found (expected 20)

⚠️  Some Anthem entities not found
   Run with --update flag to auto-update config files
```

## When to run

- **After HA integration setup** - Verify entity IDs match
- **After HA updates** - Check if entity IDs changed
- **Before deployment** - Ensure all entities exist
- **Troubleshooting** - Find missing or renamed entities

## Requirements

- Home Assistant running and accessible
- `ha-context-provider` configured
- Network access to HA server
