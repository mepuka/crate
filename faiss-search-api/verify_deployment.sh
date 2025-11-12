#!/bin/bash
# Deployment Verification Script for KEXP FAISS Search API
# Tests all critical functionality before deploying to droplet

set -e  # Exit on error

BASE_URL="http://localhost:8000"
ERRORS=0
WARNINGS=0

echo "=========================================="
echo "KEXP FAISS Search API - Deployment Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

# Test 1: Health Check
echo "=== Test 1: Health Check ==="
HEALTH=$(curl -s "$BASE_URL/api/health" || echo "ERROR")
if [ "$HEALTH" = "ERROR" ]; then
    fail "Server not responding"
    exit 1
fi

STATUS=$(echo "$HEALTH" | jq -r '.status')
INDEX_LOADED=$(echo "$HEALTH" | jq -r '.index_loaded')
DB_CONNECTED=$(echo "$HEALTH" | jq -r '.database_connected')
TOTAL_VECTORS=$(echo "$HEALTH" | jq -r '.total_vectors')

if [ "$STATUS" = "ok" ]; then
    pass "Server status: $STATUS"
else
    fail "Server status: $STATUS (expected 'ok')"
fi

if [ "$INDEX_LOADED" = "true" ]; then
    pass "FAISS index loaded: $TOTAL_VECTORS vectors"
else
    fail "FAISS index NOT loaded"
fi

if [ "$DB_CONNECTED" = "true" ]; then
    pass "Database connected"
else
    fail "Database NOT connected"
fi

echo ""

# Test 2: Basic Search
echo "=== Test 2: Search Functionality ==="

# Test 2a: Standard search
SEARCH_RESULT=$(curl -s -X POST "$BASE_URL/api/search" \
    -H "Content-Type: application/json" \
    -d '{"query": "psychedelic rock", "limit": 10}')

RESULT_COUNT=$(echo "$SEARCH_RESULT" | jq -r '.results | length')
if [ "$RESULT_COUNT" = "10" ]; then
    pass "Search returned $RESULT_COUNT results"
else
    fail "Search returned $RESULT_COUNT results (expected 10)"
fi

# Test 2b: Check similarity range (should accept negative values now)
MIN_SIM=$(echo "$SEARCH_RESULT" | jq -r '[.results[].similarity] | min')
MAX_SIM=$(echo "$SEARCH_RESULT" | jq -r '[.results[].similarity] | max')
if (( $(echo "$MIN_SIM >= -1.0" | bc -l) )) && (( $(echo "$MAX_SIM <= 1.0" | bc -l) )); then
    pass "Similarity range valid: [$MIN_SIM, $MAX_SIM]"
else
    fail "Similarity range invalid: [$MIN_SIM, $MAX_SIM]"
fi

# Test 2c: Poor match (should not fail with negative similarity)
POOR_SEARCH=$(curl -s -X POST "$BASE_URL/api/search" \
    -H "Content-Type: application/json" \
    -d '{"query": "zzz random gibberish xqwerty", "limit": 5}')

POOR_RESULT_COUNT=$(echo "$POOR_SEARCH" | jq -r '.results | length')
if [ "$POOR_RESULT_COUNT" = "5" ]; then
    pass "Poor match search handled correctly (no 500 error)"
else
    fail "Poor match search returned $POOR_RESULT_COUNT results (expected 5)"
fi

echo ""

# Test 3: Timeline - Cursor Pagination
echo "=== Test 3: Timeline - Cursor Pagination ==="

# Test 3a: First page
PAGE1=$(curl -s "$BASE_URL/api/plays/timeline?limit=10")
PAGE1_COUNT=$(echo "$PAGE1" | jq -r '.results | length')
HAS_MORE=$(echo "$PAGE1" | jq -r '.has_more')
CURSOR=$(echo "$PAGE1" | jq -r '.next_cursor')

if [ "$PAGE1_COUNT" = "10" ]; then
    pass "Timeline page 1: $PAGE1_COUNT results"
else
    fail "Timeline page 1: $PAGE1_COUNT results (expected 10)"
fi

if [ "$HAS_MORE" = "true" ] && [ "$CURSOR" != "null" ]; then
    pass "Pagination cursor present"
else
    fail "Pagination cursor missing or has_more=false"
fi

# Test 3b: Second page (using cursor)
if [ "$CURSOR" != "null" ]; then
    PAGE2=$(curl -s "$BASE_URL/api/plays/timeline?limit=10&cursor=$CURSOR")
    PAGE2_COUNT=$(echo "$PAGE2" | jq -r '.results | length')

    if [ "$PAGE2_COUNT" = "10" ]; then
        pass "Timeline page 2: $PAGE2_COUNT results"
    else
        fail "Timeline page 2: $PAGE2_COUNT results (expected 10)"
    fi

    # Check no overlap between pages
    PAGE1_IDS=$(echo "$PAGE1" | jq -r '[.results[].id] | join(",")')
    PAGE2_IDS=$(echo "$PAGE2" | jq -r '[.results[].id] | join(",")')

    # Simple check: first ID of page2 should not be in page1
    PAGE2_FIRST=$(echo "$PAGE2" | jq -r '.results[0].id')
    if echo "$PAGE1_IDS" | grep -q "$PAGE2_FIRST"; then
        fail "Pages overlap (duplicate IDs detected)"
    else
        pass "No overlap between pages"
    fi
fi

# Test 3c: Query performance
QUERY_TIME=$(echo "$PAGE1" | jq -r '.query_time_ms')
if (( $(echo "$QUERY_TIME < 50" | bc -l) )); then
    pass "Cursor query fast: ${QUERY_TIME}ms"
elif (( $(echo "$QUERY_TIME < 100" | bc -l) )); then
    warn "Cursor query acceptable: ${QUERY_TIME}ms"
else
    fail "Cursor query slow: ${QUERY_TIME}ms (expected <50ms)"
fi

echo ""

# Test 4: Timeline - Time-Based Jump
echo "=== Test 4: Timeline - Time-Based Jump ==="

TIME_RESULT=$(curl -s "$BASE_URL/api/plays/timeline?since=2015-03-15T00:00:00&limit=10")
TIME_COUNT=$(echo "$TIME_RESULT" | jq -r '.results | length')
FIRST_DATE=$(echo "$TIME_RESULT" | jq -r '.results[0].airdate')

if [ "$TIME_COUNT" -gt 0 ]; then
    pass "Time-based query returned $TIME_COUNT results"

    # Check that results are after requested date
    if [[ "$FIRST_DATE" > "2015-03-15" ]] || [[ "$FIRST_DATE" == "2015-03-15"* ]]; then
        pass "Results are after requested date: $FIRST_DATE"
    else
        fail "Results date mismatch: $FIRST_DATE (expected >= 2015-03-15)"
    fi
else
    fail "Time-based query returned no results"
fi

echo ""

# Test 5: Timeline - Percentage Jump
echo "=== Test 5: Timeline - Percentage Jump ==="

# Test at 50% and 95%
for PCT in 0.5 0.95; do
    PCT_RESULT=$(curl -s "$BASE_URL/api/plays/timeline?percentage=$PCT&limit=10")
    PCT_COUNT=$(echo "$PCT_RESULT" | jq -r '.results | length')
    PCT_TIME=$(echo "$PCT_RESULT" | jq -r '.query_time_ms')

    if [ "$PCT_COUNT" = "10" ]; then
        pass "Percentage $PCT returned $PCT_COUNT results"
    else
        fail "Percentage $PCT returned $PCT_COUNT results (expected 10)"
    fi

    if (( $(echo "$PCT_TIME < 500" | bc -l) )); then
        pass "Percentage query time: ${PCT_TIME}ms"
    else
        warn "Percentage query slow: ${PCT_TIME}ms"
    fi
done

echo ""

# Test 6: Timeline - Anchor Jump
echo "=== Test 6: Timeline - Anchor Jump ==="

# Test with limit=1 (edge case that was broken)
ANCHOR1=$(curl -s "$BASE_URL/api/plays/timeline?anchor_id=3576848&limit=1")
ANCHOR1_COUNT=$(echo "$ANCHOR1" | jq -r '.results | length')
ANCHOR1_ID=$(echo "$ANCHOR1" | jq -r '.results[0].id')
ANCHOR1_POS=$(echo "$ANCHOR1" | jq -r '.anchor_position')

if [ "$ANCHOR1_COUNT" = "1" ]; then
    pass "Anchor limit=1 returned $ANCHOR1_COUNT result"
else
    fail "Anchor limit=1 returned $ANCHOR1_COUNT results (expected 1)"
fi

if [ "$ANCHOR1_ID" = "3576848" ]; then
    pass "Anchor play present in results (ID: $ANCHOR1_ID)"
else
    fail "Anchor play missing (got ID: $ANCHOR1_ID, expected 3576848)"
fi

if [ "$ANCHOR1_POS" = "0" ]; then
    pass "Anchor position correct: $ANCHOR1_POS"
else
    fail "Anchor position incorrect: $ANCHOR1_POS (expected 0 for limit=1)"
fi

# Test with limit=5 (should center anchor)
ANCHOR5=$(curl -s "$BASE_URL/api/plays/timeline?anchor_id=3576848&limit=5")
ANCHOR5_COUNT=$(echo "$ANCHOR5" | jq -r '.results | length')
ANCHOR5_POS=$(echo "$ANCHOR5" | jq -r '.anchor_position')
ANCHOR5_HAS_ID=$(echo "$ANCHOR5" | jq -r '[.results[].id] | contains([3576848])')

if [ "$ANCHOR5_COUNT" = "5" ]; then
    pass "Anchor limit=5 returned $ANCHOR5_COUNT results"
else
    fail "Anchor limit=5 returned $ANCHOR5_COUNT results (expected 5)"
fi

if [ "$ANCHOR5_HAS_ID" = "true" ]; then
    pass "Anchor present in limit=5 results at position $ANCHOR5_POS"
else
    fail "Anchor missing from limit=5 results"
fi

echo ""

# Test 7: Single Play Lookup
echo "=== Test 7: Single Play Lookup ==="

PLAY=$(curl -s "$BASE_URL/api/plays/3576848")
PLAY_ID=$(echo "$PLAY" | jq -r '.id')

if [ "$PLAY_ID" = "3576848" ]; then
    pass "Single play lookup successful"
else
    fail "Single play lookup failed (got ID: $PLAY_ID)"
fi

# Test 404 for non-existent play
NOT_FOUND=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/plays/99999999")
if [ "$NOT_FOUND" = "404" ]; then
    pass "404 returned for non-existent play"
else
    fail "Expected 404, got $NOT_FOUND for non-existent play"
fi

echo ""

# Test 8: Validation & Error Handling
echo "=== Test 8: Validation & Error Handling ==="

# Test invalid limit
INVALID_LIMIT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/plays/timeline?limit=500")
if [ "$INVALID_LIMIT" = "400" ]; then
    pass "400 returned for invalid limit"
else
    fail "Expected 400 for invalid limit, got $INVALID_LIMIT"
fi

# Test multiple jump methods (should fail)
MULTI_JUMP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/plays/timeline?percentage=0.5&anchor_id=123")
if [ "$MULTI_JUMP" = "400" ]; then
    pass "400 returned for multiple jump methods"
else
    fail "Expected 400 for multiple jump methods, got $MULTI_JUMP"
fi

# Test invalid percentage
INVALID_PCT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/plays/timeline?percentage=1.5")
if [ "$INVALID_PCT" = "400" ]; then
    pass "400 returned for invalid percentage"
else
    fail "Expected 400 for invalid percentage, got $INVALID_PCT"
fi

echo ""

# Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo "Ready for deployment! 🚀"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ TESTS PASSED WITH $WARNINGS WARNINGS${NC}"
    echo "Ready for deployment (monitor warnings)"
    exit 0
else
    echo -e "${RED}✗ $ERRORS TESTS FAILED${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS WARNINGS${NC}"
    fi
    echo "Fix issues before deployment!"
    exit 1
fi
