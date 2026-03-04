#!/bin/bash
# Deploy Agent Orchestration to Mech Mac (192.168.0.60)
# Usage: ./deploy.sh [--setup]
#   --setup: First-time setup (clone, install, pm2 start)
#   No flag: Zero-downtime reload with rollback

set -euo pipefail

MECH_HOST="villaromanzamech@192.168.0.60"
REMOTE_DIR="/Users/villaromanzamech/agent-orchestration-system"
REPO="https://github.com/88KeysLA/agent-orchestration-system.git"
PORT=8406
APP_NAME="agent-orchestration"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
HEALTH_TIMEOUT=30
HEALTH_INTERVAL=2

log() { echo "[$(date '+%H:%M:%S')] $1"; }

wait_for_health() {
  local elapsed=0
  while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done
  return 1
}

if [ "${1:-}" = "--setup" ]; then
  log "First-time setup on Mech Mac..."

  ssh "$MECH_HOST" bash -s <<SETUP
    set -euo pipefail
    mkdir -p ~/logs

    # Install PM2 if missing
    command -v pm2 >/dev/null 2>&1 || npm install -g pm2

    # Clone if not present
    [ -d "$REMOTE_DIR" ] || git clone $REPO "$REMOTE_DIR"
    cd "$REMOTE_DIR"
    git pull origin main
    npm install --production

    # Atomic port check: fail if port is held by non-PM2 process
    PID=\$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "\$PID" ]; then
      echo "Port $PORT in use by PID \$PID — killing stale process"
      kill "\$PID" 2>/dev/null || true
      sleep 1
    fi

    # Start with PM2
    PORT=$PORT pm2 start server.js --name "$APP_NAME" --update-env
    pm2 save

    # Verify health
    ELAPSED=0
    while [ "\$ELAPSED" -lt $HEALTH_TIMEOUT ]; do
      if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "✅ Health check passed"
        curl -s "$HEALTH_URL"
        echo ""
        exit 0
      fi
      sleep $HEALTH_INTERVAL
      ELAPSED=\$((ELAPSED + $HEALTH_INTERVAL))
    done
    echo "❌ Health check failed after ${HEALTH_TIMEOUT}s"
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
SETUP

else
  log "Zero-downtime deploy to Mech Mac..."

  ssh "$MECH_HOST" bash -s <<UPDATE
    set -euo pipefail
    cd "$REMOTE_DIR"

    # Save rollback point
    PREV_COMMIT=\$(git rev-parse HEAD)
    echo "Rollback commit: \$PREV_COMMIT"

    # Pull and install
    git pull origin main
    npm install --production

    # Atomic port check before reload
    PID=\$(lsof -ti :$PORT 2>/dev/null || true)
    PM2_PID=\$(pm2 pid "$APP_NAME" 2>/dev/null || true)
    if [ -n "\$PID" ] && [ "\$PID" != "\$PM2_PID" ]; then
      echo "⚠️  Port $PORT held by non-PM2 process \$PID — killing"
      kill "\$PID" 2>/dev/null || true
      sleep 1
    fi

    # Zero-downtime reload (PM2 keeps old process until new one is ready)
    PORT=$PORT pm2 reload "$APP_NAME" --update-env

    # Health check with timeout
    ELAPSED=0
    while [ "\$ELAPSED" -lt $HEALTH_TIMEOUT ]; do
      if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "✅ Health check passed"
        curl -s "$HEALTH_URL"
        echo ""
        exit 0
      fi
      sleep $HEALTH_INTERVAL
      ELAPSED=\$((ELAPSED + $HEALTH_INTERVAL))
    done

    # Rollback: revert code and restart previous version
    echo "❌ Health check failed — rolling back to \$PREV_COMMIT"
    git checkout "\$PREV_COMMIT"
    npm install --production
    PORT=$PORT pm2 reload "$APP_NAME" --update-env
    sleep 3

    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      echo "⚠️  Rollback succeeded — previous version restored"
    else
      echo "❌ Rollback also failed — manual intervention needed"
      pm2 logs "$APP_NAME" --lines 20 --nostream
    fi
    exit 1
UPDATE

fi

log "Done. Test: curl http://192.168.0.60:$PORT/api/health"
