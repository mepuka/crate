# FAISS Search API Deployment Guide

This document covers production deployment of the FAISS Search API to Digital Ocean.

## Quick Start

```bash
# Full deployment (data + app)
./scripts/deploy_to_droplet.sh

# App only (no data changes)
./scripts/deploy_to_droplet.sh --app-only

# Data only (no container rebuild)
./scripts/deploy_to_droplet.sh --data-only
```

## Pre-Deployment Checklist

Before deploying, verify:

### 1. Data Files Exist and Are Valid

The deploy script validates these automatically, but you should be aware of requirements:

| File | Location | Min Size | Description |
|------|----------|----------|-------------|
| `embeddings_384d.npy` | `~/Dev/crate/data/` | ~3GB | Embedding vectors (2.2M x 384d) |
| `embeddings_384d.index` | `~/Dev/crate/data/` | ~100KB | FAISS index file |
| `play_ids.npy` | `~/Dev/crate/data/` | ~17MB | Play ID mapping (must match index count) |
| `metadata.json` | `~/Dev/crate/data/` | 50B | Index metadata |
| `music_kb.sqlite` | `faiss-search-api/data/` | ~1.4GB | Play database |

### 2. No Broken Symlinks

The data directory may contain symlinks. The deploy script follows them automatically, but ensure targets exist:

```bash
# Check for broken symlinks
ls -la ~/Dev/crate/data/
ls -la faiss-search-api/data/
```

### 3. SQLite Database State

Ensure the database isn't locked or has uncommitted WAL data:

```bash
# Check WAL file size (should be 0 or small)
ls -la faiss-search-api/data/music_kb.sqlite*

# Force checkpoint if needed
sqlite3 faiss-search-api/data/music_kb.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 4. Index and play_ids Match

The `play_ids.npy` count MUST match the index vector count:

```python
import numpy as np
import faiss

ids = np.load('data/play_ids.npy')
index = faiss.read_index('data/embeddings_384d.index')
assert len(ids) == index.ntotal, f"Mismatch: {len(ids)} vs {index.ntotal}"
```

## Deployment Process

### What the Script Does

1. **Validates data files** - Checks all required files exist and are reasonable sizes
2. **Creates backup** - Backs up current production data before overwriting
3. **Consolidates SQLite WAL** - Ensures clean database state
4. **Follows symlinks** - Uses `rsync -L` to copy actual files, not symlink references
5. **Syncs data** - Uploads data files to droplet
6. **Syncs app code** - Uploads application files
7. **Rebuilds container** - `docker-compose build --no-cache`
8. **Starts services** - `docker-compose up -d`
9. **Verifies health** - Checks API responds correctly

### Backup Location

Backups are stored on the droplet at `/root/faiss-backups/`:

```bash
# List backups
ssh root@cratemusic.duckdns.org 'ls -la /root/faiss-backups/'

# Backup naming: data_backup_YYYYMMDD_HHMMSS.tar.gz
```

Only the last 3 backups are kept.

## Rollback Procedure

If deployment fails:

### 1. Stop Failed Deployment

```bash
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose down'
```

### 2. Restore from Backup

```bash
# List available backups
ssh root@cratemusic.duckdns.org 'ls -la /root/faiss-backups/'

# Restore specific backup
ssh root@cratemusic.duckdns.org 'tar -xzf /root/faiss-backups/data_backup_TIMESTAMP.tar.gz -C /root/faiss-search-api'

# Restart services
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose up -d'
```

### 3. Verify Restoration

```bash
curl https://cratemusic.duckdns.org/api/health
```

## Data Regeneration

### Regenerating play_ids.npy

If play_ids gets out of sync with embeddings:

```bash
ssh root@cratemusic.duckdns.org "docker exec kexp-search-api /opt/venv/bin/python -c \"
import numpy as np
import sqlite3

# Get target count from health endpoint first
# curl https://cratemusic.duckdns.org/api/health | jq .total_vectors
target_count = 2198906  # Update this!

conn = sqlite3.connect('/app/data/music_kb.sqlite')
cursor = conn.cursor()
cursor.execute('SELECT id FROM fact_plays ORDER BY id LIMIT ?', (target_count,))
play_ids = np.array([row[0] for row in cursor.fetchall()], dtype=np.int64)
conn.close()

np.save('/app/data/play_ids.npy', play_ids)
print(f'Saved {len(play_ids):,} play IDs')
\""
```

### Rebuilding FAISS Index

If the index gets corrupted:

```bash
ssh root@cratemusic.duckdns.org "docker exec kexp-search-api /opt/venv/bin/python -c \"
import faiss
import numpy as np

# Load embeddings
embeddings = np.load('/app/data/embeddings_384d.npy', mmap_mode='r')
n_vectors, d = embeddings.shape
print(f'Loaded {n_vectors:,} vectors')

# Create IndexFlatIP
index = faiss.IndexFlatIP(d)

# Add in batches
batch_size = 100000
for i in range(0, n_vectors, batch_size):
    batch = np.array(embeddings[i:min(i+batch_size, n_vectors)], dtype=np.float32)
    faiss.normalize_L2(batch)
    index.add(batch)
    print(f'Added {min(i+batch_size, n_vectors):,} / {n_vectors:,}')

faiss.write_index(index, '/app/data/embeddings_384d.index')
print('Saved index')
\""
```

## Monitoring

### Health Check

```bash
curl https://cratemusic.duckdns.org/api/health
```

Expected response:
```json
{
  "status": "ok",
  "index_loaded": true,
  "database_connected": true,
  "total_vectors": 2198906,
  "embedding_dimension": 384
}
```

### Container Logs

```bash
# API logs
ssh root@cratemusic.duckdns.org 'docker logs -f kexp-search-api'

# Sync logs
ssh root@cratemusic.duckdns.org 'docker exec kexp-search-api tail -f /app/logs/sync.log'

# All services
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose logs -f'
```

### Container Status

```bash
ssh root@cratemusic.duckdns.org 'docker ps --format "table {{.Names}}\t{{.Status}}"'
```

## Troubleshooting

### 502 Bad Gateway

The API container is not running or not responding:

```bash
# Check container status
ssh root@cratemusic.duckdns.org 'docker ps'

# Check logs for errors
ssh root@cratemusic.duckdns.org 'docker logs --tail=50 kexp-search-api'

# Common causes:
# - Database file missing or corrupted
# - FAISS index can't be loaded
# - Python dependencies missing
```

### "database disk image is malformed"

SQLite corruption, usually from copying with active WAL:

```bash
# Restore from backup
ssh root@cratemusic.duckdns.org 'tar -xzf /root/faiss-backups/data_backup_LATEST.tar.gz -C /root/faiss-search-api'
```

### "index out of bounds"

play_ids.npy count doesn't match embeddings:

```bash
# Check counts
ssh root@cratemusic.duckdns.org 'docker exec kexp-search-api /opt/venv/bin/python -c "
import numpy as np
ids = np.load(\"/app/data/play_ids.npy\")
print(f\"play_ids: {len(ids):,}\")
"'

curl https://cratemusic.duckdns.org/api/health | jq .total_vectors
```

Then regenerate play_ids (see above).

### Sync cron not working

Check the crontab uses venv python:

```bash
ssh root@cratemusic.duckdns.org 'docker exec kexp-search-api crontab -l'
# Should show /opt/venv/bin/python, NOT /usr/local/bin/python3

# Check sync log
ssh root@cratemusic.duckdns.org 'docker exec kexp-search-api tail -20 /app/logs/sync.log'
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Digital Ocean Droplet          │
│                                          │
│  ┌─────────┐  ┌──────────────────────┐  │
│  │  nginx  │──│  kexp-search-api     │  │
│  │ :80/443 │  │  :8000               │  │
│  └─────────┘  │                      │  │
│               │  /app/data/          │  │
│               │  ├── music_kb.sqlite │  │
│               │  ├── embeddings.npy  │  │
│               │  ├── embeddings.index│  │
│               │  └── play_ids.npy    │  │
│               │                      │  │
│               │  Cron jobs:          │  │
│               │  - sync_plays.py     │  │
│               │  - embed_pending.py  │  │
│               └──────────────────────┘  │
│                                          │
└─────────────────────────────────────────┘
```

## Security Notes

- Secrets (GCP credentials) are stored in `/root/faiss-search-api/secrets/`
- Secrets are chmod 600
- Never commit secrets to git
- The API is behind nginx with SSL (Let's Encrypt)
