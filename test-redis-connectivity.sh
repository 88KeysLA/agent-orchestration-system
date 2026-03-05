#!/bin/bash
# Simple Redis connectivity test from FX and Show Mac

echo "=== Redis Connectivity Test ==="
echo ""

# Test from FX Mac
echo "Testing FX Mac (192.168.0.61) → Redis..."
echo "PING" | nc -w 2 192.168.0.61 6379 2>&1 | grep -q PONG
if [ $? -eq 0 ]; then
  echo "✓ FX Mac can reach Redis"
else
  echo "✗ FX Mac cannot reach Redis"
fi

echo ""

# Test from Show Mac
echo "Testing Show Mac (192.168.0.62) → Redis..."
echo "PING" | nc -w 2 192.168.0.62 6379 2>&1 | grep -q PONG
if [ $? -eq 0 ]; then
  echo "✓ Show Mac can reach Redis"
else
  echo "✗ Show Mac cannot reach Redis"
fi

echo ""
echo "=== Test Complete ==="
