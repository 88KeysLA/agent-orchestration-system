#!/bin/bash
# Fix Redis to listen on network interface

echo "=== Redis Network Configuration Fix ==="
echo ""

# Find redis-server process
echo "Finding Redis process..."
REDIS_PID=$(pgrep redis-server)

if [ -z "$REDIS_PID" ]; then
  echo "✗ Redis is not running"
  exit 1
fi

echo "✓ Redis running (PID: $REDIS_PID)"

# Find redis-cli
REDIS_CLI=$(find /usr/local -name redis-cli 2>/dev/null | head -1)

if [ -z "$REDIS_CLI" ]; then
  REDIS_CLI=$(find /opt -name redis-cli 2>/dev/null | head -1)
fi

if [ -z "$REDIS_CLI" ]; then
  REDIS_CLI=$(find ~/local -name redis-cli 2>/dev/null | head -1)
fi

if [ -z "$REDIS_CLI" ]; then
  echo "✗ redis-cli not found"
  echo "Trying to configure via kill and restart..."
  
  # Find redis-server binary
  REDIS_SERVER=$(find /usr/local -name redis-server 2>/dev/null | head -1)
  if [ -z "$REDIS_SERVER" ]; then
    REDIS_SERVER=$(find ~/local -name redis-server 2>/dev/null | head -1)
  fi
  
  if [ -z "$REDIS_SERVER" ]; then
    echo "✗ redis-server not found"
    exit 1
  fi
  
  echo "Found redis-server: $REDIS_SERVER"
  echo "Stopping current Redis..."
  kill $REDIS_PID
  sleep 2
  
  echo "Starting Redis with network binding..."
  $REDIS_SERVER --bind 0.0.0.0 --protected-mode no --daemonize yes --port 6379
  
  echo "✓ Redis restarted with network access"
else
  echo "✓ Found redis-cli: $REDIS_CLI"
  
  # Check current binding
  echo ""
  echo "Current Redis configuration:"
  $REDIS_CLI CONFIG GET bind
  
  # Update to bind to all interfaces
  echo ""
  echo "Updating Redis to listen on all interfaces..."
  $REDIS_CLI CONFIG SET bind "0.0.0.0"
  $REDIS_CLI CONFIG SET protected-mode no
  
  echo "✓ Redis configured for network access"
fi

echo ""
echo "Testing connectivity..."
sleep 1

# Test from localhost
echo "PING" | nc -w 2 localhost 6379 | grep -q PONG
if [ $? -eq 0 ]; then
  echo "✓ Redis responds on localhost"
else
  echo "✗ Redis not responding on localhost"
fi

echo ""
echo "=== Configuration Complete ==="
echo ""
echo "Now test from FX/Show Mac with:"
echo "  echo PING | nc -w 2 192.168.0.60 6379"
