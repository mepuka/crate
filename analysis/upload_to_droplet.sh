#!/bin/bash
# Upload updated embeddings/index to Droplet and restart API

set -e  # Exit on error

DROPLET="root@cratemusic.duckdns.org"
REMOTE_DIR="/root/faiss-search-api/data"
LOCAL_DIR="."

echo "========================================="
echo "Upload Embeddings to Droplet"
echo "========================================="
echo ""

# Check files exist
if [ ! -f "play_ids_new.npy" ]; then
    echo "❌ Error: play_ids_new.npy not found"
    exit 1
fi

if [ ! -f "embeddings_256d_new.index" ]; then
    echo "❌ Error: embeddings_256d_new.index not found"
    exit 1
fi

echo "✓ All files found locally"
echo ""

# Show file sizes
echo "File sizes:"
ls -lh play_ids_new.npy embeddings_256d_new.index | awk '{print "  " $9 ": " $5}'
echo ""

# Confirm upload
read -p "Upload these files to Droplet? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Uploading files..."
echo ""

# Backup existing files on Droplet
echo "1. Creating backups on Droplet..."
ssh $DROPLET "cd $REMOTE_DIR && \
    cp play_ids.npy play_ids.npy.backup 2>/dev/null || true && \
    cp embeddings_256d.index embeddings_256d.index.backup 2>/dev/null || true"
echo "   ✓ Backups created"
echo ""

# Upload new files (ONLY .index and play_ids - .index contains the vectors!)
echo "2. Uploading new files..."
scp -C play_ids_new.npy ${DROPLET}:${REMOTE_DIR}/play_ids.npy
echo "   ✓ Uploaded play_ids.npy"

scp -C embeddings_256d_new.index ${DROPLET}:${REMOTE_DIR}/embeddings_256d.index
echo "   ✓ Uploaded embeddings_256d.index"
echo ""

# Remove old embeddings.npy to save 2.1GB (index contains vectors)
echo "3. Removing redundant embeddings.npy on Droplet (saves 2.1GB)..."
ssh $DROPLET "rm -f ${REMOTE_DIR}/embeddings_256d.npy ${REMOTE_DIR}/embeddings_256d.npy.backup"
echo "   ✓ Cleaned up"
echo ""

# Restart API
echo "4. Restarting API service..."
ssh $DROPLET "cd /root/faiss-search-api && docker-compose restart api"
echo "   ✓ API restarted"
echo ""

# Wait for health check
echo "5. Waiting for API to be healthy (30s)..."
sleep 30

# Verify
echo "6. Verifying new data..."
ssh $DROPLET "curl -s http://localhost/api/health" | jq '.total_vectors, .memory_usage_mb'
echo ""

echo "========================================="
echo "✅ Upload Complete!"
echo "========================================="
echo ""
echo "The API is now serving the updated embeddings."
echo ""
echo "Verify at: http://cratemusic.duckdns.org/api/health"
