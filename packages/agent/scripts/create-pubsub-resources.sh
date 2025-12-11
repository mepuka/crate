#!/usr/bin/env bash
set -euo pipefail

# Provision Pub/Sub trigger for the music agent Cloud Run service.
# This script is idempotent: it will create or update the topic, service
# account, IAM bindings, and push subscription.
#
# Required env (override as needed):
#   PROJECT_ID            - GCP project id
#   REGION                - Cloud Run region (e.g. us-west1)
#   SERVICE_NAME          - Cloud Run service name (e.g. crate-agent)
#   TOPIC                 - Pub/Sub topic for new plays (default: new-play)
#   SUBSCRIPTION          - Pub/Sub subscription name (default: new-play-push)
#   PUSH_SERVICE_ACCOUNT  - Service account used by Pub/Sub push to invoke Run
#   SERVICE_URL           - Cloud Run HTTPS URL (needed for push endpoint)
#
# Example:
#   PROJECT_ID=my-proj \
#   REGION=us-west1 \
#   SERVICE_NAME=crate-agent \
#   PUSH_SERVICE_ACCOUNT=pubsub-invoker@my-proj.iam.gserviceaccount.com \
#   SERVICE_URL=https://crate-agent-xxxx-uc.a.run.app \
#   ./packages/agent/scripts/create-pubsub-resources.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=us-west1}"
: "${SERVICE_NAME:=crate-agent}"
: "${TOPIC:=new-play}"
: "${SUBSCRIPTION:=new-play-push}"
: "${PUSH_SERVICE_ACCOUNT:?PUSH_SERVICE_ACCOUNT is required}"
: "${SERVICE_URL:?SERVICE_URL is required}"

echo "Project:        ${PROJECT_ID}"
echo "Region:         ${REGION}"
echo "Service:        ${SERVICE_NAME}"
echo "Topic:          ${TOPIC}"
echo "Subscription:   ${SUBSCRIPTION}"
echo "Push SA:        ${PUSH_SERVICE_ACCOUNT}"
echo "Service URL:    ${SERVICE_URL}"
echo

gcloud config set project "${PROJECT_ID}" >/dev/null

# 1) Create topic (no-op if exists)
if gcloud pubsub topics describe "${TOPIC}" >/dev/null 2>&1; then
  echo "✓ Topic ${TOPIC} exists"
else
  gcloud pubsub topics create "${TOPIC}"
  echo "✓ Created topic ${TOPIC}"
fi

# 2) Ensure service account exists
if gcloud iam service-accounts describe "${PUSH_SERVICE_ACCOUNT}" >/dev/null 2>&1; then
  echo "✓ Service account exists: ${PUSH_SERVICE_ACCOUNT}"
else
  gcloud iam service-accounts create "$(basename "${PUSH_SERVICE_ACCOUNT%%@*}")" \
    --display-name="Music agent Pub/Sub invoker"
  echo "✓ Created service account ${PUSH_SERVICE_ACCOUNT}"
fi

# 3) Grant Pub/Sub roles needed for push and token signing
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PUSH_SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PUSH_SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  >/dev/null

echo "✓ IAM bindings applied (run.invoker, serviceAccountTokenCreator)"

# 4) Create or update push subscription
if gcloud pubsub subscriptions describe "${SUBSCRIPTION}" >/dev/null 2>&1; then
  gcloud pubsub subscriptions modify-push-config "${SUBSCRIPTION}" \
    --push-endpoint="${SERVICE_URL}/pubsub" \
    --push-auth-service-account="${PUSH_SERVICE_ACCOUNT}"
  echo "✓ Updated push config for subscription ${SUBSCRIPTION}"
else
  gcloud pubsub subscriptions create "${SUBSCRIPTION}" \
    --topic="${TOPIC}" \
    --push-endpoint="${SERVICE_URL}/pubsub" \
    --push-auth-service-account="${PUSH_SERVICE_ACCOUNT}"
  echo "✓ Created push subscription ${SUBSCRIPTION}"
fi

echo
echo "Done. Set PUBSUB_INVOKER_EMAIL=${PUSH_SERVICE_ACCOUNT} in Cloud Run env."

