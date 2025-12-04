#!/usr/bin/env python3
"""
Materialize graph edge tables from JSON relations in mb_artists and mb_labels.

Creates:
- artist_edges: band_member, member_of relationships between artists
- label_edges: ownership, distribution, imprint relationships between labels
- artist_label_edges: artist-to-label relationships
- artist_event_edges: artist performance at events

Usage:
    python scripts/materialize_graph_edges.py --db-path data/music_kb.sqlite
"""

import argparse
import json
import sqlite3
from datetime import datetime


def create_tables(conn: sqlite3.Connection):
    """Create edge tables."""
    cursor = conn.cursor()

    # Artist-to-Artist edges
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS artist_edges (
            source_mbid TEXT NOT NULL,
            target_mbid TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            source_name TEXT,
            target_name TEXT,
            target_type TEXT,
            attributes TEXT,
            begin_date TEXT,
            end_date TEXT,
            PRIMARY KEY (source_mbid, target_mbid, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_source ON artist_edges(source_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_target ON artist_edges(target_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_type ON artist_edges(relationship_type)")

    # Label-to-Label edges
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS label_edges (
            source_mbid TEXT NOT NULL,
            target_mbid TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            source_name TEXT,
            target_name TEXT,
            begin_date TEXT,
            end_date TEXT,
            PRIMARY KEY (source_mbid, target_mbid, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_le_source ON label_edges(source_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_le_target ON label_edges(target_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_le_type ON label_edges(relationship_type)")

    # Artist-to-Label edges
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS artist_label_edges (
            artist_mbid TEXT NOT NULL,
            label_mbid TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            artist_name TEXT,
            label_name TEXT,
            begin_date TEXT,
            end_date TEXT,
            PRIMARY KEY (artist_mbid, label_mbid, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ale_artist ON artist_label_edges(artist_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ale_label ON artist_label_edges(label_mbid)")

    # Artist-to-Event edges
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS artist_event_edges (
            artist_mbid TEXT NOT NULL,
            event_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            artist_name TEXT,
            event_name TEXT,
            event_type TEXT,
            event_date TEXT,
            PRIMARY KEY (artist_mbid, event_id, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aee_artist ON artist_event_edges(artist_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aee_event ON artist_event_edges(event_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aee_date ON artist_event_edges(event_date)")

    conn.commit()
    print("✓ Created edge tables")


def extract_artist_edges(conn: sqlite3.Connection) -> dict:
    """Extract artist-to-artist and artist-to-label edges from mb_artists."""
    cursor = conn.cursor()
    stats = {
        "band_member": 0,
        "member_of": 0,
        "artist_label": 0,
        "artist_event": 0
    }

    cursor.execute("""
        SELECT artist_mbid, artist_name, relations
        FROM mb_artists
        WHERE relations IS NOT NULL AND relations != '{}'
    """)

    artist_edges = []
    artist_label_edges = []
    artist_event_edges = []

    for artist_mbid, artist_name, relations_json in cursor:
        if not relations_json:
            continue

        try:
            relations = json.loads(relations_json)
        except json.JSONDecodeError:
            continue

        # Band members (this artist has these members)
        for member in relations.get("band_members", []):
            if member.get("mbid"):
                artist_edges.append((
                    artist_mbid,
                    member["mbid"],
                    "band_member",
                    artist_name,
                    member.get("name"),
                    member.get("type"),
                    json.dumps(member.get("attributes", [])) if member.get("attributes") else None,
                    member.get("begin"),
                    member.get("end")
                ))
                stats["band_member"] += 1

        # Member of bands (this artist is member of these groups)
        for band in relations.get("member_of_bands", []):
            if band.get("mbid"):
                artist_edges.append((
                    artist_mbid,
                    band["mbid"],
                    "member_of",
                    artist_name,
                    band.get("name"),
                    band.get("type"),
                    json.dumps(band.get("attributes", [])) if band.get("attributes") else None,
                    band.get("begin"),
                    band.get("end")
                ))
                stats["member_of"] += 1

        # Label relations
        for label_rel in relations.get("label_relations", []):
            if label_rel.get("mbid"):
                artist_label_edges.append((
                    artist_mbid,
                    label_rel["mbid"],
                    label_rel.get("type", "unknown"),
                    artist_name,
                    label_rel.get("name"),
                    label_rel.get("begin"),
                    label_rel.get("end")
                ))
                stats["artist_label"] += 1

        # Event relations
        for event in relations.get("events", []):
            if event.get("id"):
                artist_event_edges.append((
                    artist_mbid,
                    event["id"],
                    event.get("relation_type", "performer"),
                    artist_name,
                    event.get("name"),
                    event.get("type"),
                    event.get("date")
                ))
                stats["artist_event"] += 1

    # Bulk insert artist edges
    cursor.executemany("""
        INSERT OR REPLACE INTO artist_edges
        (source_mbid, target_mbid, relationship_type, source_name, target_name,
         target_type, attributes, begin_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, artist_edges)

    # Bulk insert artist-label edges
    cursor.executemany("""
        INSERT OR REPLACE INTO artist_label_edges
        (artist_mbid, label_mbid, relationship_type, artist_name, label_name,
         begin_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, artist_label_edges)

    # Bulk insert artist-event edges
    cursor.executemany("""
        INSERT OR REPLACE INTO artist_event_edges
        (artist_mbid, event_id, relationship_type, artist_name, event_name,
         event_type, event_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, artist_event_edges)

    conn.commit()
    return stats


def extract_label_edges(conn: sqlite3.Connection) -> dict:
    """Extract label-to-label edges from mb_labels."""
    cursor = conn.cursor()
    stats = {"label_label": 0}

    cursor.execute("""
        SELECT label_mbid, label_name, relations
        FROM mb_labels
        WHERE relations IS NOT NULL AND relations != '{}'
    """)

    label_edges = []

    for label_mbid, label_name, relations_json in cursor:
        if not relations_json:
            continue

        try:
            relations = json.loads(relations_json)
        except json.JSONDecodeError:
            continue

        # Label-to-label relations
        for label_rel in relations.get("label_relations", []):
            if label_rel.get("mbid"):
                label_edges.append((
                    label_mbid,
                    label_rel["mbid"],
                    label_rel.get("type", "unknown"),
                    label_name,
                    label_rel.get("name"),
                    label_rel.get("begin"),
                    label_rel.get("end")
                ))
                stats["label_label"] += 1

    # Bulk insert
    cursor.executemany("""
        INSERT OR REPLACE INTO label_edges
        (source_mbid, target_mbid, relationship_type, source_name, target_name,
         begin_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, label_edges)

    conn.commit()
    return stats


def print_stats(conn: sqlite3.Connection):
    """Print final statistics."""
    cursor = conn.cursor()

    print("\n" + "="*60)
    print("EDGE TABLE STATISTICS")
    print("="*60)

    # Artist edges
    cursor.execute("SELECT COUNT(*) FROM artist_edges")
    print(f"\nartist_edges: {cursor.fetchone()[0]:,} total")
    cursor.execute("""
        SELECT relationship_type, COUNT(*)
        FROM artist_edges
        GROUP BY relationship_type
    """)
    for rel_type, count in cursor:
        print(f"  - {rel_type}: {count:,}")

    # Label edges
    cursor.execute("SELECT COUNT(*) FROM label_edges")
    print(f"\nlabel_edges: {cursor.fetchone()[0]:,} total")
    cursor.execute("""
        SELECT relationship_type, COUNT(*)
        FROM label_edges
        GROUP BY relationship_type
    """)
    for rel_type, count in cursor:
        print(f"  - {rel_type}: {count:,}")

    # Artist-label edges
    cursor.execute("SELECT COUNT(*) FROM artist_label_edges")
    print(f"\nartist_label_edges: {cursor.fetchone()[0]:,} total")

    # Artist-event edges
    cursor.execute("SELECT COUNT(*) FROM artist_event_edges")
    print(f"\nartist_event_edges: {cursor.fetchone()[0]:,} total")

    # Recording-work links (from earlier)
    cursor.execute("SELECT COUNT(*) FROM recording_work_links")
    print(f"\nrecording_work_links: {cursor.fetchone()[0]:,} total")

    print("\n" + "="*60)
    print("SAMPLE QUERIES")
    print("="*60)

    # Sample: Find band members
    print("\n--- Radiohead band members ---")
    cursor.execute("""
        SELECT target_name, attributes
        FROM artist_edges
        WHERE source_name LIKE '%Radiohead%' AND relationship_type = 'band_member'
        LIMIT 5
    """)
    for name, attrs in cursor:
        print(f"  {name}: {attrs}")

    # Sample: Find labelmates
    print("\n--- Sub Pop labelmates (sample) ---")
    cursor.execute("""
        SELECT DISTINCT a1.artist_name, a2.artist_name, ale1.label_name
        FROM artist_label_edges ale1
        JOIN artist_label_edges ale2 ON ale1.label_mbid = ale2.label_mbid
        JOIN mb_artists a1 ON ale1.artist_mbid = a1.artist_mbid
        JOIN mb_artists a2 ON ale2.artist_mbid = a2.artist_mbid
        WHERE ale1.label_name LIKE '%Sub Pop%'
          AND ale1.artist_mbid < ale2.artist_mbid
        LIMIT 5
    """)
    for a1, a2, label in cursor:
        print(f"  {a1} ↔ {a2} (via {label})")

    # Sample: Label hierarchy
    print("\n--- Label ownership hierarchy (sample) ---")
    cursor.execute("""
        SELECT source_name, relationship_type, target_name
        FROM label_edges
        WHERE relationship_type = 'label ownership'
        LIMIT 5
    """)
    for source, rel, target in cursor:
        print(f"  {source} → owns → {target}")


def main():
    parser = argparse.ArgumentParser(description="Materialize graph edge tables")
    parser.add_argument("--db-path", required=True, help="Path to SQLite database")
    args = parser.parse_args()

    print(f"[{datetime.now().isoformat()}] Starting edge materialization")
    print(f"Database: {args.db_path}")

    conn = sqlite3.connect(args.db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    try:
        # Step 1: Create tables
        create_tables(conn)

        # Step 2: Extract artist edges
        print("\nExtracting artist edges...")
        artist_stats = extract_artist_edges(conn)
        print(f"  ✓ band_member: {artist_stats['band_member']:,}")
        print(f"  ✓ member_of: {artist_stats['member_of']:,}")
        print(f"  ✓ artist_label: {artist_stats['artist_label']:,}")
        print(f"  ✓ artist_event: {artist_stats['artist_event']:,}")

        # Step 3: Extract label edges
        print("\nExtracting label edges...")
        label_stats = extract_label_edges(conn)
        print(f"  ✓ label_label: {label_stats['label_label']:,}")

        # Step 4: Print stats
        print_stats(conn)

        print(f"\n[{datetime.now().isoformat()}] Done!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
