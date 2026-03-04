#!/bin/bash
# Deploy Agent Orchestration to Mech Mac (192.168.0.60)
# Usage: ./deploy.sh [--setup]
#   --setup: First-time setup (clone, install, crontab)
#   No flag: Pull latest and restart

set -e

MECH_HOST="villaromanzamech@192.168.0.60"
REMOTE_DIR="/Users/villaromanzamech/agent-orchestration-system"
REPO="https://github.com/88KeysLA/agent-orchestration-system.git"
PORT=8406
LOG_FILE="/Users/villaromanzamech/logs/agent-orchestration.log"

echo "Deploying Agent Orchestration to Mech Mac..."

# Check ports first
echo "Checking for port conflicts..."
if ! ./check-ports.sh; then
  echo "❌ Port check failed. Aborting deployment."
  exit 1
fi
echo ""

if [ "$1" = "--setup" ]; then
  echo "First-time setup..."

  ssh "$MECH_HOST" bash -s <<SETUP
    set -e
    mkdir -p ~/logs

    # Clone if not present
    if [ ! -d "$REMOTE_DIR" ]; then
      echo "Cloning repo..."
      git clone $REPO "$REMOTE_DIR"
    fi

    cd "$REMOTE_DIR"
    git pull origin main

    # Install dependencies
    npm install --production

    echo "Setup complete. Adding to crontab..."

    # Add crontab entry (idempotent)
    CRON_LINE="@reboot cd $REMOTE_DIR && PORT=$PORT node server.js >> $LOG_FILE 2>&1 &"
    (crontab -l 2>/dev/null | grep -v "agent-orchestration-system"; echo "\$CRON_LINE") | crontab -

    echo "Crontab updated. Starting server..."
    cd "$REMOTE_DIR"
    PORT=$PORT nohup node server.js >> "$LOG_FILE" 2>&1 &
    sleep 2

    # Verify
    if curl -s "http://127.0.0.1:$PORT/api/status" > /dev/null 2>&1; then
      echo "Server running on port $PORT"
      curl -s "http://127.0.0.1:$PORT/api/agents" | head -c 200
      echo ""
    else
      echo "Warning: Server may not have started. Check $LOG_FILE"
    fi
SETUP

else
  echo "Updating and restarting..."

  ssh "$MECH_HOST" bash -s <<UPDATE
    set -e
    cd "$REMOTE_DIR"

    # Pull latest
    git pull origin main

    # Install any new deps
    npm install --production

    # Kill existing process
    pkill -f "node server.js" 2>/dev/null && echo "Stopped old server" || echo "No running server found"
    sleep 1

    # Start fresh
    PORT=$PORT nohup node server.js >> "$LOG_FILE" 2>&1 &
    sleep 2

    # Verify
    if curl -s "http://127.0.0.1:$PORT/api/status" > /dev/null 2>&1; then
      echo "Server running on port $PORT"
      curl -s "http://127.0.0.1:$PORT/api/agents" | head -c 200
      echo ""
    else
      echo "Warning: Server may not have started. Check $LOG_FILE"
    fi
UPDATE

fi

echo "Done. Test with: curl http://192.168.0.60:$PORT/api/status"
