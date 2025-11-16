#!/bin/bash
set -e

# Setup script for Google Cloud deployment
# Run this once to configure your local environment

echo "Setting up Google Cloud for crate-agent deployment..."

# Source configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.gcloudrc" ]; then
  source "$SCRIPT_DIR/.gcloudrc"
else
  echo "Error: .gcloudrc not found"
  exit 1
fi

echo ""
echo "Current Configuration:"
echo "  Project: $GCP_PROJECT_ID"
echo "  Region: $GCP_REGION"
echo "  Zone: $GCP_ZONE"
echo ""

# Verify gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is not installed"
  echo "Install from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

echo "✓ gcloud CLI is installed"

# Verify authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
  echo "You need to authenticate with Google Cloud"
  gcloud auth login
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo "✓ Authenticated as: $ACTIVE_ACCOUNT"

# Set project
echo ""
echo "Setting active project..."
gcloud config set project "$GCP_PROJECT_ID"
echo "✓ Project set to: $GCP_PROJECT_ID"

# Verify APIs are enabled
echo ""
echo "Verifying required APIs are enabled..."

REQUIRED_APIS=(
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "containerregistry.googleapis.com"
  "artifactregistry.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
  if gcloud services list --enabled --filter="name:$api" --format="value(name)" | grep -q "$api"; then
    echo "✓ $api is enabled"
  else
    echo "✗ $api is not enabled"
    echo "  Enable with: gcloud services enable $api"
  fi
done

# Configure Docker for GCR
echo ""
echo "Configuring Docker for Google Container Registry..."
gcloud auth configure-docker --quiet
echo "✓ Docker configured for GCR"

# Configure Docker for Artifact Registry (if using)
echo ""
echo "Configuring Docker for Artifact Registry..."
gcloud auth configure-docker ${ARTIFACT_REGISTRY_REGION}-docker.pkg.dev --quiet
echo "✓ Docker configured for Artifact Registry"

# Set compute region/zone
echo ""
echo "Setting default compute region and zone..."
gcloud config set compute/region "$GCP_REGION"
gcloud config set compute/zone "$GCP_ZONE"
echo "✓ Defaults set"

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Update FAISS_API_URL in .gcloudrc with your actual API endpoint"
echo "  2. Test local build: ./deploy.sh local"
echo "  3. Deploy to Cloud Run: ./deploy.sh"
echo ""
