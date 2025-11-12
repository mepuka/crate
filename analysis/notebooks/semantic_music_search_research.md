# Semantic Music Search System - Research & Design

## Executive Summary

This document presents a comprehensive research analysis and architectural design for a semantic music search system for KEXP play data, inspired by Wilson Lin's search engine architecture. The system is optimized for Google Colab processing with minimal cost and self-hosted deployment.

**Key Recommendations:**
- **Embedding Model**: `all-MiniLM-L6-v2` (primary) with `all-mpnet-base-v2` for comparison
- **Vector Search**: sqlite-vec for simplicity and portability
- **Architecture**: Hybrid search combining semantic vectors + SQLite FTS5 keyword filtering
- **Processing**: One-time embedding generation in Colab, export to SQLite for local queries
- **Cost**: ~$0-5 for initial processing (Colab free tier), zero ongoing costs

---

## 1. Database Context

### Current Data Assets
Based on analysis of `/Users/pooks/Dev/crate/data/music_kb.sqlite`:

**fact_plays table** (2,193,187 rows)
- Core fields: artist, album, song, airdate, labels, rotation_status
- Metadata: recording_id, release_id, release_group_id, artist_ids, label_ids
- Context: show, image_uri, comment, play_type
- Flags: is_local, is_request, is_live

**mb_master_lookup table** (26,276,365 rows)
- Artist metadata: name, type, gender, country, life span
- Entity types: area, artist, genre, label, recording, release, release_group, work
- Relationships: 50+ relation types (artist-genre, area, instruments, etc.)
- Rich context: disambiguation, entity_metadata

**master_relations table** (32,640,646 rows)
- Triple store: subject → predicate → object
- Typed entities: artist, recording, release, genre, etc.
- Source tracking: MusicBrainz, KEXP
- Linked to plays via kexp_play_id

### Search Query Examples
Users should be able to query:
- **Genre/mood**: "chill electronic from the 90s", "energetic indie rock"
- **Artist similarity**: "artists like Radiohead but more experimental"
- **Temporal**: "popular songs played in summer 2023"
- **Contextual**: "local Seattle bands with heavy rotation"
- **Attributes**: "female vocalists in psychedelic rock"

---

## 2. Embedding Models Research

### Model Comparison: all-MiniLM-L6-v2 vs all-mpnet-base-v2

| Aspect | all-MiniLM-L6-v2 | all-mpnet-base-v2 |
|--------|------------------|-------------------|
| **Architecture** | 6 transformer layers | 12 transformer layers |
| **Dimensions** | 384 | 768 |
| **Parameters** | 22M | 110M |
| **Speed (CPU)** | ~1000s sentences/sec | ~200 sentences/sec |
| **Quality (STS-B)** | 84-85% | 87-88% |
| **Memory** | ~90MB | ~400MB |
| **Best For** | Fast inference, edge devices | Maximum accuracy |

**Recommendation**: Start with **all-MiniLM-L6-v2**
- 5x faster processing → critical for 2M+ play records
- Lower memory → fits easily in Colab free tier
- Adequate quality for music text (3% quality difference unlikely to matter)
- Can always regenerate with mpnet if quality issues arise

### Music-Specific Models

**MusicBERT** (multiple variants):
- Audio-based: Uses audio features + beat-level embeddings
- Symbolic: OctupleMIDI encoding (pitch, duration, velocity, etc.)
- Multi-modal: Unifies text and music in shared latent space

**Limitations for our use case**:
- Requires audio files (we only have metadata)
- Complex setup vs sentence transformers
- Not well-supported in Colab ecosystem
- Designed for audio similarity, not text description matching

**Verdict**: Stick with general sentence transformers. They excel at text semantic understanding, which is what we need for metadata + query matching.

### GPU Processing in Colab

**Performance expectations** (all-MiniLM-L6-v2 on Colab T4 GPU):
- Batch size: 128-256 (optimal for T4 memory)
- Processing speed: ~2000-5000 sentences/sec with GPU
- For 2.2M plays: ~7-20 minutes total embedding time
- Mixed precision (FP16): 1.5-2x speedup possible

**Best practices**:
```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2', device='cuda')
embeddings = model.encode(
    sentences,
    batch_size=256,
    convert_to_tensor=True,
    show_progress_bar=True,
    normalize_embeddings=True  # Critical for cosine similarity
)
```

---

## 3. Vector Search Solutions

### sqlite-vec vs FAISS Comparison

| Aspect | sqlite-vec | FAISS |
|--------|-----------|-------|
| **Installation** | pip install, zero dependencies | pip install, C++ deps |
| **Integration** | Native SQLite extension | Separate index + metadata DB |
| **Portability** | Single .sqlite file | Index file + separate storage |
| **Query Syntax** | Standard SQL | Python API |
| **Filtering** | Native SQL WHERE clauses | Post-retrieval filtering |
| **Updates** | INSERT/UPDATE/DELETE | Rebuild index |
| **Memory** | Disk-based with caching | RAM-based (disk with extra work) |
| **Performance** | Excellent for brute force | Excellent with ANN indexes |

**Performance benchmarks** (sift1m dataset, k=20):
- sqlite-vec: 1ms build, 17ms query
- FAISS: 126ms build, 10ms query

**For 2M music records**:
- sqlite-vec: Single-digit millisecond queries with brute force
- FAISS: Faster queries but complex architecture

**Recommendation**: **sqlite-vec**

Rationale:
1. **Simplicity**: Single SQLite file, no separate infrastructure
2. **Integration**: Already using SQLite, natural fit
3. **Portability**: Share .sqlite file, works anywhere
4. **Hybrid search**: Trivial to combine vector + FTS5 + filters
5. **Updates**: Natural INSERT/UPDATE workflow
6. **Performance**: More than adequate for 2M records

### sqlite-vec Architecture

```sql
-- Virtual table for vector storage
CREATE VIRTUAL TABLE vec_plays USING vec0(
    play_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]  -- all-MiniLM-L6-v2 dimensions
);

-- Query with KNN search
SELECT
    fp.artist, fp.song, fp.album,
    distance
FROM vec_plays vp
JOIN fact_plays fp ON fp.id = vp.play_id
WHERE vp.embedding MATCH ?
    AND k = 20
ORDER BY distance;
```

**Key features**:
- Native SQL syntax
- Automatic distance computation
- Join with fact_plays for metadata
- Can add WHERE clauses for filtering

---

## 4. Architecture Design

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│ PHASE 1: GOOGLE COLAB PROCESSING (One-time)            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐                                       │
│  │ SQLite DB    │                                       │
│  │ music_kb     │                                       │
│  └──────┬───────┘                                       │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────┐                  │
│  │ Text Enrichment Pipeline         │                  │
│  │ - Concatenate: artist + album    │                  │
│  │   + song + metadata              │                  │
│  │ - Add genre from mb_master       │                  │
│  │ - Add labels, year, rotation     │                  │
│  │ - Query expansion for genres     │                  │
│  └──────┬───────────────────────────┘                  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────┐                  │
│  │ Sentence Transformer (GPU)       │                  │
│  │ all-MiniLM-L6-v2                 │                  │
│  │ batch_size=256, normalize=True   │                  │
│  └──────┬───────────────────────────┘                  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────┐                  │
│  │ sqlite-vec Export                │                  │
│  │ - Insert into vec_plays table    │                  │
│  │ - 384-dim float vectors          │                  │
│  └──────┬───────────────────────────┘                  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────┐                  │
│  │ Download Enhanced SQLite         │                  │
│  │ Contains: fact_plays +           │                  │
│  │ vec_plays + FTS5 index           │                  │
│  └──────────────────────────────────┘                  │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ PHASE 2: LOCAL QUERY INTERFACE                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  User Query: "chill electronic from the 90s"           │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────┐                  │
│  │ Query Processing                 │                  │
│  │ - Embed query with same model    │                  │
│  │ - Extract filters (year, genre)  │                  │
│  │ - Generate SQL                   │                  │
│  └──────┬───────────────────────────┘                  │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Hybrid Search                                    │  │
│  │                                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────────┐  │  │
│  │  │ Semantic Search │  │ Keyword + Filters   │  │  │
│  │  │ (sqlite-vec)    │  │ (FTS5 + SQL WHERE)  │  │  │
│  │  └────────┬────────┘  └─────────┬───────────┘  │  │
│  │           │                      │              │  │
│  │           └──────────┬───────────┘              │  │
│  │                      ▼                          │  │
│  │           ┌─────────────────────┐               │  │
│  │           │ Reciprocal Rank     │               │  │
│  │           │ Fusion (RRF)        │               │  │
│  │           └──────────┬──────────┘               │  │
│  └──────────────────────┼──────────────────────────┘  │
│                         ▼                             │
│              ┌─────────────────────┐                  │
│              │ Ranked Results      │                  │
│              │ - Artist, song      │                  │
│              │ - Similarity score  │                  │
│              │ - Metadata          │                  │
│              └─────────────────────┘                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Process-Once Philosophy**
- Embed all data in Colab (leverages free GPU)
- Export single SQLite file with vectors
- No ongoing embedding costs
- Can re-process periodically for new data

**2. Hybrid Search Strategy**
- Semantic vectors: Understand meaning, handle synonyms
- FTS5 keyword: Exact matches, artist/song names
- SQL filters: Year, label, rotation status, flags
- RRF fusion: Combine results intelligently

**3. Single-File Distribution**
- One SQLite database contains everything
- Easy to share, backup, version
- No separate vector database deployment
- Works offline after initial setup

**4. Minimal Dependencies**
- Colab processing: sentence-transformers, sqlite-vec
- Local querying: sqlite3 (built-in), sqlite-vec extension
- Optional: Flask/FastAPI for web interface

---

## 5. Text Enrichment Strategy

### What to Embed?

Research shows metadata concatenation significantly improves embedding quality for search. Our strategy:

**Level 1: Core Text** (always included)
```
{artist} - {song} - {album}
```

**Level 2: Essential Metadata** (high signal)
```
{artist} - {song} - {album}
Genre: {genre_list}
Year: {release_year}
Label: {label_list}
```

**Level 3: Rich Context** (optional, may help)
```
{artist} - {song} - {album}
Genre: {genre_list}
Year: {release_year}
Label: {label_list}
Artist Info: {artist_type}, {artist_country}
Rotation: {rotation_status}
Flags: {local/request/live flags}
```

### Enrichment Pipeline

```python
def enrich_play_text(play_row, mb_lookup):
    """
    Enriches a play record with metadata for embedding.

    Args:
        play_row: Row from fact_plays table
        mb_lookup: Dictionary of MusicBrainz metadata

    Returns:
        Enriched text string optimized for embedding
    """
    parts = []

    # Core identity
    parts.append(f"{play_row['artist']} - {play_row['song']}")
    if play_row['album']:
        parts.append(f"from {play_row['album']}")

    # Genres from MusicBrainz relationships
    genres = get_genres_for_artist(play_row['artist_ids'], mb_lookup)
    if genres:
        parts.append(f"Genre: {', '.join(genres)}")

    # Temporal context
    if play_row['release_date']:
        year = extract_year(play_row['release_date'])
        parts.append(f"Released: {year}")

    # Labels
    if play_row['labels']:
        labels = json.loads(play_row['labels'])
        parts.append(f"Label: {', '.join(labels)}")

    # Artist metadata
    artist_info = get_artist_metadata(play_row['artist_ids'], mb_lookup)
    if artist_info:
        if artist_info.get('country'):
            parts.append(f"From: {artist_info['country']}")
        if artist_info.get('type'):
            parts.append(f"Type: {artist_info['type']}")

    # KEXP context
    if play_row['rotation_status']:
        parts.append(f"Rotation: {play_row['rotation_status']}")

    flags = []
    if play_row['is_local']:
        flags.append("Local")
    if play_row['is_live']:
        flags.append("Live")
    if flags:
        parts.append(f"Tags: {', '.join(flags)}")

    return " | ".join(parts)
```

### Genre Mapping & Query Expansion

**Problem**: Users say "chill electronic", database has "ambient techno"

**Solution**: Genre synonym mapping
```python
GENRE_SYNONYMS = {
    'electronic': ['techno', 'house', 'ambient', 'idm', 'synth', 'electronica'],
    'chill': ['ambient', 'downtempo', 'lounge', 'trip-hop', 'chillout'],
    'rock': ['indie rock', 'alternative rock', 'garage rock', 'post-rock'],
    'heavy': ['metal', 'hard rock', 'hardcore', 'punk'],
    'experimental': ['avant-garde', 'noise', 'industrial', 'art rock'],
    # ... expand based on mb_master_lookup genre analysis
}

MOOD_TO_GENRE = {
    'chill': ['ambient', 'downtempo', 'lounge', 'jazz', 'acoustic'],
    'energetic': ['punk', 'hardcore', 'drum and bass', 'garage rock'],
    'dark': ['post-punk', 'darkwave', 'doom', 'black metal'],
    'uplifting': ['pop', 'indie pop', 'dance', 'funk'],
    # ... build from genre co-occurrence analysis
}
```

**Implementation**:
1. Expand query text with synonyms before embedding
2. Store genre expansions in embeddings during preprocessing
3. Let semantic similarity do the rest

---

## 6. Hybrid Search Implementation

### Why Hybrid?

**Semantic search alone** fails for:
- Exact artist names (especially uncommon spellings)
- Song titles with special characters
- Specific label or catalog queries

**Keyword search alone** fails for:
- Conceptual queries ("music like X")
- Mood/vibe descriptions
- Synonym matching

**Hybrid combines strengths**:
- Semantic: meaning, concepts, similarity
- Keyword: precision, exact matches
- Filters: structured constraints (year, label, etc.)

### Reciprocal Rank Fusion (RRF)

**Algorithm**:
```python
def reciprocal_rank_fusion(semantic_results, keyword_results, k=60):
    """
    Combines results from multiple ranking sources using RRF.

    Args:
        semantic_results: [(play_id, distance), ...]
        keyword_results: [(play_id, rank), ...]
        k: Constant for RRF, typically 60

    Returns:
        Combined ranked results
    """
    scores = {}

    # Score semantic results (lower distance = better)
    for rank, (play_id, distance) in enumerate(semantic_results, 1):
        scores[play_id] = scores.get(play_id, 0) + 1.0 / (k + rank)

    # Score keyword results
    for rank, (play_id, keyword_rank) in enumerate(keyword_results, 1):
        scores[play_id] = scores.get(play_id, 0) + 1.0 / (k + rank)

    # Sort by combined score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked
```

**Properties**:
- Documents appearing in both results get boosted
- Position matters more than absolute score
- k=60 is empirically optimal (research consensus)
- Simple, no parameter tuning needed

### SQL Implementation

```sql
-- Semantic search CTE
WITH semantic_results AS (
  SELECT
    vp.play_id,
    vp.distance,
    ROW_NUMBER() OVER (ORDER BY vp.distance) as semantic_rank
  FROM vec_plays vp
  WHERE vp.embedding MATCH :query_embedding
    AND k = 100
),

-- Keyword search CTE (using FTS5)
keyword_results AS (
  SELECT
    fp.id as play_id,
    fts.rank as keyword_score,
    ROW_NUMBER() OVER (ORDER BY fts.rank) as keyword_rank
  FROM fact_plays fp
  JOIN fact_plays_fts fts ON fp.id = fts.rowid
  WHERE fts MATCH :query_text
  LIMIT 100
),

-- RRF fusion
fused_results AS (
  SELECT
    COALESCE(s.play_id, k.play_id) as play_id,
    (COALESCE(1.0 / (60 + s.semantic_rank), 0) +
     COALESCE(1.0 / (60 + k.keyword_rank), 0)) as rrf_score
  FROM semantic_results s
  FULL OUTER JOIN keyword_results k ON s.play_id = k.play_id
)

-- Final results with metadata
SELECT
  fp.artist,
  fp.song,
  fp.album,
  fp.labels,
  fp.release_date,
  fr.rrf_score
FROM fused_results fr
JOIN fact_plays fp ON fp.id = fr.play_id
WHERE
  -- Apply filters
  (:year_filter IS NULL OR strftime('%Y', fp.release_date) = :year_filter)
  AND (:label_filter IS NULL OR fp.labels LIKE '%' || :label_filter || '%')
  AND (:rotation_filter IS NULL OR fp.rotation_status = :rotation_filter)
ORDER BY fr.rrf_score DESC
LIMIT 20;
```

### FTS5 Setup

```sql
-- Create FTS5 index for keyword search
CREATE VIRTUAL TABLE fact_plays_fts USING fts5(
    artist,
    song,
    album,
    labels,
    content=fact_plays,
    content_rowid=id
);

-- Populate FTS5 index
INSERT INTO fact_plays_fts(rowid, artist, song, album, labels)
SELECT id, artist, song, album, labels
FROM fact_plays;

-- Keep FTS5 in sync with triggers
CREATE TRIGGER fact_plays_fts_insert AFTER INSERT ON fact_plays
BEGIN
    INSERT INTO fact_plays_fts(rowid, artist, song, album, labels)
    VALUES (new.id, new.artist, new.song, new.album, new.labels);
END;

-- Similar triggers for UPDATE and DELETE
```

---

## 7. Query Processing Pipeline

### Query Understanding

```python
def parse_query(query_text):
    """
    Extracts semantic content and structured filters from user query.

    Example:
        "chill electronic from the 90s on Sub Pop"
        → semantic: "chill electronic music"
        → filters: {decade: 1990s, label: "Sub Pop"}
    """
    filters = {}
    semantic_parts = []

    # Extract year/decade
    year_match = re.search(r'\b(19|20)\d{2}s?\b', query_text)
    if year_match:
        filters['year'] = year_match.group(0).rstrip('s')
        query_text = query_text.replace(year_match.group(0), '')

    decade_match = re.search(r'\b\d{2}s\b', query_text)
    if decade_match:
        filters['decade'] = f"19{decade_match.group(0)}"
        query_text = query_text.replace(decade_match.group(0), '')

    # Extract label mentions
    label_match = re.search(r'on ([A-Z][a-zA-Z\s]+)(?:\b|$)', query_text)
    if label_match:
        filters['label'] = label_match.group(1).strip()
        query_text = query_text.replace(label_match.group(0), '')

    # Extract rotation status
    if 'heavy rotation' in query_text.lower():
        filters['rotation'] = 'Heavy'
        query_text = query_text.replace('heavy rotation', '')

    # Extract local flag
    if 'local' in query_text.lower():
        filters['is_local'] = True
        query_text = query_text.replace('local', '')

    # What remains is semantic content
    semantic_text = query_text.strip()

    # Expand with genre synonyms
    semantic_text = expand_query_with_synonyms(semantic_text)

    return {
        'semantic': semantic_text,
        'filters': filters
    }

def expand_query_with_synonyms(query):
    """Expands query with genre/mood synonyms."""
    words = query.lower().split()
    expanded = [query]  # Start with original

    for word in words:
        if word in GENRE_SYNONYMS:
            synonyms = GENRE_SYNONYMS[word]
            expanded.extend(synonyms[:3])  # Add top 3 synonyms
        if word in MOOD_TO_GENRE:
            genres = MOOD_TO_GENRE[word]
            expanded.extend(genres[:3])

    return ' '.join(expanded)
```

### End-to-End Search Function

```python
def search_music(query_text, limit=20):
    """
    Performs hybrid semantic + keyword search on music database.

    Args:
        query_text: Natural language query (e.g., "chill electronic 90s")
        limit: Number of results to return

    Returns:
        List of matching plays with scores
    """
    # 1. Parse query
    parsed = parse_query(query_text)

    # 2. Generate query embedding
    query_embedding = model.encode(
        [parsed['semantic']],
        normalize_embeddings=True
    )[0]

    # 3. Build SQL with filters
    sql = build_hybrid_search_sql(parsed['filters'])

    # 4. Execute hybrid search with RRF
    results = execute_hybrid_search(
        query_embedding=query_embedding,
        query_text=parsed['semantic'],
        filters=parsed['filters'],
        limit=limit
    )

    # 5. Post-process and return
    return format_results(results)
```

---

## 8. Implementation Plan

### Phase 1: Colab Data Processing (One-time, ~1-2 hours)

**Step 1.1: Setup Colab Environment** (~5 min)
```python
!pip install sentence-transformers sqlite-vec torch

# Mount Google Drive for database access
from google.colab import drive
drive.mount('/content/drive')

# Or upload database directly
# from google.colab import files
# uploaded = files.upload()
```

**Step 1.2: Load and Explore Data** (~10 min)
```python
import sqlite3
import pandas as pd

conn = sqlite3.connect('music_kb.sqlite')

# Verify table structures
tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table'", conn)
print(tables)

# Sample fact_plays
sample = pd.read_sql("SELECT * FROM fact_plays LIMIT 5", conn)
print(sample)

# Sample mb_master_lookup for genres
genres = pd.read_sql("""
    SELECT DISTINCT relation_type
    FROM mb_master_lookup
    WHERE relation_type LIKE '%genre%'
    LIMIT 10
""", conn)
print(genres)
```

**Step 1.3: Build Genre Mapping** (~15 min)
```python
# Extract all genres from MusicBrainz data
genre_df = pd.read_sql("""
    SELECT DISTINCT
        artist_mb_id,
        entity_name as genre
    FROM mb_master_lookup
    WHERE relation_type = 'artist-genre'
        AND entity_type = 'genre'
""", conn)

# Build artist → genres mapping
artist_genres = genre_df.groupby('artist_mb_id')['genre'].apply(list).to_dict()

# Analyze genre distribution
genre_counts = genre_df['genre'].value_counts()
print(f"Total genres: {len(genre_counts)}")
print("Top 20 genres:")
print(genre_counts.head(20))
```

**Step 1.4: Text Enrichment Pipeline** (~20 min)
```python
import json
from datetime import datetime

def get_genres_for_play(row, artist_genres):
    """Extract genres for a play based on artist IDs."""
    if not row['artist_ids']:
        return []

    try:
        artist_ids = json.loads(row['artist_ids'])
        genres = []
        for artist_id in artist_ids:
            if artist_id in artist_genres:
                genres.extend(artist_genres[artist_id])
        return list(set(genres))[:5]  # Limit to 5 unique genres
    except:
        return []

def extract_year(date_str):
    """Extract year from release date."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str).year
    except:
        return None

def enrich_play(row, artist_genres):
    """Create enriched text for embedding."""
    parts = []

    # Core: artist - song - album
    core = f"{row['artist']} - {row['song']}"
    if row['album']:
        core += f" - {row['album']}"
    parts.append(core)

    # Genres
    genres = get_genres_for_play(row, artist_genres)
    if genres:
        parts.append(f"Genre: {', '.join(genres)}")

    # Year
    if row['release_date']:
        year = extract_year(row['release_date'])
        if year:
            parts.append(f"Year: {year}")

    # Labels
    if row['labels']:
        try:
            labels = json.loads(row['labels'])
            if labels:
                parts.append(f"Label: {', '.join(labels[:3])}")
        except:
            pass

    # Rotation
    if row['rotation_status']:
        parts.append(f"Rotation: {row['rotation_status']}")

    # Flags
    flags = []
    if row['is_local']:
        flags.append("Local Seattle")
    if row['is_live']:
        flags.append("Live Performance")
    if flags:
        parts.append(' '.join(flags))

    return " | ".join(parts)

# Test enrichment
sample_play = pd.read_sql("SELECT * FROM fact_plays LIMIT 1", conn).iloc[0]
enriched = enrich_play(sample_play, artist_genres)
print("Enriched text example:")
print(enriched)
```

**Step 1.5: Load Sentence Transformer** (~2 min)
```python
from sentence_transformers import SentenceTransformer
import torch

# Check GPU availability
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {device}")

# Load model
model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
print(f"Model loaded: {model.get_sentence_embedding_dimension()} dimensions")

# Test encoding
test_text = "Radiohead - Paranoid Android - OK Computer | Genre: alternative rock"
test_embedding = model.encode([test_text], normalize_embeddings=True)[0]
print(f"Test embedding shape: {test_embedding.shape}")
```

**Step 1.6: Batch Embed All Plays** (~15-30 min for 2.2M records)
```python
from tqdm.auto import tqdm

# Load all plays
print("Loading fact_plays...")
plays_df = pd.read_sql("""
    SELECT
        id, artist, song, album, artist_ids, labels,
        release_date, rotation_status, is_local, is_live
    FROM fact_plays
    ORDER BY id
""", conn)

print(f"Total plays: {len(plays_df)}")

# Enrich all texts
print("Enriching texts...")
enriched_texts = []
for idx, row in tqdm(plays_df.iterrows(), total=len(plays_df)):
    enriched = enrich_play(row, artist_genres)
    enriched_texts.append(enriched)

plays_df['enriched_text'] = enriched_texts

# Save checkpoint
plays_df.to_parquet('enriched_plays.parquet')
print("Checkpoint saved")

# Batch encode with GPU
print("Generating embeddings...")
batch_size = 256
embeddings = model.encode(
    enriched_texts,
    batch_size=batch_size,
    convert_to_tensor=True,
    show_progress_bar=True,
    normalize_embeddings=True,
    device=device
)

# Convert to numpy for storage
import numpy as np
embeddings_np = embeddings.cpu().numpy()
print(f"Embeddings shape: {embeddings_np.shape}")

# Save embeddings
np.save('play_embeddings.npy', embeddings_np)
print("Embeddings saved")
```

**Step 1.7: Install sqlite-vec and Create Vector Tables** (~10 min)
```python
!pip install sqlite-vec

import sqlite3
import sqlite_vec

# Connect with sqlite-vec extension
conn = sqlite3.connect('music_kb.sqlite')
conn.enable_load_extension(True)
sqlite_vec.load(conn)
conn.enable_load_extension(False)

# Create vec_plays table
conn.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_plays USING vec0(
        play_id INTEGER PRIMARY KEY,
        embedding FLOAT[384]
    )
""")

print("Vector table created")

# Insert embeddings in batches
print("Inserting embeddings...")
batch_size = 1000
for i in tqdm(range(0, len(plays_df), batch_size)):
    batch_plays = plays_df.iloc[i:i+batch_size]
    batch_embeddings = embeddings_np[i:i+batch_size]

    data = [
        (int(row['id']), batch_embeddings[idx].tobytes())
        for idx, (_, row) in enumerate(batch_plays.iterrows())
    ]

    conn.executemany(
        "INSERT INTO vec_plays (play_id, embedding) VALUES (?, ?)",
        data
    )
    conn.commit()

print("Embeddings inserted")

# Verify
count = conn.execute("SELECT COUNT(*) FROM vec_plays").fetchone()[0]
print(f"Total vectors in database: {count}")
```

**Step 1.8: Create FTS5 Index** (~5 min)
```python
# Create FTS5 virtual table
conn.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS fact_plays_fts USING fts5(
        artist,
        song,
        album,
        labels,
        content=fact_plays,
        content_rowid=id
    )
""")

# Populate FTS5
conn.execute("""
    INSERT INTO fact_plays_fts(rowid, artist, song, album, labels)
    SELECT id, artist, song, album, labels
    FROM fact_plays
""")
conn.commit()

print("FTS5 index created")

# Test FTS5
test_results = pd.read_sql("""
    SELECT COUNT(*) as count
    FROM fact_plays_fts
    WHERE fact_plays_fts MATCH 'radiohead'
""", conn)
print(f"Test FTS5 search for 'radiohead': {test_results['count'].iloc[0]} results")
```

**Step 1.9: Test Hybrid Search** (~5 min)
```python
# Test semantic search
query = "experimental electronic ambient"
query_embedding = model.encode([query], normalize_embeddings=True)[0]

semantic_results = pd.read_sql("""
    SELECT
        fp.id,
        fp.artist,
        fp.song,
        fp.album,
        vp.distance
    FROM vec_plays vp
    JOIN fact_plays fp ON fp.id = vp.play_id
    WHERE vp.embedding MATCH ?
        AND k = 10
    ORDER BY vp.distance
""", conn, params=(query_embedding.tobytes(),))

print("Semantic search results:")
print(semantic_results)

# Test keyword search
keyword_results = pd.read_sql("""
    SELECT
        fp.id,
        fp.artist,
        fp.song,
        fp.album
    FROM fact_plays fp
    JOIN fact_plays_fts fts ON fp.id = fts.rowid
    WHERE fts MATCH 'radiohead'
    LIMIT 10
""", conn)

print("\nKeyword search results:")
print(keyword_results)
```

**Step 1.10: Download Enhanced Database** (~5 min)
```python
# Close connection
conn.close()

# Verify file size
import os
db_size = os.path.getsize('music_kb.sqlite')
print(f"Database size: {db_size / (1024**3):.2f} GB")

# Download from Colab
from google.colab import files
files.download('music_kb.sqlite')

# Or save to Google Drive
!cp music_kb.sqlite /content/drive/MyDrive/music_kb_with_vectors.sqlite
print("Database saved to Google Drive")
```

### Phase 2: Local Query Interface

**Step 2.1: Setup Local Environment**
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install sentence-transformers sqlite-vec pandas numpy flask
```

**Step 2.2: Create Query Module** (`music_search.py`)
```python
import sqlite3
import sqlite_vec
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
import re
import json

class MusicSearch:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

        # Connect to database
        self.conn = sqlite3.connect(db_path)
        self.conn.enable_load_extension(True)
        sqlite_vec.load(self.conn)
        self.conn.enable_load_extension(False)

    def parse_query(self, query: str) -> Dict:
        """Extract semantic content and filters from query."""
        filters = {}

        # Year/decade
        year_match = re.search(r'\b(19|20)\d{2}s?\b', query)
        if year_match:
            filters['year'] = year_match.group(0).rstrip('s')
            query = query.replace(year_match.group(0), '')

        # Label
        label_match = re.search(r'on ([A-Z][a-zA-Z\s&]+)', query)
        if label_match:
            filters['label'] = label_match.group(1).strip()
            query = query.replace(label_match.group(0), '')

        # Rotation
        if 'heavy rotation' in query.lower():
            filters['rotation'] = 'Heavy'
            query = query.replace('heavy rotation', '').replace('Heavy rotation', '')

        # Local
        if 'local' in query.lower():
            filters['is_local'] = True
            query = query.replace('local', '').replace('Local', '')

        return {
            'semantic': query.strip(),
            'filters': filters
        }

    def semantic_search(self, query: str, limit: int = 100) -> List[Dict]:
        """Perform semantic vector search."""
        # Encode query
        query_embedding = self.model.encode(
            [query],
            normalize_embeddings=True
        )[0]

        # Query vector database
        cursor = self.conn.execute("""
            SELECT
                fp.id,
                fp.artist,
                fp.song,
                fp.album,
                fp.labels,
                fp.release_date,
                fp.rotation_status,
                vp.distance
            FROM vec_plays vp
            JOIN fact_plays fp ON fp.id = vp.play_id
            WHERE vp.embedding MATCH ?
                AND k = ?
            ORDER BY vp.distance
        """, (query_embedding.tobytes(), limit))

        results = []
        for row in cursor:
            results.append({
                'play_id': row[0],
                'artist': row[1],
                'song': row[2],
                'album': row[3],
                'labels': row[4],
                'release_date': row[5],
                'rotation_status': row[6],
                'distance': row[7],
                'source': 'semantic'
            })

        return results

    def keyword_search(self, query: str, limit: int = 100) -> List[Dict]:
        """Perform FTS5 keyword search."""
        cursor = self.conn.execute("""
            SELECT
                fp.id,
                fp.artist,
                fp.song,
                fp.album,
                fp.labels,
                fp.release_date,
                fp.rotation_status,
                fts.rank
            FROM fact_plays fp
            JOIN fact_plays_fts fts ON fp.id = fts.rowid
            WHERE fts MATCH ?
            ORDER BY fts.rank
            LIMIT ?
        """, (query, limit))

        results = []
        for row in cursor:
            results.append({
                'play_id': row[0],
                'artist': row[1],
                'song': row[2],
                'album': row[3],
                'labels': row[4],
                'release_date': row[5],
                'rotation_status': row[6],
                'rank': row[7],
                'source': 'keyword'
            })

        return results

    def reciprocal_rank_fusion(
        self,
        semantic_results: List[Dict],
        keyword_results: List[Dict],
        k: int = 60
    ) -> List[Dict]:
        """Combine results using RRF."""
        scores = {}
        play_data = {}

        # Score semantic results
        for rank, result in enumerate(semantic_results, 1):
            play_id = result['play_id']
            scores[play_id] = scores.get(play_id, 0) + 1.0 / (k + rank)
            play_data[play_id] = result

        # Score keyword results
        for rank, result in enumerate(keyword_results, 1):
            play_id = result['play_id']
            scores[play_id] = scores.get(play_id, 0) + 1.0 / (k + rank)
            if play_id not in play_data:
                play_data[play_id] = result

        # Sort by score
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        # Build final results
        results = []
        for play_id, score in ranked:
            result = play_data[play_id].copy()
            result['rrf_score'] = score
            results.append(result)

        return results

    def apply_filters(self, results: List[Dict], filters: Dict) -> List[Dict]:
        """Apply structured filters to results."""
        filtered = []

        for result in results:
            # Year filter
            if 'year' in filters:
                if result['release_date']:
                    year = result['release_date'][:4]
                    if year != filters['year']:
                        continue
                else:
                    continue

            # Label filter
            if 'label' in filters:
                if result['labels']:
                    try:
                        labels = json.loads(result['labels'])
                        if not any(filters['label'].lower() in l.lower() for l in labels):
                            continue
                    except:
                        continue
                else:
                    continue

            # Rotation filter
            if 'rotation' in filters:
                if result['rotation_status'] != filters['rotation']:
                    continue

            filtered.append(result)

        return filtered

    def search(
        self,
        query: str,
        limit: int = 20,
        use_hybrid: bool = True
    ) -> List[Dict]:
        """
        Perform hybrid search combining semantic and keyword approaches.

        Args:
            query: Natural language search query
            limit: Number of results to return
            use_hybrid: If False, use semantic search only

        Returns:
            Ranked list of matching plays
        """
        # Parse query
        parsed = self.parse_query(query)
        semantic_query = parsed['semantic']
        filters = parsed['filters']

        print(f"Semantic query: {semantic_query}")
        print(f"Filters: {filters}")

        # Get results from both sources
        semantic_results = self.semantic_search(semantic_query, limit=100)

        if use_hybrid:
            keyword_results = self.keyword_search(semantic_query, limit=100)
            # Combine with RRF
            results = self.reciprocal_rank_fusion(semantic_results, keyword_results)
        else:
            results = semantic_results

        # Apply filters
        if filters:
            results = self.apply_filters(results, filters)

        # Return top results
        return results[:limit]

    def close(self):
        """Close database connection."""
        self.conn.close()

# Usage example
if __name__ == '__main__':
    search = MusicSearch('music_kb.sqlite')

    # Test queries
    queries = [
        "chill electronic from the 90s",
        "energetic indie rock",
        "radiohead",
        "local seattle bands heavy rotation",
        "ambient experimental on Sub Pop"
    ]

    for query in queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        print('='*60)

        results = search.search(query, limit=5)

        for i, result in enumerate(results, 1):
            print(f"\n{i}. {result['artist']} - {result['song']}")
            print(f"   Album: {result['album']}")
            print(f"   Score: {result.get('rrf_score', result.get('distance', 'N/A'))}")
            if result['labels']:
                try:
                    labels = json.loads(result['labels'])
                    print(f"   Labels: {', '.join(labels)}")
                except:
                    pass

    search.close()
```

**Step 2.3: Create Web Interface** (Optional)

Create `app.py`:
```python
from flask import Flask, request, render_template, jsonify
from music_search import MusicSearch

app = Flask(__name__)
search = MusicSearch('music_kb.sqlite')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search_endpoint():
    query = request.json.get('query', '')
    limit = request.json.get('limit', 20)

    results = search.search(query, limit=limit)

    return jsonify({
        'query': query,
        'count': len(results),
        'results': results
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

Create `templates/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <title>KEXP Music Search</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 50px auto;
            padding: 20px;
        }
        .search-box {
            width: 100%;
            padding: 15px;
            font-size: 18px;
            border: 2px solid #333;
            border-radius: 5px;
        }
        .result {
            padding: 15px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .result-title {
            font-size: 18px;
            font-weight: bold;
        }
        .result-meta {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }
        .score {
            float: right;
            color: #999;
        }
    </style>
</head>
<body>
    <h1>KEXP Music Search</h1>
    <input type="text" id="query" class="search-box"
           placeholder="Try: 'chill electronic from the 90s' or 'local seattle bands'"
           onkeypress="if(event.key==='Enter') search()">
    <button onclick="search()">Search</button>

    <div id="results"></div>

    <script>
        async function search() {
            const query = document.getElementById('query').value;
            const response = await fetch('/search', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({query: query, limit: 20})
            });

            const data = await response.json();
            displayResults(data.results);
        }

        function displayResults(results) {
            const container = document.getElementById('results');
            container.innerHTML = '';

            results.forEach((result, i) => {
                const div = document.createElement('div');
                div.className = 'result';

                const score = result.rrf_score || result.distance || 'N/A';

                div.innerHTML = `
                    <div class="result-title">
                        ${i+1}. ${result.artist} - ${result.song}
                        <span class="score">${score.toFixed(4)}</span>
                    </div>
                    <div class="result-meta">
                        Album: ${result.album || 'Unknown'}<br>
                        ${result.release_date ? 'Year: ' + result.release_date.substring(0, 4) : ''}
                        ${result.rotation_status ? ' • Rotation: ' + result.rotation_status : ''}
                    </div>
                `;

                container.appendChild(div);
            });
        }
    </script>
</body>
</html>
```

Run the web interface:
```bash
python app.py
# Open browser to http://localhost:5000
```

---

## 9. Cost & Resource Estimates

### One-Time Processing (Colab)

**Free Tier (GPU: Tesla T4)**:
- Embedding generation: 15-30 minutes for 2.2M records
- Total GPU time: < 1 hour
- Within Colab free tier limits
- **Cost: $0**

**Colab Pro ($12/month)** - if needed:
- Better GPU (V100/A100)
- Faster processing: 5-10 minutes
- More reliable for large datasets
- **Cost: $12 one-time** (can cancel after)

### Storage Requirements

**Embeddings**:
- 2.2M records × 384 dimensions × 4 bytes (float32) = ~3.2 GB

**SQLite database**:
- Original: ~1-2 GB (fact_plays + metadata)
- With vectors: ~4-5 GB total
- With FTS5 index: ~5-6 GB total

**Total storage**: ~6 GB

### Querying (Local)

**Model loading**:
- all-MiniLM-L6-v2: ~90 MB RAM
- One-time cost per session

**Query processing**:
- Embedding generation: < 100ms (CPU)
- Vector search: 10-50ms (brute force, 2.2M records)
- Total latency: 100-200ms end-to-end

**Hardware requirements**:
- CPU: Any modern processor (2+ cores)
- RAM: 2GB minimum (8GB recommended)
- Storage: 10GB available space

### Comparison: Cost vs Alternatives

| Approach | Initial Cost | Ongoing Cost | Latency |
|----------|-------------|--------------|---------|
| **Our solution** | $0-12 | $0 | 100-200ms |
| OpenAI embeddings | $0 | $50-200/mo | 200-500ms |
| Pinecone | $0 | $70+/mo | 100-300ms |
| Weaviate (cloud) | $0 | $25+/mo | 100-300ms |
| ElasticSearch + ML | $0 | $50+/mo | 200-500ms |

**Key advantages**:
- No API costs
- No recurring charges
- Offline operation
- Complete data control
- Portable (single file)

---

## 10. Alternative Approaches & Trade-offs

### Alternative 1: FAISS Instead of sqlite-vec

**Pros**:
- Slightly faster queries (5-10ms vs 20ms)
- Better ANN index options (IVF, HNSW)
- Mature, battle-tested

**Cons**:
- Separate index from database
- Harder to keep in sync
- More complex deployment
- Filtering requires post-processing

**Verdict**: Use sqlite-vec unless hitting performance walls. FAISS makes sense for 10M+ records or < 10ms latency requirements.

### Alternative 2: all-mpnet-base-v2 Instead of all-MiniLM-L6-v2

**Pros**:
- 3% better quality (87% vs 84% on STS-B)
- 768-dimensional embeddings (more capacity)

**Cons**:
- 5x slower processing
- 5x larger embeddings (12 GB vs 3.2 GB)
- 5x slower queries
- Requires more VRAM

**Verdict**: Start with MiniLM. Test with sample queries. If quality issues arise, regenerate with mpnet. The 3% quality difference rarely matters for typical music search.

### Alternative 3: Pure Keyword Search (FTS5 Only)

**Pros**:
- Ultra-fast (< 5ms queries)
- No embeddings needed
- Tiny storage footprint

**Cons**:
- No semantic understanding
- Can't handle "chill electronic" queries
- Exact matches only
- Poor recall for conceptual searches

**Verdict**: Not suitable as primary approach, but essential component of hybrid search.

### Alternative 4: LLM-Based Search (GPT-4, Claude)

**Pros**:
- Excellent query understanding
- Can explain results
- Handles complex, conversational queries

**Cons**:
- Expensive ($0.01-0.10 per query)
- Slow (1-3 seconds)
- Requires API keys
- Not offline-capable

**Verdict**: Consider for reranking top results or query expansion, but not as primary search method.

### Alternative 5: Audio Embeddings (MusicBERT, Audio2Vec)

**Pros**:
- True musical similarity
- Genre/mood from actual audio
- Better for "sounds like" queries

**Cons**:
- Requires audio files (we don't have them)
- Huge storage (GB per song)
- Complex processing pipeline
- Overkill for metadata search

**Verdict**: Not applicable to current use case. Would be excellent if audio files were available.

### Alternative 6: Cloud-Based Vector Databases

**Options**: Pinecone, Weaviate, Qdrant Cloud, Milvus

**Pros**:
- Managed service
- No local setup
- Scalable infrastructure

**Cons**:
- Monthly costs ($25-200)
- Vendor lock-in
- Network latency
- Data privacy concerns

**Verdict**: Not recommended for personal/research projects. Good for production services with > 10M records or high QPS requirements.

---

## 11. Future Enhancements

### Short-Term (< 1 month)

**1. Query Expansion Dictionary**
- Build genre synonym dictionary from mb_master_lookup
- Extract mood-to-genre mappings from co-occurrence
- Add to query preprocessing

**2. Result Caching**
- Cache popular queries
- Store in SQLite table: query_hash → results
- Instant repeat queries

**3. Relevance Feedback**
- Track click data
- Boost frequently selected results
- Personalized ranking

### Medium-Term (1-3 months)

**4. Incremental Updates**
- New plays automatically embedded
- Batch embedding for weekly updates
- Maintain vector index freshness

**5. Multi-Field Search**
- Separate embeddings for artist, album, song
- Query different fields with different weights
- Better artist similarity

**6. Temporal Ranking**
- Boost recent plays
- Decay older results
- Trend detection

### Long-Term (3-6 months)

**7. Collaborative Filtering**
- User play history
- "Users who liked X also liked Y"
- Complement semantic search

**8. Audio Features** (if available)
- Extract BPM, key, energy from audio
- Mood classification
- Acoustic similarity

**9. Playlist Generation**
- Seed with query or song
- Generate coherent playlists
- Smooth transitions

### Advanced Features

**10. Multi-Modal Search**
- Image → music (album art similarity)
- Lyrics → songs
- Audio snippet → full song

**11. Explainability**
- Why was this result returned?
- Show matching genres/attributes
- Confidence scores

**12. A/B Testing Framework**
- Compare semantic models
- Test RRF parameters
- Optimize ranking

---

## 12. Known Limitations & Mitigations

### Limitation 1: Cold Start Problem

**Issue**: New songs with no plays have no historical data

**Mitigations**:
- Rely on metadata embeddings (genre, label, artist)
- Bootstrap from similar artists
- Gradually accumulate play data

### Limitation 2: Genre Ambiguity

**Issue**: Artists span multiple genres, unclear labeling

**Mitigations**:
- Use all genres in embeddings (don't pick one)
- Weight by co-occurrence frequency
- Let semantic model learn fuzzy boundaries

### Limitation 3: Spelling Variations

**Issue**: "Björk" vs "Bjork", "múm" vs "mum"

**Mitigations**:
- FTS5 handles some variations
- Normalization in enrichment pipeline
- Unicode folding in queries

### Limitation 4: Embedding Drift

**Issue**: Query model (local) differs from indexed model (Colab)

**Mitigations**:
- Use exact same model version
- Pin sentence-transformers version
- Include model version in database metadata

### Limitation 5: Scale Limits

**Issue**: sqlite-vec brute force becomes slow at 10M+ records

**Mitigations**:
- Current dataset: 2.2M, well within limits
- If growth needed: switch to FAISS with ANN
- Partition by time/genre for faster queries

### Limitation 6: No Audio Understanding

**Issue**: Can't search by actual sound, only metadata

**Mitigations**:
- Metadata is rich enough for most queries
- Genre/mood serve as audio proxy
- If audio needed: future enhancement

---

## 13. Validation & Testing Strategy

### Baseline Metrics

**Establish before building**:
1. Sample 50 queries covering:
   - Genre queries: "indie rock", "electronic"
   - Mood queries: "chill", "energetic"
   - Artist queries: "Radiohead", "local Seattle bands"
   - Hybrid: "90s electronic on Warp"
   - Similarity: "artists like Aphex Twin"

2. Manual relevance judgments:
   - Top 10 results per query
   - Binary relevant/not relevant
   - Inter-rater agreement (if multiple annotators)

3. Calculate metrics:
   - Precision@10
   - Recall@10 (requires complete relevance set)
   - MRR (Mean Reciprocal Rank)
   - NDCG@10 (graded relevance)

### A/B Testing

**Compare approaches**:
- Semantic only vs Keyword only vs Hybrid
- all-MiniLM-L6-v2 vs all-mpnet-base-v2
- Different enrichment strategies
- RRF vs other fusion methods

### Performance Testing

**Measure**:
- Query latency (p50, p95, p99)
- Index size
- Memory usage
- Cold start vs warm queries

**Target SLAs**:
- p95 latency < 200ms
- p99 latency < 500ms
- Memory < 4GB

### User Testing

**Qualitative feedback**:
- Are results relevant?
- Are they surprising/interesting?
- What queries fail?
- Feature requests

---

## 14. Conclusion & Recommendations

### Summary

We've designed a semantic music search system optimized for:
- **Minimal cost**: $0-12 one-time, $0 ongoing
- **Google Colab processing**: Leverages free GPU tier
- **Self-hosted deployment**: Single SQLite file
- **Good performance**: 100-200ms queries
- **Rich queries**: Semantic + keyword + filters

### Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Embedding Model** | all-MiniLM-L6-v2 | Fast, small, adequate quality |
| **Vector Search** | sqlite-vec | Simple, integrated, portable |
| **Keyword Search** | SQLite FTS5 | Built-in, fast, SQL-native |
| **Fusion** | Reciprocal Rank Fusion | Simple, no tuning needed |
| **Processing** | Google Colab (free) | Free GPU, Jupyter notebooks |
| **Interface** | Flask + HTML | Lightweight, easy to extend |

### Implementation Timeline

- **Week 1**: Colab processing (Phase 1)
  - Days 1-2: Setup, data exploration, genre mapping
  - Days 3-4: Text enrichment, embedding generation
  - Days 5-7: sqlite-vec setup, testing, export

- **Week 2**: Local interface (Phase 2)
  - Days 1-3: Query module implementation
  - Days 4-5: Web interface
  - Days 6-7: Testing, refinement

**Total: 2 weeks to working prototype**

### Success Criteria

**Must have**:
- ✓ Search 2.2M plays in < 500ms
- ✓ Handle semantic queries ("chill electronic")
- ✓ Handle keyword queries ("Radiohead")
- ✓ Filter by year, label, rotation
- ✓ Zero ongoing costs

**Nice to have**:
- ✓ < 200ms p95 latency
- ✓ Query expansion
- ✓ Result explanations
- ✓ Playlist generation

### Next Steps

1. **Setup Colab notebook** following Phase 1 steps
2. **Process KEXP database** (15-30 min GPU time)
3. **Download enhanced SQLite** with vectors + FTS5
4. **Implement query interface** following Phase 2
5. **Test with sample queries** and iterate
6. **Deploy web interface** (optional)
7. **Gather feedback** and refine

### Resources & References

**Code repositories**:
- sqlite-vec: https://github.com/asg017/sqlite-vec
- sentence-transformers: https://github.com/UKPLab/sentence-transformers

**Documentation**:
- sqlite-vec docs: https://alexgarcia.xyz/sqlite-vec/
- sentence-transformers docs: https://sbert.net/
- SQLite FTS5: https://www.sqlite.org/fts5.html

**Research papers**:
- SBERT: https://arxiv.org/abs/1908.10084
- RRF: "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
- MusicBERT: https://arxiv.org/abs/2106.05630

**Tutorials**:
- Semantic search with FAISS: https://huggingface.co/course/chapter5/6
- Hybrid search guide: https://www.pinecone.io/learn/hybrid-search/

---

## Appendix A: Sample Colab Notebook Structure

```
KEXP_Semantic_Search_Processing.ipynb
│
├── Cell 1: Setup & Installation
│   └── !pip install sentence-transformers sqlite-vec torch
│
├── Cell 2: Mount Drive / Upload DB
│   └── from google.colab import drive; drive.mount('/content/drive')
│
├── Cell 3: Data Exploration
│   └── Load tables, inspect schema, sample data
│
├── Cell 4: Genre Mapping
│   └── Extract genres from mb_master_lookup
│
├── Cell 5: Text Enrichment
│   └── Define enrich_play() function
│
├── Cell 6: Load Sentence Transformer
│   └── model = SentenceTransformer('all-MiniLM-L6-v2', device='cuda')
│
├── Cell 7: Batch Embedding
│   └── Embed all 2.2M plays with progress bar
│
├── Cell 8: Create sqlite-vec Tables
│   └── CREATE VIRTUAL TABLE vec_plays...
│
├── Cell 9: Insert Embeddings
│   └── Batch insert into vec_plays
│
├── Cell 10: Create FTS5 Index
│   └── CREATE VIRTUAL TABLE fact_plays_fts...
│
├── Cell 11: Test Searches
│   └── Run sample queries, verify results
│
└── Cell 12: Download Database
    └── files.download('music_kb.sqlite')
```

---

## Appendix B: Database Schema Extensions

```sql
-- Vector table (created by sqlite-vec)
CREATE VIRTUAL TABLE vec_plays USING vec0(
    play_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]
);

-- FTS5 index
CREATE VIRTUAL TABLE fact_plays_fts USING fts5(
    artist,
    song,
    album,
    labels,
    content=fact_plays,
    content_rowid=id
);

-- Query cache (optional enhancement)
CREATE TABLE query_cache (
    query_hash TEXT PRIMARY KEY,
    query_text TEXT,
    results_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hit_count INTEGER DEFAULT 1
);
CREATE INDEX idx_query_cache_created ON query_cache(created_at);

-- Enriched text storage (for debugging)
CREATE TABLE enriched_texts (
    play_id INTEGER PRIMARY KEY,
    enriched_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (play_id) REFERENCES fact_plays(id)
);

-- Model metadata (track which model was used)
CREATE TABLE embedding_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT,
    model_version TEXT,
    dimensions INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    record_count INTEGER,
    notes TEXT
);
```

---

## Appendix C: Query Examples & Expected Results

```python
# Query 1: Genre + Temporal
query = "chill electronic from the 90s"
# Expected: Ambient, IDM, early electronica from 1990-1999
# Artists: Aphex Twin, Boards of Canada, Autechre, etc.

# Query 2: Mood + Genre
query = "energetic indie rock"
# Expected: High-energy rock bands, upbeat tempo
# Artists: Japandroids, Titus Andronicus, Cloud Nothings, etc.

# Query 3: Artist Name (keyword)
query = "radiohead"
# Expected: Exact matches for Radiohead
# Should return all Radiohead plays, ranked by relevance

# Query 4: Contextual + Filter
query = "local seattle bands heavy rotation"
# Expected: is_local=True, rotation_status='Heavy'
# Artists: Sleater-Kinney, Mudhoney, Death Cab, etc.

# Query 5: Label + Genre
query = "experimental on Sub Pop"
# Expected: label='Sub Pop', experimental genres
# Artists: Shabazz Palaces, Dum Dum Girls, etc.

# Query 6: Artist Similarity
query = "artists like Aphex Twin but more ambient"
# Expected: Similar to Aphex Twin's style, ambient focus
# Artists: Boards of Canada, Autechre, Plaid, etc.

# Query 7: Era + Sound
query = "90s trip-hop"
# Expected: 1990s, trip-hop genre
# Artists: Massive Attack, Portishead, Tricky, etc.

# Query 8: Instrumentation (if in metadata)
query = "female vocalists psychedelic rock"
# Expected: Psychedelic rock with female singers
# Artists: Ty Segall's projects with female vocalists, etc.
```

---

**End of Research Report**

*This document represents comprehensive research and practical architecture for a semantic music search system. The design balances simplicity, cost-effectiveness, and performance, making it ideal for personal projects, research, and small-scale production deployments.*

*For questions or implementation assistance, refer to the resources in Section 14 or consult the linked documentation.*
