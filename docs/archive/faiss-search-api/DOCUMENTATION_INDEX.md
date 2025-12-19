# Documentation Index

Complete documentation for the KEXP FAISS Search API.

---

## Quick Links

| Document | Purpose | Audience |
|----------|---------|----------|
| [README](README.md) | Overview, quick start, API basics | Everyone |
| [Database Schema](DATABASE_SCHEMA.md) | Complete schema documentation | Developers, DBAs |
| [Enrichment Pipeline](ENRICHMENT_PIPELINE.md) | Scripts, schedules, workflows | Operators, Developers |
| [Deployment Guide](DEPLOYMENT_GUIDE.md) | Production deployment | Operators, DevOps |
| [Timeline API](TIMELINE_API.md) | Timeline endpoint details | Frontend Developers |
| [Embedding Endpoints](EMBEDDING_ENDPOINTS.md) | Embedding generation API | ML Engineers |
| [MBID Filtering](MBID_FILTERING.md) | Entity filtering and play counts | Frontend Developers |
| [Quick Reference](QUICK_REFERENCE.md) | Quick command reference | Everyone |

---

## Getting Started

### For First-Time Users

1. **Start here:** [README.md](README.md) - Overview and quick start
2. **Try the API:** [Timeline API](TIMELINE_API.md) - Browse plays chronologically
3. **Search:** Send POST to `/api/search` with query text

### For Developers

1. **Database:** [Database Schema](DATABASE_SCHEMA.md) - Understand data model
2. **API Endpoints:** [README.md#api-endpoints](README.md#api-endpoints) - Available endpoints
3. **Enrichment:** [Enrichment Pipeline](ENRICHMENT_PIPELINE.md) - Background processes

### For Operators

1. **Deploy:** [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production setup
2. **Monitor:** [Enrichment Pipeline#monitoring](ENRICHMENT_PIPELINE.md#monitoring) - Check health
3. **Maintain:** [Database Schema#maintenance](DATABASE_SCHEMA.md#maintenance) - Database ops

---

## Documentation by Topic

### API Usage

- **Search:** [README#api-endpoints](README.md#api-endpoints)
- **Timeline:** [TIMELINE_API.md](TIMELINE_API.md)
- **Entity Filtering:** [MBID_FILTERING.md](MBID_FILTERING.md)
- **Embeddings:** [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md)

### Database

- **Schema:** [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- **Tables:** [DATABASE_SCHEMA#core-tables](DATABASE_SCHEMA.md#core-tables)
- **Relationships:** [DATABASE_SCHEMA#relationship-tables](DATABASE_SCHEMA.md#relationship-tables)
- **Query Patterns:** [DATABASE_SCHEMA#query-patterns](DATABASE_SCHEMA.md#query-patterns)

### Enrichment

- **Overview:** [ENRICHMENT_PIPELINE.md](ENRICHMENT_PIPELINE.md)
- **Scripts:** [ENRICHMENT_PIPELINE#enrichment-scripts](ENRICHMENT_PIPELINE.md#enrichment-scripts)
- **Schedules:** [ENRICHMENT_PIPELINE#cron-schedule](ENRICHMENT_PIPELINE.md#cron-schedule)
- **Monitoring:** [ENRICHMENT_PIPELINE#monitoring](ENRICHMENT_PIPELINE.md#monitoring)

### Operations

- **Deployment:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Updates:** [DEPLOYMENT_GUIDE#updating-deployment](DEPLOYMENT_GUIDE.md#updating-deployment)
- **Monitoring:** [DEPLOYMENT_GUIDE#monitoring](DEPLOYMENT_GUIDE.md#monitoring)
- **Troubleshooting:** [DEPLOYMENT_GUIDE#troubleshooting](DEPLOYMENT_GUIDE.md#troubleshooting)

---

## Documentation by Role

### Frontend Developer

**Building a UI for browsing and searching KEXP plays?**

1. [Timeline API](TIMELINE_API.md) - Chronological browsing
2. [README#api-endpoints](README.md#api-endpoints) - Search endpoint
3. [MBID_FILTERING.md](MBID_FILTERING.md) - Filter by artist/album/etc.

**Key Endpoints:**
- `GET /api/plays/timeline` - Browse chronologically
- `POST /api/search` - Semantic search
- `GET /api/plays/{id}` - Get single play
- `GET /api/plays/count` - Entity play counts

### Backend Developer

**Working on the API or enrichment pipeline?**

1. [Database Schema](DATABASE_SCHEMA.md) - Data model
2. [Enrichment Pipeline](ENRICHMENT_PIPELINE.md) - Background jobs
3. [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md) - Embedding integration

**Key Files:**
- `app/main.py` - FastAPI application
- `app/services/` - Search, database, hybrid search services
- `scripts/` - Enrichment and sync scripts

### ML Engineer

**Working with embeddings and search?**

1. [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md) - Embedding API
2. [README#features](README.md#features) - BGE-small model info
3. [ENRICHMENT_PIPELINE#embed_pending.py](ENRICHMENT_PIPELINE.md#2-embed_pendingpy)

**Key Concepts:**
- Model: BAAI/bge-small-en-v1.5 (384d)
- Index: FAISS IVFFlat with nlist=1024
- Alignment: `play_ids.npy` maps FAISS indices to play IDs

### DevOps / SRE

**Deploying or maintaining the service?**

1. [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production setup
2. [ENRICHMENT_PIPELINE#monitoring](ENRICHMENT_PIPELINE.md#monitoring) - Health checks
3. [DATABASE_SCHEMA#maintenance](DATABASE_SCHEMA.md#maintenance) - Database ops

**Key Operations:**
- Deploy updates: rsync + docker-compose restart
- Check health: `/api/health` endpoint
- Monitor cron: tail logs in `/app/logs/`

### Data Analyst

**Analyzing KEXP play data?**

1. [Database Schema](DATABASE_SCHEMA.md) - Table structure
2. [DATABASE_SCHEMA#query-patterns](DATABASE_SCHEMA.md#query-patterns) - Example queries
3. [MBID_FILTERING.md](MBID_FILTERING.md) - Entity relationships

**Key Tables:**
- `fact_plays` - 2.2M+ play records
- `mb_artists`, `mb_labels`, etc. - Entity metadata
- `link_content` - DJ comment links and content

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Production System                       │
└─────────────────────────────────────────────────────────────┘

Internet
   │
   ↓
HTTPS (Nginx)
   │
   ↓
FastAPI Server ──────────────────┐
   │                             │
   ├→ /api/search ───> FAISS     │
   ├→ /api/plays/timeline → DB   │
   ├→ /api/health               │
   └→ /api/embeddings/*          │
                                 │
Cron Jobs (Background)           │
   │                             │
   ├→ sync_plays.py (30s)        │
   │    └→ KEXP API              │
   │                             │
   └→ embed_pending.py (1hr)     │
        └→ BGE-small model ──────┘
                                 │
Data Layer                       │
   │                             │
   ├→ music_kb.sqlite ───────────┘
   │    - fact_plays (2.2M rows)
   │    - mb_* tables (entities)
   │    - link_content
   │    - master_relations
   │
   ├→ embeddings_384d.index (FAISS)
   └→ play_ids.npy (alignment)

Manual Enrichment (as needed)
   │
   ├→ enrich_mb_entities.py → MusicBrainz API
   ├→ enrich_cover_art.py → Cover Art Archive
   └→ extract_links.py → Jina AI Reader
```

---

## Data Flow

### 1. Play Ingestion (Every 30 seconds)

```
KEXP API
   │
   ↓
sync_plays.py
   │
   ├─→ fact_plays (INSERT new plays)
   ├─→ Cover Art Archive (inline enrichment)
   └─→ Triggers → master_relations
```

### 2. Embedding Generation (Hourly)

```
fact_plays (plays without embeddings)
   │
   ↓
embed_pending.py
   │
   ├─→ BGE-small model (generate 384d embeddings)
   └─→ /api/embeddings/add
        │
        └─→ FAISS index + play_ids.npy (atomic update)
```

### 3. MusicBrainz Enrichment (Manual)

```
mb_artists/labels/recordings/releases/release_groups
   │ (where enriched_at IS NULL)
   ↓
enrich_mb_entities.py
   │
   ↓
MusicBrainz API
   │
   └─→ Update mb_* tables with metadata
       (country, type, URLs, dates, etc.)
```

### 4. Link Extraction (Manual)

```
fact_plays.comment (with URLs)
   │
   ↓
extract_links.py
   │
   ├─→ Extract URLs (regex)
   ├─→ Classify by domain
   ├─→ Jina AI Reader API (fetch content)
   └─→ link_content + play_links tables
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| **Total Plays** | 2,198,906 |
| **Total Artists** | ~150,000 |
| **Total Labels** | ~30,000 |
| **Database Size** | ~800MB |
| **FAISS Index Size** | ~3.2GB |
| **Memory Usage** | ~3.2GB (API) |
| **Sync Frequency** | Every 30s |
| **Embed Frequency** | Hourly |
| **API Latency** | ~800ms (search), <5ms (timeline) |

---

## Common Tasks

### Search for plays

```bash
curl -X POST https://cratemusic.duckdns.org/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "dream pop", "limit": 20}'
```

### Browse timeline

```bash
# Newest plays
curl https://cratemusic.duckdns.org/api/plays/timeline?limit=50

# Jump to date
curl https://cratemusic.duckdns.org/api/plays/timeline?since=2020-01-01T00:00:00&limit=50
```

### Check sync status

```bash
docker exec kexp-search-api tail -20 /app/logs/sync.log | jq -r '.message'
```

### Enrich entities

```bash
# Enrich top 100 artists
docker exec kexp-search-api python /app/scripts/enrich_mb_entities.py \
  --entity-type artist --batch-size 100 --verbose
```

### Extract links

```bash
# Extract 100 links from DJ comments
docker exec kexp-search-api python /app/scripts/extract_links.py \
  --batch-size 100 --verbose
```

---

## FAQ

### Where is the FAISS index built?

The FAISS index is built offline using `analysis/notebooks/` and then deployed to production. New embeddings are added incrementally via `/api/embeddings/add`.

### How often is the data synced?

- **Plays:** Every 30 seconds from KEXP API
- **Embeddings:** Hourly (for new plays)
- **MusicBrainz metadata:** Manual (run as needed)
- **Link content:** Manual (run as needed)

### What is the embedding model?

BAAI/bge-small-en-v1.5 (384 dimensions, no PCA). Embeddings are generated from play metadata: artist, song, album, DJ comment, labels, rotation status, etc.

### Can I filter by artist/album/label?

Yes, use the `/api/plays/count` endpoint with MBIDs. See [MBID_FILTERING.md](MBID_FILTERING.md) for details.

### How do I add new enrichment scripts?

1. Create script in `scripts/`
2. Add to crontab if scheduled
3. Document in [ENRICHMENT_PIPELINE.md](ENRICHMENT_PIPELINE.md)
4. Update [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) if adding tables

### How do I run migrations?

```bash
docker exec kexp-search-api python /app/scripts/run_migration.py \
  --migration /app/migrations/YOUR_MIGRATION.sql
```

See [DEPLOYMENT_GUIDE#database-migrations](DEPLOYMENT_GUIDE.md#database-migrations) for details.

---

## Need Help?

1. **Check the docs** - Use this index to find relevant documentation
2. **Check logs** - `docker-compose logs -f` or `/app/logs/`
3. **Check health** - `curl https://cratemusic.duckdns.org/api/health`
4. **Troubleshooting guides** - See [DEPLOYMENT_GUIDE#troubleshooting](DEPLOYMENT_GUIDE.md#troubleshooting)

---

## Contributing

When adding new features or fixing bugs:

1. **Update documentation** - Keep docs in sync with code
2. **Add examples** - Include usage examples in relevant docs
3. **Update this index** - Add new docs to the quick links table
4. **Test deployment** - Verify changes in production

---

Last Updated: 2025-12-02
