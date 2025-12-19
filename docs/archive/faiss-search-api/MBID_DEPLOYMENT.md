# MBID Filtering - Production Deployment Guide

## Overview

This guide covers deploying the MBID filtering feature to production (cratemusic.duckdns.org).

## Deployment Architecture

**Droplet**: ubuntu-s-2vcpu-4gb-sfo3-01 (64.227.104.135)
**Deploy Path**: /root/faiss-search-api
**Docker**: 3 containers (api, nginx, certbot)
**Domain**: cratemusic.duckdns.org (HTTPS via Let's Encrypt)

### Volume Mounts
```
Host: /root/faiss-search-api/data → Container: /app/data
Host: /root/faiss-search-api/scripts → Container: /app/scripts (read-only)
Host: /root/faiss-search-api/logs → Container: /app/logs
```

### Database Location
- **Host**: /root/faiss-search-api/data/music_kb.sqlite
- **Container**: /app/data/music_kb.sqlite

## Deployment Steps

### Step 1: Deploy New Code

From your local machine:

```bash
cd /Users/pooks/Dev/crate/faiss-search-api

# Deploy application only (data stays the same)
./scripts/deploy_to_droplet.sh --app-only
```

This will:
1. Sync all application code to /root/faiss-search-api
2. Rebuild Docker image with new code
3. Restart containers
4. Wait 30 seconds for startup
5. Verify health endpoint

**Expected Output:**
```
=========================================
KEXP FAISS Search API Deployment
=========================================

✓ Droplet IP: 64.227.104.135
Mode: Application files only

Syncing application files...
✓ Application files synced

Deploying with Docker Compose...
✓ Docker containers started

Waiting for service to initialize (30 seconds)...

Verifying deployment...
{"status":"healthy",...}

✓ Deployment complete!
```

### Step 2: Create MBID Indexes (CRITICAL)

After deployment, create the database indexes:

```bash
# SSH to droplet
ssh root@64.227.104.135

# Run index creation inside the Docker container
docker exec kexp-search-api python /app/scripts/add_mbid_indexes.py /app/data/music_kb.sqlite
```

**Expected Output:**
```
Adding MBID indexes to /app/data/music_kb.sqlite...
  ✓ Created/verified index: idx_fact_plays_recording_id
  ✓ Created/verified index: idx_fact_plays_release_id
  ✓ Created/verified index: idx_fact_plays_release_group_id
  ✓ Created/verified index: idx_fact_plays_artist_ids

Verifying indexes...
Found 4 MBID-related indexes:
  - idx_fact_plays_artist_ids
  - idx_fact_plays_recording_id
  - idx_fact_plays_release_id
  - idx_fact_plays_release_group_id

✓ MBID indexes added successfully!
```

**Important Notes:**
- Run this AFTER deploying the code (script needs to be present)
- Run INSIDE the container (not on host - Python deps)
- Indexes are idempotent - safe to run multiple times
- No downtime required - SQLite allows online index creation

Exit SSH:
```bash
exit
```

### Step 3: Restart API Container (Optional)

If you want a clean restart after index creation:

```bash
ssh root@64.227.104.135 'cd /root/faiss-search-api && docker-compose restart api'
```

Wait ~10 seconds for restart.

### Step 4: Verify Deployment

Test the API endpoints:

```bash
# Test health (should work immediately)
curl https://cratemusic.duckdns.org/api/health

# Test basic timeline (existing functionality)
curl "https://cratemusic.duckdns.org/api/plays/timeline?limit=5"

# Test MBID filtering (NEW FEATURE)
# Example: Filter by Radiohead's artist MBID
curl "https://cratemusic.duckdns.org/api/plays/timeline?artist_mbid=a74b1b7f-71a5-4011-9441-d0b5e4122711&limit=5"

# Test with multiple filters
curl "https://cratemusic.duckdns.org/api/plays/timeline?artist_mbid=a74b1b7f-71a5-4011-9441-d0b5e4122711&limit=5&since=2024-01-01T00:00:00"
```

### Step 5: Verify Indexes Are Being Used

Check query performance:

```bash
# Should return quickly (<50ms query_time_ms)
curl "https://cratemusic.duckdns.org/api/plays/timeline?artist_mbid=a74b1b7f-71a5-4011-9441-d0b5e4122711&limit=50" | jq '.query_time_ms'
```

## Complete Deployment Command Sequence

```bash
# 1. Deploy new code
cd /Users/pooks/Dev/crate/faiss-search-api && ./scripts/deploy_to_droplet.sh --app-only

# 2. Create indexes (after deployment completes)
ssh root@64.227.104.135 'docker exec kexp-search-api python /app/scripts/add_mbid_indexes.py /app/data/music_kb.sqlite'

# 3. Verify
curl https://cratemusic.duckdns.org/api/health
curl "https://cratemusic.duckdns.org/api/plays/timeline?artist_mbid=a74b1b7f-71a5-4011-9441-d0b5e4122711&limit=5"
```

## Troubleshooting

### Script Not Found

If you get "script not found" when creating indexes:

```bash
# Verify script exists in container
ssh root@64.227.104.135 'docker exec kexp-search-api ls -la /app/scripts/ | grep mbid'

# If missing, redeploy
cd /Users/pooks/Dev/crate/faiss-search-api && ./scripts/deploy_to_droplet.sh --app-only
```

### Container Not Running

Check container status:

```bash
ssh root@64.227.104.135 'docker ps'
```

If API container is not running:

```bash
# Check logs
ssh root@64.227.104.135 'docker logs kexp-search-api'

# Restart
ssh root@64.227.104.135 'cd /root/faiss-search-api && docker-compose restart api'
```

### MBID Filters Not Working

1. **Check indexes were created:**
   ```bash
   ssh root@64.227.104.135 'docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite ".indexes fact_plays"'
   ```

2. **Check for errors in logs:**
   ```bash
   ssh root@64.227.104.135 'docker logs kexp-search-api --tail 100'
   ```

3. **Verify code is deployed:**
   ```bash
   ssh root@64.227.104.135 'docker exec kexp-search-api grep -r "artist_mbid" /app/app/main.py'
   ```

## Rollback Plan

If issues arise:

```bash
# 1. Stop containers
ssh root@64.227.104.135 'cd /root/faiss-search-api && docker-compose down'

# 2. Restore previous code (if backed up)
# OR redeploy from previous git commit

# 3. Restart
ssh root@64.227.104.135 'cd /root/faiss-search-api && docker-compose up -d'
```

**Note**: MBID indexes are safe to keep - they don't break existing queries.

## Monitoring

View live logs:

```bash
# All containers
ssh root@64.227.104.135 'cd /root/faiss-search-api && docker-compose logs -f'

# API only
ssh root@64.227.104.135 'docker logs -f kexp-search-api'

# Last 100 lines
ssh root@64.227.104.135 'docker logs kexp-search-api --tail 100'
```

## Performance Verification

After deployment, monitor:

1. **Query times** - Should remain <500ms for timeline
2. **Memory usage** - Should stay ~2-2.5GB
3. **Startup time** - Should be ~7-10 seconds

Check with:

```bash
# Memory
ssh root@64.227.104.135 'docker stats kexp-search-api --no-stream'

# Query time (check query_time_ms in response)
curl "https://cratemusic.duckdns.org/api/plays/timeline?limit=50" | jq '.query_time_ms'
```

## Post-Deployment Checklist

- [ ] Code deployed successfully
- [ ] Containers running (docker ps shows all 3)
- [ ] Health endpoint returns 200
- [ ] Basic timeline works
- [ ] MBID indexes created (4 indexes)
- [ ] MBID filtering works
- [ ] Query performance acceptable (<50ms)
- [ ] No errors in logs
- [ ] HTTPS works via cratemusic.duckdns.org

## Reference

- **Deployment Script**: scripts/deploy_to_droplet.sh
- **MBID Index Script**: scripts/add_mbid_indexes.py
- **MBID Documentation**: MBID_FILTERING.md
- **API Documentation**: https://cratemusic.duckdns.org/docs
