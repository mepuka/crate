#!/usr/bin/env python3
"""
Initialize MusicBrainz Canonical Tables

This script populates the MB canonical tables (mb_artists, mb_labels, etc.)
from existing fact_plays data. It's designed to be run once after the migration
to backfill historical data.

The triggers will automatically maintain these tables going forward, but this
script is needed to process existing records.
"""

import sys
import sqlite3
import json
from pathlib import Path
from typing import Dict, Set, List, Any
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from utils.mb_extraction import MBIDExtractor


class MBCanonicalInitializer:
    """Initialize canonical MB tables from existing fact_plays data."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self):
        """Close database connection."""
        self.conn.close()

    def get_fact_plays_count(self) -> int:
        """Get total number of fact_plays records."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM fact_plays")
        return cursor.fetchone()[0]

    def process_plays_batch(self, offset: int, limit: int) -> Dict[str, Any]:
        """
        Process a batch of plays and extract MB entities.

        Args:
            offset: Starting offset for batch
            limit: Number of records to process

        Returns:
            Dictionary containing sets of entities to upsert
        """
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT rowid, artist_ids, artist, recording_id, track_id,
                   release_id, release_group_id, label_ids, labels,
                   song, album, release_date, airdate
            FROM fact_plays
            ORDER BY rowid
            LIMIT ? OFFSET ?
            """,
            (limit, offset)
        )

        # Track entities by MB ID
        artists: Dict[str, Dict[str, Any]] = {}
        labels: Dict[str, Dict[str, Any]] = {}
        recordings: Dict[str, Dict[str, Any]] = {}
        tracks: Dict[str, Dict[str, Any]] = {}
        releases: Dict[str, Dict[str, Any]] = {}
        release_groups: Dict[str, Dict[str, Any]] = {}

        for row in cursor.fetchall():
            play = dict(row)

            # Extract artists
            artist_ids = MBIDExtractor.extract_artist_mb_ids(play)
            for artist_mbid in artist_ids:
                if artist_mbid not in artists:
                    artists[artist_mbid] = {
                        'artist_mbid': artist_mbid,
                        'artist_name': play.get('artist'),
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                # Update stats
                artists[artist_mbid]['last_seen'] = max(
                    artists[artist_mbid]['last_seen'],
                    play['airdate']
                )
                artists[artist_mbid]['first_seen'] = min(
                    artists[artist_mbid]['first_seen'],
                    play['airdate']
                )
                artists[artist_mbid]['play_count'] += 1
                if play.get('artist'):
                    artists[artist_mbid]['artist_name'] = play['artist']

            # Extract labels
            label_ids_list = MBIDExtractor.extract_label_mb_ids(play)
            labels_list = []
            if play.get('labels'):
                try:
                    labels_list = json.loads(play['labels']) if isinstance(play['labels'], str) else play['labels']
                except json.JSONDecodeError:
                    labels_list = []

            for idx, label_mbid in enumerate(label_ids_list):
                if label_mbid not in labels:
                    labels[label_mbid] = {
                        'label_mbid': label_mbid,
                        'label_name': labels_list[idx] if idx < len(labels_list) else None,
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                labels[label_mbid]['last_seen'] = max(
                    labels[label_mbid]['last_seen'],
                    play['airdate']
                )
                labels[label_mbid]['first_seen'] = min(
                    labels[label_mbid]['first_seen'],
                    play['airdate']
                )
                labels[label_mbid]['play_count'] += 1
                if idx < len(labels_list) and labels_list[idx]:
                    labels[label_mbid]['label_name'] = labels_list[idx]

            # Extract recording
            recording_id = MBIDExtractor.extract_recording_mb_id(play)
            if recording_id:
                if recording_id not in recordings:
                    recordings[recording_id] = {
                        'recording_mbid': recording_id,
                        'song_title': play.get('song'),
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                recordings[recording_id]['last_seen'] = max(
                    recordings[recording_id]['last_seen'],
                    play['airdate']
                )
                recordings[recording_id]['first_seen'] = min(
                    recordings[recording_id]['first_seen'],
                    play['airdate']
                )
                recordings[recording_id]['play_count'] += 1
                if play.get('song'):
                    recordings[recording_id]['song_title'] = play['song']

            # Extract track
            track_id = MBIDExtractor.extract_track_mb_id(play)
            if track_id:
                if track_id not in tracks:
                    tracks[track_id] = {
                        'track_mbid': track_id,
                        'song_title': play.get('song'),
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                tracks[track_id]['last_seen'] = max(
                    tracks[track_id]['last_seen'],
                    play['airdate']
                )
                tracks[track_id]['first_seen'] = min(
                    tracks[track_id]['first_seen'],
                    play['airdate']
                )
                tracks[track_id]['play_count'] += 1
                if play.get('song'):
                    tracks[track_id]['song_title'] = play['song']

            # Extract release
            release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play)

            if release_id:
                if release_id not in releases:
                    releases[release_id] = {
                        'release_mbid': release_id,
                        'album_title': play.get('album'),
                        'release_date': play.get('release_date'),
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                releases[release_id]['last_seen'] = max(
                    releases[release_id]['last_seen'],
                    play['airdate']
                )
                releases[release_id]['first_seen'] = min(
                    releases[release_id]['first_seen'],
                    play['airdate']
                )
                releases[release_id]['play_count'] += 1
                if play.get('album'):
                    releases[release_id]['album_title'] = play['album']
                if play.get('release_date'):
                    releases[release_id]['release_date'] = play['release_date']

            if release_group_id:
                if release_group_id not in release_groups:
                    release_groups[release_group_id] = {
                        'release_group_mbid': release_group_id,
                        'album_title': play.get('album'),
                        'first_seen': play['airdate'],
                        'last_seen': play['airdate'],
                        'play_count': 0
                    }
                release_groups[release_group_id]['last_seen'] = max(
                    release_groups[release_group_id]['last_seen'],
                    play['airdate']
                )
                release_groups[release_group_id]['first_seen'] = min(
                    release_groups[release_group_id]['first_seen'],
                    play['airdate']
                )
                release_groups[release_group_id]['play_count'] += 1
                if play.get('album'):
                    release_groups[release_group_id]['album_title'] = play['album']

        return {
            'artists': artists,
            'labels': labels,
            'recordings': recordings,
            'tracks': tracks,
            'releases': releases,
            'release_groups': release_groups,
        }

    def upsert_artists(self, artists: Dict[str, Dict[str, Any]]):
        """Insert or update artists in mb_artists table."""
        cursor = self.conn.cursor()
        for artist in artists.values():
            cursor.execute(
                """
                INSERT INTO mb_artists (
                    artist_mbid, artist_name, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(artist_mbid) DO UPDATE SET
                    artist_name = COALESCE(excluded.artist_name, mb_artists.artist_name),
                    first_seen = MIN(mb_artists.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_artists.last_seen, excluded.last_seen),
                    play_count = mb_artists.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    artist['artist_mbid'],
                    artist['artist_name'],
                    artist['first_seen'],
                    artist['last_seen'],
                    artist['play_count']
                )
            )

    def upsert_labels(self, labels: Dict[str, Dict[str, Any]]):
        """Insert or update labels in mb_labels table."""
        cursor = self.conn.cursor()
        for label in labels.values():
            cursor.execute(
                """
                INSERT INTO mb_labels (
                    label_mbid, label_name, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(label_mbid) DO UPDATE SET
                    label_name = COALESCE(excluded.label_name, mb_labels.label_name),
                    first_seen = MIN(mb_labels.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_labels.last_seen, excluded.last_seen),
                    play_count = mb_labels.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    label['label_mbid'],
                    label['label_name'],
                    label['first_seen'],
                    label['last_seen'],
                    label['play_count']
                )
            )

    def upsert_recordings(self, recordings: Dict[str, Dict[str, Any]]):
        """Insert or update recordings in mb_recordings table."""
        cursor = self.conn.cursor()
        for recording in recordings.values():
            cursor.execute(
                """
                INSERT INTO mb_recordings (
                    recording_mbid, song_title, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(recording_mbid) DO UPDATE SET
                    song_title = COALESCE(excluded.song_title, mb_recordings.song_title),
                    first_seen = MIN(mb_recordings.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_recordings.last_seen, excluded.last_seen),
                    play_count = mb_recordings.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    recording['recording_mbid'],
                    recording['song_title'],
                    recording['first_seen'],
                    recording['last_seen'],
                    recording['play_count']
                )
            )

    def upsert_tracks(self, tracks: Dict[str, Dict[str, Any]]):
        """Insert or update tracks in mb_tracks table."""
        cursor = self.conn.cursor()
        for track in tracks.values():
            cursor.execute(
                """
                INSERT INTO mb_tracks (
                    track_mbid, song_title, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(track_mbid) DO UPDATE SET
                    song_title = COALESCE(excluded.song_title, mb_tracks.song_title),
                    first_seen = MIN(mb_tracks.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_tracks.last_seen, excluded.last_seen),
                    play_count = mb_tracks.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    track['track_mbid'],
                    track['song_title'],
                    track['first_seen'],
                    track['last_seen'],
                    track['play_count']
                )
            )

    def upsert_releases(self, releases: Dict[str, Dict[str, Any]]):
        """Insert or update releases in mb_releases table."""
        cursor = self.conn.cursor()
        for release in releases.values():
            cursor.execute(
                """
                INSERT INTO mb_releases (
                    release_mbid, album_title, release_date, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(release_mbid) DO UPDATE SET
                    album_title = COALESCE(excluded.album_title, mb_releases.album_title),
                    release_date = COALESCE(excluded.release_date, mb_releases.release_date),
                    first_seen = MIN(mb_releases.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_releases.last_seen, excluded.last_seen),
                    play_count = mb_releases.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    release['release_mbid'],
                    release['album_title'],
                    release['release_date'],
                    release['first_seen'],
                    release['last_seen'],
                    release['play_count']
                )
            )

    def upsert_release_groups(self, release_groups: Dict[str, Dict[str, Any]]):
        """Insert or update release groups in mb_release_groups table."""
        cursor = self.conn.cursor()
        for release_group in release_groups.values():
            cursor.execute(
                """
                INSERT INTO mb_release_groups (
                    release_group_mbid, album_title, first_seen, last_seen, play_count
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(release_group_mbid) DO UPDATE SET
                    album_title = COALESCE(excluded.album_title, mb_release_groups.album_title),
                    first_seen = MIN(mb_release_groups.first_seen, excluded.first_seen),
                    last_seen = MAX(mb_release_groups.last_seen, excluded.last_seen),
                    play_count = mb_release_groups.play_count + excluded.play_count,
                    updated_at = datetime('now')
                """,
                (
                    release_group['release_group_mbid'],
                    release_group['album_title'],
                    release_group['first_seen'],
                    release_group['last_seen'],
                    release_group['play_count']
                )
            )

    def initialize(self, batch_size: int = 10000):
        """
        Initialize all MB canonical tables from fact_plays.

        Args:
            batch_size: Number of records to process per batch
        """
        total_plays = self.get_fact_plays_count()
        print(f"Total plays to process: {total_plays:,}")

        processed = 0
        offset = 0

        while offset < total_plays:
            print(f"\nProcessing batch {offset:,} to {min(offset + batch_size, total_plays):,}...")

            # Extract entities from batch
            entities = self.process_plays_batch(offset, batch_size)

            # Upsert entities
            print(f"  Upserting {len(entities['artists'])} artists...")
            self.upsert_artists(entities['artists'])

            print(f"  Upserting {len(entities['labels'])} labels...")
            self.upsert_labels(entities['labels'])

            print(f"  Upserting {len(entities['recordings'])} recordings...")
            self.upsert_recordings(entities['recordings'])

            print(f"  Upserting {len(entities['tracks'])} tracks...")
            self.upsert_tracks(entities['tracks'])

            print(f"  Upserting {len(entities['releases'])} releases...")
            self.upsert_releases(entities['releases'])

            print(f"  Upserting {len(entities['release_groups'])} release groups...")
            self.upsert_release_groups(entities['release_groups'])

            # Commit batch
            self.conn.commit()

            processed += batch_size
            offset += batch_size

            progress = min(100, (offset / total_plays) * 100)
            print(f"  Progress: {progress:.1f}%")

        print("\nInitialization complete!")

        # Print final stats
        cursor = self.conn.cursor()
        print("\nFinal entity counts:")
        for table in ['mb_artists', 'mb_labels', 'mb_recordings', 'mb_tracks', 'mb_releases', 'mb_release_groups']:
            cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count:,}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Initialize MusicBrainz canonical tables from fact_plays"
    )
    parser.add_argument(
        '--db',
        type=str,
        default='data/kexp_plays.db',
        help='Path to SQLite database (default: data/kexp_plays.db)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=10000,
        help='Number of records to process per batch (default: 10000)'
    )

    args = parser.parse_args()

    # Check if database exists
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    print(f"Initializing MB canonical tables from: {db_path}")
    print(f"Batch size: {args.batch_size:,}\n")

    initializer = MBCanonicalInitializer(str(db_path))
    try:
        initializer.initialize(batch_size=args.batch_size)
    finally:
        initializer.close()

    print("\nDone!")


if __name__ == '__main__':
    main()
