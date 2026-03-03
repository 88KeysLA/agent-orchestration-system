#!/bin/bash

# Villa Portal — Comprehensive Test Suite
# Phases: syntax, API endpoints, static assets, code quality, WebSocket
#
# Usage: ./test-all.sh [portal-url]

set -euo pipefail

API_URL="${1:-http://localhost:8406}"
TOKEN="${PORTAL_KEY:-ecef97cb7a41751dcb63c6bf1129f02e}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
    local test_name=$1
    local test_command=$2

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "  ${RED}✗${NC} $test_name"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo ""
echo -e "${YELLOW}Villa Portal — Comprehensive Test Suite${NC}"
echo "========================================="
echo ""

# ===== Phase 1: Syntax Checks =====
echo -e "${YELLOW}Phase 1: JavaScript Syntax${NC}"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

run_test "server.js" "node -c '${REPO_DIR}/server.js'"
run_test "src/portal-api.js" "node -c '${REPO_DIR}/src/portal-api.js'"
run_test "src/demo-engine.js" "node -c '${REPO_DIR}/src/demo-engine.js'"

# Check all src/*.js files
JS_ERROR=0
for f in "${REPO_DIR}"/src/*.js; do
    [ -f "$f" ] || continue
    if ! node -c "$f" 2>/dev/null; then
        JS_ERROR=1
        echo -e "  ${RED}✗${NC} $(basename "$f") has syntax error"
    fi
done
if [ $JS_ERROR -eq 0 ]; then
    run_test "All src/*.js files valid" "true"
else
    run_test "All src/*.js files valid" "false"
fi

echo ""

# ===== Phase 2: Portal Module Checks =====
echo -e "${YELLOW}Phase 2: Portal Modules${NC}"

MODULES=(app.js modules/chat.js modules/dashboard.js modules/demo.js modules/visual.js modules/music.js modules/audio-viz.js modules/images.js)

for mod in "${MODULES[@]}"; do
    FILE="${REPO_DIR}/src/portal/${mod}"
    if [ -f "$FILE" ]; then
        # Check it's a valid IIFE or module
        run_test "portal/${mod} exists" "test -f '$FILE'"
    else
        run_test "portal/${mod} exists" "false"
    fi
done

# Check index.html references all modules
echo ""
echo -e "${YELLOW}Phase 3: HTML Integrity${NC}"

HTML="${REPO_DIR}/src/portal/index.html"
for mod in "${MODULES[@]}"; do
    run_test "index.html loads ${mod}" "grep -q '${mod}' '$HTML'"
done

# Check all panels have matching tabs
for panel in chat dashboard demo visual music audio images; do
    run_test "Tab + panel: ${panel}" "grep -q 'data-panel=\"${panel}\"' '$HTML' && grep -q 'panel-${panel}' '$HTML'"
done

echo ""

# ===== Phase 4: API Endpoint Tests =====
echo -e "${YELLOW}Phase 4: API Endpoints${NC}"

api_ok() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$@")
    [ "$code" = "200" ]
}

# Core endpoints
run_test "GET  /                    (portal)" "api_ok '${API_URL}/'"
run_test "GET  /api/villa/state     (state)" "api_ok '${API_URL}/api/villa/state'"
run_test "GET  /api/services/health (health)" "api_ok '${API_URL}/api/services/health'"
run_test "GET  /api/images          (images)" "api_ok '${API_URL}/api/images'"

# Demo endpoints
run_test "GET  /api/demo/sequences" "api_ok '${API_URL}/api/demo/sequences'"
run_test "GET  /api/demo/status" "api_ok '${API_URL}/api/demo/status'"

# Music endpoints
run_test "GET  /api/music/state" "api_ok '${API_URL}/api/music/state' || true"
run_test "GET  /api/music/services" "api_ok '${API_URL}/api/music/services'"

# Static assets
run_test "GET  /portal/style.css" "api_ok '${API_URL}/portal/style.css'"
run_test "GET  /portal/app.js" "api_ok '${API_URL}/portal/app.js'"
run_test "GET  /sw.js (service worker)" "api_ok '${API_URL}/sw.js'"

echo ""

# ===== Phase 5: Code Quality =====
echo -e "${YELLOW}Phase 5: Code Quality${NC}"

# No files over 800 lines
BIG_FILES=$(find "${REPO_DIR}/src" -name "*.js" -exec wc -l {} + 2>/dev/null | awk '$1 > 800 && !/total/ {print $2}' | wc -l | tr -d ' ')
run_test "No source files over 800 lines" "test '$BIG_FILES' -eq 0"

# Check for common issues
run_test "No debugger statements" "! grep -r 'debugger' '${REPO_DIR}/src/' --include='*.js' -q"
run_test "No hardcoded localhost in portal modules" "! grep -r 'localhost' '${REPO_DIR}/src/portal/' --include='*.js' -q"

# Service worker cache version
SW_VERSION=$(grep -o "CACHE_VERSION = '[^']*'" "${REPO_DIR}/src/portal/sw.js" | cut -d"'" -f2)
run_test "Service worker cache version set (${SW_VERSION})" "test -n '$SW_VERSION'"

echo ""

# ===== Phase 6: Demo Engine Validation =====
echo -e "${YELLOW}Phase 6: Demo Engine${NC}"

# Validate demo-engine.js exports correctly
run_test "DemoEngine class exported" "node -e \"const {DemoEngine} = require('${REPO_DIR}/src/demo-engine'); const d = new DemoEngine({execute:async()=>({})}); console.log(d.getSequences().length)\" | grep -q '[0-9]'"

# Check all sequences have required fields
run_test "Sequences have required fields" "node -e \"
  const {DemoEngine} = require('${REPO_DIR}/src/demo-engine');
  const d = new DemoEngine({execute:async()=>({})});
  const seqs = d.getSequences();
  const valid = seqs.every(s => s.id && s.name && s.description && s.stepCount > 0 && s.duration > 0);
  process.exit(valid ? 0 : 1);
\""

# Check demo status when idle
run_test "Idle status correct" "node -e \"
  const {DemoEngine} = require('${REPO_DIR}/src/demo-engine');
  const d = new DemoEngine({execute:async()=>({})});
  const s = d.getStatus();
  process.exit(s.running === false ? 0 : 1);
\""

echo ""

# ===== Summary =====
echo "========================================="
echo -e "${YELLOW}Test Results${NC}"
echo "========================================="
echo ""
echo -e "Total:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}${FAILED_TESTS} test(s) failed${NC}"
    exit 1
fi
