# FAISS Search API Design

**Date:** 2025-11-11
**Status:** Approved for Implementation
**Target Deployment:** Digital Ocean Droplet (configured via .env)

## Overview

Production-ready REST API service for semantic search over 2.2M KEXP music plays using FAISS embeddings. Powers an Effect-based frontend with infinite scroll and exploratory search.

## Goals

- **Simple & Robust:** Single FastAPI service, SQLite + FAISS, minimal dependencies
- **Fast:** <20ms query latency, optimized for low traffic
- **Production-Ready:** Full type safety, OpenAPI docs, error handling, monitoring
- **Future-Proof:** Index-to-ID mapping for safe re-indexing
- **Deployable:** Docker container on 4GB Digital Ocean droplet

## Non-Goals

- High-traffic optimization (>100 req/min)
- Complex caching layers
- Real-time embedding updates (handled by separate batch scripts)
- Full MusicBrainz integration (enrichment happens on frontend)

## Architecture

### Service Structure

**Simple Monolith Approach:**
- Single FastAPI application
- FAISS index + embeddings loaded at startup (stay in memory)
- SQLite database for structured play metadata
- All components in one Docker container

**Why Monolith:**
- Low traffic requirements
- Simplifies deployment and operations
- Fast queries (no network hops)
- Fits comfortably in 4GB RAM

### Directory Structure

```
faiss-search-api/
├── app/
│   ├── main.py                    # FastAPI app, endpoints, lifespan
│   ├── services/
│   │   ├── search_service.py      # FAISS search (refactored from notebook)
│   │   └── db_service.py          # SQLite queries
│   ├── models.py                  # Pydantic request/response models
│   └── config.py                  # Settings (paths, CORS, etc.)
├── data/                          # Mounted volume or local
│   ├── embeddings_256d.npy        # PCA-reduced embeddings (2.2GB)
│   ├── play_ids.npy               # Index-to-ID mapping (NEW)
│   ├── embeddings_256d.index      # FAISS IVF index
│   ├── pca_transformer_256d.joblib # PCA model
│   ├── metadata.json              # Model metadata
│   └── music_kb.sqlite            # Stripped-down database
├── tests/
│   ├── test_search_service.py
│   ├── test_db_service.py
│   └── test_api.py
├── scripts/
│   └── create_play_ids_mapping.py # Generate play_ids.npy from CSV
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

### Data Flow

```
User Query: "psychedelic rock"
    ↓
FastAPI /api/search endpoint
    ↓
SearchService.search(query, k=1000)
    ├─→ Encode query: 768d → PCA → 256d → normalize
    ├─→ FAISS.search() → indices [119583, 549310, ...]
    └─→ Map indices → play_ids.npy[indices] → [3518527, 3518526, ...]
    ↓
Paginate: play_ids[offset:offset+limit]
    ↓
DatabaseService.get_plays_by_ids(play_ids)
    ↓
Merge: plays + similarity scores
    ↓
Return: SearchResponse with PlayResult[]
```

## API Design

### Endpoints

#### POST /api/search

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
      "album": "Live At KEXP",
      "similarity": 0.4461,
      "airdate": "2020-10-15T14:23:00-07:00",
      "labels": ["KEXP"],
      "rotation_status": "Library",
      "is_local": false,
      "is_live": true,
      "is_request": false,
      "comment": "High energy performance...",
      "show": 63830,
      "artist_mbid": "...",
      "recording_mbid": "..."
    }
  ],
  "total": 856,
  "query_time_ms": 17.3,
  "query": "psychedelic rock"
}
```

**Pagination:**
- FAISS returns top 1000 most similar plays
- API slices results using offset/limit
- Frontend uses infinite scroll with incremental offsets

#### GET /api/health

Service health check.

**Response:**
```json
{
  "status": "ok",
  "index_loaded": true,
  "total_vectors": 2193235,
  "embedding_dimension": 256,
  "memory_usage_mb": 2847.3,
  "uptime_seconds": 3600.5
}
```

#### GET /api/plays/{play_id}

Get single play by ID.

**Response:** Same as PlayResult in search response.

### Models

**Full Pydantic V2 type safety:**
- `SearchRequest`: Query validation, field limits
- `SearchResponse`: Consistent response shape
- `PlayResult`: Complete play metadata + similarity
- `HealthResponse`: Service status

**Benefits:**
- Auto-generated OpenAPI docs
- Request validation with helpful errors
- Type safety for IDE support
- Guaranteed response contracts

## Data Storage

### Index-to-ID Mapping (Future-Proof)

**Problem:** Relying on CSV row order is fragile. Re-indexing breaks alignment.

**Solution:** `play_ids.npy` - parallel array mapping embedding indices to play IDs.

```python
# Generation (run once):
csv_df = pd.read_csv("enriched_plays_full.csv")
play_ids = csv_df['id'].to_numpy()
np.save("data/play_ids.npy", play_ids)

# Usage at runtime:
faiss_indices = [119583, 549310, ...]  # From FAISS search
actual_play_ids = play_ids[faiss_indices]  # O(1) lookup
```

**Benefits:**
- Order-independent
- Fast (numpy array indexing)
- Simple (one file)
- Re-indexing safe

### SQLite Database

**Schema:**
```sql
CREATE TABLE plays (
    id INTEGER PRIMARY KEY,
    artist TEXT NOT NULL,
    song TEXT NOT NULL,
    album TEXT,
    airdate TEXT,
    labels TEXT,  -- JSON array
    rotation_status TEXT,
    is_local INTEGER,
    is_live INTEGER,
    is_request INTEGER,
    comment TEXT,
    show INTEGER,
    -- MusicBrainz IDs
    artist_mbid TEXT,
    recording_mbid TEXT,
    release_mbid TEXT,
    release_group_mbid TEXT
);

CREATE INDEX idx_plays_artist ON plays(artist);
CREATE INDEX idx_plays_mbid ON plays(recording_mbid);
```

**Data Source:** `enriched_plays_full.csv` (all columns preserved)

**Size Estimates:**
- 2.2M rows × ~500 bytes/row ≈ 1.1GB uncompressed
- With indices: ~1.5GB
- Fits comfortably in 80GB disk

**MusicBrainz Strategy:**
- Store MBIDs in database
- Frontend can fetch full MB data on-demand (agentic enrichment)
- Keeps backend simple and fast

## FastAPI Best Practices

### Type Safety
- Pydantic V2 models with field validators
- Full type hints throughout
- `ConfigDict(from_attributes=True)` for ORM-like usage

### OpenAPI Documentation
- `/docs` - Swagger UI
- `/redoc` - ReDoc
- Rich descriptions, examples, response codes
- Tags for endpoint organization

### Dependency Injection
```python
def get_search_service() -> FAISSSearchService:
    if search_service is None:
        raise HTTPException(503, "Service not ready")
    return search_service

@app.post("/api/search")
async def search(
    request: SearchRequest,
    search_svc: FAISSSearchService = Depends(get_search_service)
):
    ...
```

**Benefits:**
- Testable (inject mocks)
- Clean separation of concerns
- Proper error handling

### Lifespan Management
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load FAISS, PCA, SQLite
    global search_service, db_service
    search_service = FAISSSearchService(...)
    search_service.initialize()
    db_service = DatabaseService(...)

    yield  # Server runs

    # Shutdown: close connections
    db_service.close()

app = FastAPI(lifespan=lifespan)
```

### Middleware
- **CORS:** Configured for Effect frontend
- **GZip:** Compress responses >1KB
- **Logging:** Structured logs to stdout → systemd journal

### Error Handling
- Validation errors → 400 with details
- FAISS failures → 500 (service unusable without it)
- SQL failures → Return partial results with warning
- Graceful degradation where possible

## Resource Requirements

### Memory (4GB RAM)
- Embeddings: ~2.2GB (256d × 2.2M × 4 bytes)
- FAISS index: ~200MB (IVF overhead)
- Sentence-transformers model: ~400MB
- Python + FastAPI: ~200MB
- **Total: ~3GB** - fits with headroom

### Disk (80GB)
- SQLite: ~1.5GB
- Embeddings + index: ~2.5GB
- Model cache: ~500MB
- Logs, Docker images: ~2GB
- **Total: ~7GB** - plenty of space

### Performance
- Query latency: <20ms (verified in notebook)
- Throughput: 50+ queries/sec (low traffic OK)
- Startup time: 30-60 seconds (loading embeddings)

## Deployment

### Target Environment
- **Droplet:** (configured via deployment)
- **IP:** ${DROPLET_IP} (configured via .env)
- **Specs:** 4GB RAM, 2 vCPUs, 80GB disk
- **OS:** Ubuntu 24.10

### Docker Setup

**Dockerfile:**
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/

# Data volume will be mounted
VOLUME ["/app/data"]

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Run
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data:ro
      - ./logs:/app/logs
    environment:
      - DATABASE_PATH=/app/data/music_kb.sqlite
      - EMBEDDINGS_PATH=/app/data/embeddings_256d.npy
      - PLAY_IDS_PATH=/app/data/play_ids.npy
      - PCA_PATH=/app/data/pca_transformer_256d.joblib
      - INDEX_PATH=/app/data/embeddings_256d.index
      - CORS_ORIGINS=http://localhost:3000,https://yourfrontend.com
      - LOG_LEVEL=INFO
    restart: unless-stopped
    mem_limit: 3.5g
```

### Droplet Setup Checklist

1. **Security Hardening:**
   - Create non-root user with sudo
   - Disable root SSH login
   - Set up SSH keys (password auth disabled)
   - Configure UFW firewall

2. **Firewall Configuration:**
   ```bash
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow 22/tcp    # SSH
   ufw allow 8000/tcp  # API
   ufw enable
   ```

3. **Install Docker:**
   ```bash
   apt update
   apt install -y docker.io docker-compose
   systemctl enable docker
   ```

4. **Deploy Application:**
   ```bash
   mkdir -p /opt/kexp-search/{data,logs}
   # Copy files to /opt/kexp-search/
   cd /opt/kexp-search
   docker-compose up -d
   ```

5. **Verify Deployment:**
   ```bash
   curl http://localhost:8000/api/health
   curl http://${DROPLET_IP}:8000/api/health
   ```

### Optional: Systemd Service

```ini
[Unit]
Description=KEXP Search API
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/kexp-search
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Optional: Nginx Reverse Proxy

For HTTPS and domain name:
```nginx
server {
    listen 80;
    server_name api.kexp-search.example.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Testing Strategy

### Unit Tests
- `test_search_service.py`: FAISS encoding, search logic
- `test_db_service.py`: SQLite queries, connection handling
- Mock heavy dependencies (model loading)

### Integration Tests
- `test_api.py`: Full endpoint testing with TestClient
- Test data: small subset of embeddings + SQLite
- Verify pagination, error handling, response shapes

### Performance Tests
- Verify <20ms query latency under load
- Memory leak testing (long-running queries)
- Startup time validation

## Monitoring & Operations

### Logging
- Structured JSON logs to stdout
- Captured by systemd journal or Docker logs
- Log levels: INFO (default), DEBUG (development)

### Metrics (via /api/health)
- Service status
- Index loaded status
- Vector count
- Memory usage
- Uptime

### Alerting (optional, later)
- Memory usage >90%
- High error rate
- Service downtime

### Maintenance

**Updating Embeddings:**
1. Generate new embeddings offline
2. Create new `play_ids.npy` mapping
3. Build new FAISS index
4. Replace files in `/opt/kexp-search/data/`
5. Restart service: `docker-compose restart`

**Database Updates:**
1. Export updated `enriched_plays_full.csv`
2. Import to SQLite
3. Replace `music_kb.sqlite`
4. No service restart needed (on-demand connection)

## Future Enhancements

**Not in scope for initial deployment:**
- Response caching (Redis)
- Separate microservices
- Advanced monitoring (Prometheus, Grafana)
- Auto-scaling
- CI/CD pipeline
- Backup/recovery automation
- Rate limiting
- API authentication

**Keep it simple for now. Add complexity only when needed.**

## Success Criteria

- ✅ API responds in <20ms for search queries
- ✅ Handles 2.2M plays with <4GB RAM
- ✅ Full OpenAPI documentation
- ✅ Type-safe requests/responses
- ✅ Zero-downtime restarts
- ✅ Simple deployment process
- ✅ Comprehensive error handling
- ✅ Ready for frontend integration

## References

- Notebook: `analysis/notebooks/03_faiss_search_exploration.ipynb`
- Existing code: `analysis/src/crate_analysis/faiss_search.py`
- Data: `analysis/enriched_plays_full.csv`
- Deployment: Digital Ocean droplet (see deployment config)
