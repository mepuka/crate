#!/bin/bash
set -e

# Deploy script for crate-agent to Google Cloud Run
# Source .gcloudrc for default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.gcloudrc" ]; then
  source "$SCRIPT_DIR/.gcloudrc"
fi

PROJECT_ID=${GCP_PROJECT_ID:-"gen-lang-client-0874846742"}
REGION=${GCP_REGION:-"us-west1"}
FAISS_API_URL=${FAISS_API_URL:-"http://localhost:8000"}
FAISS_API_KEY=${FAISS_API_KEY:-"placeholder"}
SERVICE_ACCOUNT_EMAIL=${SERVICE_ACCOUNT_EMAIL:-"pubsub-invoker@${PROJECT_ID}.iam.gserviceaccount.com"}
PUBSUB_INVOKER_EMAIL=${PUBSUB_INVOKER_EMAIL:-"${SERVICE_ACCOUNT_EMAIL}"}
CPU=${CPU:-"1"}
MEMORY=${MEMORY:-"1Gi"}
CONCURRENCY=${CONCURRENCY:-"1"}
MAX_INSTANCES=${MAX_INSTANCES:-"3"}
TIMEOUT=${TIMEOUT:-"900s"}

echo "Building and deploying crate-agent..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "FAISS API URL: $FAISS_API_URL"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"

# Build the Docker image locally (optional, for testing)
if [ "$1" == "local" ]; then
  echo "Building Docker image locally..."
  docker build -t crate-agent:local -f packages/agent/Dockerfile .
  echo "✓ Local build complete"
  exit 0
fi

# Submit to Cloud Build
gcloud builds submit \
  --config packages/agent/cloudbuild.yaml \
  --substitutions _FAISS_API_URL="$FAISS_API_URL",_FAISS_API_KEY="$FAISS_API_KEY",_REGION="$REGION",_SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_EMAIL",_PUBSUB_INVOKER_EMAIL="$PUBSUB_INVOKER_EMAIL",_CPU="$CPU",_MEMORY="$MEMORY",_CONCURRENCY="$CONCURRENCY",_MAX_INSTANCES="$MAX_INSTANCES",_TIMEOUT="$TIMEOUT" \
  --project "$PROJECT_ID" \
  .

echo "✓ Deployment complete!"
