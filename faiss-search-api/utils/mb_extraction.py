"""
MusicBrainz ID Extraction Utilities

This module provides utilities for extracting, validating, and working with
MusicBrainz (MB) IDs from KEXP play data. These utilities help maintain
a clean, canonical list of all MB entities (artists, labels, recordings,
releases, release groups) in the database.
"""

import json
import re
from typing import Dict, List, Optional, Tuple, Any, Set
from uuid import UUID
from datetime import datetime


# MusicBrainz UUID pattern (standard UUID v4 format)
MB_UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


class MBIDExtractor:
    """Extract and validate MusicBrainz IDs from play data."""

    @staticmethod
    def validate_mb_uuid(mb_id: Optional[str]) -> bool:
        """
        Validate that a string is a properly formatted MusicBrainz UUID.

        Args:
            mb_id: String to validate

        Returns:
            True if valid MB UUID, False otherwise
        """
        if not mb_id or not isinstance(mb_id, str):
            return False
        return bool(MB_UUID_PATTERN.match(mb_id.strip()))

    @staticmethod
    def normalize_mb_uuid(mb_id: Optional[str]) -> Optional[str]:
        """
        Normalize a MusicBrainz UUID to lowercase format.

        Args:
            mb_id: UUID string to normalize

        Returns:
            Lowercase UUID string or None if invalid
        """
        if not mb_id:
            return None
        mb_id = mb_id.strip()
        if MBIDExtractor.validate_mb_uuid(mb_id):
            return mb_id.lower()
        return None

    @staticmethod
    def extract_artist_mb_ids(play_data: Dict[str, Any]) -> List[str]:
        """
        Extract all artist MusicBrainz IDs from play data.

        Args:
            play_data: Dictionary containing play information

        Returns:
            List of validated artist MB UUIDs (lowercase)
        """
        artist_ids: List[str] = []

        # Handle artist_ids field (can be string JSON or list)
        raw_ids = play_data.get('artist_ids')
        if raw_ids:
            if isinstance(raw_ids, str):
                try:
                    parsed = json.loads(raw_ids)
                    if isinstance(parsed, list):
                        artist_ids = parsed
                except json.JSONDecodeError:
                    pass
            elif isinstance(raw_ids, list):
                artist_ids = raw_ids

        # Validate and normalize all IDs
        return [
            normalized
            for mb_id in artist_ids
            if (normalized := MBIDExtractor.normalize_mb_uuid(mb_id)) is not None
        ]

    @staticmethod
    def extract_recording_mb_id(play_data: Dict[str, Any]) -> Optional[str]:
        """
        Extract recording MusicBrainz ID from play data.

        Args:
            play_data: Dictionary containing play information

        Returns:
            Validated recording MB UUID (lowercase) or None
        """
        recording_id = play_data.get('recording_id') or play_data.get('recording_mbid')
        return MBIDExtractor.normalize_mb_uuid(recording_id)

    @staticmethod
    def extract_track_mb_id(play_data: Dict[str, Any]) -> Optional[str]:
        """
        Extract track MusicBrainz ID from play data.

        Args:
            play_data: Dictionary containing play information

        Returns:
            Validated track MB UUID (lowercase) or None
        """
        track_id = play_data.get('track_id')
        return MBIDExtractor.normalize_mb_uuid(track_id)

    @staticmethod
    def extract_release_mb_ids(play_data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract release and release group MusicBrainz IDs from play data.

        Args:
            play_data: Dictionary containing play information

        Returns:
            Tuple of (release_id, release_group_id), either may be None
        """
        release_id = play_data.get('release_id') or play_data.get('release_mbid')
        release_group_id = play_data.get('release_group_id') or play_data.get('release_group_mbid')

        return (
            MBIDExtractor.normalize_mb_uuid(release_id),
            MBIDExtractor.normalize_mb_uuid(release_group_id)
        )

    @staticmethod
    def extract_label_mb_ids(play_data: Dict[str, Any]) -> List[str]:
        """
        Extract all label MusicBrainz IDs from play data.

        Args:
            play_data: Dictionary containing play information

        Returns:
            List of validated label MB UUIDs (lowercase)
        """
        label_ids: List[str] = []

        # Handle label_ids field (can be string JSON or list)
        raw_ids = play_data.get('label_ids')
        if raw_ids:
            if isinstance(raw_ids, str):
                try:
                    parsed = json.loads(raw_ids)
                    if isinstance(parsed, list):
                        label_ids = parsed
                except json.JSONDecodeError:
                    pass
            elif isinstance(raw_ids, list):
                label_ids = raw_ids

        # Validate and normalize all IDs
        return [
            normalized
            for mb_id in label_ids
            if (normalized := MBIDExtractor.normalize_mb_uuid(mb_id)) is not None
        ]

    @staticmethod
    def extract_all_mb_ids(play_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract all MusicBrainz IDs from play data in a structured format.

        Args:
            play_data: Dictionary containing play information

        Returns:
            Dictionary with categorized MB IDs:
            {
                'artist_ids': [...],
                'recording_id': '...' or None,
                'track_id': '...' or None,
                'release_id': '...' or None,
                'release_group_id': '...' or None,
                'label_ids': [...]
            }
        """
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)

        return {
            'artist_ids': MBIDExtractor.extract_artist_mb_ids(play_data),
            'recording_id': MBIDExtractor.extract_recording_mb_id(play_data),
            'track_id': MBIDExtractor.extract_track_mb_id(play_data),
            'release_id': release_id,
            'release_group_id': release_group_id,
            'label_ids': MBIDExtractor.extract_label_mb_ids(play_data),
        }


class MBIDStats:
    """Generate statistics and reports about MusicBrainz ID coverage."""

    @staticmethod
    def calculate_coverage(plays: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate MB ID coverage statistics for a list of plays.

        Args:
            plays: List of play dictionaries

        Returns:
            Dictionary with coverage statistics
        """
        if not plays:
            return {
                'total_plays': 0,
                'artist_coverage': 0.0,
                'recording_coverage': 0.0,
                'release_coverage': 0.0,
                'release_group_coverage': 0.0,
                'label_coverage': 0.0,
                'unique_artists': 0,
                'unique_recordings': 0,
                'unique_releases': 0,
                'unique_release_groups': 0,
                'unique_labels': 0,
            }

        total = len(plays)
        artist_count = 0
        recording_count = 0
        release_count = 0
        release_group_count = 0
        label_count = 0

        unique_artists: Set[str] = set()
        unique_recordings: Set[str] = set()
        unique_releases: Set[str] = set()
        unique_release_groups: Set[str] = set()
        unique_labels: Set[str] = set()

        for play in plays:
            mb_ids = MBIDExtractor.extract_all_mb_ids(play)

            if mb_ids['artist_ids']:
                artist_count += 1
                unique_artists.update(mb_ids['artist_ids'])

            if mb_ids['recording_id']:
                recording_count += 1
                unique_recordings.add(mb_ids['recording_id'])

            if mb_ids['release_id']:
                release_count += 1
                unique_releases.add(mb_ids['release_id'])

            if mb_ids['release_group_id']:
                release_group_count += 1
                unique_release_groups.add(mb_ids['release_group_id'])

            if mb_ids['label_ids']:
                label_count += 1
                unique_labels.update(mb_ids['label_ids'])

        return {
            'total_plays': total,
            'artist_coverage': (artist_count / total * 100) if total > 0 else 0.0,
            'recording_coverage': (recording_count / total * 100) if total > 0 else 0.0,
            'release_coverage': (release_count / total * 100) if total > 0 else 0.0,
            'release_group_coverage': (release_group_count / total * 100) if total > 0 else 0.0,
            'label_coverage': (label_count / total * 100) if total > 0 else 0.0,
            'unique_artists': len(unique_artists),
            'unique_recordings': len(unique_recordings),
            'unique_releases': len(unique_releases),
            'unique_release_groups': len(unique_release_groups),
            'unique_labels': len(unique_labels),
        }

    @staticmethod
    def format_coverage_report(stats: Dict[str, Any]) -> str:
        """
        Format coverage statistics as a human-readable report.

        Args:
            stats: Statistics dictionary from calculate_coverage()

        Returns:
            Formatted report string
        """
        return f"""
MusicBrainz ID Coverage Report
{'=' * 50}

Total Plays: {stats['total_plays']:,}

Coverage by Entity Type:
  Artists:        {stats['artist_coverage']:6.2f}% ({stats['unique_artists']:,} unique)
  Recordings:     {stats['recording_coverage']:6.2f}% ({stats['unique_recordings']:,} unique)
  Releases:       {stats['release_coverage']:6.2f}% ({stats['unique_releases']:,} unique)
  Release Groups: {stats['release_group_coverage']:6.2f}% ({stats['unique_release_groups']:,} unique)
  Labels:         {stats['label_coverage']:6.2f}% ({stats['unique_labels']:,} unique)
""".strip()


# Convenience functions for common operations

def get_all_artist_ids_from_plays(plays: List[Dict[str, Any]]) -> Set[str]:
    """Get unique set of all artist MB IDs from a list of plays."""
    artist_ids: Set[str] = set()
    for play in plays:
        artist_ids.update(MBIDExtractor.extract_artist_mb_ids(play))
    return artist_ids


def get_all_label_ids_from_plays(plays: List[Dict[str, Any]]) -> Set[str]:
    """Get unique set of all label MB IDs from a list of plays."""
    label_ids: Set[str] = set()
    for play in plays:
        label_ids.update(MBIDExtractor.extract_label_mb_ids(play))
    return label_ids


def get_all_recording_ids_from_plays(plays: List[Dict[str, Any]]) -> Set[str]:
    """Get unique set of all recording MB IDs from a list of plays."""
    recording_ids: Set[str] = set()
    for play in plays:
        recording_id = MBIDExtractor.extract_recording_mb_id(play)
        if recording_id:
            recording_ids.add(recording_id)
    return recording_ids


def get_all_release_ids_from_plays(plays: List[Dict[str, Any]]) -> Tuple[Set[str], Set[str]]:
    """
    Get unique sets of release and release group MB IDs from a list of plays.

    Returns:
        Tuple of (release_ids, release_group_ids) sets
    """
    release_ids: Set[str] = set()
    release_group_ids: Set[str] = set()

    for play in plays:
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play)
        if release_id:
            release_ids.add(release_id)
        if release_group_id:
            release_group_ids.add(release_group_id)

    return release_ids, release_group_ids
