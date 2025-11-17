# Embedding Update Workflow

## Overview

This document describes the recommended workflow for generating and updating FAISS embeddings for the Crate music search API. This workflow sidesteps the memory constraints of the 3.8GB Droplet by processing everything in Google Colab's abundant RAM (12-15GB), then uploading final artifacts.

## Why This Approach?

**Problem:** The on-Droplet `/api/embeddings/integrate` endpoint caused repeated OOM (Out of Memory) crashes when processing batches of embeddings:
- Droplet has only 3.8GB RAM (+ 4GB swap)
- Processing 2.2M+ embeddings requires ~4-6GB peak memory
- FAISS index rebuild accumulates memory internally
- Multiple attempts with memory-mapped files and reduced batch sizes still failed

**Solution:** Process everything in Colab where RAM is abundant, then upload complete artifacts.

## Files

| File | Purpose |
|------|---------|
| `colab_full_integration.ipynb` | Complete Colab notebook for full embedding generation and integration |
| `upload_to_droplet.sh` | Helper script to upload artifacts and restart API |
| `incremental_embeddings_endpoint.ipynb` | **DEPRECATED** - Uses OOM-prone integrate endpoint |

## Workflow Steps

### 1. Download Current Data from Droplet

From your local machine, download the current embeddings and index:

```bash
cd ~/Downloads  # Or any working directory

# Download current data files
scp root@cratemusic.duckdns.org:/root/faiss-search-api/data/embeddings_256d.npy ./
scp root@cratemusic.duckdns.org:/root/faiss-search-api/data/play_ids.npy ./
scp root@cratemusic.duckdns.org:/root/faiss-search-api/data/pca_transformer_256d.joblib ./
```

**File sizes:**
- `embeddings_256d.npy`: ~565 MB (2.2M vectors × 256 dimensions × 4 bytes) - **ONLY for merging, not needed on Droplet!**
- `play_ids.npy`: ~18 MB (2.2M IDs × 8 bytes)
- `pca_transformer_256d.joblib`: ~775 KB (PCA model)

### 2. Open Notebook in Google Colab

1. Upload `colab_full_integration.ipynb` to Google Colab
2. **Enable GPU runtime**: Runtime → Change runtime type → Hardware accelerator → **T4 GPU**
3. Upload the 3 data files you downloaded (use the Files panel on the left)

### 3. Run the Notebook

Execute all cells in sequence. The notebook will:

1. **Load existing data** - Memory-mapped to avoid loading full 2.2M vectors into RAM
2. **Fetch pending plays** - From API endpoint `/api/embeddings/pending`
3. **Generate embeddings** - GPU-accelerated with sentence-transformers (~500-800 texts/sec)
4. **Apply PCA reduction** - 768d → 256d using existing PCA transformer
5. **Merge arrays** - Simple concatenation (Colab has 12-15GB RAM, no constraints)
6. **Rebuild FAISS index** - Complete IVFFlat index with 1024 clusters
7. **Save artifacts** - 3 output files ready for download

**Processing time:**
- T4 GPU: ~2-3 minutes for 1,000 plays
- CPU fallback: ~20-50 minutes for 1,000 plays

### 4. Download Artifacts from Colab

After the notebook completes, download these **2 files** (the .index contains the vectors, .npy is redundant):
- `play_ids_new.npy` (~18 MB)
- `embeddings_256d_new.index` (~2.2 GB - contains vectors + index structure)

**Note:** You can skip downloading `embeddings_256d_new.npy` - it's 2.1 GB and redundant since the FAISS .index file already contains all the vectors!

Use the Files panel in Colab: right-click → Download

### 5. Upload to Droplet

Navigate to the directory containing the downloaded files, then run:

```bash
cd ~/Downloads  # Or wherever you downloaded the files
chmod +x /Users/pooks/Dev/crate/analysis/upload_to_droplet.sh
/Users/pooks/Dev/crate/analysis/upload_to_droplet.sh
```

The script will:
1. ✅ Verify required files exist locally
2. ✅ Show file sizes and ask for confirmation
3. ✅ Create backups on Droplet (`.backup` suffix)
4. ✅ Upload **only 2 files**: play_ids.npy + embeddings_256d.index
5. ✅ **Delete redundant embeddings.npy** (saves 2.1 GB on Droplet!)
6. ✅ Restart API service via `docker-compose restart api`
7. ✅ Wait 30s for health check
8. ✅ Verify new data loaded

### 6. Verify Success

Check the API health endpoint:

```bash
curl http://cratemusic.duckdns.org/api/health | jq
```

Expected output should show:
- `total_vectors`: Increased by number of new plays processed
- `pending_plays`: Decreased or zero
- `memory_usage_mb`: Should be stable (< 2.5GB)

## Architecture Comparison

### Old Approach (DEPRECATED - OOM Issues)
```
Local → POST /api/embeddings/integrate (2.1 MB payload)
         ↓
      Droplet (3.8GB RAM)
         ├── Decode base64 embeddings
         ├── Merge with existing (vstack/mmap)
         ├── Rebuild FAISS index ← OOM CRASH HERE
         └── Save to disk
```

### New Approach (RECOMMENDED)
```
Colab (12-15GB RAM, GPU)
  ├── Download current data (SCP)
  ├── Generate embeddings (GPU)
  ├── Merge arrays (abundant RAM)
  ├── Rebuild FAISS index (no memory constraints)
  └── Save artifacts
       ↓
Local machine (download from Colab)
       ↓
Droplet (simple file upload + restart)
```

## Benefits of New Approach

✅ **No memory constraints** - Colab has 12-15GB vs Droplet's 3.8GB
✅ **GPU acceleration** - 500-800 texts/sec vs 20-50 on CPU
✅ **No Droplet downtime** - Processing happens offline in Colab
✅ **Simple deployment** - Just upload 3 files and restart
✅ **Debugging visibility** - Colab shows progress, errors, and metrics
✅ **Cost effective** - Colab free tier sufficient for this workflow

## Storage Optimization: Why Only 2 Files?

### FAISS Index Contains the Vectors!

The `.index` file already contains all the embedding vectors internally. The separate `.npy` file is **redundant for production use**.

**Current Droplet Storage:**
- ~~`embeddings_256d.npy`~~ - 2.1 GB **REMOVED** (redundant)
- ✅ `embeddings_256d.index` - 2.2 GB (vectors + search structure)
- ✅ `play_ids.npy` - 17 MB (index-to-ID mapping)
- ✅ `pca_transformer_256d.joblib` - 775 KB (query encoding)

**Storage Saved: 2.1 GB!**

### What About the PCA Transformer?

The **`pca_transformer_256d.joblib`** (775 KB) is a trained model:
- ✅ Created ONCE from original 2.2M embeddings
- ✅ **Never needs to be regenerated**
- ✅ Reused forever for query encoding (768d → 256d)

The Colab notebook downloads and uses the existing one - it does NOT retrain it.

### Old embeddings.npy Usage (Now Obsolete)

The `.npy` file was previously needed for:
1. ~~Integration endpoint to merge new embeddings~~ - Abandoned due to OOM
2. ~~Validation check during service startup~~ - Made optional

With the new Colab workflow, all merging happens in Colab where the temporary `.npy` is created but not uploaded to the Droplet.

## Troubleshooting

### Upload Script Issues

**Q: "Permission denied" when running script**
**A:** Make the script executable: `chmod +x upload_to_droplet.sh`

**Q: "File not found" errors**
**A:** Ensure you're in the directory containing the 3 downloaded files

**Q: "Connection refused" SSH errors**
**A:** Verify SSH access: `ssh root@cratemusic.duckdns.org "echo 'Connected'"`

### Colab Issues

**Q: "GPU not available"**
**A:** Runtime → Change runtime type → Hardware accelerator → GPU → Save

**Q: "Out of memory" in Colab**
**A:** Reduce `FETCH_LIMIT` to process smaller batches (e.g., 500 plays at a time)

**Q: "Disconnected from runtime"**
**A:** Colab free tier has 12-hour max session. Rerun from checkpoint if needed.

### API Issues

**Q: Health check shows old vector count**
**A:** Ensure API service restarted: `ssh root@cratemusic.duckdns.org "cd /root/faiss-search-api && docker-compose restart api"`

**Q: "Pending plays" not decreasing**
**A:** Check database to verify plays now have embeddings. May need to regenerate enriched text.

## Current Status (as of 2025-11-17)

- ✅ Colab notebook created and tested
- ✅ Upload script created and ready
- ✅ Documentation updated
- ✅ Docker image rebuilt with memory optimizations
- ⏳ **Ready to process ~1,529 pending plays**

## Next Steps

1. Run `colab_full_integration.ipynb` in Colab to process pending embeddings
2. Download the **2 artifact files** (skip embeddings_256d_new.npy)
3. Run `upload_to_droplet.sh` to deploy
4. Verify with health endpoint

This workflow is repeatable - run it anytime new plays need embeddings!

## Summary of Changes

**Optimizations Applied:**
- ✅ Removed redundant `embeddings_256d.npy` from Droplet (saves 2.1 GB)
- ✅ Updated search service to skip loading .npy file
- ✅ Upload script now only uploads 2 files instead of 3
- ✅ Upload script automatically cleans up old .npy files

**Files Required on Droplet:**
- `embeddings_256d.index` (2.2 GB) - contains vectors + search index
- `play_ids.npy` (17 MB) - index-to-ID mapping
- `pca_transformer_256d.joblib` (775 KB) - query encoding (never changes)
