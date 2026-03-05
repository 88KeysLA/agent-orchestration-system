#!/bin/bash
# Setup Mantis Audio Integration

echo "🎵 Mantis Audio Integration Setup"
echo "=================================="
echo ""

# Check if API key is set
if [ -z "$VILLA_API_KEY" ]; then
  echo "⚠️  VILLA_API_KEY not set"
  echo ""
  echo "To enable Mantis audio streaming, you need to set your Villa API key:"
  echo ""
  echo "  export VILLA_API_KEY=\"your-api-key-here\""
  echo ""
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc) to persist."
  echo ""
  read -p "Enter your Villa API key (or press Enter to skip): " api_key
  
  if [ -n "$api_key" ]; then
    export VILLA_API_KEY="$api_key"
    echo "✓ API key set for this session"
    echo ""
    echo "To persist, add this to your ~/.zshrc:"
    echo "  export VILLA_API_KEY=\"$api_key\""
    echo ""
  else
    echo "⚠️  Skipping API key setup. Mantis will not be available."
    echo ""
  fi
else
  echo "✓ VILLA_API_KEY is set"
  echo ""
fi

# Check Mantis endpoint
MANTIS_URL="${MANTIS_URL:-http://192.168.0.60:8406}"
echo "Testing Mantis endpoint: $MANTIS_URL"

if command -v curl &> /dev/null; then
  if curl -s -f -m 3 "$MANTIS_URL/health" > /dev/null 2>&1; then
    echo "✓ Mantis is reachable"
  else
    echo "⚠️  Cannot reach Mantis at $MANTIS_URL"
    echo "   Make sure the service is running and accessible"
  fi
else
  echo "⚠️  curl not found, skipping connectivity test"
fi

echo ""
echo "Running integration test..."
echo ""

node test-mantis-audio.js

echo ""
echo "Setup complete! 🎉"
echo ""
echo "Next steps:"
echo "  1. Start the portal: npm start"
echo "  2. Open http://localhost:8406/portal"
echo "  3. Click 'Jukebox' and create a session"
echo "  4. Check browser console for 'Loading from mantis (FLAC)'"
echo ""
