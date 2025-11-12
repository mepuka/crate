# Music Text Embedding Research - Executive Summary

**Date:** November 11, 2025
**TL;DR:** Use BGE-large or MPNet. Music-specific models don't help for text-only metadata.

---

## Key Finding

**No music-specific text-only embedding model significantly outperforms fine-tuned general sentence transformers for metadata-based search.**

Most "music embedding" research requires audio files, which you don't have.

---

## Recommended Approach

### Option 1: BGE-large-en-v1.5 (RECOMMENDED)
- Best quality for unlimited GPU budget
- 1024-dimensional embeddings
- Used by production systems
- No music-specific training needed

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('BAAI/bge-large-en-v1.5')
```

### Option 2: all-mpnet-base-v2 (ALTERNATIVE)
- Good balance of speed and quality
- 768-dimensional embeddings
- Faster than BGE (if speed matters)

```python
model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
```

### Option 3: Fine-tune if needed
- Only if baseline quality < 70% precision@10
- Cost: < $0.10, 5 minutes training time
- Use your MusicBrainz data to create training pairs

---

## Music-Specific Models: Why They Don't Help

| Model | Issue | Verdict |
|-------|-------|---------|
| **CLAP** (LAION) | Designed for audio-text matching, text encoder not optimized for metadata | Worth testing but not better |
| **CLaMP** (Microsoft) | Requires symbolic music (MIDI), not text-only | Not applicable |
| **MuLan** (Google) | Requires audio, part of MusicLM generation | Not accessible |
| **MusicBERT** | Requires MIDI or audio | Not applicable |
| **TTMR++** | Requires audio | Not applicable |
| **Musical Word Embedding** | Word-level, not sentence-level | Limited usefulness |

**All audio-based models are irrelevant because you only have text metadata.**

---

## What Actually Works (Industry Practice)

**Spotify & Deezer:** Fine-tune general transformers on playlist/listening data
**Research:** Editorial metadata (Discogs) outperforms style tags
**Conclusion:** Rich metadata + good general model > specialized architecture

Your approach: **MusicBrainz enrichment + sentence transformers = correct strategy**

---

## Quick Start Testing

1. **Install dependencies:**
```bash
pip install sentence-transformers transformers torch scikit-learn
```

2. **Run comparison script:**
```bash
python test_music_embeddings.py
```

This tests 4 models (MPNet, BGE, MiniLM, CLAP) on 1000 sample records with real queries.

3. **Evaluate results manually:**
- Which model returns most relevant results?
- Is quality good enough (>70% top-10 relevance)?
- If yes → use as-is
- If no → fine-tune on your data

---

## Processing Timeline

### Baseline (No Fine-tuning)
- **Setup:** 5 minutes
- **Testing:** 30 minutes (1K sample)
- **Full processing:** 45 minutes (2.2M records with BGE)
- **Cost:** $0 (Colab free tier sufficient)

### With Fine-tuning
- **Dataset creation:** 2 hours
- **Training:** 5 minutes
- **Full processing:** 45 minutes
- **Total:** 3-4 hours
- **Cost:** < $0.10

---

## Performance Expectations

| Metric | Target | Expected |
|--------|--------|----------|
| **Precision@10** | >70% | 75-85% |
| **Query Latency** | <200ms | 100-150ms |
| **Processing Time** | <1 hour | 30-45 min |
| **Cost** | $0 | $0 |

---

## Decision Tree

```
Start
  ↓
Test BGE-large on 1K sample
  ↓
Top-10 relevance >70%?
  ├─ Yes → Use BGE as-is (DONE)
  └─ No → Fine-tune on your data
      ↓
      Test fine-tuned model
      ↓
      Improvement >5%?
        ├─ Yes → Use fine-tuned (DONE)
        └─ No → Revisit text enrichment strategy
```

---

## What Makes Your Approach Work

1. **Rich Metadata Enrichment** (You're doing this)
   - Artist + song + album + genre + year + label
   - MusicBrainz relationships
   - This is more important than model choice

2. **Good General Model** (BGE or MPNet)
   - Already understands semantic similarity
   - Trained on billions of text pairs
   - No need for music-specific architecture

3. **Optional Fine-tuning** (If needed)
   - Learn music-specific relationships
   - Understand genre taxonomy
   - Capture artist similarities

4. **Hybrid Search** (Your plan)
   - Semantic (embeddings)
   - Keyword (FTS5)
   - Filters (SQL)

---

## Resources

### Full Research Report
- `/Users/pooks/Dev/crate/analysis/MUSIC_TEXT_EMBEDDING_RESEARCH.md`
- 60KB detailed analysis
- All papers, models, benchmarks

### Test Script
- `/Users/pooks/Dev/crate/analysis/test_music_embeddings.py`
- Compares 4 models on your data
- Real query testing

### Models on HuggingFace
- BGE-large: `BAAI/bge-large-en-v1.5`
- MPNet: `sentence-transformers/all-mpnet-base-v2`
- MiniLM: `sentence-transformers/all-MiniLM-L6-v2`
- CLAP: `laion/clap-htsat-fused`

---

## Bottom Line

**Don't overthink it:**
1. Use BGE-large-en-v1.5 out-of-the-box
2. Test on 1K sample with real queries
3. Fine-tune only if quality insufficient
4. Music-specific models won't help

**Your MusicBrainz enrichment strategy is more valuable than any specialized model.**

---

## Next Steps

**Today:**
- [ ] Run `python test_music_embeddings.py`
- [ ] Manually evaluate results
- [ ] Choose model (likely BGE)

**This Week:**
- [ ] Process full 2.2M records
- [ ] Build hybrid search
- [ ] Test diverse queries

**Next Week (if needed):**
- [ ] Create fine-tuning dataset
- [ ] Fine-tune chosen model
- [ ] Re-evaluate quality

---

**Questions?** Refer to detailed research doc: `MUSIC_TEXT_EMBEDDING_RESEARCH.md`
