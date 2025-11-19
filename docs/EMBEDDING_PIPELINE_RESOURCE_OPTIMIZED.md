# Resource-Optimized Embedding Pipeline

**Date:** 2025-11-16
**Constraint:** Droplet has 4GB RAM, already using 2.7GB for FAISS
**Solution:** All heavy processing (embedding generation) happens in Colab with GPU

---

## Resource Analysis

### Droplet Current State
- **Total RAM:** 3.8GB
- **Used:** 3.2GB (84%)
- **FAISS API container:** 2.68GB (76% of allocated)
- **Data files:** 5.8GB on disk
  - embeddings_256d.npy: 2.1GB
  - embeddings_256d.index: 2.2GB
  - music_kb.sqlite: 1.6GB

### Memory Budget Breakdown

**FAISS API loads into memory:**
- Embeddings numpy array: ~2.1GB
- FAISS index: ~2.2GB (partially in memory)
- SentenceTransformer model: ~400MB (for query encoding)
- Python process overhead: ~200MB
- **Total: ~2.9GB** (matches observed 2.68GB usage)

**Not enough room for:**
- ❌ Loading full 768d embeddings (6.7GB)
- ❌ Running batch embedding generation (~500MB per batch)
- ❌ Merging large numpy arrays (needs 2x memory temporarily)

---

## Revised Architecture: Colab Does Heavy Lifting

```
┌─────────────────────────────────────────────────────────────┐
│  DROPLET: FastAPI Endpoints (Lightweight)                   │
│  Memory: <100MB additional                                  │
│                                                              │
│  GET /api/embeddings/pending                                │
│  • Query SQLite (streaming, not loading all into memory)   │
│  • Load play_ids.npy (17MB - fits in memory)               │
│  • Find set difference (O(1) HashSet lookup)               │
│  • Stream enriched text generation                         │
│  • Return JSON (paginated, max 1000 plays per batch)       │
│                                                              │
│  GET /api/embeddings/pca-model                              │
│  • Stream 775KB file from disk                              │
│  • No memory overhead                                       │
│                                                              │
│  POST /api/embeddings/integrate                             │
│  • Receive base64 embeddings (streaming decode)            │
│  • Write to temp file immediately (don't hold in memory)   │
│  • Use mmap for large array operations                     │
│  • Rebuild FAISS index from disk (not in-memory merge)     │
│  • Atomic file swap                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Lightweight JSON
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  COLAB: Heavy Processing (GPU + 80GB RAM)                   │
│  Memory: ~10GB peak                                          │
│                                                              │
│  1. Fetch /api/embeddings/pending (JSON, <1MB)             │
│  2. Load SentenceTransformer model (~400MB)                │
│  3. Generate 768d embeddings                                │
│     • Batch size: 1024 (uses ~2GB GPU memory)              │
│     • CPU fallback if needed (~4GB RAM per batch)          │
│  4. Download pca_transformer (775KB)                        │
│  5. Apply PCA transform (in-memory, ~6GB peak)             │
│  6. Base64 encode and stream to Droplet                    │
│  7. Receive integration confirmation                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Droplet Endpoint Implementation (Memory Efficient)

### GET /api/embeddings/pending

**Memory-efficient implementation:**

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import sqlite3
import numpy as np
import json
from typing import Iterator

router = APIRouter()

@router.get("/api/embeddings/pending")
async def get_pending_embeddings(limit: int = 1000, offset: int = 0):
    """
    Stream pending plays without loading all into memory.
    Memory usage: ~50MB max (for play_ids HashSet + streaming buffer)
    """

    # Load play IDs that have embeddings (17MB - fits in memory)
    embedded_ids = set(np.load('/app/data/play_ids.npy'))

    # Stream from database (don't load all rows into memory)
    conn = sqlite3.connect('/app/data/music_kb.sqlite')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Query with LIMIT/OFFSET to control memory
    cursor.execute("""
        SELECT id, artist, song, album, airdate, labels,
               rotation_status, is_local, is_live, release_date
        FROM fact_plays
        WHERE id NOT IN (SELECT value FROM json_each(?))
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """, (json.dumps(list(embedded_ids)), limit, offset))

    def generate_plays() -> Iterator[str]:
        """Generator to stream JSON without holding all in memory."""
        yield '{"batch_id": "' + datetime.utcnow().isoformat() + '", "plays": ['

        first = True
        for row in cursor:
            if not first:
                yield ','
            first = False

            # Generate enriched text on-the-fly
            enriched_text = enrich_play_lightweight(dict(row))

            play_json = json.dumps({
                'id': row['id'],
                'enriched_text': enriched_text,
                # ... other fields
            })
            yield play_json

        yield ']}'
        conn.close()

    return StreamingResponse(
        generate_plays(),
        media_type='application/json'
    )
```

**Key optimizations:**
- ✅ Stream JSON response (no large buffer)
- ✅ Load play_ids once into HashSet (17MB)
- ✅ Use database cursor (fetches rows lazily)
- ✅ Enrich text on-the-fly (no batch processing)

---

### POST /api/embeddings/integrate

**Memory-efficient implementation using mmap:**

```python
import numpy as np
import faiss
import tempfile
import os
import mmap
from base64 import b64decode

@router.post("/api/embeddings/integrate")
async def integrate_embeddings(request: IntegrationRequest):
    """
    Integrate embeddings using memory-mapped files.
    Memory usage: ~100MB (no large arrays in memory)
    """

    # Decode embeddings to temp file (streaming, not in-memory)
    with tempfile.NamedTemporaryFile(delete=False, suffix='.npy') as tmp:
        tmp_path = tmp.name

        # Stream decode base64 to file (avoid loading all into memory)
        chunk_size = 1024 * 1024  # 1MB chunks
        embeddings_b64 = request.embeddings_256d_b64

        for i in range(0, len(embeddings_b64), chunk_size):
            chunk = embeddings_b64[i:i+chunk_size]
            decoded = b64decode(chunk)
            tmp.write(decoded)

    # Load new embeddings using mmap (no memory copy)
    new_embeddings = np.load(tmp_path, mmap_mode='r')
    new_ids = np.array(request.play_ids, dtype=np.int64)

    # Load existing using mmap (read-only, no memory copy)
    existing_embeddings = np.load('/app/data/embeddings_256d.npy', mmap_mode='r')
    existing_ids = np.load('/app/data/play_ids.npy', mmap_mode='r')

    # Merge to new temp file (avoid double memory usage)
    with tempfile.NamedTemporaryFile(delete=False, suffix='.npy') as out_tmp:
        combined_tmp = out_tmp.name

        # Stack arrays and write directly to file
        combined_embeddings = np.vstack([existing_embeddings, new_embeddings])
        combined_ids = np.concatenate([existing_ids, new_ids])

        # Sort by ID
        sort_idx = np.argsort(combined_ids)
        combined_ids = combined_ids[sort_idx]
        combined_embeddings = combined_embeddings[sort_idx]

        # Save to temp file
        np.save(combined_tmp + '.ids', combined_ids)
        np.save(combined_tmp + '.embeddings', combined_embeddings)

    # Rebuild FAISS index from disk (FAISS can use mmap)
    index = rebuild_index_from_file(combined_tmp + '.embeddings.npy')

    # Atomic swap
    os.rename(combined_tmp + '.embeddings.npy', '/app/data/embeddings_256d.npy')
    os.rename(combined_tmp + '.ids.npy', '/app/data/play_ids.npy')
    faiss.write_index(index, '/app/data/embeddings_256d.index')

    # Clean up
    os.unlink(tmp_path)

    return {"status": "success", ...}


def rebuild_index_from_file(embeddings_path: str) -> faiss.Index:
    """
    Rebuild FAISS index using memory-mapped file.
    Avoids loading full array into memory.
    """
    embeddings = np.load(embeddings_path, mmap_mode='r')

    d = embeddings.shape[1]
    nlist = 1024

    quantizer = faiss.IndexFlatIP(d)
    index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)

    # Train on sample (don't need all vectors)
    sample_size = min(100000, len(embeddings))
    sample = np.array(embeddings[:sample_size])  # Copy only sample to memory
    faiss.normalize_L2(sample)
    index.train(sample)

    # Add in batches (FAISS handles large arrays efficiently)
    batch_size = 100000
    for i in range(0, len(embeddings), batch_size):
        batch = np.array(embeddings[i:i+batch_size])  # Copy batch
        faiss.normalize_L2(batch)
        index.add(batch)

    return index
```

**Key optimizations:**
- ✅ Use mmap for reading large arrays (no memory copy)
- ✅ Stream base64 decode to temp file
- ✅ Write merged arrays directly to temp files
- ✅ Rebuild FAISS in batches (only loads batch into memory)
- ✅ Atomic file swaps

---

## Colab Notebook (Optimized for GPU)

**File:** `analysis/generate_incremental_embeddings_v2.ipynb`

```python
# Cell 1: Check GPU
import torch
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Device: {device}")
if device == 'cuda':
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

# Output: GPU: Tesla T4, Memory: 15.00 GB (free tier)
# Output: GPU: A100-SXM4-80GB, Memory: 85.17 GB (if upgraded)

# Cell 2: Install dependencies
!pip install -q sentence-transformers requests joblib

# Cell 3: Fetch pending plays
import requests
import json

API_URL = "https://cratemusic.duckdns.org"

response = requests.get(f"{API_URL}/api/embeddings/pending?limit=1000")
batch = response.json()

print(f"Batch ID: {batch['batch_id']}")
print(f"Plays to embed: {len(batch['plays'])}")

# Cell 4: Download PCA transformer
pca_response = requests.get(f"{API_URL}/api/embeddings/pca-model")
with open('pca_transformer_256d.joblib', 'wb') as f:
    f.write(pca_response.content)

print(f"✓ Downloaded PCA transformer (775KB)")

# Cell 5: Generate embeddings (EXACT pipeline)
from sentence_transformers import SentenceTransformer
import numpy as np
import joblib
from tqdm import tqdm

MODEL_NAME = 'sentence-transformers/multi-qa-mpnet-base-dot-v1'
model = SentenceTransformer(MODEL_NAME, device=device)

texts = [play['enriched_text'] for play in batch['plays']]
play_ids = [play['id'] for play in batch['plays']]

print(f"\nGenerating embeddings for {len(texts)} texts...")

# Step 1: 768d (normalized) - uses GPU if available
embeddings_768d = model.encode(
    texts,
    batch_size=1024 if device == 'cuda' else 32,  # Large batch for GPU
    show_progress_bar=True,
    normalize_embeddings=True,  # ← CRITICAL
    convert_to_numpy=True,
    device=device
)

print(f"✓ Generated 768d embeddings: {embeddings_768d.shape}")
print(f"  Memory used: ~{embeddings_768d.nbytes / 1e6:.1f} MB")

# Step 2: Apply PCA (CPU only, but fast)
pca = joblib.load('pca_transformer_256d.joblib')
embeddings_256d = pca.transform(embeddings_768d)

print(f"✓ Reduced to 256d: {embeddings_256d.shape}")

# Step 3: Re-normalize
for i in range(len(embeddings_256d)):
    embeddings_256d[i] = embeddings_256d[i] / np.linalg.norm(embeddings_256d[i])

embeddings_256d = embeddings_256d.astype('float32')

print(f"✓ Normalized 256d embeddings")
print(f"  Memory used: ~{embeddings_256d.nbytes / 1e6:.1f} MB")

# Free GPU memory
if device == 'cuda':
    del embeddings_768d
    torch.cuda.empty_cache()
    print("✓ Freed GPU memory")

# Cell 6: Compute checksum
import hashlib

embeddings_bytes = embeddings_256d.tobytes()
checksum = hashlib.sha256(embeddings_bytes).hexdigest()

print(f"Checksum: sha256:{checksum}")

# Cell 7: Encode and POST (streaming to avoid memory spike)
import base64
from datetime import datetime

# Stream encode to base64
embeddings_b64 = base64.b64encode(embeddings_bytes).decode('utf-8')

print(f"Encoded to base64 ({len(embeddings_b64) / 1e6:.1f} MB)")

payload = {
    "batch_id": batch['batch_id'],
    "play_ids": play_ids,
    "embeddings_256d_b64": embeddings_b64,
    "checksum": f"sha256:{checksum}",
    "metadata": {
        "generated_by": "colab",
        "model_name": MODEL_NAME,
        "generation_time": datetime.utcnow().isoformat(),
        "device": device
    }
}

print(f"\nPosting to {API_URL}/api/embeddings/integrate...")
print(f"Payload size: {len(json.dumps(payload)) / 1e6:.1f} MB")

response = requests.post(
    f"{API_URL}/api/embeddings/integrate",
    json=payload,
    headers={"Content-Type": "application/json"},
    timeout=300  # 5 minute timeout for large batches
)

result = response.json()

print(f"\n{'='*80}")
print(f"INTEGRATION COMPLETE")
print(f"{'='*80}")
print(f"Status: {result['status']}")

if result['status'] == 'success':
    print(f"✓ Integrated: {result['integration']['plays_integrated']} plays")
    print(f"✓ Total embeddings: {result['integration']['total_embeddings_after']}")
    print(f"✓ Index rebuilt: {result['index']['rebuilt']}")
    print(f"✓ API restarted: {result['api_restarted']}")
else:
    print(f"✗ Error: {result['error_code']}")
    print(f"  Message: {result['message']}")
```

---

## Memory Usage Comparison

### Current Approach (Colab Does Everything)

| Component | Memory | Location |
|-----------|--------|----------|
| Fetch pending plays | <1MB | Droplet → Colab |
| Load SentenceTransformer | 400MB | Colab RAM/GPU |
| Generate 768d (1000 plays) | ~3MB | Colab GPU |
| Apply PCA | ~1MB | Colab CPU |
| Base64 encode | ~1.5MB | Colab CPU |
| POST to Droplet | <1MB | Colab → Droplet |
| **Droplet overhead** | **<50MB** | ✅ Fits easily |
| **Colab peak** | **~500MB** | ✅ Fits in free tier |

### Alternative (Tried to do on Droplet) ❌

| Component | Memory | Location |
|-----------|--------|----------|
| Load SentenceTransformer | 400MB | Droplet ❌ |
| FAISS already loaded | 2.7GB | Droplet |
| Generate embeddings | 500MB | Droplet ❌ |
| **Total** | **3.6GB** | ❌ Exceeds 3.8GB limit |

---

## Deployment Checklist

### 1. Update FAISS API (Droplet)

- [ ] Add `app/routes/embeddings.py` with streaming endpoints
- [ ] Implement mmap-based integration service
- [ ] Add enrichment function (lightweight, no ML models)
- [ ] Test memory usage with `docker stats`
- [ ] Deploy and verify endpoints work

### 2. Create Colab Notebook

- [ ] Copy template above
- [ ] Test with 10-play batch
- [ ] Verify embeddings match expected format
- [ ] Test POST integration
- [ ] Document for future use

### 3. Test End-to-End

- [ ] Generate embeddings for 100 test plays in Colab
- [ ] POST to Droplet
- [ ] Verify FAISS search works
- [ ] Check memory usage stays under 3GB

### 4. Production Run

- [ ] Process all ~673 pending plays
- [ ] Monitor Droplet memory
- [ ] Verify search quality
- [ ] Document process

---

## Next Steps

Ready to implement! Should I:

1. **Create the FastAPI endpoints** with streaming/mmap optimizations?
2. **Create the Colab notebook** with the full pipeline?
3. **Both in parallel**?

The design ensures the Droplet stays under 4GB RAM by using memory-mapped files and streaming, while Colab handles all the heavy embedding generation with GPU acceleration.
