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

echo "Building and deploying crate-agent..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "FAISS API URL: $FAISS_API_URL"

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
  --substitutions _FAISS_API_URL="$FAISS_API_URL" \
  --project "$PROJECT_ID" \
  .

echo "✓ Deployment complete!"
