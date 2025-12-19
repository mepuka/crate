#!/bin/bash
# Crate Infrastructure Health Check
# Run this to verify all services are operational

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Crate Infrastructure Health Check"
echo "========================================"
echo ""

# Check FAISS API
echo -n "FAISS API (cratemusic.duckdns.org)... "
FAISS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://cratemusic.duckdns.org/api/health" 2>/dev/null || echo "000")
if [ "$FAISS_STATUS" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL (HTTP $FAISS_STATUS)${NC}"
fi

# Check crate-agent
echo -n "crate-agent (Cloud Run)... "
AGENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://crate-agent-cjatp5myqa-uw.a.run.app/health" 2>/dev/null || echo "000")
if [ "$AGENT_STATUS" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
elif [ "$AGENT_STATUS" = "403" ]; then
    echo -e "${YELLOW}AUTH REQUIRED (expected)${NC}"
else
    echo -e "${RED}FAIL (HTTP $AGENT_STATUS)${NC}"
fi

# Check GCP project access
echo -n "GCP Project Access... "
if gcloud projects describe gen-lang-client-0874846742 &>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL (check gcloud auth)${NC}"
fi

# Check Cloud Run service
echo -n "Cloud Run Service Status... "
CLOUD_RUN_STATUS=$(gcloud run services describe crate-agent --region=us-west1 --project=gen-lang-client-0874846742 --format="value(status.conditions[0].status)" 2>/dev/null || echo "UNKNOWN")
if [ "$CLOUD_RUN_STATUS" = "True" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAIL ($CLOUD_RUN_STATUS)${NC}"
fi

# Check Cloud Scheduler
echo -n "Cloud Scheduler Status... "
SCHEDULER_STATE=$(gcloud scheduler jobs describe enrich-unprocessed --location=us-west1 --project=gen-lang-client-0874846742 --format="value(state)" 2>/dev/null || echo "UNKNOWN")
if [ "$SCHEDULER_STATE" = "ENABLED" ]; then
    echo -e "${GREEN}OK (ENABLED)${NC}"
else
    echo -e "${YELLOW}$SCHEDULER_STATE${NC}"
fi

# Check last scheduler run
echo -n "Last Scheduler Run... "
LAST_RUN=$(gcloud scheduler jobs describe enrich-unprocessed --location=us-west1 --project=gen-lang-client-0874846742 --format="value(lastAttemptTime)" 2>/dev/null || echo "UNKNOWN")
LAST_STATUS=$(gcloud scheduler jobs describe enrich-unprocessed --location=us-west1 --project=gen-lang-client-0874846742 --format="value(status.code)" 2>/dev/null || echo "UNKNOWN")
if [ "$LAST_STATUS" = "0" ] || [ -z "$LAST_STATUS" ]; then
    echo -e "${GREEN}OK ($LAST_RUN)${NC}"
else
    echo -e "${YELLOW}Code $LAST_STATUS at $LAST_RUN${NC}"
fi

# Check Pub/Sub subscription
echo -n "Pub/Sub Subscription... "
PUBSUB_STATE=$(gcloud pubsub subscriptions describe new-plays-to-agent --project=gen-lang-client-0874846742 --format="value(state)" 2>/dev/null || echo "UNKNOWN")
if [ "$PUBSUB_STATE" = "ACTIVE" ]; then
    echo -e "${GREEN}OK (ACTIVE)${NC}"
else
    echo -e "${RED}$PUBSUB_STATE${NC}"
fi

# Check database (via SSH if possible)
echo -n "Database Insight Count... "
if command -v ssh &> /dev/null; then
    INSIGHT_COUNT=$(ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@cratemusic.duckdns.org "sqlite3 /root/crate/faiss-search-api/data/music_kb.sqlite 'SELECT COUNT(*) FROM insights'" 2>/dev/null || echo "N/A")
    if [ "$INSIGHT_COUNT" != "N/A" ]; then
        echo -e "${GREEN}$INSIGHT_COUNT insights${NC}"
    else
        echo -e "${YELLOW}Could not connect${NC}"
    fi
else
    echo -e "${YELLOW}SSH not available${NC}"
fi

echo ""
echo "========================================"
echo "Health check complete"
echo "========================================"
