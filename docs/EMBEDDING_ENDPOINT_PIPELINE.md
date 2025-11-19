# Embedding Endpoint Pipeline Design

**Date:** 2025-11-16
**Status:** Design Proposal
**Goal:** Create endpoint-based pipeline to incrementally update embeddings with full alignment

---

## Overview

Create a closed-loop system where:
1. FastAPI endpoint **pulls** un-embedded plays from database
2. Colab/Cloud **generates** embeddings using exact original pipeline
3. FastAPI endpoint **receives** embeddings and integrates atomically
4. Everything stays aligned (IDs, PCA, FAISS index)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Endpoint: GET /api/embeddings/pending              │
│                                                              │
│  1. Query fact_plays for all IDs                           │
│  2. Load play_ids_alignment.npy                            │
│  3. Find set difference (un-embedded plays)                │
│  4. Enrich texts with genres/metadata                      │
│  5. Return JSON batch                                       │
│                                                              │
│  Response:                                                   │
│  {                                                           │
│    "batch_id": "2025-11-16-001",                           │
│    "count": 347,                                            │
│    "plays": [                                               │
│      {                                                       │
│        "id": 3578998,                                       │
│        "enriched_text": "IDLES - Mr. Motivator ...",      │
│        "metadata": {...}                                    │
│      }                                                       │
│    ]                                                         │
│  }                                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Colab fetches batch
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Colab Notebook: generate_incremental_embeddings.ipynb     │
│                                                              │
│  1. Fetch /api/embeddings/pending                          │
│  2. Load model: multi-qa-mpnet-base-dot-v1                │
│  3. Generate 768d embeddings (normalize=True)              │
│  4. Download pca_transformer_256d.joblib from Droplet      │
│  5. Apply PCA transform (NOT fit_transform!)               │
│  6. L2 normalize at 256d                                    │
│  7. POST to /api/embeddings/integrate                      │
│                                                              │
│  POST Body:                                                  │
│  {                                                           │
│    "batch_id": "2025-11-16-001",                           │
│    "embeddings_256d": [...],  // base64 encoded numpy      │
│    "play_ids": [3578998, ...],                             │
│    "checksum": "sha256:abc123..."                          │
│  }                                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Posts embeddings back
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Endpoint: POST /api/embeddings/integrate          │
│                                                              │
│  1. Validate batch_id and checksum                         │
│  2. Decode embeddings from base64                          │
│  3. Load existing embeddings_256d.npy                      │
│  4. Verify PCA alignment (spot check)                      │
│  5. Merge: np.vstack([existing, new])                      │
│  6. Sort by play ID                                         │
│  7. Rebuild FAISS index (IVF, nlist=1024)                  │
│  8. Atomic file updates (tmp → rename)                     │
│  9. Restart API gracefully (systemd reload)                │
│  10. Return integration report                              │
│                                                              │
│  Response:                                                   │
│  {                                                           │
│    "status": "success",                                     │
│    "integrated_count": 347,                                 │
│    "total_embeddings": 2193582,                            │
│    "index_rebuilt": true,                                   │
│    "api_restarted": true                                    │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

### 1. Exact Pipeline Replication

**Critical constraints from Colab notebook:**

```python
# Step 1: Generate 768d (MUST use normalize_embeddings=True)
embeddings_768d = model.encode(
    texts,
    batch_size=1024,
    show_progress_bar=True,
    normalize_embeddings=True,  # ← CRITICAL
    convert_to_numpy=True
)

# Step 2: Apply PCA (MUST use existing transformer, not fit new one)
pca = joblib.load('pca_transformer_256d.joblib')
embeddings_256d = pca.transform(embeddings_768d)  # transform, NOT fit_transform

# Step 3: Re-normalize at 256d (for FAISS cosine similarity)
for i in range(len(embeddings_256d)):
    embeddings_256d[i] = embeddings_256d[i] / np.linalg.norm(embeddings_256d[i])

embeddings_256d = embeddings_256d.astype('float32')
```

### 2. Alignment Guarantees

**Three-way alignment:**
- `play_ids_alignment.npy` - sorted list of play IDs
- `embeddings_256d.npy` - embeddings in same order
- FAISS index - vectors in same order

**Enforcement:**
```python
# Always sort by ID after merging
combined_ids = np.concatenate([existing_ids, new_ids])
combined_embeddings = np.vstack([existing_embeddings, new_embeddings])

sort_idx = np.argsort(combined_ids)
combined_ids = combined_ids[sort_idx]
combined_embeddings = combined_embeddings[sort_idx]
```

### 3. Atomic Updates

**No partial state:**
```python
# Write to temporary files
np.save('embeddings_256d.tmp.npy', combined_embeddings)
np.save('play_ids_alignment.tmp.npy', combined_ids)
faiss.write_index(index, 'embeddings_256d.tmp.index')

# Atomic renames (all-or-nothing)
os.rename('embeddings_256d.tmp.npy', 'embeddings_256d.npy')
os.rename('play_ids_alignment.tmp.npy', 'play_ids_alignment.npy')
os.rename('embeddings_256d.tmp.index', 'embeddings_256d.index')
```

### 4. Zero-Downtime Restart

**Systemd graceful reload:**
```bash
# Update files while API is running
# API loads old files until restart signal

# Graceful restart (finishes pending requests)
systemctl reload kexp-search-api

# New requests use new embeddings
```

---

## API Endpoint Specifications

### GET /api/embeddings/pending

**Purpose:** Get batch of plays needing embeddings

**Query Parameters:**
- `limit` (optional, default=1000): Max plays to return
- `offset` (optional, default=0): Skip first N plays
- `format` (optional, default=json): Response format (json|csv)

**Response:**
```json
{
  "batch_id": "2025-11-16T22:30:00Z",
  "timestamp": "2025-11-16T22:30:00.123Z",
  "count": 347,
  "total_pending": 673,
  "plays": [
    {
      "id": 3578998,
      "artist": "IDLES",
      "song": "Mr. Motivator",
      "album": "Live At KEXP",
      "enriched_text": "IDLES - Mr. Motivator | Album: Live At KEXP | Genres: post-punk, indie rock | Year: 2020 | Label: KEXP | Rotation: Library | Live Performance",
      "airdate": "2025-11-15T18:30:00Z",
      "metadata": {
        "recording_id": "abc-123",
        "release_id": "def-456",
        "is_local": false,
        "is_live": true
      }
    }
  ],
  "pca_info": {
    "model_file": "pca_transformer_256d.joblib",
    "download_url": "https://cratemusic.duckdns.org/api/embeddings/pca-model",
    "sha256": "abc123...",
    "n_components": 256,
    "variance_explained": 0.964
  },
  "model_config": {
    "name": "sentence-transformers/multi-qa-mpnet-base-dot-v1",
    "embedding_dim": 768,
    "reduced_dim": 256,
    "normalize_embeddings": true
  }
}
```

**Errors:**
- 404: No pending plays
- 500: Database error

---

### GET /api/embeddings/pca-model

**Purpose:** Download PCA transformer for Colab

**Response:** Binary file (joblib format)

**Headers:**
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="pca_transformer_256d.joblib"
X-SHA256: abc123...
X-N-Components: 256
```

---

### POST /api/embeddings/integrate

**Purpose:** Integrate new embeddings into index

**Request Body:**
```json
{
  "batch_id": "2025-11-16T22:30:00Z",
  "play_ids": [3578998, 3578999, ...],
  "embeddings_256d_b64": "base64-encoded-numpy-array",
  "checksum": "sha256:abc123...",
  "metadata": {
    "generated_by": "colab",
    "model_name": "sentence-transformers/multi-qa-mpnet-base-dot-v1",
    "pca_sha256": "def456...",
    "generation_time": "2025-11-16T22:35:00Z"
  }
}
```

**Response (Success):**
```json
{
  "status": "success",
  "batch_id": "2025-11-16T22:30:00Z",
  "integration": {
    "plays_integrated": 347,
    "total_embeddings_before": 2193235,
    "total_embeddings_after": 2193582,
    "new_min_id": 3578998,
    "new_max_id": 3579344
  },
  "validation": {
    "alignment_verified": true,
    "pca_verified": true,
    "checksum_match": true
  },
  "index": {
    "rebuilt": true,
    "total_vectors": 2193582,
    "index_type": "IVFFlat",
    "nlist": 1024,
    "nprobe": 10
  },
  "files_updated": [
    "embeddings_256d.npy",
    "play_ids_alignment.npy",
    "embeddings_256d.index",
    "metadata.json"
  ],
  "api_restarted": true,
  "timestamp": "2025-11-16T22:40:00Z"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "error_code": "CHECKSUM_MISMATCH",
  "message": "Checksum verification failed",
  "details": {
    "expected": "sha256:abc123...",
    "received": "sha256:xyz789..."
  }
}
```

**Error Codes:**
- `INVALID_BATCH_ID`: Batch ID doesn't match pending batch
- `CHECKSUM_MISMATCH`: Embedding checksum invalid
- `SHAPE_MISMATCH`: Wrong embedding dimensions
- `PCA_MISMATCH`: PCA transformer version mismatch
- `INTEGRATION_FAILED`: Database/file write error
- `INDEX_BUILD_FAILED`: FAISS index rebuild failed

---

## Implementation Files

### 1. FastAPI Endpoints (New File)

**File:** `faiss-search-api/app/routes/embeddings.py`

```python
"""
Embedding management endpoints for incremental updates.
"""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
import numpy as np
import sqlite3
import hashlib
import base64
import joblib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

from app.services.embedding_integration_service import EmbeddingIntegrationService
from app.services.search_service import SearchService

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

# ... endpoint implementations ...
```

### 2. Integration Service (New File)

**File:** `faiss-search-api/app/services/embedding_integration_service.py`

```python
"""
Service for integrating new embeddings into FAISS index.
Ensures alignment, atomic updates, and zero-downtime.
"""

import numpy as np
import faiss
import joblib
import hashlib
import os
from pathlib import Path
from typing import Tuple, List
import logging

class EmbeddingIntegrationService:
    """Handles integration of new embeddings with existing index."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.logger = logging.getLogger(__name__)

    def detect_pending_plays(self, db_conn) -> List[Dict]:
        """Find plays without embeddings."""
        # ... implementation ...

    def enrich_texts(self, plays: List[Dict]) -> List[str]:
        """Generate enriched text representations."""
        # ... implementation using crate_analysis.enrichment ...

    def validate_embeddings(self, embeddings: np.ndarray, play_ids: List[int]) -> bool:
        """Validate embedding shape and alignment."""
        # ... implementation ...

    def integrate_embeddings(
        self,
        new_embeddings: np.ndarray,
        new_ids: np.ndarray,
        verify_pca: bool = True
    ) -> Dict[str, Any]:
        """
        Integrate new embeddings with existing index.

        Steps:
        1. Load existing embeddings and IDs
        2. Merge and sort by ID
        3. Rebuild FAISS index
        4. Atomic file updates
        5. Return integration report
        """
        # ... implementation ...

    def rebuild_faiss_index(self, embeddings: np.ndarray) -> faiss.Index:
        """Rebuild IVF index with same parameters as original."""
        # ... implementation matching original index params ...
```

### 3. Updated Colab Notebook

**File:** `analysis/generate_incremental_embeddings.ipynb`

Key cells:

```python
# Cell 1: Fetch pending plays
import requests
import json

API_URL = "https://cratemusic.duckdns.org"

response = requests.get(f"{API_URL}/api/embeddings/pending?limit=1000")
batch = response.json()

print(f"Batch ID: {batch['batch_id']}")
print(f"Plays to embed: {batch['count']}")

# Cell 2: Download PCA transformer
pca_response = requests.get(f"{API_URL}/api/embeddings/pca-model")
with open('pca_transformer_256d.joblib', 'wb') as f:
    f.write(pca_response.content)

pca_sha256 = batch['pca_info']['sha256']
print(f"Downloaded PCA transformer (sha256: {pca_sha256})")

# Cell 3: Generate embeddings (EXACT pipeline)
from sentence_transformers import SentenceTransformer
import numpy as np
import joblib

MODEL_NAME = batch['model_config']['name']
model = SentenceTransformer(MODEL_NAME)

texts = [play['enriched_text'] for play in batch['plays']]
play_ids = [play['id'] for play in batch['plays']]

# Step 1: 768d embeddings (normalized)
embeddings_768d = model.encode(
    texts,
    batch_size=1024,
    show_progress_bar=True,
    normalize_embeddings=True,  # ← CRITICAL
    convert_to_numpy=True
)

# Step 2: PCA transform (NOT fit_transform)
pca = joblib.load('pca_transformer_256d.joblib')
embeddings_256d = pca.transform(embeddings_768d)

# Step 3: Re-normalize
for i in range(len(embeddings_256d)):
    embeddings_256d[i] = embeddings_256d[i] / np.linalg.norm(embeddings_256d[i])

embeddings_256d = embeddings_256d.astype('float32')

print(f"✓ Generated {len(embeddings_256d)} embeddings")

# Cell 4: Compute checksum
embeddings_bytes = embeddings_256d.tobytes()
checksum = hashlib.sha256(embeddings_bytes).hexdigest()
print(f"Checksum: sha256:{checksum}")

# Cell 5: Encode to base64 and POST
import base64

embeddings_b64 = base64.b64encode(embeddings_bytes).decode('utf-8')

payload = {
    "batch_id": batch['batch_id'],
    "play_ids": play_ids,
    "embeddings_256d_b64": embeddings_b64,
    "checksum": f"sha256:{checksum}",
    "metadata": {
        "generated_by": "colab",
        "model_name": MODEL_NAME,
        "pca_sha256": pca_sha256,
        "generation_time": datetime.utcnow().isoformat()
    }
}

response = requests.post(
    f"{API_URL}/api/embeddings/integrate",
    json=payload,
    headers={"Content-Type": "application/json"}
)

result = response.json()
print(f"\n✓ Integration Status: {result['status']}")
if result['status'] == 'success':
    print(f"  Integrated: {result['integration']['plays_integrated']} plays")
    print(f"  Total embeddings: {result['integration']['total_embeddings_after']}")
    print(f"  Index rebuilt: {result['index']['rebuilt']}")
else:
    print(f"  Error: {result['message']}")
```

---

## Deployment Steps

### Phase 1: Add Endpoints (Week 1)

1. Create `app/routes/embeddings.py` with GET/POST endpoints
2. Create `app/services/embedding_integration_service.py`
3. Wire routes into main FastAPI app
4. Test locally with sample data

### Phase 2: Test End-to-End (Week 2)

1. Deploy updated API to Droplet
2. Run Colab notebook with 10-20 test plays
3. Verify integration works correctly
4. Check FAISS search quality unchanged

### Phase 3: Production Run (Week 3)

1. Generate embeddings for all ~673 pending plays
2. Monitor integration process
3. Verify search quality
4. Document process for future runs

### Phase 4: Automate (Week 4)

1. Add cron job to check for pending plays daily
2. Trigger Colab notebook via API or manual
3. Set up monitoring/alerts
4. Create runbook for failures

---

## Testing Strategy

### Unit Tests

```python
def test_detect_pending_plays():
    """Test detection of un-embedded plays."""
    # ... test implementation ...

def test_embedding_validation():
    """Test validation of embedding shape and checksums."""
    # ... test implementation ...

def test_atomic_file_updates():
    """Test atomic rename operations."""
    # ... test implementation ...

def test_faiss_index_rebuild():
    """Test FAISS index rebuild with known data."""
    # ... test implementation ...
```

### Integration Tests

```python
def test_full_pipeline():
    """Test complete pipeline: detect → generate → integrate."""
    # 1. Create test database with 100 plays
    # 2. Generate embeddings for 50 plays
    # 3. Call /api/embeddings/pending
    # 4. Generate embeddings in Python (not Colab)
    # 5. Call /api/embeddings/integrate
    # 6. Verify alignment and search quality
```

---

## Monitoring & Alerts

### Metrics to Track

1. **Embedding Coverage:** % of plays with embeddings
2. **Pending Queue Size:** # of un-embedded plays
3. **Integration Latency:** Time from generation → integration
4. **Search Quality:** Spot-check queries before/after
5. **API Downtime:** Duration of restart (should be <1s)

### Alerts

- Alert if pending queue > 1000 plays (backlog building)
- Alert if integration fails 3+ times
- Alert if search latency increases >20% after integration

---

## Rollback Procedure

If integration fails or search quality degrades:

```bash
# 1. Stop API
docker-compose stop api

# 2. Restore from backup (keep last 7 days)
cp data/backups/embeddings_256d.2025-11-15.npy data/embeddings_256d.npy
cp data/backups/play_ids_alignment.2025-11-15.npy data/play_ids_alignment.npy
cp data/backups/embeddings_256d.2025-11-15.index data/embeddings_256d.index

# 3. Restart API
docker-compose start api

# 4. Verify search works
curl https://cratemusic.duckdns.org/api/search?query=psychedelic
```

---

## Future Enhancements

1. **Streaming Integration:** Real-time embedding as plays arrive
2. **Multi-Model Support:** Allow switching between models
3. **A/B Testing:** Compare search quality across embeddings
4. **Auto-triggering:** Colab Cloud Functions for automation
5. **Delta Encoding:** Only send embedding deltas for efficiency

---

## Next Steps

1. Review this design
2. Implement GET /api/embeddings/pending endpoint
3. Test with synthetic data
4. Implement POST /api/embeddings/integrate
5. Update Colab notebook
6. End-to-end test with real data
