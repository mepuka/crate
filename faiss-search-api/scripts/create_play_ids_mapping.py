#!/usr/bin/env python3
"""
Create play_ids.npy mapping from enriched_plays_full.csv.

This script extracts the 'id' column from the CSV and saves it as a numpy array.
The array index corresponds to the embedding index, enabling future-proof re-indexing.

Usage:
    python scripts/create_play_ids_mapping.py \
        --csv analysis/enriched_plays_full.csv \
        --output faiss-search-api/data/play_ids.npy
"""
import argparse
import numpy as np
import pandas as pd
from pathlib import Path


def create_play_ids_mapping(csv_path: Path, output_path: Path):
    """
    Create play_ids.npy from CSV.

    Args:
        csv_path: Path to enriched_plays_full.csv
        output_path: Path to save play_ids.npy
    """
    print(f"Loading CSV: {csv_path}")
    df = pd.read_csv(csv_path, usecols=['id'], dtype={'id': int})

    print(f"Extracted {len(df):,} play IDs")

    # Convert to numpy array
    play_ids = df['id'].to_numpy()

    # Save
    print(f"Saving to: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(output_path, play_ids)

    print(f"✓ Saved play_ids.npy: {play_ids.shape}")
    print(f"  Sample IDs: {play_ids[:5]}")


def main():
    parser = argparse.ArgumentParser(description="Create play_ids.npy mapping")
    parser.add_argument(
        "--csv",
        type=Path,
        required=True,
        help="Path to enriched_plays_full.csv"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("faiss-search-api/data/play_ids.npy"),
        help="Output path for play_ids.npy"
    )

    args = parser.parse_args()

    if not args.csv.exists():
        raise FileNotFoundError(f"CSV not found: {args.csv}")

    create_play_ids_mapping(args.csv, args.output)


if __name__ == "__main__":
    main()
