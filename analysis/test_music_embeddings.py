#!/usr/bin/env python3
"""
Music Embedding Model Comparison Script
Tests multiple embedding models on a sample of KEXP music data
"""

import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer
from transformers import ClapTextModelWithProjection, ClapProcessor
import time
from pathlib import Path
import torch
from sklearn.metrics.pairwise import cosine_similarity

# Configuration
DB_PATH = Path(__file__).parent.parent / "packages" / "server" / "data" / "music_kb.db"
SAMPLE_SIZE = 1000  # Number of records to test with
BATCH_SIZE = 32


def load_sample_data(db_path: Path, limit: int = 1000):
    """Load sample plays from database with enriched metadata."""
    print(f"Loading {limit} sample records from database...")

    if not db_path.exists():
        print(f"Database not found at {db_path}")
        print("Please update DB_PATH in the script")
        return None

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Try to get enriched data
    query = """
        SELECT
            artist,
            song,
            album,
            SUBSTR(airdate, 1, 4) as year,
            labels,
            rotation_status,
            is_local,
            is_live
        FROM fact_plays
        WHERE artist IS NOT NULL
          AND song IS NOT NULL
        ORDER BY RANDOM()
        LIMIT ?
    """

    cursor.execute(query, (limit,))
    plays = cursor.fetchall()
    conn.close()

    print(f"Loaded {len(plays)} records")
    return plays


def create_enriched_texts(plays):
    """Create enriched text representations of music metadata."""
    texts = []
    for play in plays:
        artist, song, album, year, labels, rotation, is_local, is_live = play

        parts = [f"{artist} - {song}"]

        if album:
            parts.append(f"- {album}")

        if year:
            parts.append(f"| Year: {year}")

        if labels:
            parts.append(f"| Label: {labels}")

        if rotation:
            parts.append(f"| Rotation: {rotation}")

        flags = []
        if is_local:
            flags.append("Local Seattle")
        if is_live:
            flags.append("Live Performance")

        if flags:
            parts.append(f"| {', '.join(flags)}")

        texts.append(" ".join(parts))

    return texts


def load_models():
    """Load all embedding models for comparison."""
    print("\n" + "="*80)
    print("LOADING MODELS")
    print("="*80)

    models = {}

    # Model 1: all-mpnet-base-v2 (good balance)
    print("\n1. Loading all-mpnet-base-v2...")
    try:
        models['mpnet'] = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
        print("   ✓ Loaded (768-dim embeddings)")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    # Model 2: BGE-large (maximum quality)
    print("\n2. Loading BGE-large-en-v1.5...")
    try:
        models['bge'] = SentenceTransformer('BAAI/bge-large-en-v1.5')
        print("   ✓ Loaded (1024-dim embeddings)")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    # Model 3: all-MiniLM-L6-v2 (fast)
    print("\n3. Loading all-MiniLM-L6-v2...")
    try:
        models['minilm'] = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
        print("   ✓ Loaded (384-dim embeddings)")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    # Model 4: CLAP (music-specific)
    print("\n4. Loading CLAP (laion/clap-htsat-fused)...")
    try:
        models['clap_model'] = ClapTextModelWithProjection.from_pretrained("laion/clap-htsat-fused")
        models['clap_processor'] = ClapProcessor.from_pretrained("laion/clap-htsat-fused")
        print("   ✓ Loaded (512-dim embeddings)")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    return models


def encode_with_model(model, texts, model_name, batch_size=32):
    """Encode texts with a specific model and measure time."""
    print(f"\nEncoding with {model_name}...")
    start = time.time()

    if model_name == 'clap':
        # CLAP requires different encoding
        clap_model = model['model']
        clap_processor = model['processor']

        # Process in batches to avoid memory issues
        all_embeds = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            inputs = clap_processor(text=batch, return_tensors="pt", padding=True, truncation=True)
            with torch.no_grad():
                embeds = clap_model(**inputs).text_embeds
            all_embeds.append(embeds)

        embeddings = torch.cat(all_embeds, dim=0).numpy()

    elif model_name == 'bge':
        # BGE requires instruction prefix
        prefixed_texts = ["Represent this music for retrieval: " + t for t in texts]
        embeddings = model.encode(prefixed_texts, batch_size=batch_size, show_progress_bar=False)

    else:
        # Standard sentence transformers
        embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=False)

    elapsed = time.time() - start

    print(f"   ✓ Encoded {len(texts)} texts in {elapsed:.2f}s")
    print(f"   ✓ Shape: {embeddings.shape}")
    print(f"   ✓ Speed: {len(texts)/elapsed:.1f} texts/sec")

    return embeddings, elapsed


def test_query(query, texts, plays, embeddings_dict, models):
    """Test a query against all models and show top results."""
    print("\n" + "="*80)
    print(f"QUERY: '{query}'")
    print("="*80)

    for model_name, embeds in embeddings_dict.items():
        print(f"\n{model_name.upper()} - Top 5 Results:")
        print("-" * 80)

        # Encode query
        if model_name == 'clap':
            clap_model = models['clap_model']
            clap_processor = models['clap_processor']
            inputs = clap_processor(text=[query], return_tensors="pt")
            with torch.no_grad():
                query_embed = clap_model(**inputs).text_embeds.numpy()[0]

        elif model_name == 'bge':
            query_text = "Represent this query: " + query
            query_embed = models['bge'].encode(query_text)

        else:
            model = models[model_name]
            query_embed = model.encode(query)

        # Compute similarities
        sims = cosine_similarity([query_embed], embeds)[0]

        # Get top 5
        top_indices = np.argsort(sims)[-5:][::-1]

        for rank, idx in enumerate(top_indices, 1):
            artist, song, album, year, labels, rotation, is_local, is_live = plays[idx]
            score = sims[idx]
            print(f"{rank}. {artist} - {song}")
            print(f"   Album: {album or 'N/A'} | Year: {year or 'N/A'}")
            print(f"   Similarity: {score:.4f}")
            print()


def main():
    print("="*80)
    print("MUSIC EMBEDDING MODEL COMPARISON")
    print("="*80)

    # Check CUDA
    if torch.cuda.is_available():
        print(f"\n✓ CUDA available: {torch.cuda.get_device_name(0)}")
    else:
        print("\n⚠ CUDA not available, using CPU (will be slower)")

    # Load data
    plays = load_sample_data(DB_PATH, SAMPLE_SIZE)
    if plays is None:
        return

    texts = create_enriched_texts(plays)
    print(f"\nExample enriched text:")
    print(f"  {texts[0]}")

    # Load models
    models = load_models()
    if not models:
        print("\n✗ No models loaded successfully")
        return

    # Encode with all models
    print("\n" + "="*80)
    print("ENCODING SAMPLE DATA")
    print("="*80)

    embeddings_dict = {}
    timings = {}

    if 'mpnet' in models:
        embeddings_dict['mpnet'], timings['mpnet'] = encode_with_model(
            models['mpnet'], texts, 'mpnet', BATCH_SIZE
        )

    if 'bge' in models:
        embeddings_dict['bge'], timings['bge'] = encode_with_model(
            models['bge'], texts, 'bge', BATCH_SIZE
        )

    if 'minilm' in models:
        embeddings_dict['minilm'], timings['minilm'] = encode_with_model(
            models['minilm'], texts, 'minilm', BATCH_SIZE
        )

    if 'clap_model' in models and 'clap_processor' in models:
        clap_dict = {'model': models['clap_model'], 'processor': models['clap_processor']}
        embeddings_dict['clap'], timings['clap'] = encode_with_model(
            clap_dict, texts, 'clap', BATCH_SIZE
        )

    # Performance summary
    print("\n" + "="*80)
    print("PERFORMANCE SUMMARY")
    print("="*80)

    print(f"\n{'Model':<20} {'Time (s)':<12} {'Speed (t/s)':<15} {'Dimensions':<12}")
    print("-" * 80)

    for model_name, elapsed in timings.items():
        speed = SAMPLE_SIZE / elapsed
        dims = embeddings_dict[model_name].shape[1]
        print(f"{model_name:<20} {elapsed:<12.2f} {speed:<15.1f} {dims:<12}")

    # Test queries
    test_queries = [
        "chill electronic from the 90s",
        "energetic indie rock",
        "dark ambient experimental",
        "post-punk revival bands",
        "90s grunge from Seattle",
    ]

    print("\n" + "="*80)
    print("TESTING QUERIES")
    print("="*80)

    for query in test_queries:
        test_query(query, texts, plays, embeddings_dict, models)
        input("\nPress Enter to continue to next query...")

    # Final recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)

    print("""
Based on this test:

1. QUALITY: Compare the relevance of top results for each model
   - Which model returned the most relevant results?
   - Are there clear quality differences?

2. SPEED: Consider processing time for 2.2M records
   - Fastest: all-MiniLM-L6-v2 (~5x faster than MPNet)
   - Balanced: all-mpnet-base-v2 (good quality, reasonable speed)
   - Highest Quality: BGE-large (slower but best results)
   - Music-Specific: CLAP (designed for music, may or may not be better)

3. NEXT STEPS:
   - If BGE or MPNet results are good enough → use as-is
   - If results need improvement → fine-tune on your data
   - If CLAP is significantly better → use CLAP
   - If quality similar → choose fastest (MiniLM)

Run this test multiple times with different queries to get a feel for quality.
""")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
