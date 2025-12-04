#!/usr/bin/env python3
"""
Materialize place and area edge tables from MusicBrainz data.

Creates:
- artist_area_edges: Artist origin/hometown connections
- area_hierarchy: Geographic containment (Seattle → Washington → USA)
- place_recording_edges: Where recordings were made (studio/venue)
- artist_place_edges: Artists who recorded at specific places

Usage:
    python scripts/materialize_place_edges.py --db-path data/music_kb.sqlite
"""

import argparse
import json
import sqlite3
from datetime import datetime


def create_tables(conn: sqlite3.Connection):
    """Create place/area edge tables."""
    cursor = conn.cursor()

    # Artist-to-Area edges (where artists are from)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS artist_area_edges (
            artist_mbid TEXT NOT NULL,
            area_mbid TEXT NOT NULL,
            relationship_type TEXT NOT NULL,  -- 'origin', 'born_in', 'based_in'
            artist_name TEXT,
            area_name TEXT,
            area_type TEXT,  -- City, Country, Subdivision
            PRIMARY KEY (artist_mbid, area_mbid, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aae_artist ON artist_area_edges(artist_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aae_area ON artist_area_edges(area_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_aae_area_name ON artist_area_edges(area_name)")

    # Area hierarchy (containment relationships)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS area_hierarchy (
            child_mbid TEXT NOT NULL,
            parent_mbid TEXT NOT NULL,
            child_name TEXT,
            parent_name TEXT,
            child_type TEXT,
            parent_type TEXT,
            depth INTEGER DEFAULT 1,
            PRIMARY KEY (child_mbid, parent_mbid)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ah_child ON area_hierarchy(child_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ah_parent ON area_hierarchy(parent_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ah_child_name ON area_hierarchy(child_name)")

    # Place-to-Recording edges (where things were recorded)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS place_recording_edges (
            place_mbid TEXT NOT NULL,
            recording_mbid TEXT NOT NULL,
            relationship_type TEXT NOT NULL,  -- 'recorded at', 'mixed at', 'mastered at'
            place_name TEXT,
            place_type TEXT,  -- Studio, Venue
            area_name TEXT,
            recording_title TEXT,
            begin_date TEXT,
            end_date TEXT,
            PRIMARY KEY (place_mbid, recording_mbid, relationship_type)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pre_place ON place_recording_edges(place_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pre_recording ON place_recording_edges(recording_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pre_area ON place_recording_edges(area_name)")

    conn.commit()
    print("✓ Created place/area edge tables")


def build_artist_area_edges(conn: sqlite3.Connection) -> int:
    """Build artist-to-area edges from mb_artists.begin_area."""
    cursor = conn.cursor()

    # First, build a lookup of area names to MBIDs
    print("  Building area name lookup...")
    cursor.execute("SELECT area_mbid, name, area_type FROM mb_areas")
    area_lookup = {row[1]: (row[0], row[2]) for row in cursor.fetchall()}

    # Get artists with begin_area
    cursor.execute("""
        SELECT artist_mbid, artist_name, begin_area, country
        FROM mb_artists
        WHERE begin_area IS NOT NULL OR country IS NOT NULL
    """)

    edges = []
    for artist_mbid, artist_name, begin_area, country in cursor:
        # Origin from begin_area (more specific - city/region)
        if begin_area and begin_area in area_lookup:
            area_mbid, area_type = area_lookup[begin_area]
            edges.append((
                artist_mbid, area_mbid, 'origin',
                artist_name, begin_area, area_type
            ))

        # Country (if different from begin_area)
        if country and country in area_lookup:
            area_mbid, area_type = area_lookup[country]
            # Only add if different from begin_area
            if not begin_area or country != begin_area:
                edges.append((
                    artist_mbid, area_mbid, 'country',
                    artist_name, country, area_type
                ))

    # Bulk insert
    cursor.executemany("""
        INSERT OR REPLACE INTO artist_area_edges
        (artist_mbid, area_mbid, relationship_type, artist_name, area_name, area_type)
        VALUES (?, ?, ?, ?, ?, ?)
    """, edges)

    conn.commit()
    return len(edges)


def build_area_hierarchy(conn: sqlite3.Connection) -> int:
    """Build area hierarchy from mb_areas.relations 'part of'."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT area_mbid, name, area_type, relations
        FROM mb_areas
        WHERE relations IS NOT NULL AND relations != '[]'
    """)

    edges = []
    for area_mbid, area_name, area_type, relations_json in cursor:
        if not relations_json:
            continue

        try:
            relations = json.loads(relations_json)
        except json.JSONDecodeError:
            continue

        for rel in relations:
            # Look for "part of" relations
            if rel.get('type') == 'part of' and 'area' in rel:
                parent = rel['area']
                parent_mbid = parent.get('id')
                if parent_mbid:
                    edges.append((
                        area_mbid,
                        parent_mbid,
                        area_name,
                        parent.get('name'),
                        area_type,
                        parent.get('type'),
                        1  # Direct parent = depth 1
                    ))

    # Bulk insert
    cursor.executemany("""
        INSERT OR REPLACE INTO area_hierarchy
        (child_mbid, parent_mbid, child_name, parent_name, child_type, parent_type, depth)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, edges)

    conn.commit()
    return len(edges)


def build_place_recording_edges(conn: sqlite3.Connection) -> int:
    """Build place-to-recording edges from mb_places.relations."""
    cursor = conn.cursor()

    cursor.execute("""
        SELECT place_mbid, name, place_type, area_name, relations
        FROM mb_places
        WHERE relations IS NOT NULL AND relations != '[]'
    """)

    edges = []
    recording_types = {'recorded at', 'mixed at', 'mastered at', 'engineered at'}

    for place_mbid, place_name, place_type, area_name, relations_json in cursor:
        if not relations_json:
            continue

        try:
            relations = json.loads(relations_json)
        except json.JSONDecodeError:
            continue

        for rel in relations:
            rel_type = rel.get('type', '')
            if rel_type in recording_types and 'recording' in rel:
                recording = rel['recording']
                recording_mbid = recording.get('id')
                if recording_mbid:
                    edges.append((
                        place_mbid,
                        recording_mbid,
                        rel_type,
                        place_name,
                        place_type,
                        area_name,
                        recording.get('title'),
                        rel.get('begin'),
                        rel.get('end')
                    ))

    # Bulk insert
    cursor.executemany("""
        INSERT OR REPLACE INTO place_recording_edges
        (place_mbid, recording_mbid, relationship_type, place_name, place_type,
         area_name, recording_title, begin_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, edges)

    conn.commit()
    return len(edges)


def print_stats(conn: sqlite3.Connection):
    """Print final statistics."""
    cursor = conn.cursor()

    print("\n" + "="*60)
    print("PLACE/AREA EDGE TABLE STATISTICS")
    print("="*60)

    # Artist-area edges
    cursor.execute("SELECT COUNT(*) FROM artist_area_edges")
    print(f"\nartist_area_edges: {cursor.fetchone()[0]:,} total")
    cursor.execute("""
        SELECT relationship_type, COUNT(*)
        FROM artist_area_edges
        GROUP BY relationship_type
    """)
    for rel_type, count in cursor:
        print(f"  - {rel_type}: {count:,}")

    # Area hierarchy
    cursor.execute("SELECT COUNT(*) FROM area_hierarchy")
    print(f"\narea_hierarchy: {cursor.fetchone()[0]:,} total")

    # Place-recording edges
    cursor.execute("SELECT COUNT(*) FROM place_recording_edges")
    print(f"\nplace_recording_edges: {cursor.fetchone()[0]:,} total")
    cursor.execute("""
        SELECT relationship_type, COUNT(*)
        FROM place_recording_edges
        GROUP BY relationship_type
        ORDER BY COUNT(*) DESC
    """)
    for rel_type, count in cursor:
        print(f"  - {rel_type}: {count:,}")

    # Sample queries
    print("\n" + "="*60)
    print("SAMPLE QUERIES")
    print("="*60)

    # Artists from Seattle
    print("\n--- Artists from Seattle ---")
    cursor.execute("""
        SELECT artist_name
        FROM artist_area_edges
        WHERE area_name = 'Seattle'
        ORDER BY artist_name
        LIMIT 10
    """)
    for row in cursor:
        print(f"  {row[0]}")

    # Seattle's parent areas
    print("\n--- Seattle area hierarchy ---")
    cursor.execute("""
        SELECT child_name, child_type, parent_name, parent_type
        FROM area_hierarchy
        WHERE child_name = 'Seattle'
    """)
    for row in cursor:
        print(f"  {row[0]} ({row[1]}) → {row[2]} ({row[3]})")

    # Top studios by recording count
    print("\n--- Top Recording Studios ---")
    cursor.execute("""
        SELECT place_name, area_name, COUNT(*) as cnt
        FROM place_recording_edges
        WHERE place_type = 'Studio'
        GROUP BY place_mbid
        ORDER BY cnt DESC
        LIMIT 10
    """)
    for place, area, count in cursor:
        print(f"  {place} ({area}): {count:,} recordings")


def main():
    parser = argparse.ArgumentParser(description="Materialize place/area edge tables")
    parser.add_argument("--db-path", required=True, help="Path to SQLite database")
    args = parser.parse_args()

    print(f"[{datetime.now().isoformat()}] Starting place/area edge materialization")
    print(f"Database: {args.db_path}")

    conn = sqlite3.connect(args.db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    try:
        # Step 1: Create tables
        create_tables(conn)

        # Step 2: Build artist-area edges
        print("\nBuilding artist-area edges...")
        count = build_artist_area_edges(conn)
        print(f"  ✓ {count:,} artist-area edges")

        # Step 3: Build area hierarchy
        print("\nBuilding area hierarchy...")
        count = build_area_hierarchy(conn)
        print(f"  ✓ {count:,} hierarchy edges")

        # Step 4: Build place-recording edges
        print("\nBuilding place-recording edges...")
        count = build_place_recording_edges(conn)
        print(f"  ✓ {count:,} place-recording edges")

        # Step 5: Print stats
        print_stats(conn)

        print(f"\n[{datetime.now().isoformat()}] Done!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
