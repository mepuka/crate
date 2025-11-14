# KEXP FAISS Search API

Production-ready FastAPI service for semantic search over 2.2M KEXP music plays using FAISS embeddings.

## Features

- **Fast Semantic Search:** <20ms query latency using FAISS IVF index
- **Full Type Safety:** Pydantic V2 models with validation
- **Auto-Generated Docs:** OpenAPI/Swagger at `/docs`
- **Production-Ready:** Docker deployment, health checks, structured logging
- **Future-Proof:** Index-to-ID mapping for safe re-indexing

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

### 1. Create play_ids.npy Mapping

```bash
python scripts/create_play_ids_mapping.py \
  --csv ../analysis/enriched_plays_full.csv \
  --output data/play_ids.npy
```

### 2. Copy Existing Files

```bash
# From your analysis directory
cp ../data/embeddings_256d.npy data/
cp ../data/embeddings_256d.index data/
cp ../data/pca_transformer_256d.joblib data/
cp ../data/metadata.json data/
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

### POST /api/search

Semantic search over music plays.

**Request:**
```json
{
  "query": "psychedelic rock",
  "limit": 20,
  "offset": 0
}
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

### GET /api/health

Health check endpoint.

### GET /api/plays/{play_id}

Get single play by ID.

## Configuration

Environment variables (see `.env.example`):

- `DATABASE_PATH`: Path to SQLite database
- `EMBEDDINGS_PATH`: Path to embeddings .npy file
- `PLAY_IDS_PATH`: Path to play_ids .npy mapping
- `PCA_PATH`: Path to PCA transformer
- `INDEX_PATH`: Path to FAISS index
- `CORS_ORIGINS`: Comma-separated allowed origins
- `LOG_LEVEL`: Logging level (INFO, DEBUG, etc.)

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

- **Query Latency:** <20ms (verified in production)
- **Memory Usage:** ~3GB (embeddings + index + model)
- **Throughput:** 50+ queries/sec
- **Startup Time:** 30-60 seconds

## Troubleshooting

### Service won't start

Check logs:
```bash
docker-compose logs api
```

Common issues:
- Missing data files → Verify all files in `data/`
- Out of memory → Reduce FAISS_NLIST or allocate more RAM
- Port conflict → Change PORT in docker-compose.yml

### Search returns no results

- Verify embeddings and play_ids alignment
- Check FAISS index loaded: `curl /api/health`
- Increase FAISS_NPROBE for better recall

## License

See parent project LICENSE

## References

- Design Doc: `docs/plans/2025-11-11-faiss-search-api-design.md`
- Notebook: `analysis/notebooks/03_faiss_search_exploration.ipynb`
