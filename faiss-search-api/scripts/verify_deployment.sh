#!/bin/bash
# Deployment verification script
# Tests that the deployed API is working correctly

set -e

API_URL="${1:-http://localhost:8000}"

echo "========================================="
echo "Verifying KEXP Search API Deployment"
echo "API URL: $API_URL"
echo "========================================="

# Test 1: Health check
echo -e "\n1. Testing health endpoint..."
health_response=$(curl -s "$API_URL/api/health")
status=$(echo "$health_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$status" = "ok" ]; then
    echo "✓ Health check passed"
    echo "$health_response" | python3 -m json.tool
else
    echo "✗ Health check failed"
    exit 1
fi

# Test 2: Search endpoint
echo -e "\n2. Testing search endpoint..."
search_response=$(curl -s -X POST "$API_URL/api/search" \
    -H "Content-Type: application/json" \
    -d '{"query": "psychedelic rock", "limit": 5}')

results_count=$(echo "$search_response" | grep -o '"results":\[' | wc -l)

if [ "$results_count" -gt 0 ]; then
    echo "✓ Search endpoint passed"
    total=$(echo "$search_response" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    query_time=$(echo "$search_response" | grep -o '"query_time_ms":[0-9.]*' | cut -d':' -f2)
    echo "  Total results: $total"
    echo "  Query time: ${query_time}ms"
else
    echo "✗ Search endpoint failed"
    echo "$search_response"
    exit 1
fi

# Test 3: OpenAPI docs
echo -e "\n3. Testing OpenAPI documentation..."
docs_response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/docs")

if [ "$docs_response" = "200" ]; then
    echo "✓ OpenAPI docs available at $API_URL/docs"
else
    echo "✗ OpenAPI docs unavailable (HTTP $docs_response)"
    exit 1
fi

echo -e "\n========================================="
echo "✓ All verification tests passed!"
echo "========================================="
