#!/usr/bin/env python3
"""
Export enriched play data to CSV for Google Colab embedding generation.

This script creates a CSV file with:
- Original play data (id, artist, song, album, etc.)
- Enriched text ready for embedding (with genres + location)

The CSV can be uploaded to Colab for efficient batch embedding generation.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

import pandas as pd
from crate_analysis import Database
from crate_analysis.enrichment import enrich_play_batch


def export_enriched_data(output_file='enriched_plays.csv', sample_size=None):
    """Export enriched play data to CSV.

    Args:
        output_file: Path to output CSV file
        sample_size: Number of plays to export (None = all plays)
    """

    print("="*80)
    print("EXPORTING ENRICHED PLAY DATA FOR COLAB")
    print("="*80)

    # Connect to database
    db = Database()
    print(f"\n✓ Connected to: {db.db_path}")

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

    # Show memory estimate
    # ~500 bytes per enriched text
    estimated_mb = (len(plays_df) * 500) / (1024 * 1024)
    print(f"✓ Estimated CSV size: ~{estimated_mb:.1f} MB")

    # Enrich texts
    print(f"\nEnriching with genres + location...")
    import time
    start_time = time.time()

    enriched_texts = enrich_play_batch(
        plays_df,
        db,
        include_genres=True,
        include_location=True,
        max_genres=8,
        show_progress=True
    )

    elapsed = time.time() - start_time
    print(f"✓ Enrichment completed in {elapsed:.1f}s ({len(plays_df)/elapsed:.1f} plays/sec)")

    # Add enriched text column
    plays_df['enriched_text'] = enriched_texts

    # Show examples
    print(f"\n\nExample enriched records:")
    print("="*80)
    for i in range(min(5, len(plays_df))):
        row = plays_df.iloc[i]
        print(f"\n{i+1}. {row['artist']} - {row['song']}")
        print(f"   Enriched: {row['enriched_text'][:150]}...")

    # Export to CSV
    print(f"\n\nExporting to CSV...")
    output_path = Path(output_file)

    # Select columns to export
    export_columns = [
        'id',
        'artist',
        'artist_ids',
        'song',
        'recording_id',
        'album',
        'release_id',
        'release_group_id',
        'release_date',
        'labels',
        'label_ids',
        'airdate',
        'rotation_status',
        'is_local',
        'is_request',
        'is_live',
        'comment',
        'show',
        'enriched_text'
    ]

    # Filter to only columns that exist
    available_columns = [
        col for col in export_columns if col in plays_df.columns]

    plays_df[available_columns].to_csv(output_path, index=False)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"✓ Exported to: {output_path}")
    print(f"✓ File size: {file_size_mb:.1f} MB")
    print(f"✓ Rows: {len(plays_df):,}")
    print(f"✓ Columns: {len(available_columns)}")

    # Statistics
    print(f"\n\nEnrichment Statistics:")
    print("="*80)

    # Count how many have genres
    has_genres = plays_df['enriched_text'].str.contains(
        'Genres:', na=False).sum()
    has_location = plays_df['enriched_text'].str.contains(
        'From:', na=False).sum()
    has_comment = plays_df['enriched_text'].str.contains(
        'Comment:', na=False).sum()

    print(
        f"Enriched with genres:   {has_genres:,} ({has_genres/len(plays_df)*100:.1f}%)")
    print(
        f"Enriched with location: {has_location:,} ({has_location/len(plays_df)*100:.1f}%)")
    print(
        f"Enriched with comments: {has_comment:,} ({has_comment/len(plays_df)*100:.1f}%)")

    # Text length stats
    text_lengths = plays_df['enriched_text'].str.len()
    print(f"\nEnriched text length:")
    print(f"  Average: {text_lengths.mean():.0f} chars")
    print(f"  Median:  {text_lengths.median():.0f} chars")
    print(f"  Min:     {text_lengths.min():.0f} chars")
    print(f"  Max:     {text_lengths.max():.0f} chars")

    db.close()

    print(f"\n\n{'='*80}")
    print("NEXT STEPS FOR COLAB")
    print("="*80)
    print(f"""
1. Upload {output_path.name} to your Google Colab environment

2. In Colab, install dependencies:
   !pip install sentence-transformers pandas

3. Load and process:
   ```python
   import pandas as pd
   from sentence_transformers import SentenceTransformer

   # Load data
   df = pd.read_csv('{output_path.name}')
   texts = df['enriched_text'].tolist()

   # Load model (use GPU if available)
   model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')

   # Generate embeddings (with progress bar)
   embeddings = model.encode(
       texts,
       batch_size=64,  # Larger batch for GPU
       show_progress_bar=True,
       convert_to_numpy=True
   )

   # Save embeddings
   import numpy as np
   np.save('embeddings.npy', embeddings)

   # Save metadata
   df[['id', 'artist', 'song']].to_csv('metadata.csv', index=False)
   ```

4. Download results:
   - embeddings.npy
   - metadata.csv

5. Use for search in your application!
""")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description='Export enriched play data for Colab')
    parser.add_argument('--output', '-o', default='enriched_plays.csv',
                        help='Output CSV file path')
    parser.add_argument('--sample', '-s', type=int, default=None,
                        help='Sample size (default: export all plays)')
    parser.add_argument('--test', action='store_true',
                        help='Export small test sample (1000 plays)')

    args = parser.parse_args()

    sample_size = args.sample
    if args.test:
        sample_size = 1000
        print("🧪 TEST MODE: Exporting 1000 plays\n")

    try:
        export_enriched_data(args.output, sample_size)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
