# Embedding Endpoints - Quick Reference

## Files Created/Updated

```
app/routes/__init__.py                           (NEW)
app/routes/embeddings.py                         (NEW - 350 lines)
app/services/embedding_integration_service.py    (NEW - 450 lines)
app/main.py                                      (UPDATED)
EMBEDDING_ENDPOINTS.md                           (NEW)
DEPLOYMENT_GUIDE.md                              (NEW)
IMPLEMENTATION_SUMMARY.md                        (NEW)
test_endpoints_structure.py                      (NEW)
```

## API Endpoints

| Endpoint | Method | Purpose | Memory | Auth |
|----------|--------|---------|--------|------|
| `/api/embeddings/pending` | GET | Get plays needing embeddings | ~50MB | No |
| `/api/embeddings/pca-model` | GET | Download PCA transformer | Negligible | No |
| `/api/embeddings/integrate` | POST | Integrate new embeddings | ~100MB | Yes |

## Quick Commands

### Validate Locally
```bash
cd /Users/pooks/Dev/crate/faiss-search-api
python3 test_endpoints_structure.py
```

### Deploy to Droplet
```bash
# Copy files
scp app/routes/__init__.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/routes/
scp app/routes/embeddings.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/routes/
scp app/services/embedding_integration_service.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/services/
scp app/main.py root@cratemusic.duckdns.org:/root/faiss-search-api/app/

# Rebuild
ssh root@cratemusic.duckdns.org 'cd /root/faiss-search-api && docker-compose build && docker-compose up -d'
```

### Test Endpoints
```bash
# Get pending plays
curl https://cratemusic.duckdns.org/api/embeddings/pending?limit=10

# Download PCA model
curl https://cratemusic.duckdns.org/api/embeddings/pca-model -o pca.joblib

# Integrate (requires API key)
curl -X POST https://cratemusic.duckdns.org/api/embeddings/integrate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d @payload.json
```

### Monitor Memory
```bash
ssh root@cratemusic.duckdns.org 'docker stats --no-stream'
```

## Memory Budget

| Component | Usage | Status |
|-----------|-------|--------|
| FAISS API (existing) | 2.7GB | ✓ |
| Integration (peak) | +0.15GB | ✓ |
| **Total Peak** | **2.85GB** | **✓ <4GB** |

## Key Features

- Streaming base64 decode (1MB chunks)
- Memory-mapped array operations
- Batched FAISS rebuild (100k vectors)
- SHA256 checksum verification
- Atomic file swaps (rollback-safe)
- Duplicate detection

## Documentation

- API docs: `EMBEDDING_ENDPOINTS.md`
- Deployment: `DEPLOYMENT_GUIDE.md`
- Summary: `IMPLEMENTATION_SUMMARY.md`
- Design: `docs/EMBEDDING_PIPELINE_RESOURCE_OPTIMIZED.md`

## Status

- Implementation: ✓ Complete
- Tests: ✓ All passed
- Documentation: ✓ Complete
- Ready for deployment: ✓ Yes
