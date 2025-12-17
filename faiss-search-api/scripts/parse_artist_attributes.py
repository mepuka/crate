#!/usr/bin/env python3
"""
Parse instrument/role attributes from artist_edges.

Adds searchable columns for common instruments and roles:
- has_vocals, has_guitar, has_bass, has_drums, has_keys
- primary_role (first attribute in the list)

Usage:
    python scripts/parse_artist_attributes.py --db-path data/music_kb.sqlite
"""

import argparse
import json
import sqlite3
from typing import Dict, Any


# Instrument detection patterns
INSTRUMENT_PATTERNS = {
    "vocals": ["vocal", "singing", "voice"],
    "guitar": ["guitar"],
    "bass": ["bass guitar", "bass", "electric bass"],
    "drums": ["drum", "percussion", "membranophone"],
    "keys": ["piano", "keyboard", "organ", "synth", "keys", "accordion"],
}


def detect_instruments(attributes: list[str]) -> Dict[str, bool]:
    """Detect instruments from attribute list."""
    attrs_lower = [a.lower() for a in attributes]

    result = {
        "has_vocals": False,
        "has_guitar": False,
        "has_bass": False,
        "has_drums": False,
        "has_keys": False,
    }

    for attr in attrs_lower:
        # Check each instrument category
        for category, patterns in INSTRUMENT_PATTERNS.items():
            key = f"has_{category}"
            if any(p in attr for p in patterns):
                # Special case: "bass guitar" shouldn't match "guitar"
                if category == "guitar" and ("bass guitar" in attr or "electric bass" in attr):
                    continue
                result[key] = True

    return result


def add_columns(conn: sqlite3.Connection):
    """Add new columns if they don't exist."""
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(artist_edges)")
    existing = {row[1] for row in cursor.fetchall()}

    columns_to_add = [
        ("has_vocals", "INTEGER DEFAULT 0"),
        ("has_guitar", "INTEGER DEFAULT 0"),
        ("has_bass", "INTEGER DEFAULT 0"),
        ("has_drums", "INTEGER DEFAULT 0"),
        ("has_keys", "INTEGER DEFAULT 0"),
        ("primary_role", "TEXT"),
    ]

    for col_name, col_def in columns_to_add:
        if col_name not in existing:
            print(f"Adding column: {col_name}")
            cursor.execute(f"ALTER TABLE artist_edges ADD COLUMN {col_name} {col_def}")

    conn.commit()
    print("Schema updated")


def parse_and_update(conn: sqlite3.Connection, batch_size: int = 5000):
    """Parse attributes and update instrument flags."""
    cursor = conn.cursor()

    # Count total rows with attributes
    cursor.execute("""
        SELECT COUNT(*) FROM artist_edges
        WHERE attributes IS NOT NULL AND attributes != '[]'
    """)
    total = cursor.fetchone()[0]
    print(f"Processing {total:,} rows with attributes")

    # Process in batches
    cursor.execute("""
        SELECT source_mbid, target_mbid, relationship_type, attributes
        FROM artist_edges
        WHERE attributes IS NOT NULL AND attributes != '[]'
    """)

    updates = []
    processed = 0

    for row in cursor:
        source_mbid, target_mbid, rel_type, attrs_json = row

        try:
            attrs = json.loads(attrs_json) if attrs_json else []
            if not attrs:
                continue

            instruments = detect_instruments(attrs)
            primary_role = attrs[0] if attrs else None

            updates.append((
                1 if instruments["has_vocals"] else 0,
                1 if instruments["has_guitar"] else 0,
                1 if instruments["has_bass"] else 0,
                1 if instruments["has_drums"] else 0,
                1 if instruments["has_keys"] else 0,
                primary_role,
                source_mbid,
                target_mbid,
                rel_type
            ))

            if len(updates) >= batch_size:
                _commit_batch(conn, updates)
                processed += len(updates)
                print(f"  Processed: {processed:,}/{total:,}")
                updates = []

        except json.JSONDecodeError:
            continue

    # Final batch
    if updates:
        _commit_batch(conn, updates)
        processed += len(updates)

    print(f"\nCompleted: {processed:,} rows updated")


def _commit_batch(conn: sqlite3.Connection, updates: list):
    """Commit a batch of updates."""
    cursor = conn.cursor()
    cursor.executemany("""
        UPDATE artist_edges SET
            has_vocals = ?,
            has_guitar = ?,
            has_bass = ?,
            has_drums = ?,
            has_keys = ?,
            primary_role = ?
        WHERE source_mbid = ? AND target_mbid = ? AND relationship_type = ?
    """, updates)
    conn.commit()


def create_indexes(conn: sqlite3.Connection):
    """Create indexes for instrument queries."""
    cursor = conn.cursor()

    indexes = [
        ("idx_ae_vocals", "artist_edges(has_vocals) WHERE has_vocals = 1"),
        ("idx_ae_guitar", "artist_edges(has_guitar) WHERE has_guitar = 1"),
        ("idx_ae_bass", "artist_edges(has_bass) WHERE has_bass = 1"),
        ("idx_ae_drums", "artist_edges(has_drums) WHERE has_drums = 1"),
        ("idx_ae_keys", "artist_edges(has_keys) WHERE has_keys = 1"),
        ("idx_ae_primary_role", "artist_edges(primary_role)"),
    ]

    for idx_name, idx_def in indexes:
        try:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_def}")
            print(f"Created index: {idx_name}")
        except Exception as e:
            print(f"Index {idx_name}: {e}")

    conn.commit()


def print_stats(conn: sqlite3.Connection):
    """Print statistics about parsed attributes."""
    cursor = conn.cursor()

    print("\n=== Instrument Distribution ===")
    for col in ["has_vocals", "has_guitar", "has_bass", "has_drums", "has_keys"]:
        cursor.execute(f"SELECT COUNT(*) FROM artist_edges WHERE {col} = 1")
        count = cursor.fetchone()[0]
        print(f"  {col}: {count:,}")

    print("\n=== Top Primary Roles ===")
    cursor.execute("""
        SELECT primary_role, COUNT(*) as cnt
        FROM artist_edges
        WHERE primary_role IS NOT NULL
        GROUP BY primary_role
        ORDER BY cnt DESC
        LIMIT 15
    """)
    for role, count in cursor.fetchall():
        print(f"  {count:5,}: {role}")


def main():
    parser = argparse.ArgumentParser(description="Parse artist_edges attributes")
    parser.add_argument("--db-path", default="data/music_kb.sqlite", help="Database path")
    parser.add_argument("--batch-size", type=int, default=5000, help="Batch size")

    args = parser.parse_args()

    conn = sqlite3.connect(args.db_path, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")

    print("=" * 60)
    print("PARSE ARTIST_EDGES ATTRIBUTES")
    print("=" * 60)
    print(f"Database: {args.db_path}")
    print()

    add_columns(conn)
    parse_and_update(conn, args.batch_size)
    create_indexes(conn)
    print_stats(conn)

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
