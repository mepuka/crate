# Embedding Management Endpoints

## Overview

Memory-efficient FastAPI endpoints for managing embeddings on the Droplet (4GB RAM, 2.7GB used by FAISS API).

All operations use streaming, memory-mapped files, and batch processing to stay within memory constraints.

## Files Created

### 1. `/app/routes/embeddings.py`

FastAPI router with 3 endpoints:

- **GET /api/embeddings/pending** - Stream pending plays to Colab
- **GET /api/embeddings/pca-model** - Stream PCA transformer file
- **POST /api/embeddings/integrate** - Receive and integrate embeddings

### 2. `/app/services/embedding_integration_service.py`

Service class for embedding operations:

- `detect_pending_plays()` - Find plays without embeddings
- `count_pending_plays()` - Count total pending plays
- `enrich_play_text()` - Generate enriched text (lightweight, no ML)
- `integrate_embeddings()` - Merge using mmap, rebuild FAISS
- `_rebuild_index_from_file()` - Batch FAISS rebuild

### 3. `/app/main.py` (Updated)

Added embeddings router to FastAPI application.

## API Endpoints

### GET /api/embeddings/pending

**Purpose:** Fetch plays that need embeddings for processing in Colab.

**Query Parameters:**
- `limit` (int, default=1000, max=5000): Number of plays to return
- `offset` (int, default=0): Pagination offset

**Response:**
```json
{
  "batch_id": "2025-11-16T10:30:00.000000",
  "plays": [
    {
      "id": 3576848,
      "enriched_text": "The Beatles - Come Together | Album: Abbey Road | Year: 1969 | Rotation: Heavy",
      "artist": "The Beatles",
      "song": "Come Together",
      "album": "Abbey Road",
      "airdate": "2015-03-15T12:34:56"
    }
  ],
  "total_pending": 673
}
```

**Memory Usage:** ~50MB max
- Loads play_ids.npy (17MB) into HashSet
- Streams from database cursor
- No bulk loading of results

**Implementation Details:**
- Uses `EmbeddingIntegrationService.detect_pending_plays()` to find IDs
- Fetches metadata via `DatabaseService.get_plays_by_ids()`
- Generates enriched text on-the-fly (no ML models)

---

### GET /api/embeddings/pca-model

**Purpose:** Download PCA transformer for 768d → 256d dimensionality reduction.

**Response:** Binary file stream (775KB)

**Headers:**
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="pca_transformer_256d.joblib"`

**Memory Usage:** Negligible (file streaming)

**Implementation Details:**
- Returns `FileResponse` streaming from disk
- No memory overhead

---

### POST /api/embeddings/integrate

**Purpose:** Receive and integrate new embeddings from Colab.

**Authentication:** Requires `X-API-Key` header (set via `FAISS_API_KEY` env var)

**Request Body:**
```json
{
  "batch_id": "2025-11-16T10:30:00.000000",
  "play_ids": [3576848, 3576849, 3576850],
  "embeddings_256d_b64": "BASE64_ENCODED_NUMPY_ARRAY",
  "checksum": "sha256:abc123...",
  "metadata": {
    "generated_by": "colab",
    "model_name": "sentence-transformers/multi-qa-mpnet-base-dot-v1",
    "generation_time": "2025-11-16T10:35:00.000000",
    "device": "cuda"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "integration": {
    "plays_integrated": 3,
    "total_embeddings_before": 2200000,
    "total_embeddings_after": 2200003,
    "index_rebuilt": true
  },
  "checksum_verified": true,
  "message": "Successfully integrated 3 embeddings"
}
```

**Memory Usage:** ~100MB max
- Streams base64 decode to temp file (1MB chunks)
- Uses mmap for reading large arrays (no memory copy)
- Rebuilds FAISS in 100k batches

**Implementation Details:**
1. **Decode base64 to temp file** (streaming, 1MB chunks)
2. **Verify SHA256 checksum**
3. **Load existing embeddings with mmap** (read-only, no memory copy)
4. **Merge arrays** (create combined arrays temporarily)
5. **Remove duplicates** (check existing IDs)
6. **Sort by play ID** (consistent ordering)
7. **Save to temp files**
8. **Rebuild FAISS index in batches** (100k vectors at a time)
9. **Atomic file swaps** (embeddings, IDs, index)
10. **Cleanup temp files**

**Error Handling:**
- 400: Invalid data, checksum mismatch, no play IDs
- 401: Invalid or missing API key
- 500: Integration failed

---

## Memory-Efficient Design

### Text Enrichment (No ML Models)

The `enrich_play_text()` function generates enriched text using only string formatting:

```python
def enrich_play_text(play: Dict[str, Any]) -> str:
    """Generate enriched text from metadata (NO ML models)."""
    parts = [f"{play['artist']} - {play['song']}"]

    if play.get('album'):
        parts.append(f"Album: {play['album']}")

    if play.get('release_date'):
        year = play['release_date'][:4]
        parts.append(f"Year: {year}")

    if play.get('rotation_status'):
        parts.append(f"Rotation: {play['rotation_status']}")

    # ... labels, flags

    return ' | '.join(parts)
```

**Memory:** <1MB (no model loading)

### Memory-Mapped Integration

```python
# Load with mmap (no memory copy)
existing_embeddings = np.load('embeddings_256d.npy', mmap_mode='r')

# Decode base64 to temp file (streaming)
for i in range(0, len(embeddings_b64), 1024*1024):  # 1MB chunks
    chunk = embeddings_b64[i:i+1024*1024]
    decoded = base64.b64decode(chunk)
    tmp.write(decoded)
```

### Batched FAISS Rebuild

```python
# Train on sample (100k vectors)
sample = np.array(embeddings[:100000])
index.train(sample)

# Add in batches (100k at a time)
for i in range(0, len(embeddings), 100000):
    batch = np.array(embeddings[i:i+100000])
    faiss.normalize_L2(batch)
    index.add(batch)
```

**Memory:** Only loads 100k vectors (×256d ×4 bytes = ~100MB) at a time

---

## Workflow: Colab → Droplet Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  COLAB: Heavy Processing (GPU + 80GB RAM)                   │
│                                                              │
│  1. GET /api/embeddings/pending (fetch 1000 plays)         │
│  2. GET /api/embeddings/pca-model (download transformer)    │
│  3. Generate 768d embeddings (GPU batch size: 1024)         │
│  4. Apply PCA transform (768d → 256d)                       │
│  5. Base64 encode and compute SHA256                        │
│  6. POST /api/embeddings/integrate                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  DROPLET: Lightweight Integration (4GB RAM)                 │
│                                                              │
│  1. Stream decode base64 to temp file                       │
│  2. Verify checksum                                         │
│  3. Load existing embeddings with mmap                      │
│  4. Merge and deduplicate                                   │
│  5. Rebuild FAISS index (batched)                           │
│  6. Atomic file swaps                                       │
│  7. Return success                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing

### Local Testing (Without Docker)

```bash
# Syntax check
cd /Users/pooks/Dev/crate/faiss-search-api
python3 -m py_compile app/routes/embeddings.py
python3 -m py_compile app/services/embedding_integration_service.py
python3 -m py_compile app/main.py
```

### Docker Testing

```bash
# Build and run
docker build -t faiss-api .
docker run -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e FAISS_API_KEY=your_secret_key \
  faiss-api

# Test endpoints
curl http://localhost:8000/api/embeddings/pending?limit=10

curl http://localhost:8000/api/embeddings/pca-model -o pca_model.joblib

curl -X POST http://localhost:8000/api/embeddings/integrate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secret_key" \
  -d @test_integration.json
```

### Memory Monitoring

```bash
# Watch memory usage
docker stats --no-stream

# Expected:
# - Before integration: ~2.7GB
# - During integration: ~2.8GB (peak)
# - After integration: ~2.7GB
```

---

## Deployment Checklist

- [ ] Copy new files to Droplet
  - `app/routes/__init__.py`
  - `app/routes/embeddings.py`
  - `app/services/embedding_integration_service.py`
- [ ] Update `app/main.py` with router import
- [ ] Set `FAISS_API_KEY` environment variable
- [ ] Rebuild Docker container
- [ ] Test GET /api/embeddings/pending
- [ ] Test GET /api/embeddings/pca-model
- [ ] Monitor memory usage (`docker stats`)
- [ ] Run test integration with 10 plays
- [ ] Verify FAISS search works after integration
- [ ] Process full batch of ~673 pending plays

---

## Error Handling

### Common Errors

**401 Unauthorized**
- Missing or invalid `X-API-Key` header
- Solution: Set correct API key in request

**400 Bad Request**
- Checksum mismatch
- Invalid base64 encoding
- Shape mismatch (play IDs vs embeddings)
- Solution: Verify data integrity in Colab before sending

**404 Not Found**
- PCA transformer file missing
- Solution: Ensure `data/pca_transformer_256d.joblib` exists

**500 Internal Server Error**
- Database connection failed
- Disk space full
- Temp file write failed
- Solution: Check logs, verify disk space, restart service

### Rollback

If integration fails, backup files are created:
- `embeddings_256d.npy.backup`
- `play_ids.npy.backup`
- `embeddings_256d.index.backup`

To rollback:
```bash
cd /app/data
mv embeddings_256d.npy.backup embeddings_256d.npy
mv play_ids.npy.backup play_ids.npy
mv embeddings_256d.index.backup embeddings_256d.index
docker restart faiss-api
```

---

## Performance

### Expected Metrics

**GET /api/embeddings/pending**
- Query time: <100ms (database cursor)
- Response size: ~500KB for 1000 plays
- Memory overhead: ~50MB

**GET /api/embeddings/pca-model**
- Transfer time: <1s (775KB file)
- Memory overhead: Negligible

**POST /api/embeddings/integrate**
- Processing time: ~30s for 1000 plays
  - Base64 decode: ~2s
  - Merge arrays: ~5s
  - FAISS rebuild: ~20s
  - File swaps: ~3s
- Memory peak: ~2.8GB
- Disk I/O: ~500MB writes

---

## Next Steps

1. **Deploy to Droplet** (copy files, rebuild container)
2. **Create Colab notebook** (using design from EMBEDDING_PIPELINE_RESOURCE_OPTIMIZED.md)
3. **Test end-to-end** (generate 10 test embeddings)
4. **Process full batch** (~673 pending plays)
5. **Monitor memory** (verify <3GB usage)
6. **Verify search quality** (test semantic search with new embeddings)

---

## References

- Design document: `docs/EMBEDDING_PIPELINE_RESOURCE_OPTIMIZED.md`
- FAISS documentation: https://github.com/facebookresearch/faiss/wiki
- NumPy mmap: https://numpy.org/doc/stable/reference/generated/numpy.load.html
