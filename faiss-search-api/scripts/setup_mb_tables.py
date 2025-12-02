#!/usr/bin/env python3
"""
Create MusicBrainz canonical tables in the database.

This creates the mb_artists, mb_labels, mb_recordings, mb_releases,
and mb_release_groups tables with triggers to auto-maintain them.

Usage:
    python scripts/setup_mb_tables.py --db-path data/music_kb.sqlite
"""

import argparse
import sqlite3
import sys
from pathlib import Path


def create_tables(db_path: str) -> None:
    """Create MB canonical tables."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Creating MB canonical tables...")

    # mb_artists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_artists (
            artist_mbid TEXT PRIMARY KEY NOT NULL,
            artist_name TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_artists")

    # mb_labels
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_labels (
            label_mbid TEXT PRIMARY KEY NOT NULL,
            label_name TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_labels")

    # mb_recordings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_recordings (
            recording_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_recordings")

    # mb_tracks
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_tracks (
            track_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_tracks")

    # mb_releases
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_releases (
            release_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            release_date TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_releases")

    # mb_release_groups
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_release_groups (
            release_group_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            first_seen TEXT NOT NULL DEFAULT (datetime('now')),
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  Created mb_release_groups")

    conn.commit()
    conn.close()
    print("Done!")


def main():
    parser = argparse.ArgumentParser(description="Create MB canonical tables")
    parser.add_argument(
        "--db-path",
        required=True,
        help="Path to SQLite database"
    )

    args = parser.parse_args()

    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        sys.exit(1)

    create_tables(str(db_path))


if __name__ == "__main__":
    main()
