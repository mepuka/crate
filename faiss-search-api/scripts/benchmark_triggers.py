#!/usr/bin/env python3
"""
Performance Benchmark for MusicBrainz Canonical Table Triggers

This script benchmarks the performance impact of database triggers that maintain
the MusicBrainz canonical tables (mb_artists, mb_recordings, mb_tracks, mb_releases,
mb_release_groups, mb_labels) when bulk inserting plays.

The triggers are defined in:
- packages/server/src/knowledge_base/migrations/0029_create_mb_canonical_triggers.ts

Performance Baselines:
- Target: <5 seconds for 10k inserts (>2000 inserts/second)
- Acceptable: <10 seconds for 10k inserts (>1000 inserts/second)
- Warning: >10 seconds indicates potential performance issues

Trigger Operations per Insert:
- 6 INSERT or UPDATE operations (artists, recordings, tracks, releases, release_groups, labels)
- JSON array parsing for artist_ids and label_ids
- MIN() calculations for first_seen preservation
- COALESCE() for name/title updates
- Multiple conditional checks (IS NOT NULL, != '')

Memory Considerations:
- Each canonical table grows with unique MusicBrainz entities
- Artist and label tables handle JSON array expansion
- Expected memory growth is linear with unique entities

Usage:
    python scripts/benchmark_triggers.py [--db-path PATH] [--count N]

Examples:
    # Benchmark with default settings (10k inserts)
    python scripts/benchmark_triggers.py

    # Benchmark with custom insert count
    python scripts/benchmark_triggers.py --count 5000

    # Use specific database path
    python scripts/benchmark_triggers.py --db-path /tmp/benchmark.db
"""

import sqlite3
import time
import argparse
import sys
import os
import tracemalloc
from pathlib import Path
from datetime import datetime, timedelta
from uuid import uuid4
import json
import random

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))


# ============================================================================
# Configuration
# ============================================================================

DEFAULT_INSERT_COUNT = 10000
DEFAULT_DB_PATH = ":memory:"  # Use in-memory database for clean benchmarks

# Sample data pools for realistic test data
ARTISTS = [
    "The Beatles", "Radiohead", "Pink Floyd", "Led Zeppelin", "The Velvet Underground",
    "Sonic Youth", "My Bloody Valentine", "Nirvana", "Pixies", "Joy Division",
    "The Smiths", "David Bowie", "Talking Heads", "The Cure", "R.E.M.",
    "Pavement", "Arcade Fire", "Modest Mouse", "Neutral Milk Hotel", "Sufjan Stevens"
]

SONGS = [
    "Song One", "Track Two", "Number Three", "The Fourth", "Five",
    "Sixth Sense", "Lucky Seven", "Eight Days", "Nine Lives", "Perfect Ten",
    "Eleven Eleven", "Twelve Bar", "Thirteen", "Fourteen Candles", "Fifteen Minutes",
    "Sweet Sixteen", "Seventeen Seconds", "Eighteen Wheeler", "Nineteen", "Twenty Twenty"
]

ALBUMS = [
    "Abbey Road", "OK Computer", "The Dark Side of the Moon", "Led Zeppelin IV", "The Velvet Underground & Nico",
    "Daydream Nation", "Loveless", "Nevermind", "Doolittle", "Unknown Pleasures",
    "The Queen Is Dead", "The Rise and Fall of Ziggy Stardust", "Remain in Light", "Disintegration", "Automatic for the People",
    "Slanted and Enchanted", "Funeral", "The Moon & Antarctica", "In the Aeroplane Over the Sea", "Illinois"
]

LABELS = [
    "Sub Pop", "4AD", "Matador", "Merge", "Domino",
    "XL Recordings", "Warp", "Stones Throw", "Sacred Bones", "Captured Tracks",
    "Jagjaguwar", "Thrill Jockey", "Touch and Go", "SST", "Factory"
]


# ============================================================================
# Database Setup
# ============================================================================

def create_schema(conn: sqlite3.Connection):
    """Create the complete database schema including fact_plays and canonical tables."""
    cursor = conn.cursor()

    # Create fact_plays table (from 0003_add_plays_table.ts)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fact_plays (
            id INTEGER PRIMARY KEY,
            airdate TEXT NOT NULL,
            show INTEGER NOT NULL,
            show_uri TEXT NOT NULL,
            image_uri TEXT,
            thumbnail_uri TEXT,
            song TEXT,
            track_id TEXT,
            recording_id TEXT,
            artist TEXT,
            artist_ids TEXT,
            album TEXT,
            release_id TEXT,
            release_group_id TEXT,
            labels TEXT,
            label_ids TEXT,
            release_date TEXT,
            rotation_status TEXT,
            is_local INTEGER CHECK(is_local IN (0, 1)),
            is_request INTEGER CHECK(is_request IN (0, 1)),
            is_live INTEGER CHECK(is_live IN (0, 1)),
            comment TEXT,
            play_type TEXT CHECK(play_type IN ('trackplay', 'nontrackplay')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # Create MB canonical tables (from 0028_create_mb_canonical_tables.ts)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_artists (
            artist_mbid TEXT PRIMARY KEY NOT NULL,
            artist_name TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_recordings (
            recording_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_tracks (
            track_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_releases (
            release_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            release_date TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_release_groups (
            release_group_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mb_labels (
            label_mbid TEXT PRIMARY KEY NOT NULL,
            label_name TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # Create triggers (from 0029_create_mb_canonical_triggers.ts)
    create_triggers(cursor)

    conn.commit()


def create_triggers(cursor: sqlite3.Cursor):
    """Create the MusicBrainz canonical table triggers."""

    # INSERT trigger
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS mb_canonical_insert_trigger
        AFTER INSERT ON fact_plays
        BEGIN
          -- Update Artists (from artist_ids JSON array)
          INSERT INTO mb_artists (artist_mbid, artist_name, first_seen, last_seen, play_count)
          SELECT
            artist_ids.value,
            NEW.artist,
            NEW.airdate,
            NEW.airdate,
            1
          FROM json_each(NEW.artist_ids) AS artist_ids
          WHERE artist_ids.value IS NOT NULL AND artist_ids.value != ''
          ON CONFLICT(artist_mbid) DO UPDATE SET
            artist_name = COALESCE(excluded.artist_name, mb_artists.artist_name),
            first_seen = MIN(mb_artists.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_artists.play_count + 1,
            updated_at = datetime('now');

          -- Update Recording
          INSERT INTO mb_recordings (recording_mbid, song_title, first_seen, last_seen, play_count)
          SELECT NEW.recording_id, NEW.song, NEW.airdate, NEW.airdate, 1
          WHERE NEW.recording_id IS NOT NULL AND NEW.recording_id != ''
          ON CONFLICT(recording_mbid) DO UPDATE SET
            song_title = COALESCE(excluded.song_title, mb_recordings.song_title),
            first_seen = MIN(mb_recordings.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_recordings.play_count + 1,
            updated_at = datetime('now');

          -- Update Track
          INSERT INTO mb_tracks (track_mbid, song_title, first_seen, last_seen, play_count)
          SELECT NEW.track_id, NEW.song, NEW.airdate, NEW.airdate, 1
          WHERE NEW.track_id IS NOT NULL AND NEW.track_id != ''
          ON CONFLICT(track_mbid) DO UPDATE SET
            song_title = COALESCE(excluded.song_title, mb_tracks.song_title),
            first_seen = MIN(mb_tracks.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_tracks.play_count + 1,
            updated_at = datetime('now');

          -- Update Release
          INSERT INTO mb_releases (release_mbid, album_title, release_date, first_seen, last_seen, play_count)
          SELECT NEW.release_id, NEW.album, NEW.release_date, NEW.airdate, NEW.airdate, 1
          WHERE NEW.release_id IS NOT NULL AND NEW.release_id != ''
          ON CONFLICT(release_mbid) DO UPDATE SET
            album_title = COALESCE(excluded.album_title, mb_releases.album_title),
            release_date = COALESCE(excluded.release_date, mb_releases.release_date),
            first_seen = MIN(mb_releases.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_releases.play_count + 1,
            updated_at = datetime('now');

          -- Update Release Group
          INSERT INTO mb_release_groups (release_group_mbid, album_title, first_seen, last_seen, play_count)
          SELECT NEW.release_group_id, NEW.album, NEW.airdate, NEW.airdate, 1
          WHERE NEW.release_group_id IS NOT NULL AND NEW.release_group_id != ''
          ON CONFLICT(release_group_mbid) DO UPDATE SET
            album_title = COALESCE(excluded.album_title, mb_release_groups.album_title),
            first_seen = MIN(mb_release_groups.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_release_groups.play_count + 1,
            updated_at = datetime('now');

          -- Update Labels (from label_ids JSON array)
          INSERT INTO mb_labels (label_mbid, label_name, first_seen, last_seen, play_count)
          SELECT
            label_ids.value,
            (SELECT value FROM json_each(NEW.labels) WHERE json_each.key = label_ids.key),
            NEW.airdate,
            NEW.airdate,
            1
          FROM json_each(NEW.label_ids) AS label_ids
          WHERE label_ids.value IS NOT NULL AND label_ids.value != ''
          ON CONFLICT(label_mbid) DO UPDATE SET
            label_name = COALESCE(excluded.label_name, mb_labels.label_name),
            first_seen = MIN(mb_labels.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_labels.play_count + 1,
            updated_at = datetime('now');
        END;
    """)

    # DELETE trigger
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS mb_canonical_delete_trigger
        AFTER DELETE ON fact_plays
        BEGIN
          -- Decrement Artists
          UPDATE mb_artists
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE artist_mbid IN (SELECT value FROM json_each(OLD.artist_ids));

          -- Decrement Recording
          UPDATE mb_recordings
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE recording_mbid = OLD.recording_id
            AND OLD.recording_id IS NOT NULL AND OLD.recording_id != '';

          -- Decrement Track
          UPDATE mb_tracks
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE track_mbid = OLD.track_id
            AND OLD.track_id IS NOT NULL AND OLD.track_id != '';

          -- Decrement Release
          UPDATE mb_releases
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE release_mbid = OLD.release_id
            AND OLD.release_id IS NOT NULL AND OLD.release_id != '';

          -- Decrement Release Group
          UPDATE mb_release_groups
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE release_group_mbid = OLD.release_group_id
            AND OLD.release_group_id IS NOT NULL AND OLD.release_group_id != '';

          -- Decrement Labels
          UPDATE mb_labels
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE label_mbid IN (SELECT value FROM json_each(OLD.label_ids));
        END;
    """)

    # UPDATE trigger
    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS mb_canonical_update_trigger
        AFTER UPDATE ON fact_plays
        WHEN
          NEW.artist_ids != OLD.artist_ids OR
          NEW.recording_id != OLD.recording_id OR
          NEW.track_id != OLD.track_id OR
          NEW.release_id != OLD.release_id OR
          NEW.release_group_id != OLD.release_group_id OR
          NEW.label_ids != OLD.label_ids OR
          NEW.artist != OLD.artist OR
          NEW.song != OLD.song OR
          NEW.album != OLD.album OR
          NEW.release_date != OLD.release_date OR
          NEW.labels != OLD.labels
        BEGIN
          -- Decrement OLD Artists
          UPDATE mb_artists
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE artist_mbid IN (SELECT value FROM json_each(OLD.artist_ids));

          -- Increment NEW Artists
          INSERT INTO mb_artists (artist_mbid, artist_name, first_seen, last_seen, play_count)
          SELECT
            artist_ids.value,
            NEW.artist,
            NEW.airdate,
            NEW.airdate,
            1
          FROM json_each(NEW.artist_ids) AS artist_ids
          WHERE artist_ids.value IS NOT NULL AND artist_ids.value != ''
          ON CONFLICT(artist_mbid) DO UPDATE SET
            artist_name = COALESCE(excluded.artist_name, mb_artists.artist_name),
            first_seen = MIN(mb_artists.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_artists.play_count + 1,
            updated_at = datetime('now');

          -- Decrement OLD Recording
          UPDATE mb_recordings
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE recording_mbid = OLD.recording_id
            AND OLD.recording_id IS NOT NULL AND OLD.recording_id != '';

          -- Increment NEW Recording
          INSERT INTO mb_recordings (recording_mbid, song_title, first_seen, last_seen, play_count)
          SELECT NEW.recording_id, NEW.song, NEW.airdate, NEW.airdate, 1
          WHERE NEW.recording_id IS NOT NULL AND NEW.recording_id != ''
          ON CONFLICT(recording_mbid) DO UPDATE SET
            song_title = COALESCE(excluded.song_title, mb_recordings.song_title),
            first_seen = MIN(mb_recordings.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_recordings.play_count + 1,
            updated_at = datetime('now');

          -- Decrement OLD Track
          UPDATE mb_tracks
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE track_mbid = OLD.track_id
            AND OLD.track_id IS NOT NULL AND OLD.track_id != '';

          -- Increment NEW Track
          INSERT INTO mb_tracks (track_mbid, song_title, first_seen, last_seen, play_count)
          SELECT NEW.track_id, NEW.song, NEW.airdate, NEW.airdate, 1
          WHERE NEW.track_id IS NOT NULL AND NEW.track_id != ''
          ON CONFLICT(track_mbid) DO UPDATE SET
            song_title = COALESCE(excluded.song_title, mb_tracks.song_title),
            first_seen = MIN(mb_tracks.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_tracks.play_count + 1,
            updated_at = datetime('now');

          -- Decrement OLD Release
          UPDATE mb_releases
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE release_mbid = OLD.release_id
            AND OLD.release_id IS NOT NULL AND OLD.release_id != '';

          -- Increment NEW Release
          INSERT INTO mb_releases (release_mbid, album_title, release_date, first_seen, last_seen, play_count)
          SELECT NEW.release_id, NEW.album, NEW.release_date, NEW.airdate, NEW.airdate, 1
          WHERE NEW.release_id IS NOT NULL AND NEW.release_id != ''
          ON CONFLICT(release_mbid) DO UPDATE SET
            album_title = COALESCE(excluded.album_title, mb_releases.album_title),
            release_date = COALESCE(excluded.release_date, mb_releases.release_date),
            first_seen = MIN(mb_releases.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_releases.play_count + 1,
            updated_at = datetime('now');

          -- Decrement OLD Release Group
          UPDATE mb_release_groups
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE release_group_mbid = OLD.release_group_id
            AND OLD.release_group_id IS NOT NULL AND OLD.release_group_id != '';

          -- Increment NEW Release Group
          INSERT INTO mb_release_groups (release_group_mbid, album_title, first_seen, last_seen, play_count)
          SELECT NEW.release_group_id, NEW.album, NEW.airdate, NEW.airdate, 1
          WHERE NEW.release_group_id IS NOT NULL AND NEW.release_group_id != ''
          ON CONFLICT(release_group_mbid) DO UPDATE SET
            album_title = COALESCE(excluded.album_title, mb_release_groups.album_title),
            first_seen = MIN(mb_release_groups.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_release_groups.play_count + 1,
            updated_at = datetime('now');

          -- Decrement OLD Labels
          UPDATE mb_labels
          SET
            play_count = play_count - 1,
            updated_at = datetime('now')
          WHERE label_mbid IN (SELECT value FROM json_each(OLD.label_ids));

          -- Increment NEW Labels
          INSERT INTO mb_labels (label_mbid, label_name, first_seen, last_seen, play_count)
          SELECT
            label_ids.value,
            (SELECT value FROM json_each(NEW.labels) WHERE json_each.key = label_ids.key),
            NEW.airdate,
            NEW.airdate,
            1
          FROM json_each(NEW.label_ids) AS label_ids
          WHERE label_ids.value IS NOT NULL AND label_ids.value != ''
          ON CONFLICT(label_mbid) DO UPDATE SET
            label_name = COALESCE(excluded.label_name, mb_labels.label_name),
            first_seen = MIN(mb_labels.first_seen, excluded.first_seen),
            last_seen = excluded.last_seen,
            play_count = mb_labels.play_count + 1,
            updated_at = datetime('now');
        END;
    """)


# ============================================================================
# Test Data Generation
# ============================================================================

def generate_play_data(play_id: int, base_date: datetime) -> dict:
    """Generate realistic play data with MusicBrainz IDs."""
    # Vary the date to create realistic timeline
    airdate = base_date + timedelta(minutes=random.randint(0, 60*24*7))  # Within a week

    # Generate artist data (1-3 artists per play)
    num_artists = random.randint(1, 3)
    artist_names = random.sample(ARTISTS, num_artists)
    artist_mbids = [str(uuid4()) for _ in range(num_artists)]

    # Generate label data (1-2 labels per play)
    num_labels = random.randint(1, 2)
    label_names = random.sample(LABELS, num_labels)
    label_mbids = [str(uuid4()) for _ in range(num_labels)]

    return {
        "id": play_id,
        "airdate": airdate.isoformat(),
        "show": random.randint(1, 100),
        "show_uri": f"https://api.kexp.org/v2/shows/{random.randint(1, 100)}/",
        "image_uri": f"https://cdn.kexp.org/images/{uuid4()}.jpg",
        "thumbnail_uri": f"https://cdn.kexp.org/thumbs/{uuid4()}.jpg",
        "song": random.choice(SONGS),
        "track_id": str(uuid4()),
        "recording_id": str(uuid4()),
        "artist": ", ".join(artist_names),
        "artist_ids": json.dumps(artist_mbids),
        "album": random.choice(ALBUMS),
        "release_id": str(uuid4()),
        "release_group_id": str(uuid4()),
        "labels": json.dumps(label_names),
        "label_ids": json.dumps(label_mbids),
        "release_date": f"{random.randint(1960, 2024)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
        "rotation_status": random.choice(["Heavy", "Medium", "Light", "Library"]),
        "is_local": random.randint(0, 1),
        "is_request": random.randint(0, 1),
        "is_live": 0,
        "comment": "",
        "play_type": "trackplay",
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }


# ============================================================================
# Benchmark Functions
# ============================================================================

def benchmark_bulk_insert(conn: sqlite3.Connection, count: int) -> dict:
    """Benchmark bulk insert performance with triggers enabled."""
    cursor = conn.cursor()
    base_date = datetime(2024, 1, 1)

    # Generate test data
    print(f"Generating {count:,} test plays...")
    plays = [generate_play_data(i, base_date) for i in range(count)]

    # Start memory tracking
    tracemalloc.start()
    mem_before = tracemalloc.get_traced_memory()[0]

    # Benchmark insert
    print(f"Inserting {count:,} plays with triggers enabled...")
    start_time = time.time()

    cursor.executemany("""
        INSERT INTO fact_plays (
            id, airdate, show, show_uri, image_uri, thumbnail_uri,
            song, track_id, recording_id, artist, artist_ids,
            album, release_id, release_group_id, labels, label_ids,
            release_date, rotation_status, is_local, is_request, is_live,
            comment, play_type, created_at, updated_at
        ) VALUES (
            :id, :airdate, :show, :show_uri, :image_uri, :thumbnail_uri,
            :song, :track_id, :recording_id, :artist, :artist_ids,
            :album, :release_id, :release_group_id, :labels, :label_ids,
            :release_date, :rotation_status, :is_local, :is_request, :is_live,
            :comment, :play_type, :created_at, :updated_at
        )
    """, plays)

    conn.commit()
    end_time = time.time()

    # Get memory stats
    mem_after = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()

    # Calculate metrics
    total_time = end_time - start_time
    inserts_per_second = count / total_time
    avg_time_per_insert = (total_time / count) * 1000  # in milliseconds
    memory_used = (mem_after - mem_before) / (1024 * 1024)  # MB

    # Get canonical table counts
    canonical_stats = {
        "artists": cursor.execute("SELECT COUNT(*) FROM mb_artists").fetchone()[0],
        "recordings": cursor.execute("SELECT COUNT(*) FROM mb_recordings").fetchone()[0],
        "tracks": cursor.execute("SELECT COUNT(*) FROM mb_tracks").fetchone()[0],
        "releases": cursor.execute("SELECT COUNT(*) FROM mb_releases").fetchone()[0],
        "release_groups": cursor.execute("SELECT COUNT(*) FROM mb_release_groups").fetchone()[0],
        "labels": cursor.execute("SELECT COUNT(*) FROM mb_labels").fetchone()[0],
    }

    return {
        "total_time": total_time,
        "inserts_per_second": inserts_per_second,
        "avg_time_per_insert": avg_time_per_insert,
        "memory_used_mb": memory_used,
        "canonical_stats": canonical_stats
    }


def print_results(results: dict, count: int):
    """Print formatted benchmark results."""
    print("\n" + "=" * 70)
    print("BENCHMARK RESULTS")
    print("=" * 70)
    print(f"\nTest Configuration:")
    print(f"  Insert count:        {count:,} plays")
    print(f"\nPerformance Metrics:")
    print(f"  Total time:          {results['total_time']:.2f} seconds")
    print(f"  Inserts/second:      {results['inserts_per_second']:.0f}")
    print(f"  Avg time/insert:     {results['avg_time_per_insert']:.3f} ms")
    print(f"  Memory used:         {results['memory_used_mb']:.2f} MB")

    print(f"\nCanonical Table Counts:")
    for table, count in results['canonical_stats'].items():
        print(f"  mb_{table:15s}  {count:,}")

    total_canonical_rows = sum(results['canonical_stats'].values())
    print(f"  {'Total canonical rows:':17s}  {total_canonical_rows:,}")

    print(f"\nPerformance Assessment:")
    total_time = results['total_time']
    if total_time < 5.0:
        status = "EXCELLENT"
        color = "\033[92m"  # Green
    elif total_time < 10.0:
        status = "ACCEPTABLE"
        color = "\033[93m"  # Yellow
    else:
        status = "WARNING - NEEDS OPTIMIZATION"
        color = "\033[91m"  # Red

    print(f"  Status: {color}{status}\033[0m")

    if total_time >= 10.0:
        print(f"\n  Performance is below acceptable threshold (>10s for {count:,} inserts)")
        print(f"  Consider:")
        print(f"    - Adding indexes to canonical tables")
        print(f"    - Batching trigger operations")
        print(f"    - Reviewing trigger complexity")
    elif total_time >= 5.0:
        print(f"\n  Performance is acceptable but approaching target threshold")
        print(f"  Target: <5 seconds for {count:,} inserts")
    else:
        print(f"\n  Performance exceeds target (>2000 inserts/second)")

    print("\n" + "=" * 70)


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Benchmark MusicBrainz canonical table trigger performance",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Default benchmark (10k inserts)
  python scripts/benchmark_triggers.py

  # Custom insert count
  python scripts/benchmark_triggers.py --count 5000

  # Use specific database path
  python scripts/benchmark_triggers.py --db-path /tmp/benchmark.db
        """
    )
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_INSERT_COUNT,
        help=f"Number of plays to insert (default: {DEFAULT_INSERT_COUNT:,})"
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=DEFAULT_DB_PATH,
        help=f"Database path (default: {DEFAULT_DB_PATH})"
    )

    args = parser.parse_args()

    print("=" * 70)
    print("MUSICBRAINZ CANONICAL TABLE TRIGGER PERFORMANCE BENCHMARK")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  Database:     {args.db_path}")
    print(f"  Insert count: {args.count:,}")
    print(f"\nSetting up database schema and triggers...")

    # Setup database
    conn = sqlite3.connect(args.db_path)
    create_schema(conn)

    # Run benchmark
    results = benchmark_bulk_insert(conn, args.count)

    # Print results
    print_results(results, args.count)

    # Cleanup
    if args.db_path != ":memory:":
        print(f"\nDatabase file: {args.db_path}")
        print("(Delete manually if no longer needed)")

    conn.close()


if __name__ == "__main__":
    main()
