#!/usr/bin/env python3
"""
Populate MusicBrainz entity tables from fact_plays.

Scans the fact_plays table and extracts all unique MBIDs for:
- Artists (from artist_ids JSON)
- Labels (from label_ids JSON)
- Recordings (from recording_id)
- Releases (from release_id)
- Release Groups (from release_group_id)

Inserts these MBIDs into their respective mb_* tables if they don't exist.
Uses SQLite's json_each for efficient extraction.

Usage:
    python scripts/populate_mb_entities.py [--db-path PATH]
"""

import argparse
import sqlite3
import sys
import time
from pathlib import Path


def populate_entities(db_path: str):
    """Populate entity tables from fact_plays."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Enable JSON support (should be built-in)
    try:
        cursor.execute("SELECT json('{}')")
    except sqlite3.OperationalError:
        print("Error: SQLite JSON extension not enabled/available.")
        return False

    start_time = time.time()
    total_new = 0

    print(f"Populating entities in {db_path}...")

    # 1. Artists
    print("Populating Artists...")
    cursor.execute("""
        INSERT OR IGNORE INTO mb_artists (artist_mbid)
        SELECT DISTINCT value
        FROM fact_plays, json_each(fact_plays.artist_ids)
        WHERE value IS NOT NULL AND value != ''
    """)
    print(f"  - Added {cursor.rowcount} new artists")
    total_new += cursor.rowcount

    # 2. Labels
    print("Populating Labels...")
    cursor.execute("""
        INSERT OR IGNORE INTO mb_labels (label_mbid)
        SELECT DISTINCT value
        FROM fact_plays, json_each(fact_plays.label_ids)
        WHERE value IS NOT NULL AND value != ''
    """)
    print(f"  - Added {cursor.rowcount} new labels")
    total_new += cursor.rowcount

    # 3. Recordings
    print("Populating Recordings...")
    cursor.execute("""
        INSERT OR IGNORE INTO mb_recordings (recording_mbid)
        SELECT DISTINCT recording_id
        FROM fact_plays
        WHERE recording_id IS NOT NULL AND recording_id != ''
    """)
    print(f"  - Added {cursor.rowcount} new recordings")
    total_new += cursor.rowcount

    # 4. Releases
    print("Populating Releases...")
    cursor.execute("""
        INSERT OR IGNORE INTO mb_releases (release_mbid)
        SELECT DISTINCT release_id
        FROM fact_plays
        WHERE release_id IS NOT NULL AND release_id != ''
    """)
    print(f"  - Added {cursor.rowcount} new releases")
    total_new += cursor.rowcount

    # 5. Release Groups
    print("Populating Release Groups...")
    cursor.execute("""
        INSERT OR IGNORE INTO mb_release_groups (release_group_mbid)
        SELECT DISTINCT release_group_id
        FROM fact_plays
        WHERE release_group_id IS NOT NULL AND release_group_id != ''
    """)
    print(f"  - Added {cursor.rowcount} new release groups")
    total_new += cursor.rowcount

    conn.commit()
    conn.close()

    duration = time.time() - start_time
    print(f"\nDone in {duration:.2f}s. Total entities added: {total_new}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Populate MB entity tables")
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database"
    )
    args = parser.parse_args()

    if populate_entities(args.db_path):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
