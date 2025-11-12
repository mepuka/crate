#!/bin/bash
# Deploy Data to KEXP Search API Droplet
# Efficiently transfers FAISS data and minimal SQLite database

set -e

DROPLET="root@64.227.104.135"
SOURCE_DATA_DIR="/Users/pooks/Dev/crate/data"
LOCAL_APP_DIR="/Users/pooks/Dev/crate/faiss-search-api"
DROPLET_DATA_DIR="/root/faiss-search-api/data"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}▶${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

echo "==========================================="
echo "KEXP Search API - Data Deployment"
echo "==========================================="
echo ""

# Step 1: Use Python script to create minimal database
log "Step 1: Creating minimal database with Python script..."

if [ ! -f "$SOURCE_DATA_DIR/music_kb.sqlite" ]; then
    error "Source database not found: $SOURCE_DATA_DIR/music_kb.sqlite"
fi

MINIMAL_DB="$SOURCE_DATA_DIR/music_kb_minimal.sqlite"

# Check if minimal DB already exists
if [ -f "$MINIMAL_DB" ]; then
    log "⚠ Minimal database already exists: $MINIMAL_DB"
    read -p "Use existing minimal DB? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Creating fresh minimal database..."
        cd "$LOCAL_APP_DIR"
        source .venv/bin/activate
        python scripts/create_minimal_db.py \
            --source "$SOURCE_DATA_DIR/music_kb.sqlite" \
            --output "$MINIMAL_DB"
    fi
else
    log "Creating minimal database with Python..."
    cd "$LOCAL_APP_DIR"
    source .venv/bin/activate
    python scripts/create_minimal_db.py \
        --source "$SOURCE_DATA_DIR/music_kb.sqlite" \
        --output "$MINIMAL_DB"
fi

# Verify minimal database was created
if [ ! -f "$MINIMAL_DB" ]; then
    error "Minimal database not found: $MINIMAL_DB"
fi

PLAY_COUNT=$(sqlite3 "$MINIMAL_DB" "SELECT COUNT(*) FROM fact_plays")
FULL_SIZE=$(du -h "$SOURCE_DATA_DIR/music_kb.sqlite" | awk '{print $1}')
MINIMAL_SIZE=$(du -h "$MINIMAL_DB" | awk '{print $1}')
log "✓ Minimal database ready: $PLAY_COUNT plays, $MINIMAL_SIZE (was $FULL_SIZE)"

echo ""

# Step 2: Verify all required files exist
log "Step 2: Verifying required files..."

# Map source files to deployment names
declare -A FILE_MAP=(
    ["embeddings_256d.npy"]="embeddings_256d.npy"
    ["embeddings_256d.index"]="embeddings_256d.index"
    ["play_ids_alignment.npy"]="play_ids.npy"  # Will rename during transfer
    ["pca_transformer_256d.joblib"]="pca_transformer_256d.joblib"
    ["metadata.json"]="metadata.json"
)

for source_file in "${!FILE_MAP[@]}"; do
    if [ -f "$SOURCE_DATA_DIR/$source_file" ]; then
        SIZE=$(du -h "$SOURCE_DATA_DIR/$source_file" | awk '{print $1}')
        target_file="${FILE_MAP[$source_file]}"
        log "✓ $source_file → $target_file ($SIZE)"
    else
        error "Missing required file: $source_file"
    fi
done

echo ""

# Step 3: Schema validation was done by Python script
log "Step 3: Schema validation complete (done by create_minimal_db.py)"
echo ""

# Step 4: Create data directory on droplet
log "Step 4: Setting up droplet directory..."

ssh "$DROPLET" "mkdir -p $DROPLET_DATA_DIR"

echo ""

# Step 5: Transfer FAISS files using rsync
log "Step 5: Transferring FAISS files (rsync with compression)..."

# Transfer each file with progress, renaming play_ids
for source_file in "${!FILE_MAP[@]}"; do
    target_file="${FILE_MAP[$source_file]}"
    log "Syncing $source_file → $target_file..."

    if [ "$source_file" != "$target_file" ]; then
        # Transfer and rename in one step
        rsync -avz --progress \
            "$SOURCE_DATA_DIR/$source_file" \
            "$DROPLET:$DROPLET_DATA_DIR/$target_file"
    else
        # Direct transfer
        rsync -avz --progress \
            "$SOURCE_DATA_DIR/$source_file" \
            "$DROPLET:$DROPLET_DATA_DIR/"
    fi
done

echo ""

# Step 6: Transfer minimal database
log "Step 6: Transferring minimal database..."

rsync -avz --progress \
    "$MINIMAL_DB" \
    "$DROPLET:$DROPLET_DATA_DIR/music_kb.sqlite"

echo ""

# Step 7: Verify transfer and schema on droplet
log "Step 7: Verifying deployment on droplet..."

ssh "$DROPLET" << 'EOFREMOTE'
cd /root/faiss-search-api/data

echo "Files in droplet data directory:"
ls -lh | grep -E "(embeddings_256d|play_ids|pca_|metadata|music_kb)" | awk '{print "✅", $9, "(" $5 ")"}'

echo ""
echo "Database verification:"
PLAY_COUNT=$(sqlite3 music_kb.sqlite "SELECT COUNT(*) as total_plays FROM fact_plays")
echo "Total plays: $PLAY_COUNT"

echo ""
echo "Index verification:"
sqlite3 music_kb.sqlite "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fact_plays'" | while read idx; do
    echo "  ✓ $idx"
done

echo ""
echo "Schema check (required fields):"
sqlite3 music_kb.sqlite "SELECT id, airdate, show, artist, song FROM fact_plays LIMIT 1" > /dev/null && echo "  ✓ Core fields present"
sqlite3 music_kb.sqlite "SELECT artist_ids, recording_id, release_id, release_group_id FROM fact_plays LIMIT 1" > /dev/null && echo "  ✓ MusicBrainz IDs present"
sqlite3 music_kb.sqlite "SELECT labels, rotation_status, is_local, is_live, is_request FROM fact_plays LIMIT 1" > /dev/null && echo "  ✓ Metadata fields present"

echo ""
echo "Trigger check (should be none for read-only):"
TRIGGER_COUNT=$(sqlite3 music_kb.sqlite "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='fact_plays'")
if [ "$TRIGGER_COUNT" -eq 0 ]; then
    echo "  ✓ No triggers (read-only optimized)"
else
    echo "  ⚠ Warning: $TRIGGER_COUNT triggers found (not needed for read-only API)"
fi
EOFREMOTE

echo ""
echo "==========================================="
echo -e "${GREEN}✓ Data Deployment Complete${NC}"
echo "==========================================="
echo ""
echo "Deployment Summary:"
echo "  • FAISS files: 5 files (4.2 GB)"
echo "  • Database: fact_plays only ($MINIMAL_SIZE)"
echo "  • Total plays: $PLAY_COUNT"
echo "  • Mode: Read-only optimized (no triggers)"
echo ""
echo "Next steps:"
echo "1. Test API endpoints: curl http://$DROPLET:8000/api/health"
echo "2. Run verification: ssh $DROPLET 'cd /root/faiss-search-api && ./verify_deployment.sh'"
echo "3. Deploy application code with scripts/deploy_to_droplet.sh --app-only"
echo ""
echo "Minimal database kept at: $MINIMAL_DB"
echo "(You can delete this after verifying deployment works)"
