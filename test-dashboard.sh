#!/bin/bash

# Villa Portal — API Test Suite
# Tests all endpoints: villa state, demo, music, services, TTS, chat
#
# Usage: ./test-dashboard.sh [portal-url]
# Default: http://localhost:8406 (via SSH to Mech Mac)

API_URL="${1:-http://localhost:8406}"
TOKEN="${PORTAL_KEY:-ecef97cb7a41751dcb63c6bf1129f02e}"
RESULTS_FILE="TEST_RESULTS_$(date +%Y%m%d_%H%M%S).md"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

log_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ "$2" = "PASS" ]; then
        echo -e "  ${GREEN}✓${NC} $1"
        echo "✓ $1" >> "$RESULTS_FILE"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "  ${RED}✗${NC} $1: $3"
        echo "✗ $1: $3" >> "$RESULTS_FILE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

AUTH="-H \"Authorization: Bearer $TOKEN\""

api() {
    curl -s -H "Authorization: Bearer $TOKEN" "$@"
}

api_post() {
    local url=$1
    shift
    curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST "$url" "$@"
}

# Initialize results file
echo "# Villa Portal Test Results — $(date)" > "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

echo -e "${YELLOW}=== VILLA PORTAL API TEST SUITE ===${NC}"
echo -e "Target: ${API_URL}"
echo ""

# ===== AUTHENTICATION =====
echo -e "${YELLOW}Authentication${NC}"
echo "## Authentication" >> "$RESULTS_FILE"

# Test valid token
VALID=$(api "${API_URL}/api/villa/state")
if echo "$VALID" | grep -q "mode"; then
    log_test "Valid token accepted" "PASS"
else
    log_test "Valid token accepted" "FAIL" "No mode in response"
fi

# Test invalid token
INVALID=$(curl -s -H "Authorization: Bearer bad_token" "${API_URL}/api/villa/state")
if echo "$INVALID" | grep -q "Unauthorized\|error"; then
    log_test "Invalid token rejected" "PASS"
else
    log_test "Invalid token rejected" "FAIL" "Should return 401"
fi

echo ""

# ===== VILLA STATE =====
echo -e "${YELLOW}Villa State${NC}"
echo "## Villa State" >> "$RESULTS_FILE"

STATE=$(api "${API_URL}/api/villa/state")

# Check mode
MODE=$(echo "$STATE" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)
if [ -n "$MODE" ] && [ "$MODE" != "UNKNOWN" ]; then
    log_test "Villa mode readable" "PASS"
else
    log_test "Villa mode readable" "FAIL" "mode=$MODE"
fi

# Check agents
AGENT_COUNT=$(echo "$STATE" | grep -o '"agentCount":[0-9]*' | cut -d':' -f2)
if [ -n "$AGENT_COUNT" ] && [ "$AGENT_COUNT" -gt 0 ]; then
    log_test "Agents registered" "PASS"
else
    log_test "Agents registered" "FAIL" "agentCount=$AGENT_COUNT"
fi

# Check gates
for gate in lighting_enable media_enable visual_enable time_aware_enable; do
    VAL=$(echo "$STATE" | grep -o "\"${gate}\":[a-z]*" | cut -d':' -f2)
    if [ "$VAL" = "true" ] || [ "$VAL" = "false" ] || [ "$VAL" = "null" ]; then
        log_test "Gate: $gate ($VAL)" "PASS"
    else
        log_test "Gate: $gate" "FAIL" "value=$VAL"
    fi
done

echo ""

# ===== DEMO SEQUENCES =====
echo -e "${YELLOW}Demo Sequences${NC}"
echo "## Demo Sequences" >> "$RESULTS_FILE"

# List sequences
SEQS=$(api "${API_URL}/api/demo/sequences")
SEQ_COUNT=$(echo "$SEQS" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$SEQ_COUNT" -ge 4 ]; then
    log_test "List sequences (${SEQ_COUNT} found)" "PASS"
else
    log_test "List sequences" "FAIL" "expected >=4, got $SEQ_COUNT"
fi

# Check each sequence exists
for seq in grand-tour quick-vibes visual-art interlude; do
    if echo "$SEQS" | grep -q "\"$seq\""; then
        log_test "Sequence: $seq" "PASS"
    else
        log_test "Sequence: $seq" "FAIL" "not found"
    fi
done

# Check status (should be idle)
STATUS=$(api "${API_URL}/api/demo/status")
if echo "$STATUS" | grep -q '"running":false'; then
    log_test "Demo status (idle)" "PASS"
else
    log_test "Demo status (idle)" "FAIL" "$STATUS"
fi

# Test start validation (missing sequence)
BAD_START=$(api_post "${API_URL}/api/demo/start" -d '{}')
if echo "$BAD_START" | grep -q "error\|required"; then
    log_test "Start validation (missing sequence)" "PASS"
else
    log_test "Start validation (missing sequence)" "FAIL" "$BAD_START"
fi

# Test start with invalid sequence
BAD_SEQ=$(api_post "${API_URL}/api/demo/start" -d '{"sequence":"nonexistent"}')
if echo "$BAD_SEQ" | grep -q "Unknown\|error"; then
    log_test "Start validation (bad sequence)" "PASS"
else
    log_test "Start validation (bad sequence)" "FAIL" "$BAD_SEQ"
fi

echo ""

# ===== SERVICES HEALTH =====
echo -e "${YELLOW}Services Health${NC}"
echo "## Services Health" >> "$RESULTS_FILE"

HEALTH=$(api "${API_URL}/api/services/health")
if echo "$HEALTH" | grep -q "services"; then
    log_test "Health endpoint responds" "PASS"
else
    log_test "Health endpoint responds" "FAIL" "no services key"
fi

for svc in intent-resolver villa-voice music-director rag ollama; do
    SVC_STATUS=$(echo "$HEALTH" | grep -o "\"name\":\"$svc\",\"status\":\"[^\"]*\"" | grep -o "status\":\"[^\"]*\"" | cut -d'"' -f3)
    if [ "$SVC_STATUS" = "healthy" ]; then
        log_test "Service: $svc" "PASS"
    elif [ -n "$SVC_STATUS" ]; then
        log_test "Service: $svc ($SVC_STATUS)" "FAIL" "status=$SVC_STATUS"
    else
        log_test "Service: $svc" "FAIL" "not found in response"
    fi
done

echo ""

# ===== CHAT =====
echo -e "${YELLOW}Chat / Agent Execution${NC}"
echo "## Chat" >> "$RESULTS_FILE"

# Simple echo test
CHAT=$(api_post "${API_URL}/api/chat" -d '{"message":"echo:hello from test suite"}')
if echo "$CHAT" | grep -q "result\|hello"; then
    log_test "Chat: echo agent" "PASS"
else
    log_test "Chat: echo agent" "FAIL" "$CHAT"
fi

# Agent-routed test
CHAT_HA=$(api_post "${API_URL}/api/chat" -d '{"message":"ha:state:input_select.villa_mode","agent":"ha"}')
if echo "$CHAT_HA" | grep -q "result\|NORMAL\|LISTEN\|LOOK\|WATCH\|ENTERTAIN"; then
    log_test "Chat: HA agent (mode read)" "PASS"
else
    log_test "Chat: HA agent (mode read)" "FAIL" "$(echo "$CHAT_HA" | head -c 100)"
fi

echo ""

# ===== TTS =====
echo -e "${YELLOW}TTS (ElevenLabs)${NC}"
echo "## TTS" >> "$RESULTS_FILE"

# Test TTS returns audio
TTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X POST "${API_URL}/api/villa/tts" \
    -d '{"text":"Test","voice":"edward"}')

if [ "$TTS_STATUS" = "200" ]; then
    log_test "TTS returns audio (200)" "PASS"
elif [ "$TTS_STATUS" = "503" ]; then
    log_test "TTS (ElevenLabs not configured)" "FAIL" "503 — no API key"
else
    log_test "TTS endpoint" "FAIL" "HTTP $TTS_STATUS"
fi

# Test TTS validation
TTS_EMPTY=$(api_post "${API_URL}/api/villa/tts" -d '{}')
if echo "$TTS_EMPTY" | grep -q "error\|required"; then
    log_test "TTS validation (missing text)" "PASS"
else
    log_test "TTS validation (missing text)" "FAIL"
fi

echo ""

# ===== IMAGES =====
echo -e "${YELLOW}Images${NC}"
echo "## Images" >> "$RESULTS_FILE"

IMAGES=$(api "${API_URL}/api/images")
if echo "$IMAGES" | grep -q "images"; then
    IMG_COUNT=$(echo "$IMAGES" | grep -o '"name"' | wc -l | tr -d ' ')
    log_test "Images endpoint ($IMG_COUNT images)" "PASS"
else
    log_test "Images endpoint" "FAIL"
fi

echo ""

# ===== MUSIC =====
echo -e "${YELLOW}Music${NC}"
echo "## Music" >> "$RESULTS_FILE"

MUSIC_STATE=$(api "${API_URL}/api/music/state")
if echo "$MUSIC_STATE" | grep -q "{"; then
    log_test "Music state endpoint" "PASS"
else
    log_test "Music state endpoint" "FAIL"
fi

MUSIC_PLAYERS=$(api "${API_URL}/api/music/players")
if echo "$MUSIC_PLAYERS" | grep -q "{"; then
    log_test "Music players endpoint" "PASS"
else
    log_test "Music players endpoint" "FAIL"
fi

MUSIC_SERVICES=$(api "${API_URL}/api/music/services")
if echo "$MUSIC_SERVICES" | grep -q "services"; then
    log_test "Music services endpoint" "PASS"
else
    log_test "Music services endpoint" "FAIL"
fi

echo ""

# ===== PORTAL STATIC ASSETS =====
echo -e "${YELLOW}Static Assets${NC}"
echo "## Static Assets" >> "$RESULTS_FILE"

for asset in "/" "/portal/app.js" "/portal/style.css" "/portal/modules/demo.js" "/portal/modules/chat.js" "/portal/modules/music.js" "/portal/modules/dashboard.js" "/sw.js"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}${asset}")
    if [ "$STATUS" = "200" ]; then
        log_test "GET $asset" "PASS"
    else
        log_test "GET $asset" "FAIL" "HTTP $STATUS"
    fi
done

echo ""

# ===== SUMMARY =====
echo "================================"
echo -e "${YELLOW}TEST SUMMARY${NC}"
echo "================================"
echo -e "Total:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo ""
echo "Results saved to: $RESULTS_FILE"

echo "" >> "$RESULTS_FILE"
echo "## Summary" >> "$RESULTS_FILE"
echo "- Total: $TOTAL_TESTS" >> "$RESULTS_FILE"
echo "- Passed: $PASSED_TESTS" >> "$RESULTS_FILE"
echo "- Failed: $FAILED_TESTS" >> "$RESULTS_FILE"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. See $RESULTS_FILE${NC}"
    exit 1
fi
