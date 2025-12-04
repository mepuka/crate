#!/usr/bin/env python3
"""
Import MusicBrainz JSON dump data into the production database.

This script reads the MB JSON dump files (artist.tar.xz, label.tar.xz,
release-group.tar.xz) and enriches the existing entities in our database
with relations, genres, aliases, and other metadata.

Usage:
    python scripts/import_mb_dumps.py --db-path data/music_kb.sqlite --dumps-dir /path/to/dumps

The script only updates entities that already exist in our database (by MBID),
so we get rich connections data for the artists/labels/albums we actually have.
"""

import argparse
import json
import lzma
import sqlite3
import tarfile
from pathlib import Path
from datetime import datetime
from typing import Iterator, Dict, Any, Optional
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

def extract_relations(relations: list) -> Dict[str, Any]:
    """Extract structured relations from MB relations array."""
    result = {
        'band_members': [],
        'member_of_bands': [],
        'collaborators': [],
        'urls': {},
        'label_relations': [],
        'events': [],
    }

    for rel in relations:
        rel_type = rel.get('type', '')
        direction = rel.get('direction', '')

        # Band member relationships
        if rel_type == 'member of band':
            artist = rel.get('artist', {})
            member_info = {
                'mbid': artist.get('id'),
                'name': artist.get('name'),
                'type': artist.get('type'),
                'begin': rel.get('begin'),
                'end': rel.get('end'),
                'attributes': rel.get('attributes', []),
            }
            if direction == 'backward':
                # This artist is the band, the related artist is a member
                result['band_members'].append(member_info)
            else:
                # This artist is a member of the related band
                result['member_of_bands'].append(member_info)

        # URL relationships (discogs, wikipedia, official site, etc.)
        elif rel.get('url'):
            url_info = rel.get('url', {})
            resource = url_info.get('resource', '')
            if rel_type and resource:
                if rel_type not in result['urls']:
                    result['urls'][rel_type] = []
                result['urls'][rel_type].append(resource)

        # Label relationships
        elif rel.get('label'):
            label_info = rel.get('label', {})
            result['label_relations'].append({
                'mbid': label_info.get('id'),
                'name': label_info.get('name'),
                'type': rel_type,
                'begin': rel.get('begin'),
                'end': rel.get('end'),
            })

        # Event relationships
        elif rel.get('event'):
            event_info = rel.get('event', {})
            result['events'].append({
                'id': event_info.get('id'),
                'name': event_info.get('name'),
                'type': event_info.get('type'),
                'date': event_info.get('life-span', {}).get('begin'),
                'relation_type': rel_type,
            })

    return result

def import_artists(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import artist data from MB dump."""
    log(f"Starting artist import from {tar_path}")

    cursor = conn.cursor()

    # First, get all artist MBIDs we have in our DB
    cursor.execute("SELECT artist_mbid FROM mb_artists")
    our_mbids = set(row[0] for row in cursor.fetchall())
    log(f"Found {len(our_mbids)} artists in our database")

    # Add new columns if they don't exist
    try:
        cursor.execute("ALTER TABLE mb_artists ADD COLUMN relations TEXT")
    except sqlite3.OperationalError:
        pass  # Column exists

    try:
        cursor.execute("ALTER TABLE mb_artists ADD COLUMN genres TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE mb_artists ADD COLUMN aliases TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE mb_artists ADD COLUMN tags TEXT")
    except sqlite3.OperationalError:
        pass

    conn.commit()

    # Stream through the dump
    updated = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/artist'):
        processed += 1
        mbid = entity.get('id')

        if mbid in our_mbids:
            # Extract enrichment data
            relations = extract_relations(entity.get('relations', []))
            genres = [g.get('name') for g in entity.get('genres', [])]
            aliases = [a.get('name') for a in entity.get('aliases', [])]
            tags = [t.get('name') for t in entity.get('tags', [])]

            batch.append((
                json.dumps(relations),
                json.dumps(genres),
                json.dumps(aliases),
                json.dumps(tags),
                entity.get('country'),
                entity.get('type'),
                entity.get('sort-name'),
                entity.get('disambiguation'),
                entity.get('life-span', {}).get('begin'),
                entity.get('life-span', {}).get('end'),
                datetime.now().isoformat(),
                mbid
            ))

            if len(batch) >= batch_size:
                cursor.executemany("""
                    UPDATE mb_artists SET
                        relations = ?,
                        genres = ?,
                        aliases = ?,
                        tags = ?,
                        country = COALESCE(?, country),
                        artist_type = COALESCE(?, artist_type),
                        sort_name = COALESCE(?, sort_name),
                        disambiguation = COALESCE(?, disambiguation),
                        begin_date = COALESCE(?, begin_date),
                        end_date = COALESCE(?, end_date),
                        enriched_at = ?
                    WHERE artist_mbid = ?
                """, batch)
                conn.commit()
                updated += len(batch)
                log(f"Artists: processed {processed:,}, updated {updated:,}")
                batch = []

        if processed % 100000 == 0:
            log(f"Artists: scanned {processed:,} entities...")

    # Final batch
    if batch:
        cursor.executemany("""
            UPDATE mb_artists SET
                relations = ?,
                genres = ?,
                aliases = ?,
                tags = ?,
                country = COALESCE(?, country),
                artist_type = COALESCE(?, artist_type),
                sort_name = COALESCE(?, sort_name),
                disambiguation = COALESCE(?, disambiguation),
                begin_date = COALESCE(?, begin_date),
                end_date = COALESCE(?, end_date),
                enriched_at = ?
            WHERE artist_mbid = ?
        """, batch)
        conn.commit()
        updated += len(batch)

    log(f"Artist import complete: {updated:,} updated out of {processed:,} scanned")
    return updated

def import_labels(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import label data from MB dump."""
    log(f"Starting label import from {tar_path}")

    cursor = conn.cursor()

    # Get all label MBIDs we have
    cursor.execute("SELECT label_mbid FROM mb_labels")
    our_mbids = set(row[0] for row in cursor.fetchall())
    log(f"Found {len(our_mbids)} labels in our database")

    # Add new columns if they don't exist
    for col in ['relations', 'genres', 'aliases', 'tags', 'country', 'area']:
        try:
            cursor.execute(f"ALTER TABLE mb_labels ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass

    conn.commit()

    updated = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/label'):
        processed += 1
        mbid = entity.get('id')

        if mbid in our_mbids:
            relations = extract_relations(entity.get('relations', []))
            genres = [g.get('name') for g in entity.get('genres', [])]
            aliases = [a.get('name') for a in entity.get('aliases', [])]
            tags = [t.get('name') for t in entity.get('tags', [])]
            area_data = entity.get('area')
            area = area_data.get('name') if area_data else None

            batch.append((
                json.dumps(relations),
                json.dumps(genres),
                json.dumps(aliases),
                json.dumps(tags),
                entity.get('country'),
                area,
                entity.get('type'),
                entity.get('label-code'),
                entity.get('disambiguation'),
                datetime.now().isoformat(),
                mbid
            ))

            if len(batch) >= batch_size:
                cursor.executemany("""
                    UPDATE mb_labels SET
                        relations = ?,
                        genres = ?,
                        aliases = ?,
                        tags = ?,
                        country = COALESCE(?, country),
                        area = ?,
                        label_type = COALESCE(?, label_type),
                        label_code = COALESCE(?, label_code),
                        disambiguation = COALESCE(?, disambiguation),
                        enriched_at = ?
                    WHERE label_mbid = ?
                """, batch)
                conn.commit()
                updated += len(batch)
                log(f"Labels: processed {processed:,}, updated {updated:,}")
                batch = []

        if processed % 50000 == 0:
            log(f"Labels: scanned {processed:,} entities...")

    if batch:
        cursor.executemany("""
            UPDATE mb_labels SET
                relations = ?,
                genres = ?,
                aliases = ?,
                tags = ?,
                country = COALESCE(?, country),
                area = ?,
                label_type = COALESCE(?, label_type),
                label_code = COALESCE(?, label_code),
                disambiguation = COALESCE(?, disambiguation),
                enriched_at = ?
            WHERE label_mbid = ?
        """, batch)
        conn.commit()
        updated += len(batch)

    log(f"Label import complete: {updated:,} updated out of {processed:,} scanned")
    return updated

def import_releases(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import release data from MB dump."""
    log(f"Starting release import from {tar_path}")

    cursor = conn.cursor()

    # Get all release MBIDs we have
    cursor.execute("SELECT release_mbid FROM mb_releases")
    our_mbids = set(row[0] for row in cursor.fetchall())
    log(f"Found {len(our_mbids)} releases in our database")

    # Add new columns if they don't exist
    for col in ['relations', 'label_info', 'media', 'release_group_mbid', 'packaging', 'quality', 'artist_credit']:
        try:
            cursor.execute(f"ALTER TABLE mb_releases ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass

    conn.commit()

    updated = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/release'):
        processed += 1
        mbid = entity.get('id')

        if mbid in our_mbids:
            relations = extract_relations(entity.get('relations', []))

            # Extract label info
            label_info = []
            for li in entity.get('label-info', []):
                label = li.get('label', {})
                if label:
                    label_info.append({
                        'label_mbid': label.get('id'),
                        'label_name': label.get('name'),
                        'catalog_number': li.get('catalog-number'),
                    })

            # Extract media/format info
            media = []
            for m in entity.get('media', []):
                media.append({
                    'format': m.get('format'),
                    'track_count': m.get('track-count'),
                    'position': m.get('position'),
                })

            # Extract artist credit
            artist_credit = []
            for credit in entity.get('artist-credit', []):
                if isinstance(credit, dict) and 'artist' in credit:
                    artist = credit['artist']
                    artist_credit.append({
                        'mbid': artist.get('id'),
                        'name': artist.get('name'),
                        'joinphrase': credit.get('joinphrase', ''),
                    })

            # Get release group MBID
            rg = entity.get('release-group', {})
            release_group_mbid = rg.get('id') if rg else None

            batch.append((
                json.dumps(relations),
                json.dumps(label_info) if label_info else None,
                json.dumps(media) if media else None,
                release_group_mbid,
                entity.get('packaging'),
                entity.get('quality'),
                json.dumps(artist_credit) if artist_credit else None,
                entity.get('title'),
                entity.get('date'),
                entity.get('status'),
                entity.get('barcode'),
                entity.get('asin'),
                entity.get('country'),
                entity.get('disambiguation'),
                datetime.now().isoformat(),
                mbid
            ))

            if len(batch) >= batch_size:
                cursor.executemany("""
                    UPDATE mb_releases SET
                        relations = ?,
                        label_info = ?,
                        media = ?,
                        release_group_mbid = ?,
                        packaging = ?,
                        quality = ?,
                        artist_credit = ?,
                        album_title = COALESCE(?, album_title),
                        release_date = COALESCE(?, release_date),
                        status = COALESCE(?, status),
                        barcode = COALESCE(?, barcode),
                        asin = COALESCE(?, asin),
                        country = COALESCE(?, country),
                        disambiguation = COALESCE(?, disambiguation),
                        enriched_at = ?
                    WHERE release_mbid = ?
                """, batch)
                conn.commit()
                updated += len(batch)
                log(f"Releases: processed {processed:,}, updated {updated:,}")
                batch = []

        if processed % 500000 == 0:
            log(f"Releases: scanned {processed:,} entities...")

    if batch:
        cursor.executemany("""
            UPDATE mb_releases SET
                relations = ?,
                label_info = ?,
                media = ?,
                release_group_mbid = ?,
                packaging = ?,
                quality = ?,
                artist_credit = ?,
                album_title = COALESCE(?, album_title),
                release_date = COALESCE(?, release_date),
                status = COALESCE(?, status),
                barcode = COALESCE(?, barcode),
                asin = COALESCE(?, asin),
                country = COALESCE(?, country),
                disambiguation = COALESCE(?, disambiguation),
                enriched_at = ?
            WHERE release_mbid = ?
        """, batch)
        conn.commit()
        updated += len(batch)

    log(f"Release import complete: {updated:,} updated out of {processed:,} scanned")
    return updated


def import_recordings(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import recording data from MB dump - critical for work relations (covers)."""
    log(f"Starting recording import from {tar_path}")

    cursor = conn.cursor()

    # Get all recording MBIDs we have
    cursor.execute("SELECT recording_mbid FROM mb_recordings")
    our_mbids = set(row[0] for row in cursor.fetchall())
    log(f"Found {len(our_mbids)} recordings in our database")

    # Add new columns if they don't exist
    for col in ['relations', 'work_mbids', 'isrcs', 'tags', 'genres']:
        try:
            cursor.execute(f"ALTER TABLE mb_recordings ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass

    conn.commit()

    updated = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/recording'):
        processed += 1
        mbid = entity.get('id')

        if mbid in our_mbids:
            relations = entity.get('relations', [])

            # Extract work MBIDs from "performance of" relations - key for cover detection
            work_mbids = []
            for rel in relations:
                if rel.get('type') == 'performance' and rel.get('work'):
                    work_mbids.append(rel['work'].get('id'))

            # Extract ISRCs
            isrcs = entity.get('isrcs', [])

            tags = [t.get('name') for t in entity.get('tags', [])]
            genres = [g.get('name') for g in entity.get('genres', [])]

            batch.append((
                json.dumps(relations),
                json.dumps(work_mbids) if work_mbids else None,
                json.dumps(isrcs) if isrcs else None,
                json.dumps(tags) if tags else None,
                json.dumps(genres) if genres else None,
                entity.get('title'),
                entity.get('length'),
                entity.get('disambiguation'),
                datetime.now().isoformat(),
                mbid
            ))

            if len(batch) >= batch_size:
                cursor.executemany("""
                    UPDATE mb_recordings SET
                        relations = ?,
                        work_mbids = ?,
                        isrcs = ?,
                        tags = ?,
                        genres = ?,
                        song_title = COALESCE(?, song_title),
                        length_ms = COALESCE(?, length_ms),
                        disambiguation = COALESCE(?, disambiguation),
                        enriched_at = ?
                    WHERE recording_mbid = ?
                """, batch)
                conn.commit()
                updated += len(batch)
                log(f"Recordings: processed {processed:,}, updated {updated:,}")
                batch = []

        if processed % 500000 == 0:
            log(f"Recordings: scanned {processed:,} entities...")

    if batch:
        cursor.executemany("""
            UPDATE mb_recordings SET
                relations = ?,
                work_mbids = ?,
                isrcs = ?,
                tags = ?,
                genres = ?,
                song_title = COALESCE(?, song_title),
                length_ms = COALESCE(?, length_ms),
                disambiguation = COALESCE(?, disambiguation),
                enriched_at = ?
            WHERE recording_mbid = ?
        """, batch)
        conn.commit()
        updated += len(batch)

    log(f"Recording import complete: {updated:,} updated out of {processed:,} scanned")
    return updated


def import_release_groups(conn: sqlite3.Connection, tar_path: Path, batch_size: int = 1000):
    """Import release group data from MB dump."""
    log(f"Starting release group import from {tar_path}")

    cursor = conn.cursor()

    # Get all release group MBIDs we have
    cursor.execute("SELECT release_group_mbid FROM mb_release_groups")
    our_mbids = set(row[0] for row in cursor.fetchall())
    log(f"Found {len(our_mbids)} release groups in our database")

    # Add new columns if they don't exist
    for col in ['relations', 'genres', 'aliases', 'tags', 'artist_credit']:
        try:
            cursor.execute(f"ALTER TABLE mb_release_groups ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass

    conn.commit()

    updated = 0
    processed = 0
    batch = []

    for entity in stream_jsonl_from_tar(tar_path, 'mbdump/release-group'):
        processed += 1
        mbid = entity.get('id')

        if mbid in our_mbids:
            relations = extract_relations(entity.get('relations', []))
            genres = [g.get('name') for g in entity.get('genres', [])]
            aliases = [a.get('name') for a in entity.get('aliases', [])]
            tags = [t.get('name') for t in entity.get('tags', [])]

            # Extract artist credit info
            artist_credit = []
            for credit in entity.get('artist-credit', []):
                if isinstance(credit, dict) and 'artist' in credit:
                    artist = credit['artist']
                    artist_credit.append({
                        'mbid': artist.get('id'),
                        'name': artist.get('name'),
                        'joinphrase': credit.get('joinphrase', ''),
                    })

            # Get secondary types
            secondary_types = entity.get('secondary-types', [])

            batch.append((
                json.dumps(relations),
                json.dumps(genres),
                json.dumps(aliases),
                json.dumps(tags),
                json.dumps(artist_credit),
                entity.get('title'),
                entity.get('first-release-date'),
                entity.get('primary-type'),
                json.dumps(secondary_types) if secondary_types else None,
                entity.get('disambiguation'),
                datetime.now().isoformat(),
                mbid
            ))

            if len(batch) >= batch_size:
                cursor.executemany("""
                    UPDATE mb_release_groups SET
                        relations = ?,
                        genres = ?,
                        aliases = ?,
                        tags = ?,
                        artist_credit = ?,
                        album_title = COALESCE(?, album_title),
                        first_release_date = COALESCE(?, first_release_date),
                        primary_type = COALESCE(?, primary_type),
                        secondary_types = COALESCE(?, secondary_types),
                        disambiguation = COALESCE(?, disambiguation),
                        enriched_at = ?
                    WHERE release_group_mbid = ?
                """, batch)
                conn.commit()
                updated += len(batch)
                log(f"Release groups: processed {processed:,}, updated {updated:,}")
                batch = []

        if processed % 100000 == 0:
            log(f"Release groups: scanned {processed:,} entities...")

    if batch:
        cursor.executemany("""
            UPDATE mb_release_groups SET
                relations = ?,
                genres = ?,
                aliases = ?,
                tags = ?,
                artist_credit = ?,
                album_title = COALESCE(?, album_title),
                first_release_date = COALESCE(?, first_release_date),
                primary_type = COALESCE(?, primary_type),
                secondary_types = COALESCE(?, secondary_types),
                disambiguation = COALESCE(?, disambiguation),
                enriched_at = ?
            WHERE release_group_mbid = ?
        """, batch)
        conn.commit()
        updated += len(batch)

    log(f"Release group import complete: {updated:,} updated out of {processed:,} scanned")
    return updated

def main():
    parser = argparse.ArgumentParser(description='Import MusicBrainz dump data')
    parser.add_argument('--db-path', required=True, help='Path to SQLite database')
    parser.add_argument('--dumps-dir', required=True, help='Directory containing MB dump files')
    parser.add_argument('--entity-type', choices=['artist', 'label', 'release-group', 'release', 'recording', 'all'],
                        default='all', help='Entity type to import')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for updates')

    args = parser.parse_args()

    db_path = Path(args.db_path)
    dumps_dir = Path(args.dumps_dir)

    if not db_path.exists():
        log(f"Error: Database not found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))

    results = {}

    if args.entity_type in ['artist', 'all']:
        artist_tar = dumps_dir / 'artist.tar.xz'
        if artist_tar.exists():
            results['artists'] = import_artists(conn, artist_tar, args.batch_size)
        else:
            log(f"Warning: {artist_tar} not found, skipping artists")

    if args.entity_type in ['label', 'all']:
        label_tar = dumps_dir / 'label.tar.xz'
        if label_tar.exists():
            results['labels'] = import_labels(conn, label_tar, args.batch_size)
        else:
            log(f"Warning: {label_tar} not found, skipping labels")

    if args.entity_type in ['release-group', 'all']:
        rg_tar = dumps_dir / 'release-group.tar.xz'
        if rg_tar.exists():
            results['release_groups'] = import_release_groups(conn, rg_tar, args.batch_size)
        else:
            log(f"Warning: {rg_tar} not found, skipping release groups")

    if args.entity_type in ['release', 'all']:
        release_tar = dumps_dir / 'release.tar.xz'
        if release_tar.exists():
            results['releases'] = import_releases(conn, release_tar, args.batch_size)
        else:
            log(f"Warning: {release_tar} not found, skipping releases")

    if args.entity_type in ['recording', 'all']:
        recording_tar = dumps_dir / 'recording.tar.xz'
        if recording_tar.exists():
            results['recordings'] = import_recordings(conn, recording_tar, args.batch_size)
        else:
            log(f"Warning: {recording_tar} not found, skipping recordings")

    conn.close()

    log("=" * 50)
    log("Import Summary:")
    for entity_type, count in results.items():
        log(f"  {entity_type}: {count:,} enriched")
    log("=" * 50)

if __name__ == '__main__':
    main()
