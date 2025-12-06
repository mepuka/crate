# Docker Improvements Plan

## Current Issues

### 1. Image Size: 7.9GB
The `sentence-transformers` package pulls in PyTorch (~2GB) and transformer dependencies. No multi-stage build means all build artifacts remain in final image.

### 2. No Build Cache Optimization
Any change to `requirements.txt` invalidates the entire pip install layer.

### 3. Data Safety Concerns
- Bind mounts (`./data:/app/data`) tie data to specific host paths
- No backup strategy for 13GB SQLite database
- Orphan volumes accumulate on rebuilds

### 4. Process Management
- Cron runs inside API container (violates single-process principle)
- No graceful shutdown handling
- 5-minute health check start period is arbitrary

### 5. Cleanup
- Old images accumulate on rebuilds
- No automated pruning

---

## Proposed Changes

### Phase 1: Dockerfile Optimization

**New multi-stage Dockerfile:**

```dockerfile
# =============================================================================
# Stage 1: Builder - Install dependencies
# =============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Stage 2: Runtime - Minimal production image
# =============================================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /root/.cache

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY app/ ./app/

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Expected size reduction:** 7.9GB → ~3-4GB (removing build tools, caches)

---

### Phase 2: docker-compose.yml Improvements

```yaml
services:
  api:
    build:
      context: .
      target: runtime
    container_name: crate-api
    expose:
      - "8000"
    volumes:
      - crate-data:/app/data:rw
    environment:
      - DATABASE_PATH=/app/data/music_kb.sqlite
      - EMBEDDINGS_PATH=/app/data/embeddings_384d.npy
      - PLAY_IDS_PATH=/app/data/play_ids.npy
      - INDEX_PATH=/app/data/embeddings_384d.index
      - MODEL_NAME=BAAI/bge-small-en-v1.5
      - EMBEDDING_DIM=384
      - CORS_ORIGINS=*
      - LOG_LEVEL=INFO
    deploy:
      resources:
        limits:
          memory: 3.5G
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - crate-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 180s
      retries: 3

  sync-worker:
    build:
      context: .
      target: runtime
    container_name: crate-sync
    volumes:
      - crate-data:/app/data:rw
      - ./scripts:/app/scripts:ro
    environment:
      - DATABASE_PATH=/app/data/music_kb.sqlite
      - PLAY_IDS_PATH=/app/data/play_ids.npy
      - SYNC_INTERVAL=30
    command: ["python", "-m", "scripts.sync_loop"]
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"
    networks:
      - crate-network
    depends_on:
      api:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    container_name: crate-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - nginx-logs:/var/log/nginx
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - crate-network
    command: >
      /bin/sh -c 'while :; do sleep 6h & wait $${!}; nginx -s reload; done & nginx -g "daemon off;"'

  certbot:
    image: certbot/certbot
    container_name: crate-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: >
      /bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

networks:
  crate-network:
    driver: bridge

volumes:
  crate-data:
    name: crate-music-data
  nginx-logs:
    name: crate-nginx-logs
```

**Key changes:**
- Named volumes (`crate-data`) instead of bind mounts
- Separate `sync-worker` container for cron-like operations
- Non-root user in container
- Health check dependency for startup order
- Removed deprecated `version` key

---

### Phase 3: Sync Worker Script

Create `/scripts/sync_loop.py`:

```python
#!/usr/bin/env python3
"""Sync worker - runs sync_plays.py in a loop."""

import os
import subprocess
import time
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SYNC_INTERVAL = int(os.getenv('SYNC_INTERVAL', 30))
DB_PATH = os.getenv('DATABASE_PATH', '/app/data/music_kb.sqlite')
PLAY_IDS_PATH = os.getenv('PLAY_IDS_PATH', '/app/data/play_ids.npy')

def run_sync():
    """Run the sync script."""
    try:
        result = subprocess.run(
            ['python', '/app/scripts/sync_plays.py',
             '--db-path', DB_PATH,
             '--play-ids-path', PLAY_IDS_PATH],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            logger.error(f"Sync failed: {result.stderr}")
        else:
            logger.info("Sync completed successfully")
    except subprocess.TimeoutExpired:
        logger.error("Sync timed out")
    except Exception as e:
        logger.error(f"Sync error: {e}")

if __name__ == '__main__':
    logger.info(f"Starting sync worker (interval: {SYNC_INTERVAL}s)")
    while True:
        run_sync()
        time.sleep(SYNC_INTERVAL)
```

---

### Phase 4: Deploy Script with Cleanup

Update `deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== Deploying FAISS Search API ==="

# Stop old containers
docker-compose down

# Prune old images (keep last 24h)
echo "Cleaning up old images..."
docker image prune -a --filter "until=24h" -f

# Build new image
echo "Building new image..."
docker-compose build --no-cache

# Start services
echo "Starting services..."
docker-compose up -d

# Wait for health check
echo "Waiting for API health..."
sleep 10
for i in {1..30}; do
    if curl -sf http://localhost:8000/api/health > /dev/null; then
        echo "API is healthy!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 10
done

# Show status
docker-compose ps
docker system df

echo "=== Deployment complete ==="
```

---

### Phase 5: Backup Strategy

Add `backup.sh`:

```bash
#!/bin/bash
# Backup SQLite database to compressed archive

BACKUP_DIR="/root/backups"
DB_PATH="/root/faiss-search-api/data/music_kb.sqlite"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/music_kb_${TIMESTAMP}.sqlite.gz"

mkdir -p "$BACKUP_DIR"

# Use sqlite3 backup command for consistent backup
sqlite3 "$DB_PATH" ".backup /tmp/music_kb_backup.sqlite"
gzip -c /tmp/music_kb_backup.sqlite > "$BACKUP_FILE"
rm /tmp/music_kb_backup.sqlite

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/music_kb_*.sqlite.gz | tail -n +8 | xargs -r rm

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
```

Add to crontab:
```
0 3 * * * /root/faiss-search-api/backup.sh >> /var/log/backup.log 2>&1
```

---

## Migration Plan

1. **Backup current database** before any changes
2. **Test locally** with new Dockerfile/compose
3. **Create named volume** from existing bind mount data
4. **Deploy new stack** with zero-downtime approach
5. **Verify health** and sync functionality
6. **Clean up** old images and containers

---

## Benefits

| Improvement | Before | After |
|-------------|--------|-------|
| Image size | 7.9GB | ~3-4GB |
| Build time | Full rebuild | Layer caching |
| Data safety | Bind mount | Named volume + backups |
| Process isolation | Cron in API | Separate worker |
| Cleanup | Manual | Automated |
| Security | Root user | Non-root user |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Full backup before changes |
| Service disruption | Health check dependencies, gradual rollout |
| Volume permission issues | Test with non-root user locally first |
| Sync timing changes | Monitor logs after deployment |
