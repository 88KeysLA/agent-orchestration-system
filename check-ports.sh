#!/bin/bash
# Port Conflict Check - Villa Romanza Services
# Tests all known ports before deployment

set -e

echo "🔍 Checking Villa Romanza Port Conflicts..."
echo ""

# Check each port
check_port() {
  local PORT=$1
  local SERVICE=$2
  
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    PROCESS=$(lsof -Pi :$PORT -sTCP:LISTEN -t | head -1)
    PROCESS_NAME=$(ps -p $PROCESS -o comm= 2>/dev/null || echo "unknown")
    echo "✅ Port $PORT: $SERVICE (running: $PROCESS_NAME)"
    return 0
  else
    echo "⚠️  Port $PORT: $SERVICE (NOT RUNNING)"
    return 1
  fi
}

RUNNING=0
TOTAL=8

# Check all services
check_port 8406 "Agent Orchestration" && RUNNING=$((RUNNING + 1)) || true
check_port 11434 "Ollama LLM" && RUNNING=$((RUNNING + 1)) || true
check_port 8450 "RAG Server" && RUNNING=$((RUNNING + 1)) || true
check_port 6379 "Redis" && RUNNING=$((RUNNING + 1)) || true
check_port 8400 "Intent Resolver" && RUNNING=$((RUNNING + 1)) || true
check_port 8404 "Music Service" && RUNNING=$((RUNNING + 1)) || true
check_port 8405 "Voice Service" && RUNNING=$((RUNNING + 1)) || true
check_port 8123 "Home Assistant" && RUNNING=$((RUNNING + 1)) || true

echo ""
echo "Summary: $RUNNING/$TOTAL services running"
echo ""
echo "✅ Port check complete"
exit 0
