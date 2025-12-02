# KEXP FAISS Search API

Production-ready FastAPI service for semantic search over 2.2M KEXP music plays using FAISS embeddings.

**Live API:** https://cratemusic.duckdns.org

## Current Production Status

| Component | Value |
|-----------|-------|
| Model | BAAI/bge-small-en-v1.5 |
| Embedding Dimension | 384 (native) |
| Total Vectors | 2,198,906 |
| Memory Usage | ~3.2GB |

---

## Documentation

📚 **[Complete Documentation Index](DOCUMENTATION_INDEX.md)** - Full documentation by topic and role

**Quick Links:**
- **[Database Schema](DATABASE_SCHEMA.md)** - Complete database schema and table documentation
- **[Enrichment Pipeline](ENRICHMENT_PIPELINE.md)** - Enrichment scripts, schedules, and workflows
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Production deployment and operations
- **[Timeline API](TIMELINE_API.md)** - Timeline browsing and navigation
- **[Embedding Endpoints](EMBEDDING_ENDPOINTS.md)** - Embedding generation and integration
- **[MBID Filtering](MBID_FILTERING.md)** - MusicBrainz entity filtering and play counts

---

## Features

- **Fast Semantic Search:** ~800ms query latency using FAISS IVFFlat index
- **BGE-small Embeddings:** 384d native vectors, no PCA required
- **Real-time Play Sync:** New plays synced from KEXP API every 30 seconds
- **Timeline API:** Browse 2.2M+ plays chronologically with cursor pagination
- **Enrichment Pipeline:** MusicBrainz metadata, cover art, and link content extraction
- **Full Type Safety:** Pydantic V2 models with validation
- **Auto-Generated Docs:** OpenAPI/Swagger at `/docs`
- **Production-Ready:** Docker deployment, health checks, structured logging

## Quick Start

### Prerequisites

- Python 3.12+
- Docker & Docker Compose (for deployment)
- Data files (see Data Preparation below)

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set up data files (see Data Preparation)
# Copy/symlink data files to ./data/

# Run server
uvicorn app.main:app --reload

# Access docs
open http://localhost:8000/docs
```

### Docker Deployment

```bash
# Build image
docker build -t kexp-search-api .

# Run with docker-compose
docker-compose up -d

# Check health
curl http://localhost:8000/api/health

# View logs
docker-compose logs -f
```

## Data Preparation

Before running the service, prepare these data files in the `data/` directory:

### Required Files (384d BGE-small)

```bash
# From your data directory
cp ../data/embeddings_384d.index data/   # 3.2 GB - FAISS index
cp ../data/play_ids.npy data/            # 17 MB - ID mapping
cp ../data/metadata.json data/           # Model configuration
cp ../data/music_kb.sqlite data/         # SQLite database
```

**Note:** The `embeddings_384d.npy` file is NOT needed at runtime - the FAISS index contains the vectors.

### metadata.json Format

```json
{
  "model_name": "BAAI/bge-small-en-v1.5",
  "embedding_dim": 384,
  "num_vectors": 2198906,
  "index_type": "IVFFlat",
  "nlist": 1024,
  "metric": "inner_product",
  "normalized": true,
  "pca_applied": false
}
```

### 3. Prepare SQLite Database

Option A: Strip down existing database:

```bash
sqlite3 ../data/music_kb.sqlite ".dump plays" | sqlite3 data/music_kb.sqlite
```

Option B: Import from CSV (if full DB too large):

```python
import pandas as pd
import sqlite3

df = pd.read_csv('../analysis/enriched_plays_full.csv')
conn = sqlite3.connect('data/music_kb.sqlite')
df.to_sql('plays', conn, if_exists='replace', index=False)
conn.close()
```

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description | Documentation |
|----------|--------|-------------|---------------|
| `/api/search` | POST | Semantic search over plays | [QUICK_REFERENCE.md](QUICK_REFERENCE.md) |
| `/api/plays/timeline` | GET | Browse plays chronologically | [TIMELINE_API.md](TIMELINE_API.md) |
| `/api/plays/{id}` | GET | Get single play by ID | - |
| `/api/plays/count` | GET | Get play counts by entity | [MBID_FILTERING.md](MBID_FILTERING.md) |
| `/api/health` | GET | Health check | - |

### Embedding Endpoints

| Endpoint | Method | Description | Documentation |
|----------|--------|-------------|---------------|
| `/api/embeddings/pending` | GET | Get plays needing embeddings | [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md) |
| `/api/embeddings/add` | POST | Add embeddings to FAISS index | [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md) |
| `/api/embeddings/pca-model` | GET | Download PCA transformer (legacy) | [EMBEDDING_ENDPOINTS.md](EMBEDDING_ENDPOINTS.md) |

### Example: Semantic Search

**Request:**
```bash
curl -X POST https://cratemusic.duckdns.org/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "psychedelic rock",
    "limit": 20,
    "offset": 0
  }'
```

**Response:**
```json
{
  "results": [
    {
      "id": 119583,
      "artist": "IDLES",
      "song": "Mr. Motivator",
      "similarity": 0.4461,
      ...
    }
  ],
  "total": 856,
  "query_time_ms": 17.3,
  "query": "psychedelic rock"
}
```

### Example: Timeline Browsing

```bash
# First page (newest plays)
curl https://cratemusic.duckdns.org/api/plays/timeline?limit=50

# Jump to March 2015
curl https://cratemusic.duckdns.org/api/plays/timeline?since=2015-03-01T00:00:00&limit=50

# Next page using cursor
curl https://cratemusic.duckdns.org/api/plays/timeline?cursor={next_cursor}&limit=50
```

## Configuration

Environment variables (set in docker-compose.yml):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | data/music_kb.sqlite | SQLite database |
| `INDEX_PATH` | data/embeddings_384d.index | FAISS index |
| `PLAY_IDS_PATH` | data/play_ids.npy | ID mapping |
| `METADATA_PATH` | data/metadata.json | Index config |
| `MODEL_NAME` | BAAI/bge-small-en-v1.5 | Embedding model |
| `EMBEDDING_DIM` | 384 | Embedding dimension |
| `CORS_ORIGINS` | * | Allowed origins |
| `LOG_LEVEL` | INFO | Logging level |

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_api.py::test_search_endpoint_valid -v
```

### Performance Benchmarks

Benchmark database trigger performance for MusicBrainz canonical tables:

```bash
# Default benchmark (10k inserts)
python scripts/benchmark_triggers.py

# Custom insert count
python scripts/benchmark_triggers.py --count 50000

# Save to file database for inspection
python scripts/benchmark_triggers.py --db-path /tmp/benchmark.db
```

**Benchmark Results (as of 2024-11-13):**

| Insert Count | Total Time | Inserts/Second | Avg Time/Insert | Status |
|--------------|------------|----------------|-----------------|---------|
| 10,000       | 0.32s      | 30,971/s       | 0.032 ms        | Excellent |
| 50,000       | 1.73s      | 28,962/s       | 0.035 ms        | Excellent |
| 100,000      | 3.64s      | 27,456/s       | 0.036 ms        | Excellent |

Performance consistently exceeds target baseline (>2,000 inserts/second). The triggers perform 6 INSERT or UPDATE operations per play insert (artists, recordings, tracks, releases, release_groups, labels) with JSON parsing and MIN() calculations for first_seen preservation.

## Deployment to Digital Ocean Droplet

### Setup Droplet

```bash
# SSH into droplet
ssh root@64.227.104.135

# Install Docker
apt update
apt install -y docker.io docker-compose
systemctl enable docker

# Create application directory
mkdir -p /opt/kexp-search/{data,logs}
```

### Copy Data Files

```bash
# From local machine
scp data/* root@64.227.104.135:/opt/kexp-search/data/
```

### Deploy Application

```bash
# Copy application files
scp -r faiss-search-api/* root@64.227.104.135:/opt/kexp-search/

# SSH into droplet
ssh root@64.227.104.135

# Navigate to app directory
cd /opt/kexp-search

# Start service
docker-compose up -d

# Verify
curl http://localhost:8000/api/health
```

### Configure Firewall

```bash
ufw allow 22/tcp   # SSH
ufw allow 8000/tcp # API
ufw enable
```

## Architecture

```
Query → FastAPI → SearchService (FAISS) → indices
                              ↓
                     get_play_ids(indices) → play_ids
                              ↓
                     DatabaseService (SQLite) → plays
                              ↓
                     Merge plays + similarity → Response
```

## Performance

- **Query Latency:** ~800ms first query, ~100ms subsequent (warm cache)
- **Memory Usage:** ~3.2GB (FAISS index + model)
- **Startup Time:** ~45 seconds (FAISS index loading)
- **Container Limit:** 3.5GB (4GB droplet)

**Note:** BM25/Hybrid search is disabled due to memory constraints on 4GB droplet.

## Enrichment Pipeline

The API includes several enrichment scripts that run on scheduled intervals:

| Script | Schedule | Purpose | Status |
|--------|----------|---------|--------|
| `sync_plays.py` | Every 30s | Sync new plays from KEXP API | ✅ Running |
| `embed_pending.py` | Hourly | Generate embeddings for new plays | ✅ Running |
| `enrich_mb_entities.py` | Manual | Fetch MusicBrainz entity metadata | ⚠️ Manual |
| `enrich_cover_art.py` | Manual | Fetch missing cover art | ⚠️ Manual |
| `extract_links.py` | Manual | Extract and fetch link content | ⚠️ Manual |

See [ENRICHMENT_PIPELINE.md](ENRICHMENT_PIPELINE.md) for detailed documentation.

### Running Enrichment Scripts

```bash
# Enrich MusicBrainz metadata for top 100 artists
python scripts/enrich_mb_entities.py --entity-type artist --batch-size 100

# Extract links from DJ comments
python scripts/extract_links.py --batch-size 100 --verbose

# Backfill cover art
python scripts/enrich_cover_art.py --batch-size 100
```

---

## Database Schema

The database includes the following table groups:

- **Core Tables:** `fact_plays` (2.2M+ rows)
- **MusicBrainz Entities:** `mb_artists`, `mb_labels`, `mb_recordings`, `mb_releases`, `mb_release_groups`, `mb_tracks`
- **Link Content:** `link_content`, `play_links`
- **Enrichments:** `enrichment_types`, `enrichments`
- **Relationships:** `master_relations`
- **Search:** `entities_fts` (FTS5 full-text search)

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for complete schema documentation.

---

## Monitoring

### Check Logs

```bash
# Sync logs (30s intervals)
docker exec kexp-search-api tail -f /app/logs/sync.log

# Embedding logs (hourly)
docker exec kexp-search-api tail -f /app/logs/embed.log

# API logs
docker-compose logs -f api
```

### Check Service Health

```bash
# Health endpoint
curl https://cratemusic.duckdns.org/api/health | jq

# Memory usage
docker stats --no-stream kexp-search-api
```

### Database Stats

```bash
# Total plays
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM fact_plays;"

# Enriched entities
sqlite3 data/music_kb.sqlite "SELECT COUNT(*) FROM mb_artists WHERE enriched_at IS NOT NULL;"

# Link content stats
sqlite3 data/music_kb.sqlite "SELECT fetch_status, COUNT(*) FROM link_content GROUP BY fetch_status;"
```

---

## Troubleshooting

### Service won't start

Check logs:
```bash
docker-compose logs api
```

Common issues:
- Missing data files → Verify all files in `data/`
- Out of memory → Check `docker stats`, may need to increase container memory
- Port conflict → Change PORT in docker-compose.yml

### Search returns no results

- Verify embeddings and play_ids alignment
- Check FAISS index loaded: `curl /api/health`
- Increase FAISS_NPROBE for better recall

### Enrichment scripts not running

```bash
# Check cron is running
docker exec kexp-search-api ps aux | grep cron

# Check crontab is installed
docker exec kexp-search-api crontab -l

# Reinstall crontab
docker exec kexp-search-api crontab /app/crontab
docker exec kexp-search-api service cron start
```

## License

See parent project LICENSE

## References

- [Database Schema Documentation](DATABASE_SCHEMA.md)
- [Enrichment Pipeline Documentation](ENRICHMENT_PIPELINE.md)
- [Timeline API Documentation](TIMELINE_API.md)
- [Embedding Endpoints Documentation](EMBEDDING_ENDPOINTS.md)
- Design Doc: `docs/plans/2025-11-11-faiss-search-api-design.md`
- Notebook: `analysis/notebooks/03_faiss_search_exploration.ipynb`
