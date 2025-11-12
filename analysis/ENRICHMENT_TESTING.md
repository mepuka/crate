# Music Data Enrichment & Embedding Testing

## Overview

This directory contains tools for exploring your KEXP/MusicBrainz data and testing different text enrichment and embedding strategies.

## What You Have

### Research Deliverables
1. **`MUSIC_TEXT_EMBEDDING_RESEARCH.md`** - Comprehensive research on music-specific models
2. **`MUSIC_EMBEDDING_SUMMARY.md`** - Quick summary and recommendations
3. **`EMBEDDING_MODELS_QUICK_REF.md`** - Model comparison table

### Notebooks
1. **`notebooks/01_initial_exploration.ipynb`** - Database exploration
2. **`notebooks/02_enrichment_exploration.ipynb`** - **NEW!** Analyze your data enrichment
3. **`notebooks/semantic_music_search_colab.ipynb`** - Colab processing (coming soon)

### Python Utilities
- **`src/crate_analysis/db.py`** - Database connection helpers
- **`src/crate_analysis/enrichment.py`** - Text enrichment function
- **`test_local_embedding.py`** - Quick local embedding test

## Quick Start: Test Locally

### 1. Install Dependencies

```bash
cd analysis
uv add sentence-transformers scikit-learn
```

### 2. Explore Your Data

```bash
# Start Jupyter
uv run jupyter lab

# Open: notebooks/02_enrichment_exploration.ipynb
# This will show you:
# - What MusicBrainz data you have
# - DJ comments analysis
# - Relationship data structure
# - Example enriched texts
```

### 3. Test Embeddings Locally

```bash
# Quick test with 100 samples
python test_local_embedding.py
```

This will:
- Load 100 random plays from your database
- Enrich them with comments, labels, genres, etc.
- Test 3 embedding models (MiniLM, MPNet, BGE-large)
- Show top results for 5 example queries
- Let you manually evaluate quality

**Expected runtime**: 2-5 minutes

### 4. Evaluate Results

The test script shows you semantic search results for queries like:
- "chill electronic ambient music"
- "energetic indie rock guitar"
- "jazz experimental saxophone"

**Look for**:
- Are the top results relevant?
- Do semantic matches make sense?
- Which model gives best results?

## Text Enrichment Strategy

Based on your data, we enrich each play with:

```
Artist - Song - Album | Comment: <DJ comment> | Label: <label> | Rotation: <status> | Year: <year>
```

**Example**:
```
Radiohead - Paranoid Android - OK Computer | Comment: Epic multi-part progressive rock masterpiece | Label: Parlophone | Rotation: Heavy | Year: 1997
```

### What Makes It Work

1. **DJ Comments** - Most valuable! Contains genre, mood, style descriptions
2. **Labels** - Record labels help identify style/scene
3. **Rotation Status** - Heavy/Medium/Light indicates quality/popularity
4. **MusicBrainz Relationships** - Structured genre data (if available)
5. **Year** - Temporal context

## Model Recommendations

### For Maximum Quality (You Have Colab Premium)
✅ **Use `BAAI/bge-large-en-v1.5`**
- Best quality
- 1024 dimensions
- Slower but you have GPU

### For Speed/Efficiency
✅ **Use `all-MiniLM-L6-v2`**
- 5x faster
- 384 dimensions
- Good enough quality for most use cases

### Music-Specific Models
❌ **Don't bother** - No text-only music models outperform fine-tuned general models for metadata search

See `MUSIC_TEXT_EMBEDDING_RESEARCH.md` for full analysis.

## Next Steps

### Today
1. ✅ Run `notebooks/02_enrichment_exploration.ipynb`
2. ✅ Run `python test_local_embedding.py`
3. ⏳ Manually evaluate which model is best

### This Week
4. ⏳ If quality good (>70%) → Process full 2.2M in Colab
5. ⏳ If quality poor → Fine-tune model (scripts available)
6. ⏳ Build search interface

## Files Created

| File | Purpose |
|------|---------|
| `notebooks/02_enrichment_exploration.ipynb` | Explore your MusicBrainz data |
| `src/crate_analysis/enrichment.py` | Text enrichment function |
| `test_local_embedding.py` | Quick embedding quality test |
| `MUSIC_TEXT_EMBEDDING_RESEARCH.md` | Full research report |
| `MUSIC_EMBEDDING_SUMMARY.md` | TL;DR recommendations |
| `EMBEDDING_MODELS_QUICK_REF.md` | Model comparison table |

## Key Insights from Research

1. **No magic music models** - General sentence transformers work best for metadata
2. **Enrichment > Model** - Rich text (80%) matters more than model choice (15%)
3. **Comments are gold** - DJ comments contain genre/mood/style info
4. **Fine-tuning helps** - ~5-10% improvement if baseline insufficient
5. **You're on the right track** - Your MusicBrainz enrichment strategy is correct

## Questions?

- See `MUSIC_EMBEDDING_SUMMARY.md` for quick answers
- See `MUSIC_TEXT_EMBEDDING_RESEARCH.md` for deep dive
- See `EMBEDDING_MODELS_QUICK_REF.md` for model specs
- See research papers linked in docs

## Bottom Line

**Start simple**:
1. Test embeddings locally with `test_local_embedding.py`
2. Pick best model (likely BGE-large for you)
3. Process full dataset in Colab
4. Ship it!

Your enrichment strategy is more important than the embedding model.
