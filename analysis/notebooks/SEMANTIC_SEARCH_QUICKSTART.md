# Semantic Music Search - Quick Start Guide

This guide provides a streamlined path to implementing semantic search for the KEXP music database.

## 📋 Overview

**Goal**: Build a semantic music search system that understands natural language queries like:
- "chill electronic from the 90s"
- "energetic indie rock similar to Radiohead"
- "local Seattle bands in heavy rotation"

**Approach**:
- Process data once in Google Colab (free GPU)
- Export enhanced SQLite database with embeddings
- Query locally with hybrid semantic + keyword search
- Zero ongoing costs

**Time Required**:
- Setup & Processing: 30-60 minutes (mostly automated)
- Local setup: 15 minutes
- **Total**: ~1-2 hours to working system

## 🎯 Quick Decision Matrix

### Should I Use This Approach?

✅ **YES, if you want:**
- Semantic understanding of music queries
- Self-hosted solution (no API costs)
- Offline capability
- Single-file database portability
- Research/personal project scale

❌ **NO, if you need:**
- Production scale (100M+ records)
- Sub-10ms query latency
- Real-time updates (second-by-second)
- Multi-user concurrent access (1000+ QPS)

### Embedding Model Choice

| Model | Speed | Quality | Size | Use Case |
|-------|-------|---------|------|----------|
| **all-MiniLM-L6-v2** ⭐ | Fast (5x) | Good (84%) | Small (90MB) | **Recommended: Start here** |
| all-mpnet-base-v2 | Slow (1x) | Better (87%) | Large (400MB) | If quality issues found |

**Decision**: Start with MiniLM. Only switch to mpnet if testing reveals quality problems.

## 🚀 Implementation Steps

### Phase 1: Colab Processing (30-60 min)

**What happens**: Generate embeddings for 2.2M plays using free GPU

**Steps**:

1. **Open Google Colab**
   - Go to https://colab.research.google.com/
   - File → Upload notebook
   - Upload: `semantic_music_search_colab.ipynb` (from this directory)

2. **Enable GPU** (CRITICAL)
   - Runtime → Change runtime type
   - Hardware accelerator: **GPU**
   - Save

3. **Upload Database**
   - Option A: Upload `music_kb.sqlite` directly (~5 min upload)
   - Option B: Mount Google Drive if database already there

4. **Run All Cells**
   - Runtime → Run all
   - Grab coffee ☕ (~30 min processing)
   - Watch progress bars

5. **Download Enhanced Database**
   - Final cell downloads `music_kb.sqlite` with vectors
   - Size: ~6GB

**Output**: `music_kb.sqlite` with:
- Original tables (fact_plays, mb_master_lookup, etc.)
- **NEW**: vec_plays table (embeddings)
- **NEW**: fact_plays_fts table (keyword index)

### Phase 2: Local Setup (15 min)

**What happens**: Setup Python environment to query the database

**Steps**:

1. **Create Project Directory**
   ```bash
   mkdir music-search
   cd music-search
   ```

2. **Create Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Mac/Linux
   # or
   venv\Scripts\activate  # Windows
   ```

3. **Install Dependencies**
   ```bash
   pip install sentence-transformers sqlite-vec pandas numpy flask
   ```

4. **Copy Database**
   ```bash
   # Place the enhanced music_kb.sqlite in this directory
   cp ~/Downloads/music_kb.sqlite .
   ```

5. **Create Query Script**
   - Copy `music_search.py` from research document Appendix
   - Or download from project repository

6. **Test Queries**
   ```bash
   python music_search.py
   ```

**Output**: Working search with test queries

### Phase 3: Web Interface (Optional, 15 min)

**What happens**: Simple web UI for searching

**Steps**:

1. **Create Flask App**
   - Copy `app.py` and `templates/index.html` from research doc
   - Or use CLI-only version

2. **Run Server**
   ```bash
   python app.py
   ```

3. **Open Browser**
   - Navigate to http://localhost:5000
   - Start searching!

## 📊 What You Get

### Query Capabilities

| Query Type | Example | How It Works |
|------------|---------|--------------|
| **Semantic** | "chill electronic" | Embedding similarity |
| **Keyword** | "radiohead" | FTS5 exact match |
| **Filtered** | "90s indie on Sub Pop" | Combines semantic + SQL filters |
| **Hybrid** | "energetic rock" | RRF fusion of semantic + keyword |

### Performance Expectations

| Metric | Value | Notes |
|--------|-------|-------|
| **Query Latency** | 100-200ms | p95, includes embedding + search |
| **Index Size** | ~6GB | Original DB + vectors + FTS5 |
| **Memory Usage** | ~2GB | Model + database cache |
| **Processing Time** | 30-60 min | One-time, on Colab GPU |

### Cost Breakdown

| Component | Cost | Notes |
|-----------|------|-------|
| **Colab Processing** | $0 | Free tier sufficient |
| **Local Hosting** | $0 | Runs on your machine |
| **API Calls** | $0 | No external APIs |
| **Storage** | $0 | 6GB on local disk |
| **TOTAL** | **$0** | Zero ongoing costs |

## 🔧 Customization

### Easy Tweaks

**1. Change Number of Results**
```python
results = search.search(query, limit=50)  # Default: 20
```

**2. Semantic-Only Search**
```python
results = search.search(query, use_hybrid=False)
```

**3. Adjust Filters**
```python
# In music_search.py, modify parse_query() to extract more filters:
# - Genre extraction
# - BPM ranges
# - Multiple years
```

**4. Change Embedding Model**
```python
# In Colab notebook, change model name:
model = SentenceTransformer('all-mpnet-base-v2')  # Better quality, slower
```

### Advanced Customizations

**1. Multi-Field Embeddings**
- Embed artist, album, song separately
- Query with different weights
- Better for artist similarity queries

**2. Query Expansion**
- Add genre synonym dictionary
- Expand queries automatically
- Better recall for vague queries

**3. Re-ranking**
- LLM-based relevance scoring
- Collaborative filtering
- Temporal boosting

**4. Playlist Generation**
- Seed with song or query
- Generate sequence with smooth transitions
- Export to Spotify/Apple Music

## 🐛 Troubleshooting

### Common Issues

**❌ "CUDA out of memory" in Colab**
- Reduce batch_size: `batch_size=128` or `batch_size=64`
- Restart runtime: Runtime → Restart runtime
- Use smaller model: Keep MiniLM (already small)

**❌ "sqlite-vec not found" locally**
- Reinstall: `pip install --force-reinstall sqlite-vec`
- Check Python version: Requires Python 3.8+
- Try loading explicitly: `sqlite_vec.load(conn)`

**❌ "Slow queries (> 1 second)"**
- Check model is loaded once (not per query)
- Verify GPU used in Colab (check test cell output)
- Ensure database is on SSD, not HDD
- Try smaller k value: `k=50` instead of `k=100`

**❌ "Poor result quality"**
- Check text enrichment: Print enriched texts
- Verify genres are being extracted
- Try different query phrasing
- Consider upgrading to mpnet model

**❌ "Database too large to download"**
- Use Google Drive instead: Save to Drive, sync locally
- Compress first: `gzip music_kb.sqlite`
- Split into chunks: Use split command

## 📚 Key Files Reference

### From This Directory

| File | Purpose | Size |
|------|---------|------|
| `semantic_music_search_research.md` | Full research & design doc | 60KB |
| `semantic_music_search_colab.ipynb` | Colab processing notebook | TBD |
| `SEMANTIC_SEARCH_QUICKSTART.md` | This quick start guide | 10KB |

### To Create Locally

| File | Purpose | Source |
|------|---------|--------|
| `music_search.py` | Query module | Copy from research doc Section 8, Step 2.2 |
| `app.py` | Flask web server | Copy from research doc Section 8, Step 2.3 |
| `templates/index.html` | Web UI | Copy from research doc Section 8, Step 2.3 |

### Database Files

| File | Purpose | Size | Location |
|------|---------|------|----------|
| `music_kb.sqlite` (original) | KEXP data | ~2GB | Existing |
| `music_kb.sqlite` (enhanced) | + vectors + FTS5 | ~6GB | After Colab |

## 🎓 Learning Path

### Beginner: Just Get It Working
1. Follow Phase 1 (Colab) exactly as written
2. Download database
3. Use provided `music_search.py` without modifications
4. Test with example queries
5. Done! 🎉

### Intermediate: Customize & Improve
1. Complete Beginner path
2. Modify `parse_query()` to extract more filters
3. Add genre synonym dictionary
4. Build simple web interface
5. Experiment with different models

### Advanced: Extend & Research
1. Complete Intermediate path
2. Implement multi-field embeddings
3. Add collaborative filtering
4. Build playlist generation
5. Contribute improvements back

## 📈 Next Steps After Setup

### Immediate (Day 1)
- [ ] Test with 20+ diverse queries
- [ ] Document query failures
- [ ] Adjust enrichment strategy if needed
- [ ] Share with colleagues for feedback

### Short-Term (Week 1)
- [ ] Build genre synonym dictionary
- [ ] Add query result caching
- [ ] Create favorite queries list
- [ ] Document common use cases

### Medium-Term (Month 1)
- [ ] Implement relevance feedback
- [ ] Add playlist generation
- [ ] Build recommendation engine
- [ ] A/B test different models

### Long-Term (Quarter 1)
- [ ] Scale to 10M+ records if needed
- [ ] Add audio feature extraction
- [ ] Multi-modal search (images, audio)
- [ ] Production deployment

## 🤝 Getting Help

### Resources

**Documentation**:
- Research doc: Full technical details
- Colab notebook: Inline comments and explanations
- sqlite-vec docs: https://alexgarcia.xyz/sqlite-vec/
- sentence-transformers: https://sbert.net/

**Community**:
- sqlite-vec GitHub: https://github.com/asg017/sqlite-vec
- Sentence Transformers: https://github.com/UKPLab/sentence-transformers
- Stack Overflow: Tag with `sqlite`, `embeddings`, `semantic-search`

**Testing & Validation**:
1. Start with simple queries ("radiohead")
2. Progress to semantic ("chill music")
3. Test filters ("90s indie")
4. Try complex hybrid queries
5. Document what works/doesn't

## ✅ Success Checklist

Before considering the project "done":

- [ ] Colab processing completed without errors
- [ ] Database downloaded successfully (6GB)
- [ ] Local environment setup working
- [ ] Test queries return relevant results
- [ ] Query latency < 500ms (p95)
- [ ] Semantic queries work ("chill electronic")
- [ ] Keyword queries work ("radiohead")
- [ ] Filters work (year, label, etc.)
- [ ] Can explain results to others
- [ ] Ready to extend with new features

## 🎯 Expected Results

### Good Queries (Should Work Well)

✅ "chill electronic from the 90s"
✅ "energetic indie rock"
✅ "radiohead paranoid android"
✅ "local seattle bands"
✅ "heavy rotation punk"
✅ "ambient experimental"
✅ "female vocalists indie"

### Challenging Queries (May Need Tuning)

⚠️ "music that sounds like a rainy day"
⚠️ "happy summer vibes"
⚠️ "songs to work out to"
⚠️ "dinner party background music"
⚠️ "makes me want to dance"

These work better with:
- Genre-to-mood mappings
- Audio features (BPM, energy)
- Collaborative filtering
- User feedback

## 🚀 Production Considerations

If you want to deploy this for real users:

### Must Have
- [ ] Error handling and logging
- [ ] Input validation and sanitization
- [ ] Rate limiting
- [ ] Monitoring and metrics
- [ ] Backup strategy

### Should Have
- [ ] Caching layer (Redis)
- [ ] API authentication
- [ ] Usage analytics
- [ ] A/B testing framework
- [ ] Feedback collection

### Nice to Have
- [ ] Auto-scaling
- [ ] CDN for database distribution
- [ ] Multi-region deployment
- [ ] Real-time updates
- [ ] Admin dashboard

## 📝 Final Notes

**This is a research/prototype system**, optimized for:
- Learning semantic search
- Personal music exploration
- Research experiments
- Proof of concept

**Not optimized for**:
- High-traffic production (1000+ QPS)
- Real-time updates (second-by-second)
- Multi-tenancy
- Enterprise SLAs

**But you can**:
- Iterate quickly
- Experiment freely
- Learn deeply
- Build confidence
- Scale later if needed

---

**Questions?** Review the full research document (`semantic_music_search_research.md`) for deep technical details, architecture decisions, and advanced topics.

**Ready to start?** Open `semantic_music_search_colab.ipynb` in Google Colab and begin! 🎵
