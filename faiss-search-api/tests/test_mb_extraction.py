"""
Tests for MusicBrainz ID Extraction Utilities

Comprehensive test coverage for mb_extraction.py including:
- UUID validation and normalization
- Artist/label/recording/track/release extraction
- JSON parsing edge cases
- Coverage statistics calculation
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from utils.mb_extraction import (
    MBIDExtractor,
    MBIDStats,
    get_all_artist_ids_from_plays,
    get_all_label_ids_from_plays,
    get_all_recording_ids_from_plays,
    get_all_release_ids_from_plays,
)

# ========================================
# Test MBIDExtractor.validate_mb_uuid()
# ========================================


class TestValidateMBUUID:
    """Test cases for UUID validation."""

    def test_valid_lowercase_uuid(self):
        """Valid lowercase UUID should pass."""
        valid_uuid = "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert MBIDExtractor.validate_mb_uuid(valid_uuid) is True

    def test_valid_uppercase_uuid(self):
        """Valid uppercase UUID should pass."""
        valid_uuid = "5B11F4CE-A62D-471E-81FC-A69A8278C7DA"
        assert MBIDExtractor.validate_mb_uuid(valid_uuid) is True

    def test_valid_mixed_case_uuid(self):
        """Valid mixed case UUID should pass."""
        valid_uuid = "5b11F4Ce-A62d-471E-81Fc-a69A8278C7Da"
        assert MBIDExtractor.validate_mb_uuid(valid_uuid) is True

    def test_valid_uuid_with_whitespace(self):
        """UUID with surrounding whitespace should pass (it gets stripped)."""
        valid_uuid = "  5b11f4ce-a62d-471e-81fc-a69a8278c7da  "
        assert MBIDExtractor.validate_mb_uuid(valid_uuid) is True

    def test_invalid_uuid_no_hyphens(self):
        """UUID without hyphens should fail."""
        invalid_uuid = "5b11f4cea62d471e81fca69a8278c7da"
        assert MBIDExtractor.validate_mb_uuid(invalid_uuid) is False

    def test_invalid_uuid_wrong_format(self):
        """UUID with wrong format should fail."""
        invalid_uuid = "5b11f4ce-a62d-471e-81fc-a69a8278c7d"  # Too short
        assert MBIDExtractor.validate_mb_uuid(invalid_uuid) is False

    def test_invalid_uuid_wrong_section_lengths(self):
        """UUID with wrong section lengths should fail."""
        invalid_uuid = "5b11f4c-a62d-471e-81fc-a69a8278c7da"  # First section too short
        assert MBIDExtractor.validate_mb_uuid(invalid_uuid) is False

    def test_invalid_uuid_special_chars(self):
        """UUID with special characters should fail."""
        invalid_uuid = "5b11f4ce-a62d-471e-81fc-a69a8278c7d@"
        assert MBIDExtractor.validate_mb_uuid(invalid_uuid) is False

    def test_invalid_none(self):
        """None should return False."""
        assert MBIDExtractor.validate_mb_uuid(None) is False

    def test_invalid_empty_string(self):
        """Empty string should return False."""
        assert MBIDExtractor.validate_mb_uuid("") is False

    def test_invalid_non_string(self):
        """Non-string input should return False."""
        assert MBIDExtractor.validate_mb_uuid(12345) is False
        assert MBIDExtractor.validate_mb_uuid([]) is False
        assert MBIDExtractor.validate_mb_uuid({}) is False


# ========================================
# Test MBIDExtractor.normalize_mb_uuid()
# ========================================


class TestNormalizeMBUUID:
    """Test cases for UUID normalization."""

    def test_normalize_lowercase(self):
        """Already lowercase UUID should remain unchanged."""
        uuid = "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert MBIDExtractor.normalize_mb_uuid(uuid) == uuid

    def test_normalize_uppercase(self):
        """Uppercase UUID should be converted to lowercase."""
        uuid = "5B11F4CE-A62D-471E-81FC-A69A8278C7DA"
        expected = "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert MBIDExtractor.normalize_mb_uuid(uuid) == expected

    def test_normalize_mixed_case(self):
        """Mixed case UUID should be converted to lowercase."""
        uuid = "5b11F4Ce-A62d-471E-81Fc-a69A8278C7Da"
        expected = "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert MBIDExtractor.normalize_mb_uuid(uuid) == expected

    def test_normalize_with_whitespace(self):
        """UUID with whitespace should be stripped and normalized."""
        uuid = "  5B11F4CE-A62D-471E-81FC-A69A8278C7DA  \n"
        expected = "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert MBIDExtractor.normalize_mb_uuid(uuid) == expected

    def test_normalize_invalid_uuid(self):
        """Invalid UUID should return None."""
        assert MBIDExtractor.normalize_mb_uuid("not-a-uuid") is None
        assert MBIDExtractor.normalize_mb_uuid("5b11f4cea62d471e81fca69a8278c7da") is None

    def test_normalize_none(self):
        """None should return None."""
        assert MBIDExtractor.normalize_mb_uuid(None) is None

    def test_normalize_empty_string(self):
        """Empty string should return None."""
        assert MBIDExtractor.normalize_mb_uuid("") is None


# ========================================
# Test MBIDExtractor.extract_artist_mb_ids()
# ========================================


class TestExtractArtistMBIDs:
    """Test cases for artist MBID extraction."""

    def test_extract_from_json_string(self):
        """Extract artist IDs from JSON string."""
        play_data = {
            "artist_ids": (
                '["5b11f4ce-a62d-471e-81fc-a69a8278c7da", "83d91898-7763-47d7-b03b-b92132375c47"]'
            )
        }
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert len(result) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result

    def test_extract_from_list(self):
        """Extract artist IDs from list."""
        play_data = {
            "artist_ids": [
                "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
                "83d91898-7763-47d7-b03b-b92132375c47",
            ]
        }
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert len(result) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result

    def test_extract_normalizes_to_lowercase(self):
        """Artist IDs should be normalized to lowercase."""
        play_data = {"artist_ids": ["5B11F4CE-A62D-471E-81FC-A69A8278C7DA"]}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == ["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]

    def test_extract_filters_invalid_uuids(self):
        """Invalid UUIDs should be filtered out."""
        play_data = {
            "artist_ids": [
                "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
                "invalid-uuid",
                "",
                "83d91898-7763-47d7-b03b-b92132375c47",
            ]
        }
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert len(result) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result

    def test_extract_malformed_json(self):
        """Malformed JSON should return empty list."""
        play_data = {"artist_ids": '{"not": "a list"}'}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_invalid_json(self):
        """Invalid JSON should return empty list."""
        play_data = {"artist_ids": "not valid json at all"}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_missing_field(self):
        """Missing artist_ids field should return empty list."""
        play_data = {}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_none_value(self):
        """None value should return empty list."""
        play_data = {"artist_ids": None}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_empty_list(self):
        """Empty list should return empty list."""
        play_data = {"artist_ids": []}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_empty_json_array(self):
        """Empty JSON array should return empty list."""
        play_data = {"artist_ids": "[]"}
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == []

    def test_extract_artist_mb_ids_filters_non_string_types(self):
        """Should filter out integers, None, and other non-string types."""
        play_data = {
            "artist_ids": [
                123,
                None,
                True,
                {"invalid": "object"},
                "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
            ]
        }
        result = MBIDExtractor.extract_artist_mb_ids(play_data)
        assert result == ["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]


# ========================================
# Test MBIDExtractor.extract_recording_mb_id()
# ========================================


class TestExtractRecordingMBID:
    """Test cases for recording MBID extraction."""

    def test_extract_from_recording_id(self):
        """Extract from recording_id field."""
        play_data = {"recording_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_from_recording_mbid(self):
        """Extract from recording_mbid field (fallback)."""
        play_data = {"recording_mbid": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_prefers_recording_id(self):
        """Should prefer recording_id over recording_mbid."""
        play_data = {
            "recording_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
            "recording_mbid": "83d91898-7763-47d7-b03b-b92132375c47",
        }
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_normalizes(self):
        """Should normalize to lowercase."""
        play_data = {"recording_id": "5B11F4CE-A62D-471E-81FC-A69A8278C7DA"}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_invalid_uuid(self):
        """Invalid UUID should return None."""
        play_data = {"recording_id": "invalid-uuid"}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result is None

    def test_extract_missing_field(self):
        """Missing field should return None."""
        play_data = {}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result is None

    def test_extract_none_value(self):
        """None value should return None."""
        play_data = {"recording_id": None}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result is None

    def test_extract_empty_string(self):
        """Empty string should return None."""
        play_data = {"recording_id": ""}
        result = MBIDExtractor.extract_recording_mb_id(play_data)
        assert result is None


# ========================================
# Test MBIDExtractor.extract_track_mb_id()
# ========================================


class TestExtractTrackMBID:
    """Test cases for track MBID extraction."""

    def test_extract_from_track_id(self):
        """Extract from track_id field."""
        play_data = {"track_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"}
        result = MBIDExtractor.extract_track_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_normalizes(self):
        """Should normalize to lowercase."""
        play_data = {"track_id": "5B11F4CE-A62D-471E-81FC-A69A8278C7DA"}
        result = MBIDExtractor.extract_track_mb_id(play_data)
        assert result == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"

    def test_extract_invalid_uuid(self):
        """Invalid UUID should return None."""
        play_data = {"track_id": "invalid-uuid"}
        result = MBIDExtractor.extract_track_mb_id(play_data)
        assert result is None

    def test_extract_missing_field(self):
        """Missing field should return None."""
        play_data = {}
        result = MBIDExtractor.extract_track_mb_id(play_data)
        assert result is None


# ========================================
# Test MBIDExtractor.extract_release_mb_ids()
# ========================================


class TestExtractReleaseMBIDs:
    """Test cases for release MBID extraction."""

    def test_extract_both_ids(self):
        """Extract both release and release_group IDs."""
        play_data = {
            "release_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
            "release_group_id": "83d91898-7763-47d7-b03b-b92132375c47",
        }
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert release_group_id == "83d91898-7763-47d7-b03b-b92132375c47"

    def test_extract_from_fallback_fields(self):
        """Extract from release_mbid and release_group_mbid fallback fields."""
        play_data = {
            "release_mbid": "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
            "release_group_mbid": "83d91898-7763-47d7-b03b-b92132375c47",
        }
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert release_group_id == "83d91898-7763-47d7-b03b-b92132375c47"

    def test_extract_only_release_id(self):
        """Extract with only release_id present."""
        play_data = {"release_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"}
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert release_group_id is None

    def test_extract_only_release_group_id(self):
        """Extract with only release_group_id present."""
        play_data = {"release_group_id": "83d91898-7763-47d7-b03b-b92132375c47"}
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id is None
        assert release_group_id == "83d91898-7763-47d7-b03b-b92132375c47"

    def test_extract_normalizes(self):
        """Should normalize both IDs to lowercase."""
        play_data = {
            "release_id": "5B11F4CE-A62D-471E-81FC-A69A8278C7DA",
            "release_group_id": "83D91898-7763-47D7-B03B-B92132375C47",
        }
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert release_group_id == "83d91898-7763-47d7-b03b-b92132375c47"

    def test_extract_missing_fields(self):
        """Missing fields should return None for both."""
        play_data = {}
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id is None
        assert release_group_id is None

    def test_extract_invalid_uuids(self):
        """Invalid UUIDs should return None."""
        play_data = {"release_id": "invalid", "release_group_id": "also-invalid"}
        release_id, release_group_id = MBIDExtractor.extract_release_mb_ids(play_data)
        assert release_id is None
        assert release_group_id is None


# ========================================
# Test MBIDExtractor.extract_label_mb_ids()
# ========================================


class TestExtractLabelMBIDs:
    """Test cases for label MBID extraction."""

    def test_extract_from_json_string(self):
        """Extract label IDs from JSON string."""
        play_data = {
            "label_ids": (
                '["5b11f4ce-a62d-471e-81fc-a69a8278c7da", "83d91898-7763-47d7-b03b-b92132375c47"]'
            )
        }
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert len(result) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result

    def test_extract_from_list(self):
        """Extract label IDs from list."""
        play_data = {"label_ids": ["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]}
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == ["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]

    def test_extract_filters_invalid(self):
        """Should filter out invalid UUIDs."""
        play_data = {
            "label_ids": [
                "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
                "invalid",
                "83d91898-7763-47d7-b03b-b92132375c47",
            ]
        }
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert len(result) == 2

    def test_extract_empty_list(self):
        """Empty list should return empty list."""
        play_data = {"label_ids": []}
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == []

    def test_extract_missing_field(self):
        """Missing field should return empty list."""
        play_data = {}
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == []

    def test_extract_label_mb_ids_filters_non_string_types(self):
        """Should filter out integers, None, and other non-string types."""
        play_data = {
            "label_ids": [456, None, False, {"bad": "data"}, "5b11f4ce-a62d-471e-81fc-a69a8278c7da"]
        }
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == ["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]

    def test_extract_label_malformed_json(self):
        """Malformed JSON string should return empty list."""
        play_data = {"label_ids": '{"not": "a list"}'}
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == []

    def test_extract_label_invalid_json(self):
        """Invalid JSON should return empty list."""
        play_data = {"label_ids": "not valid json at all"}
        result = MBIDExtractor.extract_label_mb_ids(play_data)
        assert result == []


# ========================================
# Test MBIDExtractor.extract_all_mb_ids()
# ========================================


class TestExtractAllMBIDs:
    """Test cases for extracting all MB IDs at once."""

    def test_extract_complete_play(self):
        """Extract all IDs from a complete play record."""
        play_data = {
            "artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
            "recording_id": "83d91898-7763-47d7-b03b-b92132375c47",
            "track_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
            "release_id": "f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f",
            "release_group_id": "11223344-5566-7788-99aa-bbccddeeff00",
            "label_ids": '["aabbccdd-eeff-0011-2233-445566778899"]',
        }
        result = MBIDExtractor.extract_all_mb_ids(play_data)

        assert len(result["artist_ids"]) == 1
        assert result["artist_ids"][0] == "5b11f4ce-a62d-471e-81fc-a69a8278c7da"
        assert result["recording_id"] == "83d91898-7763-47d7-b03b-b92132375c47"
        assert result["track_id"] == "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"
        assert result["release_id"] == "f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f"
        assert result["release_group_id"] == "11223344-5566-7788-99aa-bbccddeeff00"
        assert len(result["label_ids"]) == 1

    def test_extract_empty_play(self):
        """Extract from play with no MB IDs."""
        play_data = {}
        result = MBIDExtractor.extract_all_mb_ids(play_data)

        assert result["artist_ids"] == []
        assert result["recording_id"] is None
        assert result["track_id"] is None
        assert result["release_id"] is None
        assert result["release_group_id"] is None
        assert result["label_ids"] == []

    def test_extract_partial_play(self):
        """Extract from play with some MB IDs."""
        play_data = {
            "artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
            "recording_id": "83d91898-7763-47d7-b03b-b92132375c47",
        }
        result = MBIDExtractor.extract_all_mb_ids(play_data)

        assert len(result["artist_ids"]) == 1
        assert result["recording_id"] is not None
        assert result["track_id"] is None
        assert result["release_id"] is None


# ========================================
# Test MBIDStats.calculate_coverage()
# ========================================


class TestCalculateCoverage:
    """Test cases for coverage calculation."""

    def test_calculate_empty_plays(self):
        """Empty plays list should return zero stats."""
        stats = MBIDStats.calculate_coverage([])

        assert stats["total_plays"] == 0
        assert stats["artist_coverage"] == 0.0
        assert stats["recording_coverage"] == 0.0
        assert stats["release_coverage"] == 0.0
        assert stats["release_group_coverage"] == 0.0
        assert stats["label_coverage"] == 0.0
        assert stats["unique_artists"] == 0
        assert stats["unique_recordings"] == 0
        assert stats["unique_releases"] == 0
        assert stats["unique_release_groups"] == 0
        assert stats["unique_labels"] == 0

    def test_calculate_full_coverage(self):
        """All plays with MB IDs should show 100% coverage."""
        plays = [
            {
                "artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
                "recording_id": "83d91898-7763-47d7-b03b-b92132375c47",
                "release_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
                "release_group_id": "f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f",
                "label_ids": '["aabbccdd-eeff-0011-2233-445566778899"]',
            },
            {
                "artist_ids": '["11223344-5566-7788-99aa-bbccddeeff00"]',
                "recording_id": "aabbccdd-eeff-0011-2233-445566778899",
                "release_id": "11223344-5566-7788-99aa-bbccddeeff00",
                "release_group_id": "aabbccdd-eeff-0011-2233-445566778899",
                "label_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
            },
        ]
        stats = MBIDStats.calculate_coverage(plays)

        assert stats["total_plays"] == 2
        assert stats["artist_coverage"] == 100.0
        assert stats["recording_coverage"] == 100.0
        assert stats["release_coverage"] == 100.0
        assert stats["release_group_coverage"] == 100.0
        assert stats["label_coverage"] == 100.0

    def test_calculate_partial_coverage(self):
        """Mixed coverage should calculate percentages correctly."""
        plays = [
            {
                "artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
                "recording_id": "83d91898-7763-47d7-b03b-b92132375c47",
            },
            {
                # No MB IDs
            },
            {
                "artist_ids": '["11223344-5566-7788-99aa-bbccddeeff00"]',
            },
            {
                "recording_id": "aabbccdd-eeff-0011-2233-445566778899",
            },
        ]
        stats = MBIDStats.calculate_coverage(plays)

        assert stats["total_plays"] == 4
        # 2 out of 4 have artist IDs = 50%
        assert stats["artist_coverage"] == 50.0
        # 2 out of 4 have recording IDs = 50%
        assert stats["recording_coverage"] == 50.0
        # 0 out of 4 have release IDs = 0%
        assert stats["release_coverage"] == 0.0

    def test_calculate_unique_counts(self):
        """Should count unique entities correctly."""
        plays = [
            {
                "artist_ids": (
                    '["5b11f4ce-a62d-471e-81fc-a69a8278c7da", '
                    '"83d91898-7763-47d7-b03b-b92132375c47"]'
                ),
                "recording_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
            },
            {
                # Same artist appears again
                "artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]',
                # Different recording
                "recording_id": "f1e2d3c4-b5a6-4978-8869-7a6b5c4d3e2f",
            },
            {
                # New artist
                "artist_ids": '["aabbccdd-eeff-0011-2233-445566778899"]',
                # Same recording as first play
                "recording_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
            },
        ]
        stats = MBIDStats.calculate_coverage(plays)

        # 3 unique artists total
        assert stats["unique_artists"] == 3
        # 2 unique recordings
        assert stats["unique_recordings"] == 2

    def test_calculate_with_invalid_data(self):
        """Should handle plays with invalid MB IDs gracefully."""
        plays = [
            {
                "artist_ids": '["invalid-uuid"]',
                "recording_id": "also-invalid",
            },
            {
                "artist_ids": "not-json",
                "recording_id": "",
            },
        ]
        stats = MBIDStats.calculate_coverage(plays)

        assert stats["total_plays"] == 2
        assert stats["artist_coverage"] == 0.0
        assert stats["recording_coverage"] == 0.0
        assert stats["unique_artists"] == 0
        assert stats["unique_recordings"] == 0


# ========================================
# Test convenience functions
# ========================================


class TestConvenienceFunctions:
    """Test convenience functions for extracting IDs from play lists."""

    def test_get_all_artist_ids(self):
        """Should extract unique artist IDs from multiple plays."""
        plays = [
            {"artist_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]'},
            {
                "artist_ids": (
                    '["5b11f4ce-a62d-471e-81fc-a69a8278c7da", '
                    '"83d91898-7763-47d7-b03b-b92132375c47"]'
                )
            },
            {"artist_ids": '["aabbccdd-eeff-0011-2233-445566778899"]'},
        ]
        result = get_all_artist_ids_from_plays(plays)

        assert len(result) == 3
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result
        assert "aabbccdd-eeff-0011-2233-445566778899" in result

    def test_get_all_label_ids(self):
        """Should extract unique label IDs from multiple plays."""
        plays = [
            {"label_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]'},
            {"label_ids": '["5b11f4ce-a62d-471e-81fc-a69a8278c7da"]'},  # Duplicate
            {"label_ids": '["83d91898-7763-47d7-b03b-b92132375c47"]'},
        ]
        result = get_all_label_ids_from_plays(plays)

        assert len(result) == 2

    def test_get_all_recording_ids(self):
        """Should extract unique recording IDs from multiple plays."""
        plays = [
            {"recording_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"},
            {"recording_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da"},  # Duplicate
            {"recording_id": "83d91898-7763-47d7-b03b-b92132375c47"},
            {},  # No recording ID
        ]
        result = get_all_recording_ids_from_plays(plays)

        assert len(result) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in result
        assert "83d91898-7763-47d7-b03b-b92132375c47" in result

    def test_get_all_release_ids(self):
        """Should extract unique release and release_group IDs."""
        plays = [
            {
                "release_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
                "release_group_id": "aabbccdd-eeff-0011-2233-445566778899",
            },
            {
                "release_id": "5b11f4ce-a62d-471e-81fc-a69a8278c7da",  # Duplicate release
                "release_group_id": "11223344-5566-7788-99aa-bbccddeeff00",  # New release_group
            },
            {
                "release_id": "83d91898-7763-47d7-b03b-b92132375c47",
            },
        ]
        release_ids, release_group_ids = get_all_release_ids_from_plays(plays)

        assert len(release_ids) == 2
        assert len(release_group_ids) == 2
        assert "5b11f4ce-a62d-471e-81fc-a69a8278c7da" in release_ids
        assert "83d91898-7763-47d7-b03b-b92132375c47" in release_ids


# ========================================
# Test MBIDStats.format_coverage_report()
# ========================================


class TestFormatCoverageReport:
    """Test coverage report formatting."""

    def test_format_report(self):
        """Should format stats into readable report."""
        stats = {
            "total_plays": 1000,
            "artist_coverage": 85.5,
            "recording_coverage": 72.3,
            "release_coverage": 60.0,
            "release_group_coverage": 58.5,
            "label_coverage": 45.2,
            "unique_artists": 500,
            "unique_recordings": 800,
            "unique_releases": 600,
            "unique_release_groups": 580,
            "unique_labels": 350,
        }
        report = MBIDStats.format_coverage_report(stats)

        assert "1,000" in report
        assert "85.50%" in report
        assert "500 unique" in report
        assert "Artists:" in report
        assert "Recordings:" in report

    def test_format_report_with_zeros(self):
        """Should handle zero values gracefully."""
        stats = {
            "total_plays": 0,
            "artist_coverage": 0.0,
            "recording_coverage": 0.0,
            "release_coverage": 0.0,
            "release_group_coverage": 0.0,
            "label_coverage": 0.0,
            "unique_artists": 0,
            "unique_recordings": 0,
            "unique_releases": 0,
            "unique_release_groups": 0,
            "unique_labels": 0,
        }
        report = MBIDStats.format_coverage_report(stats)

        assert "Total Plays: 0" in report
        assert "0.00%" in report
