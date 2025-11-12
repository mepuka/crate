#!/usr/bin/env python3
"""
Generate HIGH-QUALITY synthetic training data for fine-tuning.

Smart filtering:
- Only substantive DJ comments (not announcements)
- Quality checks on genre combinations
- Deduplicate similar pairs
- Option for human review

Smaller, higher-quality dataset (~2-3K pairs) often beats 12K noisy pairs.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

import pandas as pd
from crate_analysis import Database
import random
import json
import re


# Comment quality filters
ANNOUNCEMENT_PATTERNS = [
    r'\b(coming up|next|stay tuned|tune in|call in|request line)\b',
    r'\b(weather|traffic|news|announcement)\b',
    r'\b(brought to you by|sponsored by)\b',
    r'\b(pledge|donation|member)\b',
    r'\b(\d{3}[-.]?\d{4})\b',  # Phone numbers
    r'^(good morning|good afternoon|good evening)',
    r'\b(thanks for listening|you\'re listening to)\b'
]

SUBSTANTIVE_INDICATORS = [
    r'\b(sounds? like|similar to|reminds? me of)\b',
    r'\b(vibe|mood|feel|energy|groove)\b',
    r'\b(heavy|light|dark|bright|mellow|intense)\b',
    r'\b(beautiful|amazing|incredible|perfect)\b',
    r'\b(love|great|fantastic|awesome)\b',
]


def is_substantive_comment(comment):
    """Check if comment is substantive (not just an announcement)."""
    if not comment or len(comment) < 20:
        return False

    comment_lower = comment.lower()

    # Filter out announcements
    for pattern in ANNOUNCEMENT_PATTERNS:
        if re.search(pattern, comment_lower, re.IGNORECASE):
            return False

    # Look for substantive content
    has_substance = any(
        re.search(pattern, comment_lower, re.IGNORECASE)
        for pattern in SUBSTANTIVE_INDICATORS
    )

    return has_substance or len(comment) > 100  # Long comments usually substantive


def generate_high_quality_genre_pairs(db, n_samples=1000):
    """Generate high-quality genre-based pairs."""
    pairs = []

    # Get artists with 2-5 genres (not too few, not too many)
    artists_genres = db.query("""
        SELECT
            subject_name as artist,
            GROUP_CONCAT(object_name, '|||') as genres_str,
            COUNT(*) as genre_count
        FROM master_relations
        WHERE predicate = 'artist-genre'
        GROUP BY subject_name
        HAVING genre_count BETWEEN 2 AND 5
        ORDER BY RANDOM()
        LIMIT ?
    """, (n_samples * 2,))  # Get extras for filtering

    for _, row in artists_genres.iterrows():
        artist = row['artist']
        genres = row['genres_str'].split('|||')

        # Get a play with album info (higher quality)
        play = db.query("""
            SELECT artist, song, album, comment
            FROM fact_plays
            WHERE artist = ?
            AND album IS NOT NULL
            LIMIT 1
        """, (artist,))

        if play.empty:
            continue

        play = play.iloc[0]

        # Create multiple query variations for diversity
        num_genres = min(3, len(genres))
        selected = random.sample(genres, num_genres)

        # Natural query variations
        if num_genres == 2:
            queries = [
                f"{selected[0]} {selected[1]}",
                f"{selected[0]} with {selected[1]} vibes",
                f"{selected[1]} {selected[0]} music"
            ]
        else:
            queries = [
                f"{selected[0]} {selected[1]} {selected[2]}",
                f"{selected[0]} meets {selected[1]}"
            ]

        positive = f"{play['artist']} - {play['song']} - {play['album']}"

        # Add one pair per artist
        pairs.append({
            'query': random.choice(queries),
            'positive': positive,
            'type': 'genre',
            'genres': ', '.join(selected)
        })

        if len(pairs) >= n_samples:
            break

    return pairs


def generate_substantive_comment_pairs(db, n_samples=500):
    """Generate pairs from HIGH-QUALITY DJ comments only."""
    pairs = []

    # Get plays with substantial comments
    plays = db.query("""
        SELECT artist, song, album, comment
        FROM fact_plays
        WHERE comment IS NOT NULL
        AND LENGTH(comment) > 30
        ORDER BY RANDOM()
        LIMIT ?
    """, (n_samples * 5,))  # Get extras for filtering

    for _, row in plays.iterrows():
        comment = row['comment']

        # Quality filter
        if not is_substantive_comment(comment):
            continue

        # Extract mood/vibe keywords
        comment_lower = comment.lower()
        keywords = []

        # Mood descriptors
        moods = ['funky', 'groovy', 'mellow', 'chill', 'upbeat', 'energetic',
                 'heavy', 'intense', 'dreamy', 'psychedelic', 'dark', 'atmospheric']
        keywords.extend([m for m in moods if m in comment_lower])

        # If we found good keywords, create query
        if keywords:
            query = f"{' '.join(keywords[:2])} music"
        else:
            # Use first meaningful sentence
            sentences = [s.strip() for s in comment.split('.') if len(s.strip()) > 20]
            if not sentences:
                continue
            query = sentences[0]

        if pd.notna(row['album']):
            positive = f"{row['artist']} - {row['song']} - {row['album']}"
        else:
            positive = f"{row['artist']} - {row['song']}"

        pairs.append({
            'query': query,
            'positive': positive,
            'type': 'comment',
            'original_comment': comment
        })

        if len(pairs) >= n_samples:
            break

    return pairs


def generate_location_pairs(db, n_samples=500):
    """Generate location-based pairs."""
    pairs = []

    # Get artists with meaningful locations (cities with multiple artists)
    location_artists = db.query("""
        SELECT
            object_name as location,
            subject_name as artist
        FROM master_relations
        WHERE predicate IN ('area', 'begin-area')
        AND object_name NOT IN ('United States', 'United Kingdom', 'Canada')
        ORDER BY RANDOM()
        LIMIT ?
    """, (n_samples * 2,))

    for _, row in location_artists.iterrows():
        artist = row['artist']
        location = row['location']

        play = db.query("""
            SELECT artist, song, album
            FROM fact_plays
            WHERE artist = ?
            AND album IS NOT NULL
            LIMIT 1
        """, (artist,))

        if play.empty:
            continue

        play = play.iloc[0]

        # Natural query variations
        queries = [
            f"music from {location}",
            f"{location} artists",
            f"bands from {location}",
            f"{location} sound"
        ]

        positive = f"{play['artist']} - {play['song']} - {play['album']}"

        pairs.append({
            'query': random.choice(queries),
            'positive': positive,
            'type': 'location',
            'location': location
        })

        if len(pairs) >= n_samples:
            break

    return pairs


def generate_similar_artist_pairs(db, n_samples=500):
    """Generate high-quality similar artist pairs."""
    pairs = []

    # Get specific, interesting genres (not overly broad)
    genre_artists = db.query("""
        SELECT
            object_name as genre,
            GROUP_CONCAT(DISTINCT subject_name, '|||') as artists_str,
            COUNT(DISTINCT subject_name) as artist_count
        FROM master_relations
        WHERE predicate = 'artist-genre'
        AND object_name NOT IN ('rock', 'pop', 'electronic', 'jazz', 'metal')
        GROUP BY object_name
        HAVING artist_count BETWEEN 5 AND 50
        ORDER BY RANDOM()
        LIMIT 50
    """)

    for _, row in genre_artists.iterrows():
        genre = row['genre']
        artists = row['artists_str'].split('|||')

        if len(artists) < 2:
            continue

        # Sample pairs
        for _ in range(min(10, len(artists) // 2)):
            anchor_artist, similar_artist = random.sample(artists, 2)

            # Get plays
            anchor_play = db.query("""
                SELECT artist, song, album
                FROM fact_plays
                WHERE artist = ? AND album IS NOT NULL
                LIMIT 1
            """, (anchor_artist,))

            similar_play = db.query("""
                SELECT artist, song, album
                FROM fact_plays
                WHERE artist = ? AND album IS NOT NULL
                LIMIT 1
            """, (similar_artist,))

            if anchor_play.empty or similar_play.empty:
                continue

            anchor = anchor_play.iloc[0]
            similar = similar_play.iloc[0]

            # Query: "artists like X"
            query = f"artists like {anchor['artist']}"
            positive = f"{similar['artist']} - {similar['song']} - {similar['album']}"

            pairs.append({
                'query': query,
                'positive': positive,
                'type': 'similar_artist',
                'genre': genre
            })

            if len(pairs) >= n_samples:
                return pairs

    return pairs


def deduplicate_pairs(pairs):
    """Remove near-duplicate pairs."""
    seen_queries = set()
    seen_positives = set()
    deduped = []

    for pair in pairs:
        query_norm = pair['query'].lower().strip()
        positive_norm = pair['positive'].lower().strip()

        # Keep if both query and positive are novel
        if query_norm not in seen_queries or positive_norm not in seen_positives:
            deduped.append(pair)
            seen_queries.add(query_norm)
            seen_positives.add(positive_norm)

    return deduped


def export_for_review(pairs, filename='finetuning_data_review.csv'):
    """Export pairs for human review."""
    df = pd.DataFrame(pairs)
    df['approved'] = ''  # Column for human to fill: 'y', 'n', or empty
    df['notes'] = ''  # Optional notes

    df.to_csv(filename, index=False)
    print(f"\n✓ Exported {len(df)} pairs to {filename}")
    print(f"\nFor human review:")
    print(f"  1. Open {filename} in Excel/Google Sheets")
    print(f"  2. Review each pair")
    print(f"  3. Mark 'approved' column with 'y' (good) or 'n' (bad)")
    print(f"  4. Save and run: import_reviewed_data('{filename}')")


def import_reviewed_data(filename='finetuning_data_review.csv'):
    """Import human-reviewed pairs."""
    df = pd.read_csv(filename)

    # Filter approved pairs
    approved = df[df['approved'].str.lower() == 'y'].to_dict('records')

    print(f"\nImported {len(approved)} approved pairs from {len(df)} total")

    return approved


def main():
    print("="*80)
    print("GENERATING HIGH-QUALITY FINE-TUNING DATA")
    print("="*80)
    print("\nFocus: Quality over quantity")
    print("Target: ~2-3K high-quality pairs\n")

    db = Database()

    all_pairs = []

    print("1. Generating genre-based pairs...")
    genre_pairs = generate_high_quality_genre_pairs(db, n_samples=1000)
    all_pairs.extend(genre_pairs)
    print(f"   ✓ Generated {len(genre_pairs):,} genre pairs")

    print("\n2. Generating substantive comment pairs...")
    comment_pairs = generate_substantive_comment_pairs(db, n_samples=500)
    all_pairs.extend(comment_pairs)
    print(f"   ✓ Generated {len(comment_pairs):,} comment pairs (filtered for quality)")

    print("\n3. Generating location pairs...")
    location_pairs = generate_location_pairs(db, n_samples=500)
    all_pairs.extend(location_pairs)
    print(f"   ✓ Generated {len(location_pairs):,} location pairs")

    print("\n4. Generating similar artist pairs...")
    similar_pairs = generate_similar_artist_pairs(db, n_samples=500)
    all_pairs.extend(similar_pairs)
    print(f"   ✓ Generated {len(similar_pairs):,} similar artist pairs")

    print(f"\n5. Deduplicating...")
    all_pairs = deduplicate_pairs(all_pairs)
    print(f"   ✓ {len(all_pairs):,} unique pairs after deduplication")

    # Shuffle
    random.shuffle(all_pairs)

    print(f"\n{'='*80}")
    print("REVIEW OPTIONS")
    print(f"{'='*80}")

    choice = input("\nDo you want to:\n  1. Use data as-is (recommended for quick start)\n  2. Export for human review\n\nChoice (1 or 2): ")

    if choice == '2':
        # Export for human review
        export_for_review(all_pairs)
        print("\nAfter reviewing, run:")
        print("  pairs = import_reviewed_data('finetuning_data_review.csv')")
        return

    # Save directly
    df = pd.DataFrame(all_pairs)
    train_size = int(0.9 * len(df))
    train_df = df[:train_size]
    val_df = df[train_size:]

    train_df.to_json('finetuning_train.jsonl', orient='records', lines=True)
    val_df.to_json('finetuning_val.jsonl', orient='records', lines=True)

    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total pairs: {len(all_pairs):,}")
    print(f"  - Genre pairs: {len(genre_pairs):,}")
    print(f"  - Comment pairs: {len(comment_pairs):,} (quality-filtered)")
    print(f"  - Location pairs: {len(location_pairs):,}")
    print(f"  - Similar artist pairs: {len(similar_pairs):,}")
    print(f"\nTrain set: {len(train_df):,} pairs")
    print(f"Val set: {len(val_df):,} pairs")
    print(f"\nSaved:")
    print(f"  - finetuning_train.jsonl")
    print(f"  - finetuning_val.jsonl")

    # Show samples
    print(f"\n{'='*80}")
    print("SAMPLE PAIRS")
    print(f"{'='*80}")
    for pair_type in ['genre', 'comment', 'location', 'similar_artist']:
        sample = next((p for p in all_pairs if p['type'] == pair_type), None)
        if sample:
            print(f"\n{pair_type.upper()}:")
            print(f"  Query: {sample['query']}")
            print(f"  Positive: {sample['positive']}")

    db.close()


if __name__ == "__main__":
    main()
