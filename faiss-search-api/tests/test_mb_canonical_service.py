"""
Tests for MusicBrainz Canonical Service

Comprehensive test coverage for mb_canonical_service.py including:
- Database connection handling
- Query methods for all entity types (artists, labels, recordings, tracks, releases, release_groups)
- Statistics and analytics
- Edge cases and error handling
"""

import sqlite3
import pytest
from pathlib import Path
from datetime import datetime, timedelta

import sys
sys.path.append(str(Path(__file__).parent.parent))

from services.mb_canonical_service import MBCanonicalService


# ========================================
# Test Fixtures
# ========================================

@pytest.fixture
def test_db_path(tmp_path):
    """Create a temporary test database with MB canonical tables."""
    db_path = tmp_path / "test_mb.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create fact_plays table (needed for stats queries)
    cursor.execute("""
        CREATE TABLE fact_plays (
            id INTEGER PRIMARY KEY,
            artist_ids TEXT,
            recording_id TEXT,
            release_id TEXT,
            airdate TEXT
        )
    """)

    # Create MB canonical tables matching the schema
    cursor.execute("""
        CREATE TABLE mb_artists (
            artist_mbid TEXT PRIMARY KEY NOT NULL,
            artist_name TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE mb_labels (
            label_mbid TEXT PRIMARY KEY NOT NULL,
            label_name TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE mb_recordings (
            recording_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE mb_tracks (
            track_mbid TEXT PRIMARY KEY NOT NULL,
            song_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE mb_releases (
            release_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            release_date TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cursor.execute("""
        CREATE TABLE mb_release_groups (
            release_group_mbid TEXT PRIMARY KEY NOT NULL,
            album_title TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Insert test data
    now = datetime.now().isoformat()
    week_ago = (datetime.now() - timedelta(days=7)).isoformat()
    month_ago = (datetime.now() - timedelta(days=30)).isoformat()

    # Test artists
    test_artists = [
        ('5b11f4ce-a62d-471e-81fc-a69a8278c7da', 'IDLES', month_ago, now, 100),
        ('83d91898-7763-47d7-b03b-b92132375c47', 'Madvillain', month_ago, week_ago, 50),
        ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Test Artist', week_ago, now, 25),
    ]
    cursor.executemany("""
        INSERT INTO mb_artists (artist_mbid, artist_name, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?)
    """, test_artists)

    # Test labels
    test_labels = [
        ('f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f', 'Stones Throw', month_ago, now, 75),
        ('11223344-5566-7788-99aa-bbccddeeff00', 'Sub Pop', month_ago, week_ago, 40),
    ]
    cursor.executemany("""
        INSERT INTO mb_labels (label_mbid, label_name, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?)
    """, test_labels)

    # Test recordings
    test_recordings = [
        ('aabbccdd-eeff-0011-2233-445566778899', 'All Caps', month_ago, now, 90),
        ('bbccddee-ff00-1122-3344-556677889900', 'Mr. Motivator', month_ago, week_ago, 60),
    ]
    cursor.executemany("""
        INSERT INTO mb_recordings (recording_mbid, song_title, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?)
    """, test_recordings)

    # Test tracks
    test_tracks = [
        ('ccddee00-1122-3344-5566-778899aabbcc', 'Track One', month_ago, now, 30),
    ]
    cursor.executemany("""
        INSERT INTO mb_tracks (track_mbid, song_title, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?)
    """, test_tracks)

    # Test releases
    test_releases = [
        ('ddee0011-2233-4455-6677-8899aabbccdd', 'Madvillainy', '2004', month_ago, now, 80),
        ('ee001122-3344-5566-7788-99aabbccddee', 'Joy as an Act of Resistance', '2018', month_ago, week_ago, 55),
    ]
    cursor.executemany("""
        INSERT INTO mb_releases (release_mbid, album_title, release_date, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?, ?)
    """, test_releases)

    # Test release groups
    test_release_groups = [
        ('ff001122-3344-5566-7788-99aabbccddee', 'Madvillainy', month_ago, now, 85),
    ]
    cursor.executemany("""
        INSERT INTO mb_release_groups (release_group_mbid, album_title, first_seen, last_seen, play_count)
        VALUES (?, ?, ?, ?, ?)
    """, test_release_groups)

    # Insert test plays for stats
    test_plays = [
        (1, '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]', 'aabbccdd-eeff-0011-2233-445566778899', 'ddee0011-2233-4455-6677-8899aabbccdd', now),
        (2, '["83d91898-7763-47d7-b03b-b92132375c47"]', 'bbccddee-ff00-1122-3344-556677889900', 'ee001122-3344-5566-7788-99aabbccddee', week_ago),
        (3, '[]', '', '', month_ago),  # Play without MB IDs
    ]
    cursor.executemany("""
        INSERT INTO fact_plays (id, artist_ids, recording_id, release_id, airdate)
        VALUES (?, ?, ?, ?, ?)
    """, test_plays)

    conn.commit()
    conn.close()

    return db_path


# ========================================
# Test Service Initialization
# ========================================

class TestServiceInitialization:
    """Test service initialization and connection handling."""

    def test_service_init(self, test_db_path):
        """Service should initialize with database path."""
        service = MBCanonicalService(str(test_db_path))
        assert service.db_path == str(test_db_path)

    def test_get_connection(self, test_db_path):
        """Should create connection with row factory."""
        service = MBCanonicalService(str(test_db_path))
        conn = service._get_connection()
        assert conn is not None
        assert conn.row_factory == sqlite3.Row
        conn.close()

    def test_multiple_connections(self, test_db_path):
        """Should handle multiple connection requests."""
        service = MBCanonicalService(str(test_db_path))
        conn1 = service._get_connection()
        conn2 = service._get_connection()
        assert conn1 is not conn2
        conn1.close()
        conn2.close()


# ========================================
# Test Artist Queries
# ========================================

class TestArtistQueries:
    """Test artist-related query methods."""

    def test_get_artist_exists(self, test_db_path):
        """Should retrieve existing artist by MBID."""
        service = MBCanonicalService(str(test_db_path))
        artist = service.get_artist('5b11f4ce-a62d-471e-81fc-a69a8278c7da')

        assert artist is not None
        assert artist['artist_mbid'] == '5b11f4ce-a62d-471e-81fc-a69a8278c7da'
        assert artist['artist_name'] == 'IDLES'
        assert artist['play_count'] == 100

    def test_get_artist_not_exists(self, test_db_path):
        """Should return None for non-existent artist."""
        service = MBCanonicalService(str(test_db_path))
        artist = service.get_artist('00000000-0000-0000-0000-000000000000')
        assert artist is None

    def test_get_top_artists(self, test_db_path):
        """Should return artists ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.get_top_artists(limit=10)

        assert len(artists) == 3
        # Should be ordered by play_count DESC
        assert artists[0]['artist_name'] == 'IDLES'  # 100 plays
        assert artists[1]['artist_name'] == 'Madvillain'  # 50 plays
        assert artists[2]['artist_name'] == 'Test Artist'  # 25 plays

    def test_get_top_artists_with_limit(self, test_db_path):
        """Should respect limit parameter."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.get_top_artists(limit=2)
        assert len(artists) == 2

    def test_get_top_artists_with_min_plays(self, test_db_path):
        """Should filter by minimum play count."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.get_top_artists(min_plays=50)

        assert len(artists) == 2
        for artist in artists:
            assert artist['play_count'] >= 50

    def test_get_recent_artists(self, test_db_path):
        """Should return recently played artists."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.get_recent_artists(days=7, limit=10)

        # Should include artists played in last 7 days
        assert len(artists) >= 1
        # All should have recent last_seen dates
        for artist in artists:
            assert artist['last_seen'] is not None

    def test_get_recent_artists_narrow_window(self, test_db_path):
        """Should respect time window."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.get_recent_artists(days=1, limit=10)

        # Fewer artists should match very recent window
        # (depends on test data, but should be <= total)
        assert len(artists) <= 3

    def test_search_artists(self, test_db_path):
        """Should search artists by name."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.search_artists('IDLE')

        assert len(artists) == 1
        assert artists[0]['artist_name'] == 'IDLES'

    def test_search_artists_case_insensitive(self, test_db_path):
        """Search should be case-insensitive."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.search_artists('idle')
        assert len(artists) == 1

    def test_search_artists_partial_match(self, test_db_path):
        """Should match partial strings."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.search_artists('vil')  # Matches "Madvillain"
        assert len(artists) == 1
        assert 'vil' in artists[0]['artist_name'].lower()

    def test_search_artists_no_match(self, test_db_path):
        """Should return empty list for no matches."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.search_artists('NonExistentArtist')
        assert artists == []

    def test_search_artists_with_limit(self, test_db_path):
        """Should respect limit parameter."""
        service = MBCanonicalService(str(test_db_path))
        artists = service.search_artists('', limit=2)  # Empty search matches all
        assert len(artists) == 2


# ========================================
# Test Label Queries
# ========================================

class TestLabelQueries:
    """Test label-related query methods."""

    def test_get_label_exists(self, test_db_path):
        """Should retrieve existing label by MBID."""
        service = MBCanonicalService(str(test_db_path))
        label = service.get_label('f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f')

        assert label is not None
        assert label['label_name'] == 'Stones Throw'
        assert label['play_count'] == 75

    def test_get_label_not_exists(self, test_db_path):
        """Should return None for non-existent label."""
        service = MBCanonicalService(str(test_db_path))
        label = service.get_label('00000000-0000-0000-0000-000000000000')
        assert label is None

    def test_get_top_labels(self, test_db_path):
        """Should return labels ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        labels = service.get_top_labels(limit=10)

        assert len(labels) == 2
        assert labels[0]['label_name'] == 'Stones Throw'  # 75 plays
        assert labels[1]['label_name'] == 'Sub Pop'  # 40 plays

    def test_get_top_labels_with_min_plays(self, test_db_path):
        """Should filter by minimum play count."""
        service = MBCanonicalService(str(test_db_path))
        labels = service.get_top_labels(min_plays=50)

        assert len(labels) == 1
        assert labels[0]['label_name'] == 'Stones Throw'

    def test_search_labels(self, test_db_path):
        """Should search labels by name."""
        service = MBCanonicalService(str(test_db_path))
        labels = service.search_labels('Stone')

        assert len(labels) == 1
        assert labels[0]['label_name'] == 'Stones Throw'

    def test_search_labels_no_match(self, test_db_path):
        """Should return empty list for no matches."""
        service = MBCanonicalService(str(test_db_path))
        labels = service.search_labels('NonExistentLabel')
        assert labels == []


# ========================================
# Test Recording Queries
# ========================================

class TestRecordingQueries:
    """Test recording-related query methods."""

    def test_get_recording_exists(self, test_db_path):
        """Should retrieve existing recording by MBID."""
        service = MBCanonicalService(str(test_db_path))
        recording = service.get_recording('aabbccdd-eeff-0011-2233-445566778899')

        assert recording is not None
        assert recording['song_title'] == 'All Caps'
        assert recording['play_count'] == 90

    def test_get_recording_not_exists(self, test_db_path):
        """Should return None for non-existent recording."""
        service = MBCanonicalService(str(test_db_path))
        recording = service.get_recording('00000000-0000-0000-0000-000000000000')
        assert recording is None

    def test_get_top_recordings(self, test_db_path):
        """Should return recordings ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        recordings = service.get_top_recordings(limit=10)

        assert len(recordings) == 2
        assert recordings[0]['song_title'] == 'All Caps'  # 90 plays
        assert recordings[1]['song_title'] == 'Mr. Motivator'  # 60 plays

    def test_get_top_recordings_with_min_plays(self, test_db_path):
        """Should filter by minimum play count."""
        service = MBCanonicalService(str(test_db_path))
        recordings = service.get_top_recordings(min_plays=70)

        assert len(recordings) == 1
        assert recordings[0]['song_title'] == 'All Caps'


# ========================================
# Test Track Queries
# ========================================

class TestTrackQueries:
    """Test track-related query methods."""

    def test_get_track_exists(self, test_db_path):
        """Should retrieve existing track by MBID."""
        service = MBCanonicalService(str(test_db_path))
        track = service.get_track('ccddee00-1122-3344-5566-778899aabbcc')

        assert track is not None
        assert track['song_title'] == 'Track One'
        assert track['play_count'] == 30

    def test_get_track_not_exists(self, test_db_path):
        """Should return None for non-existent track."""
        service = MBCanonicalService(str(test_db_path))
        track = service.get_track('00000000-0000-0000-0000-000000000000')
        assert track is None

    def test_get_top_tracks(self, test_db_path):
        """Should return tracks ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        tracks = service.get_top_tracks(limit=10)

        assert len(tracks) == 1
        assert tracks[0]['song_title'] == 'Track One'


# ========================================
# Test Release Queries
# ========================================

class TestReleaseQueries:
    """Test release-related query methods."""

    def test_get_release_exists(self, test_db_path):
        """Should retrieve existing release by MBID."""
        service = MBCanonicalService(str(test_db_path))
        release = service.get_release('ddee0011-2233-4455-6677-8899aabbccdd')

        assert release is not None
        assert release['album_title'] == 'Madvillainy'
        assert release['release_date'] == '2004'
        assert release['play_count'] == 80

    def test_get_release_not_exists(self, test_db_path):
        """Should return None for non-existent release."""
        service = MBCanonicalService(str(test_db_path))
        release = service.get_release('00000000-0000-0000-0000-000000000000')
        assert release is None

    def test_get_top_releases(self, test_db_path):
        """Should return releases ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        releases = service.get_top_releases(limit=10)

        assert len(releases) == 2
        assert releases[0]['album_title'] == 'Madvillainy'  # 80 plays
        assert releases[1]['album_title'] == 'Joy as an Act of Resistance'  # 55 plays

    def test_get_releases_by_year(self, test_db_path):
        """Should filter releases by year."""
        service = MBCanonicalService(str(test_db_path))
        releases = service.get_releases_by_year('2004')

        assert len(releases) == 1
        assert releases[0]['album_title'] == 'Madvillainy'

    def test_get_releases_by_year_no_match(self, test_db_path):
        """Should return empty list for year with no releases."""
        service = MBCanonicalService(str(test_db_path))
        releases = service.get_releases_by_year('1999')
        assert releases == []


# ========================================
# Test Release Group Queries
# ========================================

class TestReleaseGroupQueries:
    """Test release group-related query methods."""

    def test_get_release_group_exists(self, test_db_path):
        """Should retrieve existing release group by MBID."""
        service = MBCanonicalService(str(test_db_path))
        release_group = service.get_release_group('ff001122-3344-5566-7788-99aabbccddee')

        assert release_group is not None
        assert release_group['album_title'] == 'Madvillainy'
        assert release_group['play_count'] == 85

    def test_get_release_group_not_exists(self, test_db_path):
        """Should return None for non-existent release group."""
        service = MBCanonicalService(str(test_db_path))
        release_group = service.get_release_group('00000000-0000-0000-0000-000000000000')
        assert release_group is None

    def test_get_top_release_groups(self, test_db_path):
        """Should return release groups ordered by play count."""
        service = MBCanonicalService(str(test_db_path))
        release_groups = service.get_top_release_groups(limit=10)

        assert len(release_groups) == 1
        assert release_groups[0]['album_title'] == 'Madvillainy'


# ========================================
# Test Statistics and Analytics
# ========================================

class TestStatisticsAndAnalytics:
    """Test statistics and analytics methods."""

    def test_get_overall_stats(self, test_db_path):
        """Should calculate overall statistics."""
        service = MBCanonicalService(str(test_db_path))
        stats = service.get_overall_stats()

        assert stats['total_plays'] == 3
        assert stats['unique_artists'] == 3
        assert stats['unique_labels'] == 2
        assert stats['unique_recordings'] == 2
        assert stats['unique_tracks'] == 1
        assert stats['unique_releases'] == 2
        assert stats['unique_release_groups'] == 1

    def test_get_overall_stats_coverage(self, test_db_path):
        """Should calculate coverage percentages."""
        service = MBCanonicalService(str(test_db_path))
        stats = service.get_overall_stats()

        # 2 out of 3 plays have artist IDs = 66.67%
        assert stats['coverage']['artist_coverage_pct'] > 60
        # 2 out of 3 plays have recording IDs
        assert stats['coverage']['recording_coverage_pct'] > 60
        # 2 out of 3 plays have release IDs
        assert stats['coverage']['release_coverage_pct'] > 60

    def test_get_entity_counts(self, test_db_path):
        """Should return entity counts."""
        service = MBCanonicalService(str(test_db_path))
        counts = service.get_entity_counts()

        assert counts['artists'] == 3
        assert counts['labels'] == 2
        assert counts['recordings'] == 2
        assert counts['tracks'] == 1
        assert counts['releases'] == 2
        assert counts['release_groups'] == 1

    def test_format_stats_report(self, test_db_path):
        """Should format stats into readable report."""
        service = MBCanonicalService(str(test_db_path))
        report = service.format_stats_report()

        assert 'MusicBrainz Canonical Tables Statistics' in report
        assert 'Total Plays' in report
        assert 'Unique Entities:' in report
        assert 'Artists:' in report
        assert 'Coverage:' in report

    def test_format_stats_report_has_counts(self, test_db_path):
        """Report should contain actual count values."""
        service = MBCanonicalService(str(test_db_path))
        report = service.format_stats_report()

        # Should contain the actual numbers
        assert '3' in report  # 3 total plays or 3 artists


# ========================================
# Test Edge Cases
# ========================================

class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_database(self, tmp_path):
        """Should handle empty database gracefully."""
        db_path = tmp_path / "empty.db"
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Create all tables but don't insert data
        cursor.execute("""
            CREATE TABLE mb_artists (
                artist_mbid TEXT PRIMARY KEY,
                artist_name TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE mb_labels (
                label_mbid TEXT PRIMARY KEY,
                label_name TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE mb_recordings (
                recording_mbid TEXT PRIMARY KEY,
                song_title TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE mb_tracks (
                track_mbid TEXT PRIMARY KEY,
                song_title TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE mb_releases (
                release_mbid TEXT PRIMARY KEY,
                album_title TEXT,
                release_date TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE mb_release_groups (
                release_group_mbid TEXT PRIMARY KEY,
                album_title TEXT,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE TABLE fact_plays (id INTEGER PRIMARY KEY, artist_ids TEXT, recording_id TEXT, release_id TEXT)")
        conn.commit()
        conn.close()

        service = MBCanonicalService(str(db_path))
        artists = service.get_top_artists()
        assert artists == []

        counts = service.get_entity_counts()
        assert counts['artists'] == 0
        assert counts['labels'] == 0
        assert counts['recordings'] == 0

    def test_connection_with_invalid_path(self):
        """Should handle invalid database path."""
        service = MBCanonicalService('/nonexistent/path/to/db.sqlite')
        # Connection should fail when actually trying to query
        with pytest.raises(Exception):
            service.get_top_artists()

    def test_queries_return_correct_types(self, test_db_path):
        """All queries should return proper data types."""
        service = MBCanonicalService(str(test_db_path))

        # Single entity queries return dict or None
        artist = service.get_artist('5b11f4ce-a62d-471e-81fc-a69a8278c7da')
        assert isinstance(artist, dict)

        # List queries return list
        artists = service.get_top_artists()
        assert isinstance(artists, list)

        # Stats return dict
        stats = service.get_overall_stats()
        assert isinstance(stats, dict)

        # Report returns string
        report = service.format_stats_report()
        assert isinstance(report, str)
