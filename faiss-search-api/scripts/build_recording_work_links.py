#!/usr/bin/env python3
"""
Build Recording → Work links from mb_works.relations.

The MusicBrainz work dump stores performance relationships as:
  mb_works.relations: [{"type": "performance", "recording": {"id": "...", "title": "..."}}]

This script extracts those links and:
1. Creates a recording_work_links table for graph queries
2. Updates mb_recordings.work_mbids for quick lookups

Usage:
    python scripts/build_recording_work_links.py --db-path data/music_kb.sqlite
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime


def create_tables(conn: sqlite3.Connection):
    """Create the recording_work_links table with attribute flags."""
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recording_work_links (
            recording_mbid TEXT NOT NULL,
            work_mbid TEXT NOT NULL,
            work_title TEXT,
            attributes TEXT,  -- JSON array: ["live", "cover", etc.]
            relationship_type TEXT DEFAULT 'performance',
            is_cover INTEGER DEFAULT 0,
            is_live INTEGER DEFAULT 0,
            is_medley INTEGER DEFAULT 0,
            is_instrumental INTEGER DEFAULT 0,
            is_partial INTEGER DEFAULT 0,
            PRIMARY KEY (recording_mbid, work_mbid)
        )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_recording ON recording_work_links(recording_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_work ON recording_work_links(work_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_type ON recording_work_links(relationship_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_cover ON recording_work_links(is_cover)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_live ON recording_work_links(is_live)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_medley ON recording_work_links(is_medley)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_instrumental ON recording_work_links(is_instrumental)")

    conn.commit()
    print("✓ Created recording_work_links table with attribute flags")


def get_our_recording_mbids(conn: sqlite3.Connection) -> set:
    """Get all recording MBIDs we have in mb_recordings."""
    cursor = conn.cursor()
    cursor.execute("SELECT recording_mbid FROM mb_recordings WHERE recording_mbid IS NOT NULL")
    mbids = {row[0] for row in cursor.fetchall()}
    print(f"✓ Found {len(mbids):,} recordings with MBIDs")
    return mbids


def parse_attributes(attributes: list) -> dict:
    """Parse attribute list into boolean flags.

    MusicBrainz performance attributes include:
    - cover: This is a cover version
    - live: This is a live recording
    - medley: Part of a medley
    - instrumental: Instrumental version (no vocals)
    - partial: Partial performance
    - remix: Remix version
    """
    attr_set = set(attr.lower() for attr in attributes) if attributes else set()
    return {
        'is_cover': 1 if 'cover' in attr_set else 0,
        'is_live': 1 if 'live' in attr_set else 0,
        'is_medley': 1 if 'medley' in attr_set else 0,
        'is_instrumental': 1 if 'instrumental' in attr_set else 0,
        'is_partial': 1 if 'partial' in attr_set else 0,
    }


def extract_links(conn: sqlite3.Connection, our_recordings: set, batch_size: int = 5000):
    """Extract recording-work links from mb_works.relations."""
    cursor = conn.cursor()

    # Count total works to process
    cursor.execute("SELECT COUNT(*) FROM mb_works WHERE relations IS NOT NULL AND relations != '[]'")
    total_works = cursor.fetchone()[0]
    print(f"Processing {total_works:,} works with relations...")

    links_found = 0
    links_matched = 0
    processed = 0
    attr_counts = {'cover': 0, 'live': 0, 'medley': 0, 'instrumental': 0, 'partial': 0}

    # Process in batches using rowid for efficient pagination
    cursor.execute("SELECT MIN(rowid), MAX(rowid) FROM mb_works")
    min_rowid, max_rowid = cursor.fetchone()

    if min_rowid is None:
        print("No works found!")
        return 0, attr_counts

    current_rowid = min_rowid
    batch_links = []

    while current_rowid <= max_rowid:
        cursor.execute("""
            SELECT work_mbid, title, relations
            FROM mb_works
            WHERE rowid >= ? AND rowid < ?
            AND relations IS NOT NULL AND relations != '[]'
        """, (current_rowid, current_rowid + batch_size))

        rows = cursor.fetchall()

        for work_mbid, work_title, relations_json in rows:
            if not relations_json:
                continue

            try:
                relations = json.loads(relations_json)
            except json.JSONDecodeError:
                continue

            for rel in relations:
                if rel.get('type') == 'performance' and 'recording' in rel:
                    recording = rel['recording']
                    recording_mbid = recording.get('id')

                    if recording_mbid:
                        links_found += 1

                        # Only keep if it's one of our recordings
                        if recording_mbid in our_recordings:
                            links_matched += 1
                            attributes = rel.get('attributes', [])
                            flags = parse_attributes(attributes)

                            # Track attribute counts
                            for attr in ['cover', 'live', 'medley', 'instrumental', 'partial']:
                                if flags[f'is_{attr}']:
                                    attr_counts[attr] += 1

                            batch_links.append((
                                recording_mbid,
                                work_mbid,
                                work_title,
                                json.dumps(attributes) if attributes else None,
                                rel.get('type', 'performance'),  # relationship_type
                                flags['is_cover'],
                                flags['is_live'],
                                flags['is_medley'],
                                flags['is_instrumental'],
                                flags['is_partial'],
                            ))

        processed += len(rows)
        current_rowid += batch_size

        # Insert batch
        if batch_links:
            cursor.executemany("""
                INSERT OR REPLACE INTO recording_work_links
                (recording_mbid, work_mbid, work_title, attributes,
                 relationship_type, is_cover, is_live, is_medley, is_instrumental, is_partial)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch_links)
            batch_links = []

        # Progress update every 100k
        if processed % 100000 < batch_size:
            pct = 100 * processed / total_works if total_works > 0 else 0
            print(f"  Processed {processed:,}/{total_works:,} ({pct:.1f}%) - "
                  f"found {links_found:,} links, matched {links_matched:,}")

    conn.commit()
    return links_matched, attr_counts


def update_recordings_work_mbids(conn: sqlite3.Connection):
    """Update mb_recordings.work_mbids from the links table."""
    cursor = conn.cursor()

    print("Updating mb_recordings.work_mbids...")

    # Group work_mbids by recording
    cursor.execute("""
        UPDATE mb_recordings
        SET work_mbids = (
            SELECT json_group_array(work_mbid)
            FROM recording_work_links
            WHERE recording_work_links.recording_mbid = mb_recordings.recording_mbid
        )
        WHERE recording_mbid IN (SELECT DISTINCT recording_mbid FROM recording_work_links)
    """)

    updated = cursor.rowcount
    conn.commit()
    print(f"✓ Updated {updated:,} recordings with work_mbids")
    return updated


def print_stats(conn: sqlite3.Connection, attr_counts: dict = None):
    """Print final statistics."""
    cursor = conn.cursor()

    print("\n" + "="*60)
    print("FINAL STATISTICS")
    print("="*60)

    cursor.execute("SELECT COUNT(*) FROM recording_work_links")
    total_links = cursor.fetchone()[0]
    print(f"Total recording-work links: {total_links:,}")

    cursor.execute("SELECT COUNT(DISTINCT recording_mbid) FROM recording_work_links")
    unique_recordings = cursor.fetchone()[0]
    print(f"Unique recordings with works: {unique_recordings:,}")

    cursor.execute("SELECT COUNT(DISTINCT work_mbid) FROM recording_work_links")
    unique_works = cursor.fetchone()[0]
    print(f"Unique works linked: {unique_works:,}")

    cursor.execute("SELECT COUNT(*) FROM mb_recordings WHERE work_mbids IS NOT NULL AND work_mbids != '[]'")
    recordings_with_works = cursor.fetchone()[0]
    print(f"Recordings with work_mbids populated: {recordings_with_works:,}")

    # Attribute distribution
    print("\n--- Attribute Distribution ---")
    cursor.execute("SELECT SUM(is_cover), SUM(is_live), SUM(is_medley), SUM(is_instrumental), SUM(is_partial) FROM recording_work_links")
    row = cursor.fetchone()
    if row:
        print(f"  Covers: {row[0] or 0:,}")
        print(f"  Live recordings: {row[1] or 0:,}")
        print(f"  Medleys: {row[2] or 0:,}")
        print(f"  Instrumentals: {row[3] or 0:,}")
        print(f"  Partial performances: {row[4] or 0:,}")

    # Sample some covers (works with multiple recordings)
    print("\n--- Sample Works with Multiple Recordings (Covers) ---")
    cursor.execute("""
        SELECT
            rwl.work_title,
            COUNT(*) as recording_count,
            GROUP_CONCAT(r.song_title, ' | ') as recordings
        FROM recording_work_links rwl
        JOIN mb_recordings r ON rwl.recording_mbid = r.recording_mbid
        GROUP BY rwl.work_mbid
        HAVING COUNT(*) > 1
        ORDER BY recording_count DESC
        LIMIT 5
    """)

    for work_title, count, recordings in cursor:
        print(f"\n  Work: {work_title}")
        print(f"  Recordings ({count}): {recordings[:200]}...")


def main():
    parser = argparse.ArgumentParser(description="Build recording-work links from mb_works")
    parser.add_argument("--db-path", required=True, help="Path to SQLite database")
    parser.add_argument("--batch-size", type=int, default=5000, help="Batch size for processing")
    args = parser.parse_args()

    print(f"[{datetime.now().isoformat()}] Starting recording-work link extraction")
    print(f"Database: {args.db_path}")

    conn = sqlite3.connect(args.db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    try:
        # Step 1: Create tables
        create_tables(conn)

        # Step 2: Get our recordings
        our_recordings = get_our_recording_mbids(conn)

        # Step 3: Extract links
        links, attr_counts = extract_links(conn, our_recordings, args.batch_size)
        print(f"\n✓ Extracted {links:,} recording-work links")
        print(f"  Attribute breakdown:")
        for attr, count in attr_counts.items():
            print(f"    {attr}: {count:,}")

        # Step 4: Update mb_recordings.work_mbids
        update_recordings_work_mbids(conn)

        # Step 5: Print stats
        print_stats(conn, attr_counts)

        print(f"\n[{datetime.now().isoformat()}] Done!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
