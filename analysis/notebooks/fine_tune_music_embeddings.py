#!/usr/bin/env python3
"""
Fine-tune Sentence Transformer for Music Metadata
Creates training data from KEXP database and fine-tunes embedding model
"""

import sqlite3
import random
from pathlib import Path
from typing import List, Tuple
import json

from sentence_transformers import SentenceTransformer, InputExample, losses
from sentence_transformers.evaluation import InformationRetrievalEvaluator
from torch.utils.data import DataLoader


# Configuration
DB_PATH = Path(__file__).parent.parent.parent / "packages" / "server" / "data" / "music_kb.db"
BASE_MODEL = "BAAI/bge-large-en-v1.5"  # or "sentence-transformers/all-mpnet-base-v2"
OUTPUT_PATH = "./models/music-embedding-finetuned"
TRAIN_SIZE = 10000
EVAL_SIZE = 500
BATCH_SIZE = 16
EPOCHS = 1


def load_music_data(db_path: Path, limit: int = 50000):
    """Load music metadata from database."""
    print(f"Loading music data from {db_path}...")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    query = """
        SELECT
            play_id,
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
        LIMIT ?
    """

    cursor.execute(query, (limit,))
    plays = cursor.fetchall()
    conn.close()

    print(f"Loaded {len(plays)} records")
    return plays


def get_genre_from_relationships(db_path: Path, play_id: int):
    """Get genres from MusicBrainz relationships if available."""
    # This is a placeholder - adjust based on your schema
    # You may need to join through master_relations to get genre info
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    query = """
        SELECT DISTINCT entity_metadata
        FROM master_relations
        WHERE kexp_play_id = ?
          AND predicate_label = 'genre'
        LIMIT 5
    """

    cursor.execute(query, (play_id,))
    genres = [row[0] for row in cursor.fetchall()]
    conn.close()

    return genres


def enrich_play_text(play, genres=None):
    """Create enriched text representation."""
    play_id, artist, song, album, year, labels, rotation, is_local, is_live = play

    parts = [f"{artist} - {song}"]

    if album:
        parts.append(f"- {album}")

    if genres:
        parts.append(f"| Genre: {', '.join(genres)}")

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

    return " ".join(parts)


def create_training_pairs(plays, db_path: Path, num_pairs: int = 10000):
    """Create positive pairs for training."""
    print(f"\nCreating {num_pairs} training pairs...")

    # Group plays by different attributes
    by_artist = {}
    by_year = {}
    by_label = {}

    for play in plays:
        play_id, artist, song, album, year, labels, rotation, is_local, is_live = play

        # Group by artist
        if artist:
            if artist not in by_artist:
                by_artist[artist] = []
            by_artist[artist].append(play)

        # Group by year
        if year:
            if year not in by_year:
                by_year[year] = []
            by_year[year].append(play)

        # Group by label
        if labels:
            if labels not in by_label:
                by_label[labels] = []
            by_label[labels].append(play)

    # Create positive pairs
    pairs = []

    # Strategy 1: Same artist (high similarity)
    print("  Creating same-artist pairs...")
    for artist, artist_plays in by_artist.items():
        if len(artist_plays) >= 2:
            # Create pairs within same artist
            for i in range(min(len(artist_plays), 10)):
                for j in range(i+1, min(len(artist_plays), 10)):
                    play1 = artist_plays[i]
                    play2 = artist_plays[j]
                    text1 = enrich_play_text(play1)
                    text2 = enrich_play_text(play2)
                    pairs.append((text1, text2, 0.9))  # High similarity

                    if len(pairs) >= num_pairs * 0.4:
                        break
                if len(pairs) >= num_pairs * 0.4:
                    break
        if len(pairs) >= num_pairs * 0.4:
            break

    # Strategy 2: Same year (medium similarity)
    print("  Creating same-year pairs...")
    for year, year_plays in by_year.items():
        if len(year_plays) >= 2 and len(pairs) < num_pairs * 0.7:
            for i in range(min(len(year_plays), 5)):
                for j in range(i+1, min(len(year_plays), 5)):
                    play1 = year_plays[i]
                    play2 = year_plays[j]

                    # Don't pair same artist (already done)
                    if play1[1] != play2[1]:
                        text1 = enrich_play_text(play1)
                        text2 = enrich_play_text(play2)
                        pairs.append((text1, text2, 0.6))  # Medium similarity

                        if len(pairs) >= num_pairs * 0.7:
                            break
                if len(pairs) >= num_pairs * 0.7:
                    break
        if len(pairs) >= num_pairs * 0.7:
            break

    # Strategy 3: Same label (medium similarity)
    print("  Creating same-label pairs...")
    for label, label_plays in by_label.items():
        if len(label_plays) >= 2 and len(pairs) < num_pairs:
            for i in range(min(len(label_plays), 5)):
                for j in range(i+1, min(len(label_plays), 5)):
                    play1 = label_plays[i]
                    play2 = label_plays[j]

                    # Don't pair same artist
                    if play1[1] != play2[1]:
                        text1 = enrich_play_text(play1)
                        text2 = enrich_play_text(play2)
                        pairs.append((text1, text2, 0.7))  # Medium-high similarity

                        if len(pairs) >= num_pairs:
                            break
                if len(pairs) >= num_pairs:
                    break
        if len(pairs) >= num_pairs:
            break

    print(f"  Created {len(pairs)} pairs")
    return pairs


def create_evaluation_set(plays, db_path: Path, num_queries: int = 100):
    """Create evaluation set for measuring retrieval quality."""
    print(f"\nCreating evaluation set with {num_queries} queries...")

    # Sample random plays as queries
    query_plays = random.sample(plays, min(num_queries, len(plays)))

    # Create corpus (all plays)
    corpus = {}
    for i, play in enumerate(plays):
        corpus[str(i)] = enrich_play_text(play)

    # Create queries and relevant docs
    queries = {}
    relevant_docs = {}

    for i, query_play in enumerate(query_plays):
        query_id = f"q{i}"
        query_text = enrich_play_text(query_play)
        queries[query_id] = query_text

        # Find relevant documents (same artist)
        query_artist = query_play[1]
        relevant = []

        for j, play in enumerate(plays):
            if play[1] == query_artist and play != query_play:
                relevant.append(str(j))

        if relevant:
            relevant_docs[query_id] = relevant[:20]  # Top 20 relevant docs

    print(f"  Created {len(queries)} queries")
    print(f"  Average relevant docs per query: {sum(len(v) for v in relevant_docs.values()) / len(relevant_docs):.1f}")

    return queries, corpus, relevant_docs


def main():
    print("="*80)
    print("FINE-TUNING MUSIC EMBEDDING MODEL")
    print("="*80)

    # Load data
    plays = load_music_data(DB_PATH, limit=50000)

    # Create training pairs
    train_pairs = create_training_pairs(plays, DB_PATH, TRAIN_SIZE)

    # Create evaluation set
    queries, corpus, relevant_docs = create_evaluation_set(plays, DB_PATH, EVAL_SIZE)

    # Convert to InputExample format
    print("\nPreparing training data...")
    train_examples = [
        InputExample(texts=[pair[0], pair[1]], label=pair[2])
        for pair in train_pairs
    ]

    # Load base model
    print(f"\nLoading base model: {BASE_MODEL}")
    model = SentenceTransformer(BASE_MODEL)

    # Create DataLoader
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=BATCH_SIZE)

    # Define loss function
    train_loss = losses.MultipleNegativesRankingLoss(model)

    # Create evaluator
    evaluator = InformationRetrievalEvaluator(
        queries=queries,
        corpus=corpus,
        relevant_docs=relevant_docs,
        name="music-retrieval-eval"
    )

    # Evaluate before fine-tuning
    print("\n" + "="*80)
    print("EVALUATION BEFORE FINE-TUNING")
    print("="*80)
    evaluator(model)

    # Fine-tune
    print("\n" + "="*80)
    print("FINE-TUNING")
    print("="*80)

    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        evaluator=evaluator,
        epochs=EPOCHS,
        warmup_steps=100,
        output_path=OUTPUT_PATH,
        show_progress_bar=True,
    )

    # Evaluate after fine-tuning
    print("\n" + "="*80)
    print("EVALUATION AFTER FINE-TUNING")
    print("="*80)
    evaluator(model)

    # Save model
    print(f"\n✓ Model saved to: {OUTPUT_PATH}")

    # Usage instructions
    print("\n" + "="*80)
    print("USAGE")
    print("="*80)
    print(f"""
To use the fine-tuned model:

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer('{OUTPUT_PATH}')
    embeddings = model.encode(["your", "texts", "here"])

Compare before/after results using test_music_embeddings.py
""")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
