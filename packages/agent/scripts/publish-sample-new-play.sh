#!/usr/bin/env bash
set -euo pipefail

# Publish a sample new-play message to Pub/Sub for end-to-end testing.
# Requires gcloud auth on the target project.
#
# Usage:
#   PROJECT_ID=my-proj \
#   TOPIC=new-play \
#   PLAY_IDS="123,456,789" \
#   ./packages/agent/scripts/publish-sample-new-play.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${TOPIC:=new-play}"
: "${PLAY_IDS:?PLAY_IDS is required (comma-separated numbers)}"

IFS=',' read -ra PLAY_ID_ARRAY <<< "${PLAY_IDS}"
PAYLOAD=$(jq -n --argjson ids "$(printf '%s\n' "${PLAY_ID_ARRAY[@]}" | jq -R . | jq -s 'map(tonumber)')" '{play_ids: $ids}')

echo "Publishing to topic ${TOPIC} in project ${PROJECT_ID}: ${PAYLOAD}"

gcloud pubsub topics publish "${TOPIC}" \
  --project "${PROJECT_ID}" \
  --message "${PAYLOAD}"

echo "✓ Published. Check Cloud Run logs for processing results."

