#!/usr/bin/env python3
"""
Add indexes for MusicBrainz ID fields to optimize filtering queries.

This script adds indexes on the MBID fields in fact_plays table to support
efficient filtering by artist, recording, release, and release group MBIDs.
"""

import sqlite3
import sys
from pathlib import Path

def add_mbid_indexes(db_path: str):
    """Add indexes for MBID fields if they don't already exist."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    indexes = [
        # Index for recording_id filtering (simple string comparison)
        ("idx_fact_plays_recording_id", "CREATE INDEX IF NOT EXISTS idx_fact_plays_recording_id ON fact_plays(recording_id)"),

        # Index for release_id filtering
        ("idx_fact_plays_release_id", "CREATE INDEX IF NOT EXISTS idx_fact_plays_release_id ON fact_plays(release_id)"),

        # Index for release_group_id filtering
        ("idx_fact_plays_release_group_id", "CREATE INDEX IF NOT EXISTS idx_fact_plays_release_group_id ON fact_plays(release_group_id)"),

        # Index for artist_ids JSON array (SQLite 3.38+)
        # This enables efficient filtering when artist_ids contains a specific MBID
        ("idx_fact_plays_artist_ids", "CREATE INDEX IF NOT EXISTS idx_fact_plays_artist_ids ON fact_plays(artist_ids)"),
    ]

    print(f"Adding MBID indexes to {db_path}...")

    for idx_name, create_sql in indexes:
        try:
            cursor.execute(create_sql)
            print(f"  ✓ Created/verified index: {idx_name}")
        except sqlite3.Error as e:
            print(f"  ✗ Failed to create index {idx_name}: {e}")

    conn.commit()

    # Verify indexes were created
    print("\nVerifying indexes...")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fact_plays' AND name LIKE 'idx_fact_plays_%'")
    indexes = cursor.fetchall()

    print(f"Found {len(indexes)} MBID-related indexes:")
    for idx in indexes:
        print(f"  - {idx[0]}")

    conn.close()
    print("\n✓ MBID indexes added successfully!")

if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "/home/user/crate/data/music_kb.sqlite"

    if not Path(db_path).exists():
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    add_mbid_indexes(db_path)
