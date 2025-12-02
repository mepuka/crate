# Deployment Guide

## Production Environment

**Server:** Digital Ocean Droplet (4GB RAM, 2 vCPU)
**OS:** Ubuntu 22.04 LTS
**Domain:** cratemusic.duckdns.org
**IP:** 64.227.104.135
**Container:** `kexp-search-api` (Docker)

---

## Architecture

```
Internet → HTTPS (443) → Nginx → FastAPI (8000) → SQLite + FAISS
                                      ↓
                            Cron Jobs (sync, embed)
```

**Components:**
- **Nginx:** SSL termination, reverse proxy, caching
- **FastAPI:** API server with FAISS search and timeline endpoints
- **SQLite:** Database with 2.2M+ play records and entity metadata
- **FAISS:** In-memory semantic search index (384d BGE-small embeddings)
- **Cron:** Background jobs for sync and embedding generation

---

## Initial Setup

### 1. Create Droplet

```bash
# Create 4GB droplet via Digital Ocean dashboard
# - Image: Ubuntu 22.04 LTS
# - Size: 4GB RAM, 2 vCPU, 80GB SSD
# - Region: San Francisco 3
# - Authentication: SSH keys

# Note droplet IP
DROPLET_IP=64.227.104.135
```

### 2. Configure DNS

```bash
# Point domain to droplet IP using DuckDNS
curl "https://www.duckdns.org/update?domains=cratemusic&token=YOUR_TOKEN&ip=$DROPLET_IP"
```

### 3. Initial Server Setup

```bash
# SSH into droplet
ssh root@$DROPLET_IP

# Update system
apt update && apt upgrade -y

# Install Docker
apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker

# Install other tools
apt install -y git vim htop cron

# Create application directory
mkdir -p /root/faiss-search-api/data
mkdir -p /root/faiss-search-api/logs
```

### 4. Deploy Application

```bash
# From local machine, copy application files
rsync -avz --exclude '.git' --exclude 'data' --exclude '.venv' \
  /Users/pooks/Dev/crate/faiss-search-api/ \
  root@$DROPLET_IP:/root/faiss-search-api/

# Copy data files separately (large files)
rsync -avz --progress \
  /Users/pooks/Dev/crate/faiss-search-api/data/ \
  root@$DROPLET_IP:/root/faiss-search-api/data/
```

### 5. Configure Environment

```bash
# SSH into droplet
ssh root@$DROPLET_IP
cd /root/faiss-search-api

# Create .env file
cat > .env <<EOF
DATABASE_PATH=data/music_kb.sqlite
INDEX_PATH=data/embeddings_384d.index
PLAY_IDS_PATH=data/play_ids.npy
METADATA_PATH=data/metadata.json
MODEL_NAME=BAAI/bge-small-en-v1.5
EMBEDDING_DIM=384
CORS_ORIGINS=*
LOG_LEVEL=INFO
FAISS_NLIST=1024
FAISS_NPROBE=32
JINA_API_KEY=your_jina_key_here
EOF
```

### 6. Build and Start

```bash
# Build Docker image
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify services
docker ps
curl http://localhost:8000/api/health
```

### 7. Configure SSL

```bash
# Install certbot
apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
certbot --nginx -d cratemusic.duckdns.org

# Test auto-renewal
certbot renew --dry-run
```

### 8. Install Crontab

```bash
# Install crontab in container
docker exec kexp-search-api crontab /app/crontab

# Start cron service
docker exec kexp-search-api service cron start

# Verify crontab
docker exec kexp-search-api crontab -l
```

### 9. Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (redirect to HTTPS)
ufw allow 443/tcp  # HTTPS
ufw enable

# Verify
ufw status
```

---

## Updating Deployment

### Update Application Code

```bash
# From local machine
cd /Users/pooks/Dev/crate/faiss-search-api

# Sync code changes
rsync -avz --exclude '.git' --exclude 'data' --exclude '.venv' \
  . root@cratemusic.duckdns.org:/root/faiss-search-api/

# SSH into server
ssh root@cratemusic.duckdns.org
cd /root/faiss-search-api

# Rebuild and restart
docker-compose build
docker-compose up -d

# Verify
curl https://cratemusic.duckdns.org/api/health
```

### Update Data Files

```bash
# From local machine - sync database
rsync -avz --progress \
  data/music_kb.sqlite \
  root@cratemusic.duckdns.org:/root/faiss-search-api/data/

# Sync FAISS index and play_ids
rsync -avz --progress \
  data/embeddings_384d.index \
  data/play_ids.npy \
  root@cratemusic.duckdns.org:/root/faiss-search-api/data/

# Restart to reload data
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose restart'
```

---

## Database Migrations

### Running Migrations

```bash
# SSH into droplet
ssh root@cratemusic.duckdns.org

# Run migration script
docker exec kexp-search-api python /app/scripts/run_migration.py \
  --migration /app/migrations/002_add_mb_entity_metadata.sql

# Verify migration
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite \
  "SELECT * FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 5;"
```

### Manual Migration

```bash
# If migration script not available, run SQL directly
docker exec -i kexp-search-api sqlite3 /app/data/music_kb.sqlite < migrations/002_add_mb_entity_metadata.sql
```

---

## Monitoring

### Check Service Status

```bash
# Container status
docker ps
docker stats --no-stream

# API health
curl https://cratemusic.duckdns.org/api/health | jq

# Logs
docker-compose logs -f
docker exec kexp-search-api tail -f /app/logs/sync.log
docker exec kexp-search-api tail -f /app/logs/embed.log
```

### Check Resource Usage

```bash
# Memory usage
free -h
docker stats --no-stream

# Disk usage
df -h
du -sh /root/faiss-search-api/data/*

# CPU usage
htop
```

### Check Cron Jobs

```bash
# Verify crontab installed
docker exec kexp-search-api crontab -l

# Check cron logs
docker exec kexp-search-api tail -100 /app/logs/sync.log | jq -r '.message'
docker exec kexp-search-api tail -100 /app/logs/embed.log | jq -r '.message'

# Check last sync
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite \
  "SELECT COUNT(*), MAX(airdate) FROM fact_plays;"
```

---

## Backup and Restore

### Backup Database

```bash
# From local machine
rsync -avz --progress \
  root@cratemusic.duckdns.org:/root/faiss-search-api/data/music_kb.sqlite \
  backups/music_kb_$(date +%Y%m%d).sqlite

# Verify backup
sqlite3 backups/music_kb_$(date +%Y%m%d).sqlite "SELECT COUNT(*) FROM fact_plays;"
```

### Restore Database

```bash
# From local machine
rsync -avz --progress \
  backups/music_kb_20250101.sqlite \
  root@cratemusic.duckdns.org:/root/faiss-search-api/data/music_kb.sqlite

# Restart service
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose restart'
```

---

## Performance Tuning

### Docker Memory Limits

Edit `docker-compose.yml`:

```yaml
services:
  api:
    image: kexp-search-api
    mem_limit: 3500m  # Leave 500MB for system
    memswap_limit: 3500m  # Disable swap
```

### SQLite Optimization

```bash
# Vacuum database (reclaim space)
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "VACUUM;"

# Analyze database (update statistics)
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "ANALYZE;"

# Check WAL mode (should be enabled)
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "PRAGMA journal_mode;"
```

### FAISS Index Tuning

Adjust `nprobe` for recall/speed tradeoff in `.env`:

```bash
# Low recall, fast (current)
FAISS_NPROBE=32

# High recall, slower
FAISS_NPROBE=64

# Rebuild container after changes
docker-compose restart
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs api

# Check disk space
df -h

# Check memory
free -h

# Common fixes:
# 1. Out of memory → Reduce FAISS_NLIST or container mem_limit
# 2. Missing data files → Verify data/ directory has all files
# 3. Port conflict → Check if port 8000 is in use
```

### Cron Jobs Not Running

```bash
# Check cron service
docker exec kexp-search-api ps aux | grep cron

# Start cron
docker exec kexp-search-api service cron start

# Check crontab
docker exec kexp-search-api crontab -l

# Reinstall crontab
docker exec kexp-search-api crontab /app/crontab
```

### Database Locked Errors

```bash
# Check WAL mode
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "PRAGMA journal_mode;"

# Enable WAL mode if not enabled
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "PRAGMA journal_mode=WAL;"

# Check for stale lock files
docker exec kexp-search-api ls -la /app/data/*.db-*
```

### High Memory Usage

```bash
# Check memory
docker stats --no-stream kexp-search-api

# If OOM, reduce memory usage:
# 1. Disable hybrid search (already disabled)
# 2. Reduce FAISS_NLIST in .env
# 3. Increase container memory limit in docker-compose.yml
```

### SSL Certificate Renewal

```bash
# Check certificate expiry
certbot certificates

# Renew manually
certbot renew

# Check auto-renewal timer
systemctl status certbot.timer
```

---

## Security Checklist

- [x] SSH key authentication (no password login)
- [x] UFW firewall configured (only 22, 80, 443 open)
- [x] SSL certificate installed and auto-renewing
- [x] Regular backups scheduled
- [x] API key for sensitive endpoints (embedding integration)
- [x] CORS configured for specific origins
- [ ] Rate limiting on API endpoints (TODO)
- [ ] Database backups to external storage (TODO)

---

## Useful Commands

```bash
# Quick health check
curl https://cratemusic.duckdns.org/api/health | jq '.status,.total_vectors,.last_sync'

# Check recent plays
curl https://cratemusic.duckdns.org/api/plays/timeline?limit=5 | jq '.results[].artist'

# Search test
curl -X POST https://cratemusic.duckdns.org/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "shoegaze", "limit": 5}' | jq '.results[].artist'

# Check database size
docker exec kexp-search-api du -h /app/data/music_kb.sqlite

# Check logs with jq
docker exec kexp-search-api tail -100 /app/logs/sync.log | jq -r '[.timestamp,.level,.message] | @tsv'

# Restart everything
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose restart'
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `data/music_kb.sqlite` | SQLite database path |
| `INDEX_PATH` | `data/embeddings_384d.index` | FAISS index path |
| `PLAY_IDS_PATH` | `data/play_ids.npy` | Play IDs alignment file |
| `METADATA_PATH` | `data/metadata.json` | Index metadata |
| `MODEL_NAME` | `BAAI/bge-small-en-v1.5` | Embedding model |
| `EMBEDDING_DIM` | `384` | Embedding dimension |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `LOG_LEVEL` | `INFO` | Logging level |
| `FAISS_NLIST` | `1024` | FAISS IVF clusters |
| `FAISS_NPROBE` | `32` | FAISS search clusters |
| `JINA_API_KEY` | - | Jina AI Reader API key (optional) |

---

## See Also

- [README](README.md)
- [Database Schema](DATABASE_SCHEMA.md)
- [Enrichment Pipeline](ENRICHMENT_PIPELINE.md)
- [HTTPS Setup](HTTPS_SETUP.md)
