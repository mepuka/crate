"""
Tests for MBID filtering in timeline queries.

This module tests the MBID filtering functionality added to the timeline API,
ensuring that filters work correctly across all navigation methods.
"""

import pytest
import sqlite3
import json
from pathlib import Path
import tempfile
from datetime import datetime

from app.services.db_service import DatabaseService


@pytest.fixture
def test_db():
    """Create a temporary test database with sample data."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.db', delete=False) as f:
        db_path = f.name

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create table
    cursor.execute("""
        CREATE TABLE fact_plays (
            id INTEGER PRIMARY KEY,
            airdate TEXT NOT NULL,
            show INTEGER NOT NULL,
            artist TEXT,
            song TEXT,
            album TEXT,
            labels TEXT,
            artist_ids TEXT,
            recording_id TEXT,
            release_id TEXT,
            release_group_id TEXT,
            track_id TEXT,
            rotation_status TEXT,
            is_local INTEGER,
            is_live INTEGER,
            is_request INTEGER,
            comment TEXT,
            image_uri TEXT,
            thumbnail_uri TEXT
        )
    """)

    # Create indexes
    cursor.execute("CREATE INDEX idx_plays_airdate_id ON fact_plays(airdate DESC, id DESC)")
    cursor.execute("CREATE INDEX idx_fact_plays_recording_id ON fact_plays(recording_id)")
    cursor.execute("CREATE INDEX idx_fact_plays_release_id ON fact_plays(release_id)")
    cursor.execute("CREATE INDEX idx_fact_plays_release_group_id ON fact_plays(release_group_id)")
    cursor.execute("CREATE INDEX idx_fact_plays_artist_ids ON fact_plays(artist_ids)")

    # Sample MBIDs for testing
    artist_mbid_1 = "a74b1b7f-71a5-4011-9441-d0b5e4122711"  # Radiohead
    artist_mbid_2 = "b071f9fa-14b0-4217-8e97-eb41da73f598"  # The Beatles
    recording_mbid_1 = "6b9b4b7f-71a5-4011-9441-d0b5e4122711"
    recording_mbid_2 = "7c8c5c8f-82b6-5122-a552-e1c6f5233822"
    release_mbid_1 = "8d9d6d9f-93c7-6233-b663-f2d7g6344933"
    release_group_mbid_1 = "9e0e7e0f-a4d8-7344-c774-g3e8h7455a44"

    # Insert test data with different MBIDs
    test_plays = [
        # Artist 1 plays
        (1, "2024-01-10T10:00:00", 100, "Radiohead", "Creep", "Pablo Honey",
         json.dumps(["Capitol"]), json.dumps([artist_mbid_1]),
         recording_mbid_1, release_mbid_1, release_group_mbid_1, None,
         "Heavy", 0, 0, 0, None, None, None),

        (2, "2024-01-09T14:00:00", 100, "Radiohead", "Karma Police", "OK Computer",
         json.dumps(["Capitol"]), json.dumps([artist_mbid_1]),
         recording_mbid_2, None, None, None,
         "Heavy", 0, 0, 0, None, None, None),

        # Artist 2 plays
        (3, "2024-01-08T16:00:00", 100, "The Beatles", "Hey Jude", "Hey Jude",
         json.dumps(["Apple"]), json.dumps([artist_mbid_2]),
         None, None, None, None,
         "Heavy", 0, 0, 0, None, None, None),

        (4, "2024-01-07T12:00:00", 100, "The Beatles", "Let It Be", "Let It Be",
         json.dumps(["Apple"]), json.dumps([artist_mbid_2]),
         None, None, None, None,
         "Heavy", 0, 0, 0, None, None, None),

        # No MBIDs
        (5, "2024-01-06T18:00:00", 100, "Unknown Artist", "Unknown Song", None,
         json.dumps([]), None, None, None, None, None,
         None, 0, 0, 0, None, None, None),
    ]

    cursor.executemany("""
        INSERT INTO fact_plays (
            id, airdate, show, artist, song, album, labels, artist_ids,
            recording_id, release_id, release_group_id, track_id,
            rotation_status, is_local, is_live, is_request,
            comment, image_uri, thumbnail_uri
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, test_plays)

    conn.commit()
    conn.close()

    yield db_path

    # Cleanup
    Path(db_path).unlink()


class TestMBIDFiltering:
    """Test MBID filtering across all timeline methods."""

    def test_cursor_filter_by_artist_mbid(self, test_db):
        """Test cursor pagination with artist MBID filter."""
        service = DatabaseService(test_db)

        # Filter by Radiohead MBID
        result = service.get_plays_by_cursor(
            limit=10,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(result['results']) == 2
        assert all("Radiohead" in play['artist'] for play in result['results'])
        assert result['results'][0]['id'] == 1  # Most recent first
        assert result['results'][1]['id'] == 2

    def test_cursor_filter_by_recording_mbid(self, test_db):
        """Test cursor pagination with recording MBID filter."""
        service = DatabaseService(test_db)

        result = service.get_plays_by_cursor(
            limit=10,
            recording_mbid="6b9b4b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(result['results']) == 1
        assert result['results'][0]['song'] == "Creep"

    def test_cursor_filter_by_release_mbid(self, test_db):
        """Test cursor pagination with release MBID filter."""
        service = DatabaseService(test_db)

        result = service.get_plays_by_cursor(
            limit=10,
            release_mbid="8d9d6d9f-93c7-6233-b663-f2d7g6344933"
        )

        assert len(result['results']) == 1
        assert result['results'][0]['album'] == "Pablo Honey"

    def test_cursor_filter_by_release_group_mbid(self, test_db):
        """Test cursor pagination with release group MBID filter."""
        service = DatabaseService(test_db)

        result = service.get_plays_by_cursor(
            limit=10,
            release_group_mbid="9e0e7e0f-a4d8-7344-c774-g3e8h7455a44"
        )

        assert len(result['results']) == 1
        assert result['results'][0]['album'] == "Pablo Honey"

    def test_cursor_multiple_filters(self, test_db):
        """Test cursor pagination with multiple MBID filters combined."""
        service = DatabaseService(test_db)

        # Filter by both artist and recording
        result = service.get_plays_by_cursor(
            limit=10,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711",
            recording_mbid="6b9b4b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(result['results']) == 1
        assert result['results'][0]['song'] == "Creep"
        assert "Radiohead" in result['results'][0]['artist']

    def test_time_range_with_mbid_filter(self, test_db):
        """Test time range query with MBID filter."""
        service = DatabaseService(test_db)

        since = datetime.fromisoformat("2024-01-01T00:00:00")
        until = datetime.fromisoformat("2024-01-31T23:59:59")

        result = service.get_plays_by_time_range(
            since=since,
            until=until,
            limit=10,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(result['results']) == 2
        assert all("Radiohead" in play['artist'] for play in result['results'])

    def test_percentage_with_mbid_filter(self, test_db):
        """Test percentage jump with MBID filter."""
        service = DatabaseService(test_db)

        # Jump to 0% (newest) of Radiohead plays
        result = service.get_plays_by_percentage(
            percentage=0.0,
            limit=10,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(result['results']) == 2
        assert result['total_count'] == 2  # Only 2 Radiohead plays
        assert all("Radiohead" in play['artist'] for play in result['results'])

    def test_anchor_with_mbid_filter(self, test_db):
        """Test anchor jump with MBID filter."""
        service = DatabaseService(test_db)

        # Get plays around ID 2 (Karma Police), filtered by artist
        result = service.get_plays_around_id(
            anchor_id=2,
            limit=10,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        # Should return both Radiohead plays centered on ID 2
        assert len(result['results']) == 2
        assert result['anchor_position'] is not None
        assert all("Radiohead" in play['artist'] for play in result['results'])

    def test_cursor_pagination_with_filter(self, test_db):
        """Test cursor pagination works correctly with filters."""
        service = DatabaseService(test_db)

        # First page with limit=1
        page1 = service.get_plays_by_cursor(
            limit=1,
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(page1['results']) == 1
        assert page1['has_more'] is True
        assert page1['next_cursor'] is not None

        # Second page using cursor
        page2 = service.get_plays_by_cursor(
            limit=1,
            cursor=page1['next_cursor'],
            artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711"
        )

        assert len(page2['results']) == 1
        assert page2['has_more'] is False
        assert page1['results'][0]['id'] != page2['results'][0]['id']

    def test_no_results_with_nonexistent_mbid(self, test_db):
        """Test that filtering by nonexistent MBID returns no results."""
        service = DatabaseService(test_db)

        result = service.get_plays_by_cursor(
            limit=10,
            artist_mbid="00000000-0000-0000-0000-000000000000"
        )

        assert len(result['results']) == 0
        assert result['has_more'] is False
        assert result['next_cursor'] is None

    def test_filter_without_mbid_returns_all(self, test_db):
        """Test that queries without MBID filters return all plays."""
        service = DatabaseService(test_db)

        result = service.get_plays_by_cursor(limit=10)

        assert len(result['results']) == 5  # All plays

    def test_mbid_filter_case_sensitivity(self, test_db):
        """Test that MBID filters are case-insensitive (as UUIDs should be)."""
        service = DatabaseService(test_db)

        # Test with uppercase MBID
        result = service.get_plays_by_cursor(
            limit=10,
            artist_mbid="A74B1B7F-71A5-4011-9441-D0B5E4122711"  # Uppercase
        )

        # Should still match (SQLite LIKE is case-insensitive for ASCII)
        assert len(result['results']) == 2


class TestBuildMBIDFilterClause:
    """Test the _build_mbid_filter_clause helper method."""

    def test_no_filters(self, test_db):
        """Test building filter clause with no filters."""
        service = DatabaseService(test_db)
        where_clause, params = service._build_mbid_filter_clause()

        assert where_clause == ""
        assert params == []

    def test_artist_filter_only(self, test_db):
        """Test building filter clause with artist filter only."""
        service = DatabaseService(test_db)
        where_clause, params = service._build_mbid_filter_clause(
            artist_mbid="test-mbid"
        )

        assert "artist_ids LIKE ?" in where_clause
        assert params == ['%"test-mbid"%']

    def test_recording_filter_only(self, test_db):
        """Test building filter clause with recording filter only."""
        service = DatabaseService(test_db)
        where_clause, params = service._build_mbid_filter_clause(
            recording_mbid="test-mbid"
        )

        assert "recording_id = ?" in where_clause
        assert params == ["test-mbid"]

    def test_multiple_filters(self, test_db):
        """Test building filter clause with multiple filters."""
        service = DatabaseService(test_db)
        where_clause, params = service._build_mbid_filter_clause(
            artist_mbid="artist-mbid",
            recording_mbid="recording-mbid",
            release_mbid="release-mbid"
        )

        assert "artist_ids LIKE ?" in where_clause
        assert "recording_id = ?" in where_clause
        assert "release_id = ?" in where_clause
        assert " AND " in where_clause
        assert len(params) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
