"""
MusicBrainz Canonical Data Service

This module provides high-level access to the canonical MusicBrainz entity tables
that are automatically maintained by database triggers. These tables provide
quick lookup and statistics for all MB entities extracted from plays.
"""

import sqlite3
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from pathlib import Path


class MBCanonicalService:
    """Service for querying MusicBrainz canonical entity tables."""

    def __init__(self, db_path: str):
        """
        Initialize the service with a database connection.

        Args:
            db_path: Path to the SQLite database
        """
        self.db_path = db_path

    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ========================================
    # Artist Queries
    # ========================================

    def get_artist(self, artist_mbid: str) -> Optional[Dict[str, Any]]:
        """
        Get artist details by MusicBrainz ID.

        Args:
            artist_mbid: Artist MusicBrainz UUID

        Returns:
            Artist dictionary or None if not found
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT artist_mbid, artist_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_artists
                WHERE artist_mbid = ?
                """,
                (artist_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_artists(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """
        Get top artists by play count.

        Args:
            limit: Maximum number of artists to return
            min_plays: Minimum play count to include

        Returns:
            List of artist dictionaries ordered by play count descending
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT artist_mbid, artist_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_artists
                WHERE play_count >= ?
                ORDER BY play_count DESC, artist_name ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_recent_artists(self, days: int = 7, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get artists recently played within the specified time window.

        Args:
            days: Number of days to look back
            limit: Maximum number of artists to return

        Returns:
            List of artist dictionaries ordered by last_seen descending
        """
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT artist_mbid, artist_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_artists
                WHERE last_seen >= ?
                ORDER BY last_seen DESC
                LIMIT ?
                """,
                (cutoff, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    def search_artists(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Search artists by name.

        Args:
            query: Search term for artist name
            limit: Maximum number of results

        Returns:
            List of matching artist dictionaries
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT artist_mbid, artist_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_artists
                WHERE artist_name LIKE ?
                ORDER BY play_count DESC, artist_name ASC
                LIMIT ?
                """,
                (f'%{query}%', limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Label Queries
    # ========================================

    def get_label(self, label_mbid: str) -> Optional[Dict[str, Any]]:
        """Get label details by MusicBrainz ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT label_mbid, label_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_labels
                WHERE label_mbid = ?
                """,
                (label_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_labels(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """Get top labels by play count."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT label_mbid, label_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_labels
                WHERE play_count >= ?
                ORDER BY play_count DESC, label_name ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    def search_labels(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search labels by name."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT label_mbid, label_name, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_labels
                WHERE label_name LIKE ?
                ORDER BY play_count DESC, label_name ASC
                LIMIT ?
                """,
                (f'%{query}%', limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Recording Queries
    # ========================================

    def get_recording(self, recording_mbid: str) -> Optional[Dict[str, Any]]:
        """Get recording details by MusicBrainz ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT recording_mbid, song_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_recordings
                WHERE recording_mbid = ?
                """,
                (recording_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_recordings(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """Get top recordings by play count."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT recording_mbid, song_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_recordings
                WHERE play_count >= ?
                ORDER BY play_count DESC, song_title ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Track Queries
    # ========================================

    def get_track(self, track_mbid: str) -> Optional[Dict[str, Any]]:
        """Get track details by MusicBrainz ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT track_mbid, song_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_tracks
                WHERE track_mbid = ?
                """,
                (track_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_tracks(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """Get top tracks by play count."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT track_mbid, song_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_tracks
                WHERE play_count >= ?
                ORDER BY play_count DESC, song_title ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Release Queries
    # ========================================

    def get_release(self, release_mbid: str) -> Optional[Dict[str, Any]]:
        """Get release details by MusicBrainz ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT release_mbid, album_title, release_date, first_seen,
                       last_seen, play_count, created_at, updated_at
                FROM mb_releases
                WHERE release_mbid = ?
                """,
                (release_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_releases(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """Get top releases by play count."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT release_mbid, album_title, release_date, first_seen,
                       last_seen, play_count, created_at, updated_at
                FROM mb_releases
                WHERE play_count >= ?
                ORDER BY play_count DESC, album_title ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_releases_by_year(self, year: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get releases by release year."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT release_mbid, album_title, release_date, first_seen,
                       last_seen, play_count, created_at, updated_at
                FROM mb_releases
                WHERE release_date LIKE ?
                ORDER BY play_count DESC, album_title ASC
                LIMIT ?
                """,
                (f'{year}%', limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Release Group Queries
    # ========================================

    def get_release_group(self, release_group_mbid: str) -> Optional[Dict[str, Any]]:
        """Get release group details by MusicBrainz ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT release_group_mbid, album_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_release_groups
                WHERE release_group_mbid = ?
                """,
                (release_group_mbid,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_top_release_groups(self, limit: int = 100, min_plays: int = 1) -> List[Dict[str, Any]]:
        """Get top release groups by play count."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT release_group_mbid, album_title, first_seen, last_seen,
                       play_count, created_at, updated_at
                FROM mb_release_groups
                WHERE play_count >= ?
                ORDER BY play_count DESC, album_title ASC
                LIMIT ?
                """,
                (min_plays, limit)
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========================================
    # Statistics and Analytics
    # ========================================

    def get_overall_stats(self) -> Dict[str, Any]:
        """
        Get overall statistics about MB entities in the database.

        Returns:
            Dictionary with counts and coverage statistics
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # Count entities
            cursor.execute("SELECT COUNT(*) as count FROM mb_artists")
            artist_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM mb_labels")
            label_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM mb_recordings")
            recording_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM mb_tracks")
            track_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM mb_releases")
            release_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM mb_release_groups")
            release_group_count = cursor.fetchone()['count']

            # Total plays
            cursor.execute("SELECT COUNT(*) as count FROM fact_plays")
            total_plays = cursor.fetchone()['count']

            # Plays with MB IDs
            cursor.execute("""
                SELECT COUNT(*) as count FROM fact_plays
                WHERE artist_ids IS NOT NULL AND artist_ids != '[]'
            """)
            plays_with_artists = cursor.fetchone()['count']

            cursor.execute("""
                SELECT COUNT(*) as count FROM fact_plays
                WHERE recording_id IS NOT NULL AND recording_id != ''
            """)
            plays_with_recordings = cursor.fetchone()['count']

            cursor.execute("""
                SELECT COUNT(*) as count FROM fact_plays
                WHERE release_id IS NOT NULL AND release_id != ''
            """)
            plays_with_releases = cursor.fetchone()['count']

            return {
                'total_plays': total_plays,
                'unique_artists': artist_count,
                'unique_labels': label_count,
                'unique_recordings': recording_count,
                'unique_tracks': track_count,
                'unique_releases': release_count,
                'unique_release_groups': release_group_count,
                'coverage': {
                    'artist_coverage_pct': (plays_with_artists / total_plays * 100) if total_plays > 0 else 0,
                    'recording_coverage_pct': (plays_with_recordings / total_plays * 100) if total_plays > 0 else 0,
                    'release_coverage_pct': (plays_with_releases / total_plays * 100) if total_plays > 0 else 0,
                }
            }

    def get_entity_counts(self) -> Dict[str, int]:
        """
        Get simple count of entities in each canonical table.

        Returns:
            Dictionary mapping entity type to count
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()

            counts = {}
            for table, key in [
                ('mb_artists', 'artists'),
                ('mb_labels', 'labels'),
                ('mb_recordings', 'recordings'),
                ('mb_tracks', 'tracks'),
                ('mb_releases', 'releases'),
                ('mb_release_groups', 'release_groups'),
            ]:
                cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                counts[key] = cursor.fetchone()['count']

            return counts

    def format_stats_report(self) -> str:
        """
        Generate a formatted report of MB entity statistics.

        Returns:
            Human-readable statistics report
        """
        stats = self.get_overall_stats()

        return f"""
MusicBrainz Canonical Tables Statistics
{'=' * 50}

Total Plays in Database: {stats['total_plays']:,}

Unique Entities:
  Artists:        {stats['unique_artists']:,}
  Labels:         {stats['unique_labels']:,}
  Recordings:     {stats['unique_recordings']:,}
  Tracks:         {stats['unique_tracks']:,}
  Releases:       {stats['unique_releases']:,}
  Release Groups: {stats['unique_release_groups']:,}

Coverage:
  Plays with Artist IDs:    {stats['coverage']['artist_coverage_pct']:.2f}%
  Plays with Recording IDs: {stats['coverage']['recording_coverage_pct']:.2f}%
  Plays with Release IDs:   {stats['coverage']['release_coverage_pct']:.2f}%
""".strip()
