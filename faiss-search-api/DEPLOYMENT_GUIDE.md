# Embedding Endpoints Deployment Guide

## Quick Summary

Memory-efficient FastAPI endpoints for embedding management have been implemented:

1. **GET /api/embeddings/pending** - Stream pending plays to Colab (~50MB memory)
2. **GET /api/embeddings/pca-model** - Stream PCA transformer file (negligible memory)
3. **POST /api/embeddings/integrate** - Receive and integrate embeddings (~100MB memory peak)

All operations designed to stay within 4GB RAM constraint (currently 2.7GB used).

## Files Created

```
faiss-search-api/
├── app/
│   ├── routes/
│   │   ├── __init__.py                    (NEW)
│   │   └── embeddings.py                  (NEW - 350 lines)
│   ├── services/
│   │   └── embedding_integration_service.py (NEW - 450 lines)
│   └── main.py                            (UPDATED - added router)
├── EMBEDDING_ENDPOINTS.md                  (NEW - API documentation)
├── DEPLOYMENT_GUIDE.md                     (NEW - this file)
└── test_endpoints_structure.py             (NEW - validation script)
```

## Deployment Steps

### 1. Verify Local Structure

```bash
cd /Users/pooks/Dev/crate/faiss-search-api
python3 test_endpoints_structure.py
```

Expected output:
```
✓ PASS: File Existence
✓ PASS: Python Syntax
✓ PASS: Import Structure
✓ PASS: Memory Efficiency
```

### 2. Copy Files to Droplet

```bash
# SSH to Droplet
ssh root@cratemusic.duckdns.org

# Navigate to project directory
cd /root/faiss-search-api

# Create routes directory if needed
mkdir -p app/routes

# Exit SSH
exit

# Copy files from local to Droplet
scp app/routes/__init__.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/routes/
scp app/routes/embeddings.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/routes/
scp app/services/embedding_integration_service.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/services/
scp app/main.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/
```

### 3. Set API Key

```bash
# SSH to Droplet
ssh root@cratemusic.duckdns.org

# Set environment variable in .env or docker-compose.yml
echo "FAISS_API_KEY=your_secure_random_key" >> .env

# Or edit docker-compose.yml to add:
# environment:
#   - FAISS_API_KEY=your_secure_random_key
```

### 4. Rebuild and Restart Container

```bash
# SSH to Droplet
ssh root@cratemusic.duckdns.org
cd /root/faiss-search-api

# Rebuild container
docker-compose build

# Restart service
docker-compose down
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 5. Test Endpoints

```bash
# From your local machine or Droplet

# Test 1: Get pending plays
curl https://cratemusic.duckdns.org/api/embeddings/pending?limit=10

# Expected:
# {
#   "batch_id": "2025-11-16T...",
#   "plays": [...],
#   "total_pending": 673
# }

# Test 2: Download PCA model
curl https://cratemusic.duckdns.org/api/embeddings/pca-model -o pca_model.joblib

# Expected: 775KB file downloaded

# Test 3: Integration (requires API key)
# Create test payload first (see Colab notebook section)
```

### 6. Monitor Memory Usage

```bash
# SSH to Droplet
ssh root@cratemusic.duckdns.org

# Watch memory in real-time
docker stats --no-stream

# Expected output:
# CONTAINER    MEM USAGE / LIMIT     MEM %
# faiss-api    2.70GiB / 3.80GiB     71.05%

# During integration (temporary spike):
# faiss-api    2.85GiB / 3.80GiB     75.00%
```

## Testing Integration Endpoint

### Create Test Payload

Use this Python script to create a test integration payload:

```python
import numpy as np
import base64
import hashlib
import json
from datetime import datetime

# Create test embeddings (3 plays, 256 dimensions)
test_embeddings = np.random.randn(3, 256).astype(np.float32)

# Normalize
for i in range(len(test_embeddings)):
    test_embeddings[i] = test_embeddings[i] / np.linalg.norm(test_embeddings[i])

# Encode to base64
embeddings_bytes = test_embeddings.tobytes()
embeddings_b64 = base64.b64encode(embeddings_bytes).decode('utf-8')

# Compute checksum
checksum = hashlib.sha256(embeddings_bytes).hexdigest()

# Create payload
payload = {
    "batch_id": datetime.utcnow().isoformat(),
    "play_ids": [9999001, 9999002, 9999003],  # Test IDs
    "embeddings_256d_b64": embeddings_b64,
    "checksum": f"sha256:{checksum}",
    "metadata": {
        "generated_by": "test_script",
        "model_name": "sentence-transformers/multi-qa-mpnet-base-dot-v1",
        "generation_time": datetime.utcnow().isoformat(),
        "device": "cpu"
    }
}

# Save to file
with open('test_integration.json', 'w') as f:
    json.dump(payload, f, indent=2)

print(f"Created test payload: {len(embeddings_b64)} bytes")
print(f"Checksum: {checksum}")
```

### Send Test Request

```bash
# Send integration request
curl -X POST https://cratemusic.duckdns.org/api/embeddings/integrate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_secure_random_key" \
  -d @test_integration.json

# Expected response:
# {
#   "status": "success",
#   "integration": {
#     "plays_integrated": 3,
#     "total_embeddings_before": 2200000,
#     "total_embeddings_after": 2200003,
#     "index_rebuilt": true
#   },
#   "checksum_verified": true,
#   "message": "Successfully integrated 3 embeddings"
# }
```

## Colab Notebook Integration

### Create Notebook

Create a new Colab notebook with cells from the design document:

1. **Check GPU availability**
2. **Install dependencies** (`sentence-transformers`, `requests`, `joblib`)
3. **Fetch pending plays** (GET /api/embeddings/pending)
4. **Download PCA model** (GET /api/embeddings/pca-model)
5. **Generate 768d embeddings** (GPU batch size: 1024)
6. **Apply PCA transform** (768d → 256d)
7. **Encode and compute checksum**
8. **POST to integration endpoint**

See `docs/EMBEDDING_PIPELINE_RESOURCE_OPTIMIZED.md` for full implementation.

## Troubleshooting

### Issue: 401 Unauthorized

**Cause:** Missing or incorrect API key

**Solution:**
```bash
# Check API key is set
ssh root@cratemusic.duckdns.org
cat /root/faiss-search-api/.env | grep FAISS_API_KEY

# Restart container after setting key
docker-compose restart
```

### Issue: 404 PCA Model Not Found

**Cause:** PCA transformer file missing

**Solution:**
```bash
# Check file exists
ssh root@cratemusic.duckdns.org
ls -lh /root/faiss-search-api/data/pca_transformer_256d.joblib

# If missing, copy from original location
```

### Issue: 400 Checksum Mismatch

**Cause:** Data corruption during base64 encoding

**Solution:**
- Verify embeddings array is contiguous: `embeddings = np.ascontiguousarray(embeddings)`
- Re-encode with chunked processing
- Verify checksum before sending

### Issue: 500 Integration Failed

**Cause:** Disk space, memory, or database issues

**Solution:**
```bash
# Check disk space
df -h

# Check memory
free -h

# Check logs
docker-compose logs faiss-api | tail -100

# Restart container
docker-compose restart
```

### Issue: Memory Spike Above 3GB

**Cause:** Batch size too large or memory leak

**Solution:**
- Reduce batch size in `_rebuild_index_from_file()` (currently 100k)
- Monitor with `docker stats`
- Restart container to clear memory

## Rollback Procedure

If integration fails and corrupts data:

```bash
# SSH to Droplet
ssh root@cratemusic.duckdns.org
cd /root/faiss-search-api/data

# Check for backups
ls -lh *.backup

# Restore backups
mv embeddings_256d.npy.backup embeddings_256d.npy
mv play_ids.npy.backup play_ids.npy
mv embeddings_256d.index.backup embeddings_256d.index

# Restart container
cd /root/faiss-search-api
docker-compose restart
```

## Performance Benchmarks

### Expected Performance

| Operation | Time | Memory Peak | Network |
|-----------|------|-------------|---------|
| GET /pending (1000 plays) | <100ms | +50MB | ~500KB |
| GET /pca-model | <1s | Negligible | 775KB |
| POST /integrate (1000 plays) | ~30s | +150MB | ~1.5MB |

### Integration Breakdown

| Step | Time | Memory |
|------|------|--------|
| Base64 decode | ~2s | +50MB |
| Checksum verify | ~1s | 0MB |
| Load existing (mmap) | ~1s | 0MB |
| Merge arrays | ~3s | +50MB |
| Sort by ID | ~2s | 0MB |
| FAISS rebuild | ~20s | +100MB |
| Atomic swaps | ~1s | 0MB |

## Next Steps

1. Deploy endpoints to Droplet
2. Test all 3 endpoints
3. Monitor memory usage
4. Create Colab notebook
5. Process test batch (10 plays)
6. Process full batch (~673 pending plays)
7. Verify search quality
8. Document lessons learned

## References

- API Documentation: `EMBEDDING_ENDPOINTS.md`
- Design Document: `docs/EMBEDDING_PIPELINE_RESOURCE_OPTIMIZED.md`
- Structure Tests: `test_endpoints_structure.py`
- Main Application: `app/main.py`
- Routes: `app/routes/embeddings.py`
- Service: `app/services/embedding_integration_service.py`
