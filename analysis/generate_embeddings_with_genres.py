#!/usr/bin/env python3
"""
Generate embeddings with genre-enhanced text enrichment.
Compares baseline vs genre-enhanced embeddings for search quality.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

import numpy as np
from sentence_transformers import SentenceTransformer
import time
import pickle
from sklearn.metrics.pairwise import cosine_similarity

from crate_analysis import Database
from crate_analysis.enrichment import enrich_play_batch


def generate_embeddings(db_path, model_name='sentence-transformers/all-mpnet-base-v2',
                       sample_size=None, include_genres=True):
    """Generate embeddings with optional genre enrichment."""

    print("="*80)
    print(f"GENERATING EMBEDDINGS")
    print(f"Model: {model_name}")
    print(f"Include genres: {include_genres}")
    print("="*80)

    # Load model
    print(f"\nLoading model: {model_name}")
    model = SentenceTransformer(model_name)
    print(f"✓ Model loaded (embedding dim: {model.get_sentence_embedding_dimension()})")

    # Connect to database
    db = Database()
    print(f"✓ Connected to: {db.db_path}")

    # Load plays
    print(f"\nLoading plays from database...")
    if sample_size:
        plays_df = db.query(f"""
            SELECT *
            FROM fact_plays
            WHERE artist IS NOT NULL AND song IS NOT NULL
            ORDER BY RANDOM()
            LIMIT {sample_size}
        """)
    else:
        plays_df = db.query("""
            SELECT *
            FROM fact_plays
            WHERE artist IS NOT NULL AND song IS NOT NULL
        """)

    print(f"✓ Loaded {len(plays_df):,} plays")

    # Enrich texts
    print(f"\nEnriching texts (genres={include_genres})...")
    start = time.time()

    enriched_texts = enrich_play_batch(
        plays_df,
        db,
        include_genres=include_genres,
        max_genres=8,
        show_progress=True
    )

    elapsed = time.time() - start
    print(f"✓ Enriched {len(enriched_texts):,} texts in {elapsed:.1f}s")

    # Show examples
    print("\nExample enriched texts:")
    for i in range(min(3, len(enriched_texts))):
        print(f"\n{i+1}. {enriched_texts[i][:200]}...")

    # Generate embeddings
    print(f"\n\nGenerating embeddings...")
    start = time.time()

    embeddings = model.encode(
        enriched_texts,
        batch_size=32,
        show_progress_bar=True,
        convert_to_numpy=True
    )

    elapsed = time.time() - start
    print(f"\n✓ Generated embeddings in {elapsed:.1f}s ({len(embeddings)/elapsed:.1f} texts/sec)")
    print(f"✓ Embeddings shape: {embeddings.shape}")

    db.close()

    return {
        'embeddings': embeddings,
        'texts': enriched_texts,
        'plays': plays_df,
        'model_name': model_name,
        'include_genres': include_genres
    }


def search(query, data, model, top_k=10):
    """Search for query in embeddings."""
    # Encode query
    query_embedding = model.encode([query], convert_to_numpy=True)[0]

    # Compute similarities
    similarities = cosine_similarity([query_embedding], data['embeddings'])[0]

    # Get top results
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    results = []
    for idx in top_indices:
        play = data['plays'].iloc[idx]
        results.append({
            'artist': play['artist'],
            'song': play['song'],
            'album': play.get('album'),
            'text': data['texts'][idx],
            'score': similarities[idx]
        })

    return results


def compare_search_results(query, baseline_data, enhanced_data, model):
    """Compare search results between baseline and enhanced embeddings."""
    print("\n" + "="*80)
    print(f"QUERY: '{query}'")
    print("="*80)

    # Search both
    baseline_results = search(query, baseline_data, model, top_k=10)
    enhanced_results = search(query, enhanced_data, model, top_k=10)

    # Show baseline
    print("\n📝 BASELINE (no genres) - Top 10:")
    print("-"*80)
    for i, result in enumerate(baseline_results, 1):
        print(f"{i:2d}. {result['artist']} - {result['song']}")
        if result['album']:
            print(f"    Album: {result['album']}")
        print(f"    Score: {result['score']:.4f}")
        print()

    # Show enhanced
    print("\n✨ ENHANCED (with genres) - Top 10:")
    print("-"*80)
    for i, result in enumerate(enhanced_results, 1):
        print(f"{i:2d}. {result['artist']} - {result['song']}")
        if result['album']:
            print(f"    Album: {result['album']}")
        print(f"    Score: {result['score']:.4f}")
        # Show if it has genres in the text
        if 'Genres:' in result['text']:
            genres_start = result['text'].find('Genres:')
            genres_end = result['text'].find('|', genres_start)
            if genres_end == -1:
                genres_text = result['text'][genres_start:]
            else:
                genres_text = result['text'][genres_start:genres_end].strip()
            print(f"    {genres_text}")
        print()

    # Compare overlap
    baseline_tracks = set((r['artist'], r['song']) for r in baseline_results)
    enhanced_tracks = set((r['artist'], r['song']) for r in enhanced_results)

    overlap = len(baseline_tracks & enhanced_tracks)
    only_baseline = baseline_tracks - enhanced_tracks
    only_enhanced = enhanced_tracks - baseline_tracks

    print(f"\n📊 Comparison:")
    print(f"   Overlap: {overlap}/10 results are the same")
    print(f"   Only in baseline: {len(only_baseline)}")
    print(f"   Only in enhanced: {len(only_enhanced)}")

    if only_enhanced:
        print(f"\n   ✨ New results with genres:")
        for artist, song in only_enhanced:
            print(f"      • {artist} - {song}")


def main():
    print("="*80)
    print("GENRE-ENHANCED EMBEDDINGS GENERATION & COMPARISON")
    print("="*80)

    # Configuration
    MODEL_NAME = 'sentence-transformers/all-mpnet-base-v2'
    SAMPLE_SIZE = 5000  # Use 5k for quick testing, None for full dataset

    print(f"\nConfiguration:")
    print(f"  Model: {MODEL_NAME}")
    print(f"  Sample size: {SAMPLE_SIZE if SAMPLE_SIZE else 'Full dataset'}")

    # Generate baseline embeddings (no genres)
    print("\n\n" + "="*80)
    print("STEP 1: Generate BASELINE embeddings (no genres)")
    print("="*80)

    baseline_data = generate_embeddings(
        db_path=None,  # Uses default from Database class
        model_name=MODEL_NAME,
        sample_size=SAMPLE_SIZE,
        include_genres=False
    )

    # Generate enhanced embeddings (with genres)
    print("\n\n" + "="*80)
    print("STEP 2: Generate ENHANCED embeddings (with genres)")
    print("="*80)

    # Need to use same plays for fair comparison
    # So we'll regenerate with same random seed or save/reload plays
    enhanced_data = generate_embeddings(
        db_path=None,
        model_name=MODEL_NAME,
        sample_size=SAMPLE_SIZE,
        include_genres=True
    )

    # Save embeddings
    print("\n\nSaving embeddings...")
    output_dir = Path(__file__).parent / "embeddings_output"
    output_dir.mkdir(exist_ok=True)

    baseline_path = output_dir / "baseline_embeddings.pkl"
    enhanced_path = output_dir / "enhanced_embeddings.pkl"

    with open(baseline_path, 'wb') as f:
        pickle.dump(baseline_data, f)
    print(f"✓ Saved baseline to {baseline_path}")

    with open(enhanced_path, 'wb') as f:
        pickle.dump(enhanced_data, f)
    print(f"✓ Saved enhanced to {enhanced_path}")

    # Load model for search
    print("\n\nLoading model for search...")
    model = SentenceTransformer(MODEL_NAME)

    # Test queries
    test_queries = [
        "psychedelic folk rock",
        "experimental electronic ambient",
        "90s grunge from Seattle",
        "jazz fusion instrumental",
        "indie rock from the 2000s",
        "dark atmospheric post-punk",
        "upbeat dance pop",
        "heavy metal",
        "chill hip hop beats",
        "dream pop shoegaze"
    ]

    print("\n\n" + "="*80)
    print("COMPARING SEARCH RESULTS")
    print("="*80)

    for query in test_queries:
        compare_search_results(query, baseline_data, enhanced_data, model)

        if query != test_queries[-1]:
            response = input("\nPress Enter for next query (or 'q' to quit): ")
            if response.lower() == 'q':
                break

    # Summary
    print("\n\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    print(f"""
✅ Generated embeddings for {len(baseline_data['embeddings']):,} plays

📊 Coverage:
   - Total plays processed: {len(baseline_data['plays']):,}
   - Embedding dimensions: {baseline_data['embeddings'].shape[1]}
   - Model: {MODEL_NAME}

💾 Saved to:
   - {baseline_path}
   - {enhanced_path}

🎯 Next steps:
   1. Review search quality differences above
   2. If genre enrichment helps → use enhanced embeddings
   3. Generate full dataset embeddings (set SAMPLE_SIZE=None)
   4. Build search API/interface
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
