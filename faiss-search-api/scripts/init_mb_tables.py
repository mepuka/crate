#!/usr/bin/env python3
"""
Initialize MusicBrainz entity tables.

Creates the following tables if they don't exist:
- mb_artists
- mb_labels
- mb_recordings
- mb_releases
- mb_release_groups

Usage:
    python scripts/init_mb_tables.py [--db-path PATH]
"""

import argparse
import sqlite3
import sys
from pathlib import Path


def init_tables(db_path: str) -> bool:
    """Create MB entity tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Artists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mb_artists (
                artist_mbid TEXT PRIMARY KEY NOT NULL,
                artist_name TEXT,
                sort_name TEXT,
                country TEXT,
                artist_type TEXT,
                disambiguation TEXT,
                begin_area TEXT,
                begin_date TEXT,
                end_date TEXT,
                urls TEXT,
                first_seen TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen TEXT NOT NULL DEFAULT (datetime('now')),
                play_count INTEGER NOT NULL DEFAULT 0,
                enriched_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Labels
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mb_labels (
                label_mbid TEXT PRIMARY KEY NOT NULL,
                label_name TEXT,
                country TEXT,
                label_type TEXT,
                disambiguation TEXT,
                label_code INTEGER,
                urls TEXT,
                first_seen TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen TEXT NOT NULL DEFAULT (datetime('now')),
                play_count INTEGER NOT NULL DEFAULT 0,
                enriched_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Recordings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mb_recordings (
                recording_mbid TEXT PRIMARY KEY NOT NULL,
                song_title TEXT,
                length_ms INTEGER,
                disambiguation TEXT,
                isrc TEXT,
                first_seen TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen TEXT NOT NULL DEFAULT (datetime('now')),
                play_count INTEGER NOT NULL DEFAULT 0,
                enriched_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Releases
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mb_releases (
                release_mbid TEXT PRIMARY KEY NOT NULL,
                album_title TEXT,
                release_date TEXT,
                country TEXT,
                status TEXT,
                disambiguation TEXT,
                barcode TEXT,
                asin TEXT,
                urls TEXT,
                first_seen TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen TEXT NOT NULL DEFAULT (datetime('now')),
                play_count INTEGER NOT NULL DEFAULT 0,
                enriched_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Release Groups
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS mb_release_groups (
                release_group_mbid TEXT PRIMARY KEY NOT NULL,
                album_title TEXT,
                primary_type TEXT,
                secondary_types TEXT,
                disambiguation TEXT,
                first_release_date TEXT,
                urls TEXT,
                first_seen TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen TEXT NOT NULL DEFAULT (datetime('now')),
                play_count INTEGER NOT NULL DEFAULT 0,
                enriched_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)

        conn.commit()
        print("Tables initialized successfully.")
        return True

    except Exception as e:
        print(f"Error initializing tables: {e}")
        return False
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Initialize MusicBrainz tables")
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database"
    )
    args = parser.parse_args()

    # Ensure directory exists
    db_path = Path(args.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if init_tables(str(db_path)):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
