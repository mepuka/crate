#!/usr/bin/env python3
"""
Generate synthetic training data for fine-tuning sentence transformers.

Creates query-play pairs by:
1. Genre-based queries → plays with those genres
2. Artist-based queries → similar artists
3. Vibe/mood queries → plays with matching comments
4. Location-based queries → artists from that location
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

import pandas as pd
from crate_analysis import Database
import random
import json


def generate_genre_pairs(db, n_samples=5000):
    """Generate (query, positive_text) pairs based on genres."""
    pairs = []

    # Get artists with genres
    artists_genres = db.query("""
        SELECT DISTINCT
            subject_name as artist,
            GROUP_CONCAT(object_name, ', ') as genres
        FROM master_relations
        WHERE predicate = 'artist-genre'
        GROUP BY subject_name
        HAVING COUNT(*) >= 2
        LIMIT ?
    """, (n_samples,))

    for _, row in artists_genres.iterrows():
        artist = row['artist']
        genres = row['genres'].split(', ')

        # Get a play from this artist
        play = db.query("""
            SELECT artist, song, album
            FROM fact_plays
            WHERE artist = ?
            LIMIT 1
        """, (artist,)).iloc[0]

        # Create query variations
        if len(genres) >= 2:
            # Multi-genre query
            selected = random.sample(genres, min(2, len(genres)))
            query = f"{selected[0]} {selected[1]} music"
        else:
            query = f"{genres[0]} artists"

        positive = f"{play['artist']} - {play['song']}"
        if pd.notna(play['album']):
            positive += f" - {play['album']}"

        pairs.append({
            'query': query,
            'positive': positive,
            'type': 'genre'
        })

    return pairs


def generate_location_pairs(db, n_samples=2000):
    """Generate pairs based on artist location."""
    pairs = []

    # Get artists with locations
    artists_locations = db.query("""
        SELECT DISTINCT
            subject_name as artist,
            object_name as location
        FROM master_relations
        WHERE predicate IN ('area', 'begin-area')
        LIMIT ?
    """, (n_samples,))

    for _, row in artists_locations.iterrows():
        artist = row['artist']
        location = row['location']

        play = db.query("""
            SELECT artist, song, album
            FROM fact_plays
            WHERE artist = ?
            LIMIT 1
        """, (artist,)).iloc[0]

        # Query variations
        queries = [
            f"music from {location}",
            f"{location} artists",
            f"bands from {location}"
        ]

        positive = f"{play['artist']} - {play['song']}"
        if pd.notna(play['album']):
            positive += f" - {play['album']}"

        pairs.append({
            'query': random.choice(queries),
            'positive': positive,
            'type': 'location'
        })

    return pairs


def generate_comment_pairs(db, n_samples=3000):
    """Generate pairs from DJ comments (valuable semantic info!)."""
    pairs = []

    # Get plays with meaningful comments
    plays_with_comments = db.query("""
        SELECT artist, song, album, comment
        FROM fact_plays
        WHERE comment IS NOT NULL
        AND LENGTH(comment) > 50
        ORDER BY RANDOM()
        LIMIT ?
    """, (n_samples,))

    for _, row in plays_with_comments.iterrows():
        comment = row['comment']

        # Extract key phrases from comment (simple heuristic)
        # In production, you'd use better NLP
        comment_lower = comment.lower()

        # Create query from comment keywords
        keywords = []
        if 'funky' in comment_lower or 'groove' in comment_lower:
            keywords.append('groovy')
        if 'upbeat' in comment_lower or 'energetic' in comment_lower:
            keywords.append('upbeat')
        if 'mellow' in comment_lower or 'chill' in comment_lower:
            keywords.append('chill')
        if 'heavy' in comment_lower or 'intense' in comment_lower:
            keywords.append('intense')

        if keywords:
            query = f"{' '.join(keywords)} music"
        else:
            # Use first sentence of comment as query
            first_sentence = comment.split('.')[0].strip()
            query = first_sentence

        positive = f"{row['artist']} - {row['song']}"
        if pd.notna(row['album']):
            positive += f" - {row['album']}"

        pairs.append({
            'query': query,
            'positive': positive,
            'type': 'comment',
            'original_comment': comment
        })

    return pairs


def generate_similar_artist_pairs(db, n_samples=2000):
    """Generate pairs for artists in same genres (implicit similarity)."""
    pairs = []

    # Get genres with multiple artists
    genre_artists = db.query("""
        SELECT
            object_name as genre,
            GROUP_CONCAT(DISTINCT subject_name) as artists
        FROM master_relations
        WHERE predicate = 'artist-genre'
        GROUP BY object_name
        HAVING COUNT(DISTINCT subject_name) >= 5
        LIMIT 100
    """)

    for _, row in genre_artists.iterrows():
        genre = row['genre']
        artists = row['artists'].split(',')

        if len(artists) < 2:
            continue

        # Sample two artists from same genre
        anchor_artist, similar_artist = random.sample(artists, 2)

        # Get plays
        anchor_play = db.query("""
            SELECT artist, song, album
            FROM fact_plays
            WHERE artist = ?
            LIMIT 1
        """, (anchor_artist,))

        if anchor_play.empty:
            continue

        similar_play = db.query("""
            SELECT artist, song, album
            FROM fact_plays
            WHERE artist = ?
            LIMIT 1
        """, (similar_artist,))

        if similar_play.empty:
            continue

        anchor = anchor_play.iloc[0]
        similar = similar_play.iloc[0]

        # Query: artist name → positive: similar artist's song
        query = f"artists like {anchor['artist']}"
        positive = f"{similar['artist']} - {similar['song']}"
        if pd.notna(similar['album']):
            positive += f" - {similar['album']}"

        pairs.append({
            'query': query,
            'positive': positive,
            'type': 'similar_artist'
        })

        if len(pairs) >= n_samples:
            break

    return pairs


def main():
    print("="*80)
    print("GENERATING FINE-TUNING DATA")
    print("="*80)

    db = Database()

    all_pairs = []

    print("\n1. Generating genre-based pairs...")
    genre_pairs = generate_genre_pairs(db, n_samples=5000)
    all_pairs.extend(genre_pairs)
    print(f"   ✓ Generated {len(genre_pairs):,} genre pairs")

    print("\n2. Generating location-based pairs...")
    location_pairs = generate_location_pairs(db, n_samples=2000)
    all_pairs.extend(location_pairs)
    print(f"   ✓ Generated {len(location_pairs):,} location pairs")

    print("\n3. Generating comment-based pairs...")
    comment_pairs = generate_comment_pairs(db, n_samples=3000)
    all_pairs.extend(comment_pairs)
    print(f"   ✓ Generated {len(comment_pairs):,} comment pairs")

    print("\n4. Generating similar artist pairs...")
    similar_pairs = generate_similar_artist_pairs(db, n_samples=2000)
    all_pairs.extend(similar_pairs)
    print(f"   ✓ Generated {len(similar_pairs):,} similar artist pairs")

    # Shuffle
    random.shuffle(all_pairs)

    # Convert to DataFrame
    df = pd.DataFrame(all_pairs)

    # Split train/val
    train_size = int(0.9 * len(df))
    train_df = df[:train_size]
    val_df = df[train_size:]

    # Save
    train_df.to_json('finetuning_train.jsonl', orient='records', lines=True)
    val_df.to_json('finetuning_val.jsonl', orient='records', lines=True)

    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total pairs: {len(all_pairs):,}")
    print(f"  - Genre pairs: {len(genre_pairs):,}")
    print(f"  - Location pairs: {len(location_pairs):,}")
    print(f"  - Comment pairs: {len(comment_pairs):,}")
    print(f"  - Similar artist pairs: {len(similar_pairs):,}")
    print(f"\nTrain set: {len(train_df):,} pairs")
    print(f"Val set: {len(val_df):,} pairs")
    print(f"\nSaved:")
    print(f"  - finetuning_train.jsonl")
    print(f"  - finetuning_val.jsonl")

    print(f"\n{'='*80}")
    print("NEXT STEPS")
    print(f"{'='*80}")
    print("""
1. Upload both JSONL files to Google Colab
2. Use the fine-tuning notebook (finetune_model_colab.ipynb)
3. Fine-tune for 2-3 epochs (~1-2 hours on T4 GPU)
4. Download fine-tuned model
5. Use for embedding generation!

Expected improvement: 10-30% better retrieval quality on music-specific queries
""")

    db.close()


if __name__ == "__main__":
    main()
