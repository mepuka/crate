#!/bin/bash
# Download MusicBrainz JSON dumps
# Usage: ./scripts/download_mb_dumps.sh [entity_type]
# Example: ./scripts/download_mb_dumps.sh label

BASE="http://ftp.musicbrainz.org/pub/musicbrainz/data/json-dumps"

# Get the latest directory name dynamically
echo "Resolving latest dump version..."
LATEST=$(curl -s "$BASE/LATEST" | tr -d '[:space:]')
URL="$BASE/$LATEST"

echo "Latest version: $LATEST"
echo "Base URL: $URL"

if [ -z "$1" ]; then
    echo ""
    echo "Usage: $0 <entity_type>"
    echo "Example: $0 label"
    echo ""
    echo "Available dumps:"
    echo "- area"
    echo "- artist"
    echo "- event"
    echo "- instrument"
    echo "- label"
    echo "- place"
    echo "- recording"
    echo "- release"
    echo "- release-group"
    echo "- series"
    echo "- work"
    exit 0
fi

ENTITY=$1
FILE="$ENTITY.tar.xz"
DEST_DIR="mb_dumps"

mkdir -p "$DEST_DIR"

echo "Downloading $ENTITY from $URL/$FILE..."
wget -c "$URL/$FILE" -P "$DEST_DIR"

echo "Download complete: $DEST_DIR/$FILE"
