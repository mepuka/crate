#!/bin/bash
# Test script for unified timeline API endpoints

BASE_URL="http://localhost:8000"
API_URL="${BASE_URL}/api/plays/timeline"

echo "========================================="
echo "KEXP Timeline API Endpoint Tests"
echo "========================================="
echo ""

echo "Starting FastAPI server in background..."
cd "$(dirname "$0")"
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/api_server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 3

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    echo ""
    echo "=== Test: $name ==="
    echo "URL: $url"

    response=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" "$url")
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    time_total=$(echo "$response" | grep "TIME:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE:/,$d')

    echo "Status: $http_code"
    echo "Time: ${time_total}s"

    if [ "$http_code" = "200" ]; then
        # Extract key fields
        results_count=$(echo "$body" | grep -o '"results":\[' | wc -l)
        has_more=$(echo "$body" | grep -o '"has_more":[^,}]*' | cut -d: -f2)
        query_time=$(echo "$body" | grep -o '"query_time_ms":[0-9.]*' | cut -d: -f2)

        echo "Results: $(echo "$body" | grep -o '"id":[0-9]*' | wc -l)"
        echo "Query time: ${query_time}ms"
        echo "Has more: $has_more"

        # Show first result
        first_artist=$(echo "$body" | grep -o '"artist":"[^"]*"' | head -1 | cut -d'"' -f4)
        first_song=$(echo "$body" | grep -o '"song":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$first_artist" ]; then
            echo "First result: $first_artist - $first_song"
        fi

        echo "✓ PASS"
    else
        echo "✗ FAIL (HTTP $http_code)"
        echo "$body" | head -20
    fi
}

# Wait a bit more for full startup
sleep 2

# Test 1: Standard cursor pagination (default)
test_endpoint "Standard Pagination (default)" "${API_URL}?limit=20"

# Test 2: Time-based query
test_endpoint "Time-Based Query (March 2015)" "${API_URL}?since=2015-03-15T00:00:00&limit=20"

# Test 3: Time range query
test_endpoint "Time Range Query" "${API_URL}?since=2015-03-01T00:00:00&until=2015-04-01T00:00:00&limit=20"

# Test 4: Percentage jump (50%)
test_endpoint "Percentage Jump (50%)" "${API_URL}?percentage=0.5&limit=20"

# Test 5: Percentage jump (0% - newest)
test_endpoint "Percentage Jump (0% - newest)" "${API_URL}?percentage=0.0&limit=10"

# Test 6: Anchor jump
test_endpoint "Anchor Jump" "${API_URL}?anchor_id=2544131&limit=50"

# Test 7: Validation - multiple methods (should fail)
test_endpoint "Validation: Multiple Methods (should fail)" "${API_URL}?cursor=abc&percentage=0.5&limit=20"

# Test 8: Validation - invalid percentage (should fail)
test_endpoint "Validation: Invalid Percentage (should fail)" "${API_URL}?percentage=1.5&limit=20"

echo ""
echo "========================================="
echo "Tests Complete"
echo "========================================="
echo ""
echo "Server log (last 20 lines):"
tail -20 /tmp/api_server.log

# Cleanup
echo ""
echo "Stopping server (PID: $SERVER_PID)..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo "Done!"
