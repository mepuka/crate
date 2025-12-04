#!/usr/bin/env python3
"""
Import MusicBrainz reference data into new tables.

This script imports MB dumps for entities we don't already have in our database:
- events: concerts, festivals, etc.
- places: venues with coordinates
- areas: geographic regions
- works: musical compositions
- series: tours, festivals, etc.

Unlike import_mb_dumps.py which enriches existing data, this script populates
new reference tables that enable graph queries and location-based discovery.

Usage:
    python scripts/import_mb_reference_data.py --db-path data/music_kb.sqlite --dumps-dir /path/to/dumps
"""

import argparse
import json
import lzma
import sqlite3
import tarfile
from pathlib import Path
from datetime import datetime
from typing import Iterator, Dict, Any
import sys

def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def stream_jsonl_from_tar(tar_path: Path, member_name: str) -> Iterator[Dict[str, Any]]:
    """Stream JSON lines from a tar.xz file without extracting to disk."""
    with tarfile.open(tar_path, 'r:xz') as tar:
        for member in tar.getmembers():
            if member.name == member_name:
                f = tar.extractfile(member)
                if f:
                    for line in f:
                        try:
                            yield json.loads(line.decode('utf-8'))
                        except json.JSONDecodeError:
                            continue
                break

def create_tables(conn: sqlite3.Connection):
    """Create reference tables if they don't exist."""
    cursor = conn.cursor()

    # Events table - concerts, festivals, etc.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_events (
            event_mbid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            event_type TEXT,
            date_begin TEXT,
            date_end TEXT,
            time TEXT,
            cancelled INTEGER DEFAULT 0,
            setlist TEXT,
            disambiguation TEXT,
            relations TEXT,
            genres TEXT,
            tags TEXT,
            aliases TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Places table - venues with coordinates
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_places (
            place_mbid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            place_type TEXT,
            address TEXT,
            latitude REAL,
            longitude REAL,
            area_mbid TEXT,
            area_name TEXT,
            date_begin TEXT,
            date_end TEXT,
            disambiguation TEXT,
            relations TEXT,
            genres TEXT,
            tags TEXT,
            aliases TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Areas table - geographic regions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_areas (
            area_mbid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_name TEXT,
            area_type TEXT,
            date_begin TEXT,
            date_end TEXT,
            disambiguation TEXT,
            relations TEXT,
            genres TEXT,
            tags TEXT,
            aliases TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Works table - musical compositions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_works (
            work_mbid TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            work_type TEXT,
            language TEXT,
            languages TEXT,
            iswcs TEXT,
            attributes TEXT,
            disambiguation TEXT,
            relations TEXT,
            genres TEXT,
            tags TEXT,
            aliases TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Series table - tours, festivals, etc.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_series (
            series_mbid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            series_type TEXT,
            disambiguation TEXT,
            relations TEXT,
            genres TEXT,
            tags TEXT,
            aliases TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create indexes for common lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON mb_events(event_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_date ON mb_events(date_begin)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_places_type ON mb_places(place_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_places_area ON mb_places(area_mbid)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_places_coords ON mb_places(latitude, longitude)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_areas_type ON mb_areas(area_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_works_type ON mb_works(work_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_series_type ON mb_series(series_type)")

    conn.commit()
    log("Reference tables created/verified")

def import_events(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import events from MB dump."""
    log(f"Starting event import from {tar_path}")

    cursor = conn.cursor()
    inserted = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/event'):
        processed += 1

        lifespan = entity.get('life-span') or {}

        batch.append((
            entity.get('id'),
            entity.get('name'),
            entity.get('type'),
            lifespan.get('begin'),
            lifespan.get('end'),
            entity.get('time'),
            1 if entity.get('cancelled') else 0,
            entity.get('setlist'),
            entity.get('disambiguation'),
            json.dumps(entity.get('relations', [])),
            json.dumps([g.get('name') for g in entity.get('genres', [])]),
            json.dumps([t.get('name') for t in entity.get('tags', [])]),
            json.dumps([a.get('name') for a in entity.get('aliases', [])]),
        ))

        if len(batch) >= batch_size:
            cursor.executemany("""
                INSERT OR REPLACE INTO mb_events
                (event_mbid, name, event_type, date_begin, date_end, time, cancelled,
                 setlist, disambiguation, relations, genres, tags, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            conn.commit()
            inserted += len(batch)
            log(f"Events: processed {processed:,}, inserted {inserted:,}")
            batch = []

    if batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO mb_events
            (event_mbid, name, event_type, date_begin, date_end, time, cancelled,
             setlist, disambiguation, relations, genres, tags, aliases)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, batch)
        conn.commit()
        inserted += len(batch)

    log(f"Event import complete: {inserted:,} inserted out of {processed:,}")
    return inserted

def import_places(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import places from MB dump."""
    log(f"Starting place import from {tar_path}")

    cursor = conn.cursor()
    inserted = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/place'):
        processed += 1

        lifespan = entity.get('life-span') or {}
        coords = entity.get('coordinates') or {}
        area = entity.get('area') or {}

        batch.append((
            entity.get('id'),
            entity.get('name'),
            entity.get('type'),
            entity.get('address'),
            coords.get('latitude') if coords else None,
            coords.get('longitude') if coords else None,
            area.get('id') if area else None,
            area.get('name') if area else None,
            lifespan.get('begin'),
            lifespan.get('end'),
            entity.get('disambiguation'),
            json.dumps(entity.get('relations', [])),
            json.dumps([g.get('name') for g in entity.get('genres', [])]),
            json.dumps([t.get('name') for t in entity.get('tags', [])]),
            json.dumps([a.get('name') for a in entity.get('aliases', [])]),
        ))

        if len(batch) >= batch_size:
            cursor.executemany("""
                INSERT OR REPLACE INTO mb_places
                (place_mbid, name, place_type, address, latitude, longitude,
                 area_mbid, area_name, date_begin, date_end, disambiguation,
                 relations, genres, tags, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            conn.commit()
            inserted += len(batch)
            log(f"Places: processed {processed:,}, inserted {inserted:,}")
            batch = []

    if batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO mb_places
            (place_mbid, name, place_type, address, latitude, longitude,
             area_mbid, area_name, date_begin, date_end, disambiguation,
             relations, genres, tags, aliases)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, batch)
        conn.commit()
        inserted += len(batch)

    log(f"Place import complete: {inserted:,} inserted out of {processed:,}")
    return inserted

def import_areas(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import areas from MB dump."""
    log(f"Starting area import from {tar_path}")

    cursor = conn.cursor()
    inserted = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/area'):
        processed += 1

        lifespan = entity.get('life-span') or {}

        batch.append((
            entity.get('id'),
            entity.get('name'),
            entity.get('sort-name'),
            entity.get('type'),
            lifespan.get('begin'),
            lifespan.get('end'),
            entity.get('disambiguation'),
            json.dumps(entity.get('relations', [])),
            json.dumps([g.get('name') for g in entity.get('genres', [])]),
            json.dumps([t.get('name') for t in entity.get('tags', [])]),
            json.dumps([a.get('name') for a in entity.get('aliases', [])]),
        ))

        if len(batch) >= batch_size:
            cursor.executemany("""
                INSERT OR REPLACE INTO mb_areas
                (area_mbid, name, sort_name, area_type, date_begin, date_end,
                 disambiguation, relations, genres, tags, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            conn.commit()
            inserted += len(batch)
            log(f"Areas: processed {processed:,}, inserted {inserted:,}")
            batch = []

    if batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO mb_areas
            (area_mbid, name, sort_name, area_type, date_begin, date_end,
             disambiguation, relations, genres, tags, aliases)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, batch)
        conn.commit()
        inserted += len(batch)

    log(f"Area import complete: {inserted:,} inserted out of {processed:,}")
    return inserted

def import_works(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import works from MB dump."""
    log(f"Starting work import from {tar_path}")

    cursor = conn.cursor()
    inserted = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/work'):
        processed += 1

        batch.append((
            entity.get('id'),
            entity.get('title'),
            entity.get('type'),
            entity.get('language'),
            json.dumps(entity.get('languages', [])),
            json.dumps(entity.get('iswcs', [])),
            json.dumps(entity.get('attributes', [])),
            entity.get('disambiguation'),
            json.dumps(entity.get('relations', [])),
            json.dumps([g.get('name') for g in entity.get('genres', [])]),
            json.dumps([t.get('name') for t in entity.get('tags', [])]),
            json.dumps([a.get('name') for a in entity.get('aliases', [])]),
        ))

        if len(batch) >= batch_size:
            cursor.executemany("""
                INSERT OR REPLACE INTO mb_works
                (work_mbid, title, work_type, language, languages, iswcs,
                 attributes, disambiguation, relations, genres, tags, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            conn.commit()
            inserted += len(batch)
            log(f"Works: processed {processed:,}, inserted {inserted:,}")
            batch = []

    if batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO mb_works
            (work_mbid, title, work_type, language, languages, iswcs,
             attributes, disambiguation, relations, genres, tags, aliases)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, batch)
        conn.commit()
        inserted += len(batch)

    log(f"Work import complete: {inserted:,} inserted out of {processed:,}")
    return inserted

def import_series(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import series from MB dump."""
    log(f"Starting series import from {tar_path}")

    cursor = conn.cursor()
    inserted = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/series'):
        processed += 1

        batch.append((
            entity.get('id'),
            entity.get('name'),
            entity.get('type'),
            entity.get('disambiguation'),
            json.dumps(entity.get('relations', [])),
            json.dumps([g.get('name') for g in entity.get('genres', [])]),
            json.dumps([t.get('name') for t in entity.get('tags', [])]),
            json.dumps([a.get('name') for a in entity.get('aliases', [])]),
        ))

        if len(batch) >= batch_size:
            cursor.executemany("""
                INSERT OR REPLACE INTO mb_series
                (series_mbid, name, series_type, disambiguation, relations, genres, tags, aliases)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            conn.commit()
            inserted += len(batch)
            log(f"Series: processed {processed:,}, inserted {inserted:,}")
            batch = []

    if batch:
        cursor.executemany("""
            INSERT OR REPLACE INTO mb_series
            (series_mbid, name, series_type, disambiguation, relations, genres, tags, aliases)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, batch)
        conn.commit()
        inserted += len(batch)

    log(f"Series import complete: {inserted:,} inserted out of {processed:,}")
    return inserted

def main():
    parser = argparse.ArgumentParser(description='Import MusicBrainz reference data')
    parser.add_argument('--db-path', required=True, help='Path to SQLite database')
    parser.add_argument('--dumps-dir', required=True, help='Directory containing MB dump files')
    parser.add_argument('--entity-type',
                        choices=['event', 'place', 'area', 'work', 'series', 'all'],
                        default='all', help='Entity type to import')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for inserts')

    args = parser.parse_args()

    db_path = Path(args.db_path)
    dumps_dir = Path(args.dumps_dir)

    if not db_path.exists():
        log(f"Error: Database not found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))

    # Create tables first
    create_tables(conn)

    results = {}

    if args.entity_type in ['event', 'all']:
        event_tar = dumps_dir / 'event.tar.xz'
        if event_tar.exists():
            results['events'] = import_events(conn, event_tar, args.batch_size)
        else:
            log(f"Warning: {event_tar} not found, skipping events")

    if args.entity_type in ['place', 'all']:
        place_tar = dumps_dir / 'place.tar.xz'
        if place_tar.exists():
            results['places'] = import_places(conn, place_tar, args.batch_size)
        else:
            log(f"Warning: {place_tar} not found, skipping places")

    if args.entity_type in ['area', 'all']:
        area_tar = dumps_dir / 'area.tar.xz'
        if area_tar.exists():
            results['areas'] = import_areas(conn, area_tar, args.batch_size)
        else:
            log(f"Warning: {area_tar} not found, skipping areas")

    if args.entity_type in ['work', 'all']:
        work_tar = dumps_dir / 'work.tar.xz'
        if work_tar.exists():
            results['works'] = import_works(conn, work_tar, args.batch_size)
        else:
            log(f"Warning: {work_tar} not found, skipping works")

    if args.entity_type in ['series', 'all']:
        series_tar = dumps_dir / 'series.tar.xz'
        if series_tar.exists():
            results['series'] = import_series(conn, series_tar, args.batch_size)
        else:
            log(f"Warning: {series_tar} not found, skipping series")

    conn.close()

    log("=" * 50)
    log("Import Summary:")
    for entity_type, count in results.items():
        log(f"  {entity_type}: {count:,} inserted")
    log("=" * 50)

if __name__ == '__main__':
    main()
