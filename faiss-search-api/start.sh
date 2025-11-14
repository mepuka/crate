#!/bin/bash
# Startup script for KEXP Search API with cron-based sync

set -e

echo "Starting KEXP Search API..."

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Install crontab
echo "Installing crontab..."
crontab /app/crontab
echo "Crontab installed:"
crontab -l

# Start cron in background
echo "Starting cron daemon..."
cron

# Run initial sync to catch up
echo "Running initial sync..."
python /app/scripts/sync_plays.py \
    --db-path /app/data/music_kb.sqlite \
    --play-ids-path /app/data/play_ids.npy \
    >> /app/logs/sync.log 2>&1 || echo "Initial sync failed (will retry via cron)"

# Start API server in foreground
echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
