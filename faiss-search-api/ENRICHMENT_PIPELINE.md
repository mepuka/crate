# Enrichment Pipeline Documentation

## Overview

The FAISS Search API includes several enrichment scripts that fetch and process additional metadata for KEXP plays. These scripts run on scheduled intervals via cron and can also be executed manually.

---

## Architecture

```
KEXP API → sync_plays.py (30s) → fact_plays
                                      ↓
                    ┌─────────────────┼─────────────────┐
                    ↓                 ↓                 ↓
           embed_pending.py    enrich_cover_art   Cloud Pub/Sub
               (1hr)               (inline)        (new-plays)
                    ↓                 ↓                 ↓
           FAISS index +        image_uri        crate-agent
             play_ids            updates         (Cloud Run)
                                                      ↓
                                                AI Insights

fact_plays → extract_links.py → link_content + play_links
                                      ↓
                              Jina AI Reader API

mb_* tables → enrich_mb_entities.py → MusicBrainz API → enriched metadata
```

---

## Enrichment Scripts

### 1. sync_plays.py

**Purpose:** Continuously sync new plays from KEXP API to local database

**Schedule:** Every 30 seconds (via cron with 2 offset jobs)

**Process:**
1. Query `MAX(id)` from `fact_plays` to find last synced play
2. Fetch new plays from KEXP API with pagination
3. Insert new plays into `fact_plays` table (INSERT OR IGNORE)
4. Inline cover art enrichment for plays without images
5. Publish enrichment trigger to Cloud Pub/Sub (if enabled)
6. Triggers auto-populate `master_relations` table

**Features:**
- File-based locking prevents concurrent executions
- Exponential backoff retry for API failures
- Structured JSON logging to stdout
- Inline cover art enrichment from Cover Art Archive
- Cloud Pub/Sub integration for AI insights (opt-in via `PUBSUB_ENABLED=true`)

**Usage:**
```bash
# Manual run
python scripts/sync_plays.py --db-path data/music_kb.sqlite --play-ids-path data/play_ids.npy

# Check logs (in production)
docker exec kexp-search-api tail -f /app/logs/sync.log
```

**Crontab:**
```cron
* * * * * cd /app && python3 /app/scripts/sync_plays.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/sync.log 2>&1
* * * * * sleep 30 && cd /app && python3 /app/scripts/sync_plays.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/sync.log 2>&1
```

**Performance:**
- Typical sync: 0-10 new plays
- Duration: 100-500ms when no new plays
- Duration: 1-5s when syncing 10+ plays

**Status:** ✅ Running in production

---

### 2. embed_pending.py

**Purpose:** Generate embeddings for new plays and add to FAISS index

**Schedule:** Hourly (at minute 5)

**Process:**
1. Load existing `play_ids.npy` to determine which plays have embeddings
2. Query `fact_plays` for plays not in `play_ids.npy`
3. Generate enriched text from play metadata (artist, song, album, DJ comment, labels, etc.)
4. Load BGE-small model and generate 384d embeddings
5. Call `/api/embeddings/add` to update in-memory FAISS index
6. API atomically updates index and persists to disk

**Features:**
- File-based locking prevents concurrent executions
- Batched processing (default: 100 plays per run)
- Matches original embedding generation format
- Calls API endpoint for atomic index updates

**Usage:**
```bash
# Manual run (default: 100 plays)
python scripts/embed_pending.py

# Custom batch size
python scripts/embed_pending.py --limit 50

# Dry run (preview without changes)
python scripts/embed_pending.py --dry-run

# Check logs (in production)
docker exec kexp-search-api tail -f /app/logs/embed.log
```

**Crontab:**
```cron
5 * * * * cd /app && python3 /app/scripts/embed_pending.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/embed.log 2>&1
```

**Performance:**
- Embedding generation: ~2-3s per 100 plays
- API integration: ~5-10s for index update and persistence
- Total: ~10-15s per 100 plays

**Model:** BAAI/bge-small-en-v1.5 (384 dimensions)

**Status:** ✅ Running in production

---

### 3. enrich_cover_art.py

**Purpose:** Fetch missing album cover art from MusicBrainz Cover Art Archive

**Schedule:** Manual (inline enrichment now handled by `sync_plays.py`)

**Process:**
1. Query plays with `release_id` OR `release_group_id` but NULL/empty `image_uri`
2. Fetch from Cover Art Archive (release preferred, then release_group)
3. Follow redirects to get final archive.org URLs
4. Update `image_uri` and `thumbnail_uri` in `fact_plays`

**Features:**
- Rate-limited to 1 request/second (CAA guideline)
- Tries release_id first (more specific), falls back to release_group_id
- Constructs both 500px and 250px thumbnail URLs
- Structured JSON logging

**Usage:**
```bash
# Enrich 100 plays
python scripts/enrich_cover_art.py --batch-size 100

# Dry run (preview without changes)
python scripts/enrich_cover_art.py --batch-size 10 --dry-run --verbose

# Verbose mode
python scripts/enrich_cover_art.py --batch-size 50 --verbose
```

**Performance:**
- ~1s per play (due to 1s rate limit)
- 100 plays = ~100-120 seconds

**Status:** ⚠️ Manual only (inline enrichment in sync_plays.py is preferred)

**Note:** Most cover art enrichment now happens inline during play sync. This script is mainly useful for backfilling historical plays.

---

### 4. enrich_mb_entities.py

**Purpose:** Fetch rich metadata from MusicBrainz API for entities in mb_* tables

**Schedule:** Manual (run as needed)

**Process:**
1. Query mb_* tables for entities where `enriched_at IS NULL`
2. Fetch from MusicBrainz API: `/ws/2/{entity}/{mbid}?fmt=json&inc=url-rels`
3. Extract and store metadata (country, type, URLs, dates, etc.)
4. Update entity record with enriched data and set `enriched_at` timestamp

**Entities Enriched:**
- **Artists:** country, type, disambiguation, begin_area, URLs (official, wikipedia, etc.)
- **Labels:** country, type, disambiguation, label_code, URLs
- **Recordings:** length, disambiguation, ISRC
- **Releases:** country, status, disambiguation, barcode
- **Release Groups:** primary_type, secondary_types, first_release_date, URLs

**Features:**
- Rate-limited to 1 request/second (MusicBrainz API guideline)
- Automatic retry with exponential backoff for 503 responses
- Batch processing with configurable batch size
- Dry-run mode for testing
- Verbose logging

**Usage:**
```bash
# Enrich 100 artists
python scripts/enrich_mb_entities.py --entity-type artist --batch-size 100

# Enrich all entity types (50 of each)
python scripts/enrich_mb_entities.py --entity-type all --batch-size 50 --verbose

# Dry run
python scripts/enrich_mb_entities.py --entity-type release_group --batch-size 10 --dry-run

# Specific entity type
python scripts/enrich_mb_entities.py --entity-type label --batch-size 200
```

**Options:**
- `--db-path`: Path to SQLite database (default: `data/music_kb.sqlite`)
- `--batch-size`: Number of entities to process per run (default: 100)
- `--entity-type`: Which entity to enrich: `artist`, `label`, `recording`, `release`, `release_group`, `all`
- `--dry-run`: Preview changes without writing to database
- `--verbose`: Show detailed progress

**Performance:**
- ~1.1s per entity (rate limit)
- 100 entities = ~110-120 seconds

**Priority Order:**
Entities are ordered by `play_count DESC`, so most popular entities are enriched first.

**Status:** ⚠️ Manual only (run periodically to backfill metadata)

**Rate Limits:**
- MusicBrainz API: 1 request/second
- User-Agent: `Crate/1.0 (https://crate.fm; dev@crate.fm)`

---

### 5. extract_links.py

**Purpose:** Extract links from DJ comments and fetch content via Jina AI Reader

**Schedule:** Manual (run as needed)

**Process:**
1. Find plays with URLs in `comment` field that aren't yet in `link_content`
2. Extract URLs using regex pattern
3. Classify URLs by domain/type
4. Skip domains without meaningful text content (video, music streaming, social media)
5. Fetch content via Jina AI Reader API (returns markdown)
6. Store in `link_content` table and create `play_links` associations

**Features:**
- Smart domain filtering (skips video, streaming, social media, URL shorteners)
- Link type classification (article, artist, reference, event, other)
- Rate-limited to 2 requests/second for Jina API
- Batch processing with configurable batch size
- Dry-run mode to preview what would be fetched
- Deduplication by normalized URL

**Link Types Fetched:**
- **KEXP articles** (122K links!) - blog.kexp.org
- **Bandcamp** (149K links!) - artist bios and album descriptions
- **News/Articles** - Pitchfork, Rolling Stone, Stereogum, Brooklyn Vegan, etc.
- **Reference** - Wikipedia, Discogs, AllMusic, MusicBrainz, RateYourMusic
- **Events** - Bandsintown

**Domains Skipped:**
- Video platforms (YouTube, Vimeo, Dailymotion)
- Music streaming (Soundcloud, Spotify, Apple Music)
- Social media (Twitter, Instagram, Facebook, TikTok)
- Image hosting (Imgur, Giphy)
- URL shorteners (bit.ly, t.co, goo.gl)

**Usage:**
```bash
# Fetch 100 links
python scripts/extract_links.py --batch-size 100 --verbose

# Dry run (preview what would be fetched)
python scripts/extract_links.py --dry-run --batch-size 50

# Show stats (no fetching)
python scripts/extract_links.py --stats

# Custom database path
python scripts/extract_links.py --db-path /path/to/music_kb.sqlite --batch-size 200
```

**Environment Variables:**
```bash
# Optional: Jina API key for higher rate limits
export JINA_API_KEY=your_key_here
```

**Performance:**
- ~0.5s per link (2 requests/second)
- 100 links = ~50-60 seconds
- Actual time varies based on skip ratio

**Status:** ⚠️ Manual only (run periodically to backfill link content)

**API:** Jina AI Reader - https://r.jina.ai/

---

## Cron Schedule

Current production crontab (`crontab` file in repo root):

```cron
# Sync KEXP plays every 30 seconds (two offset cron jobs)
* * * * * cd /app && /usr/local/bin/python3 /app/scripts/sync_plays.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/sync.log 2>&1
* * * * * sleep 30 && cd /app && /usr/local/bin/python3 /app/scripts/sync_plays.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/sync.log 2>&1

# Generate embeddings for pending plays hourly (at minute 5)
5 * * * * cd /app && /usr/local/bin/python3 /app/scripts/embed_pending.py --db-path /app/data/music_kb.sqlite --play-ids-path /app/data/play_ids.npy >> /app/logs/embed.log 2>&1
```

**Installation:**
```bash
# Copy crontab to container and install
docker exec kexp-search-api crontab /app/crontab
docker exec kexp-search-api cron

# Verify crontab is installed
docker exec kexp-search-api crontab -l
```

---

## Monitoring

### Check Logs

```bash
# Sync logs (30s intervals)
docker exec kexp-search-api tail -f /app/logs/sync.log

# Embedding logs (hourly)
docker exec kexp-search-api tail -f /app/logs/embed.log

# Parse JSON logs with jq
docker exec kexp-search-api tail -100 /app/logs/sync.log | jq -r '.message'
```

### Check Database Stats

```bash
# Total plays
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM fact_plays;"

# Plays with embeddings
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM (SELECT id FROM fact_plays) WHERE id IN (SELECT * FROM play_ids.npy);"

# Enriched entities
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM mb_artists WHERE enriched_at IS NOT NULL;"
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM mb_labels WHERE enriched_at IS NOT NULL;"

# Link content stats
sqlite3 data/music_kb.sqlite "SELECT fetch_status, COUNT(*) FROM link_content GROUP BY fetch_status;"
sqlite3 data/music_kb.sqlite "SELECT link_type, COUNT(*) FROM link_content GROUP BY link_type ORDER BY COUNT(*) DESC LIMIT 10;"
```

### Check Service Health

```bash
# API health endpoint
curl https://cratemusic.duckdns.org/api/health | jq

# Memory usage
docker stats --no-stream kexp-search-api
```

---

## Manual Enrichment Workflows

### Backfill Cover Art

```bash
# Enrich 500 plays without cover art
python scripts/enrich_cover_art.py --batch-size 500 --verbose
```

### Backfill MusicBrainz Metadata

```bash
# Enrich top 500 artists by play count
python scripts/enrich_mb_entities.py --entity-type artist --batch-size 500 --verbose

# Enrich all entity types (200 of each)
python scripts/enrich_mb_entities.py --entity-type all --batch-size 200 --verbose
```

### Backfill Link Content

```bash
# Extract and fetch 1000 links
python scripts/extract_links.py --batch-size 1000 --verbose

# Check what would be fetched (dry run)
python scripts/extract_links.py --dry-run --batch-size 100

# Check stats
python scripts/extract_links.py --stats
```

---

## Troubleshooting

### Sync script not running

```bash
# Check if cron is running
docker exec kexp-search-api ps aux | grep cron

# Check crontab is installed
docker exec kexp-search-api crontab -l

# Reinstall crontab
docker exec kexp-search-api crontab /app/crontab
docker exec kexp-search-api service cron start
```

### Embedding script fails

```bash
# Check API is running
curl http://localhost:8000/api/health

# Check model files exist
docker exec kexp-search-api ls -lh /app/data/ | grep -E 'play_ids|embeddings|metadata'

# Check memory usage (may OOM if insufficient RAM)
docker stats --no-stream kexp-search-api
```

### MusicBrainz enrichment rate limited

```bash
# MusicBrainz has strict rate limits (1 req/s)
# If getting 503 errors frequently, reduce batch size or increase delay
python scripts/enrich_mb_entities.py --entity-type artist --batch-size 50
```

### Link extraction errors

```bash
# Check Jina API key is set
echo $JINA_API_KEY

# Test Jina API directly
curl -H "Authorization: Bearer $JINA_API_KEY" https://r.jina.ai/https://kexp.org
```

---

## Performance Benchmarks

| Script | Frequency | Items/Run | Duration | Memory | Status |
|--------|-----------|-----------|----------|--------|--------|
| sync_plays | 30s | 0-10 plays | 100ms-5s | ~50MB | ✅ Running |
| embed_pending | 1hr | 100 plays | ~15s | ~500MB | ✅ Running |
| enrich_cover_art | Manual | 100 plays | ~120s | ~20MB | ⚠️ Manual |
| enrich_mb_entities | Manual | 100 entities | ~120s | ~10MB | ⚠️ Manual |
| extract_links | Manual | 100 links | ~60s | ~30MB | ⚠️ Manual |

---

## Future Enhancements

### Planned
- [ ] Auto-detect stale enrichments and re-fetch updated metadata
- [ ] Webhook-based real-time play sync (instead of polling)
- [ ] Batch embedding generation for historical plays
- [ ] Link content search API endpoint

### Considered
- [ ] Genre classification from MusicBrainz tags
- [ ] Audio feature extraction (tempo, key, energy)
- [ ] Artist similarity graph from MusicBrainz relationships
- [ ] Sentiment analysis of DJ comments

---

## See Also

- [Database Schema](DATABASE_SCHEMA.md)
- [API Documentation](README.md#api-endpoints)
- [Migrations](migrations/)
