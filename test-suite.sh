#!/bin/bash
# Comprehensive Test Suite - Agent Orchestration System
# Runs all tests including port checks

set -e

echo "🧪 Running Agent Orchestration Test Suite"
echo "=========================================="
echo ""

PASSED=0
FAILED=0

# Test 1: Port Conflicts
echo "1️⃣  Port Conflict Check"
if ./check-ports.sh > /dev/null 2>&1; then
  echo "   ✅ No port conflicts"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Port conflicts detected"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: Unit Tests
echo "2️⃣  Unit Tests"
if npm test > /dev/null 2>&1; then
  echo "   ✅ All unit tests passing"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Unit tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Authentication
echo "3️⃣  Authentication Tests"
if node test/auth.test.js > /dev/null 2>&1; then
  echo "   ✅ Authentication working"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Authentication tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Lifecycle Manager
echo "4️⃣  Lifecycle Manager Tests"
if node test/lifecycle-manager.test.js > /dev/null 2>&1; then
  echo "   ✅ Lifecycle manager working"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Lifecycle manager tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 5: Redis Bus
echo "5️⃣  Redis Bus Tests"
if node test/redis-bus.test.js > /dev/null 2>&1; then
  echo "   ✅ Redis bus working"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Redis bus tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Test 6: Mantis Integration
echo "6️⃣  Mantis Integration Tests"
if node test/mantis-integration.test.js > /dev/null 2>&1; then
  echo "   ✅ Mantis integration working"
  PASSED=$((PASSED + 1))
else
  echo "   ❌ Mantis integration tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Summary
echo "=========================================="
echo "Test Results: $PASSED passed, $FAILED failed"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
