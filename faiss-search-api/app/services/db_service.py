"""Database service for SQLite queries."""
import sqlite3
import json
import base64
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for querying play metadata from SQLite."""

    def __init__(self, db_path: Path):
        """
        Initialize database service.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path)
        self._conn: Optional[sqlite3.Connection] = None

        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")

        logger.info(f"Connected to database: {self.db_path}")

    @property
    def conn(self) -> sqlite3.Connection:
        """Lazy database connection (thread-safe for read operations)."""
        if self._conn is None:
            # Allow SQLite connection to be used across threads for read-only operations
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def get_play_by_id(self, play_id: int) -> Optional[Dict[str, Any]]:
        """
        Fetch a single play by ID.

        Args:
            play_id: Play ID

        Returns:
            Play dictionary or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM fact_plays WHERE id = ?", (play_id,))
        row = cursor.fetchone()

        if row is None:
            return None

        return self._row_to_dict(row)

    def get_plays_by_ids(self, play_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Fetch multiple plays by IDs.

        Args:
            play_ids: List of play IDs

        Returns:
            Dictionary mapping play_id -> play data
        """
        if not play_ids:
            return {}

        cursor = self.conn.cursor()
        placeholders = ','.join('?' * len(play_ids))
        query = f"SELECT * FROM fact_plays WHERE id IN ({placeholders})"
        cursor.execute(query, play_ids)

        results = {}
        for row in cursor.fetchall():
            play_dict = self._row_to_dict(row)
            results[play_dict['id']] = play_dict

        return results

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """
        Convert SQLite row to dictionary with proper type conversion.

        Args:
            row: SQLite row

        Returns:
            Dictionary with typed values matching PlayResult model
        """
        data = dict(row)

        # Parse labels as JSON array (stored as ["Label1", "Label2"] format)
        if 'labels' in data and data['labels']:
            try:
                data['labels'] = json.loads(data['labels'])
            except json.JSONDecodeError:
                data['labels'] = []
        else:
            data['labels'] = []

        # Parse artist_ids as JSON array and map to artist_mbid for PlayResult compatibility
        if 'artist_ids' in data and data['artist_ids']:
            try:
                data['artist_mbid'] = json.loads(data['artist_ids'])
            except json.JSONDecodeError:
                data['artist_mbid'] = []
        else:
            data['artist_mbid'] = []

        # Map MusicBrainz ID fields to PlayResult expected names
        if 'recording_id' in data:
            data['recording_mbid'] = data.get('recording_id')
        if 'release_id' in data:
            data['release_mbid'] = data.get('release_id')
        if 'release_group_id' in data:
            data['release_group_mbid'] = data.get('release_group_id')

        # Convert integer booleans
        for bool_field in ['is_local', 'is_live', 'is_request']:
            if bool_field in data:
                data[bool_field] = bool(data[bool_field])

        return data

    def encode_cursor(self, airdate: str, play_id: int) -> str:
        """
        Encode cursor for pagination.

        Args:
            airdate: ISO 8601 airdate string
            play_id: Play ID

        Returns:
            Base64-encoded cursor string
        """
        cursor_str = f"{airdate}:{play_id}"
        return base64.b64encode(cursor_str.encode()).decode()

    def decode_cursor(self, cursor: str) -> Tuple[str, int]:
        """
        Decode cursor for pagination.

        Args:
            cursor: Base64-encoded cursor string

        Returns:
            Tuple of (airdate, play_id)

        Raises:
            ValueError: If cursor is invalid
        """
        try:
            cursor_str = base64.b64decode(cursor.encode()).decode()
            # Split from the right to handle ISO 8601 timestamps with colons
            parts = cursor_str.rsplit(":", 1)
            if len(parts) != 2:
                raise ValueError("Invalid cursor format")
            airdate, play_id_str = parts
            return airdate, int(play_id_str)
        except Exception as e:
            raise ValueError(f"Invalid cursor: {e}")

    def get_plays_by_cursor(
        self,
        limit: int = 50,
        cursor: Optional[str] = None,
        direction: str = "next"
    ) -> Dict[str, Any]:
        """
        Get plays using cursor-based pagination.

        Args:
            limit: Maximum number of results to return
            cursor: Optional cursor for pagination (base64-encoded "airdate:id")
            direction: Pagination direction ("next" or "prev")

        Returns:
            Dictionary with:
                - results: List of play dictionaries
                - next_cursor: Cursor for next page (None if no more results)
                - has_more: Boolean indicating if more results exist
        """
        cursor_obj = self.conn.cursor()

        # Fetch limit+1 to detect if more results exist
        fetch_limit = limit + 1

        if cursor is None:
            # First page: get most recent plays
            query = """
                SELECT * FROM fact_plays
                ORDER BY airdate DESC, id DESC
                LIMIT ?
            """
            cursor_obj.execute(query, (fetch_limit,))
        else:
            # Subsequent page: use compound cursor for stable pagination
            airdate, play_id = self.decode_cursor(cursor)

            if direction == "next":
                query = """
                    SELECT * FROM fact_plays
                    WHERE airdate < ? OR (airdate = ? AND id < ?)
                    ORDER BY airdate DESC, id DESC
                    LIMIT ?
                """
                cursor_obj.execute(query, (airdate, airdate, play_id, fetch_limit))
            else:
                # "prev" direction (for future implementation)
                query = """
                    SELECT * FROM fact_plays
                    WHERE airdate > ? OR (airdate = ? AND id > ?)
                    ORDER BY airdate ASC, id ASC
                    LIMIT ?
                """
                cursor_obj.execute(query, (airdate, airdate, play_id, fetch_limit))

        rows = cursor_obj.fetchall()

        # Check if there are more results
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]  # Remove the extra row

        # Convert to dictionaries
        results = [self._row_to_dict(row) for row in rows]

        # If direction is "prev", reverse results to maintain DESC order
        if direction == "prev" and results:
            results = list(reversed(results))

        # Generate next cursor from last result
        next_cursor = None
        if has_more and results:
            last = results[-1]
            next_cursor = self.encode_cursor(last['airdate'], last['id'])

        return {
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more
        }

    @property
    def total_count(self) -> int:
        """
        Get total count of plays in the database.

        Cached after first query for performance.

        Returns:
            Total number of plays
        """
        if not hasattr(self, '_total_count'):
            cursor = self.conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM fact_plays")
            self._total_count = cursor.fetchone()[0]
            logger.info(f"Cached total count: {self._total_count}")
        return self._total_count

    def get_plays_by_time_range(
        self,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get plays within a time range, chronologically ordered (newest first).

        Args:
            since: Start datetime (inclusive). If None, no lower bound.
            until: End datetime (inclusive). If None, no upper bound.
            limit: Maximum number of results to return

        Returns:
            Dictionary with:
                - results: List of play dictionaries
                - next_cursor: Cursor for next page (None if no more results)
                - has_more: Boolean indicating if more results exist

        Example:
            # Get plays from March 2015
            service.get_plays_by_time_range(
                since=datetime(2015, 3, 1),
                until=datetime(2015, 4, 1),
                limit=20
            )
        """
        cursor_obj = self.conn.cursor()
        fetch_limit = limit + 1

        # Build query with time constraints
        conditions = []
        params = []

        if since is not None:
            conditions.append("airdate >= ?")
            params.append(since.isoformat())

        if until is not None:
            conditions.append("airdate <= ?")
            params.append(until.isoformat())

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        query = f"""
            SELECT * FROM fact_plays
            {where_clause}
            ORDER BY airdate DESC, id DESC
            LIMIT ?
        """
        params.append(fetch_limit)

        cursor_obj.execute(query, params)
        rows = cursor_obj.fetchall()

        # Check if there are more results
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        # Convert to dictionaries
        results = [self._row_to_dict(row) for row in rows]

        # Generate next cursor from last result
        next_cursor = None
        if has_more and results:
            last = results[-1]
            next_cursor = self.encode_cursor(last['airdate'], last['id'])

        return {
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more
        }

    def get_plays_by_percentage(
        self,
        percentage: float,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Jump to a percentage position in the timeline.

        Uses OFFSET to jump to the approximate position based on percentage,
        then returns results with cursor for smooth pagination.

        Args:
            percentage: Position in timeline (0.0 to 1.0)
            limit: Maximum number of results to return

        Returns:
            Dictionary with:
                - results: List of play dictionaries
                - next_cursor: Cursor for next page
                - has_more: Boolean indicating if more results exist
                - total_count: Total number of plays (for context)

        Example:
            # Jump to 50% through the timeline
            service.get_plays_by_percentage(0.5, limit=20)
        """
        if not 0.0 <= percentage <= 1.0:
            raise ValueError("Percentage must be between 0.0 and 1.0")

        total = self.total_count
        offset = int(total * percentage)

        # Clamp offset to valid range
        if offset >= total:
            offset = max(0, total - limit)

        cursor_obj = self.conn.cursor()
        fetch_limit = limit + 1

        query = """
            SELECT * FROM fact_plays
            ORDER BY airdate DESC, id DESC
            LIMIT ? OFFSET ?
        """
        cursor_obj.execute(query, (fetch_limit, offset))
        rows = cursor_obj.fetchall()

        # Check if there are more results
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]

        # Convert to dictionaries
        results = [self._row_to_dict(row) for row in rows]

        # Generate next cursor from last result
        next_cursor = None
        if has_more and results:
            last = results[-1]
            next_cursor = self.encode_cursor(last['airdate'], last['id'])

        return {
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more,
            'total_count': total
        }

    def get_plays_around_id(
        self,
        anchor_id: int,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Get plays centered around a specific play ID.

        Fetches plays before and after the anchor play, returning a view
        centered on the anchor. Useful for "show context around this play".

        Args:
            anchor_id: Play ID to center around
            limit: Total number of results to return (split before/after)

        Returns:
            Dictionary with:
                - results: List of play dictionaries centered on anchor
                - next_cursor: Cursor for next page
                - has_more: Boolean indicating if more results exist
                - anchor_position: Index of anchor play in results (if found)

        Example:
            # Get 50 plays centered around play ID 3576848
            service.get_plays_around_id(3576848, limit=50)
        """
        # First, get the anchor play to get its airdate
        # Fetch anchor first (we already have it as anchor_play dict, but need Row object)
        cursor_obj = self.conn.cursor()
        anchor_row = cursor_obj.execute("SELECT * FROM fact_plays WHERE id = ?", (anchor_id,)).fetchone()
        if not anchor_row:
            raise ValueError(f"Play ID {anchor_id} not found")

        anchor_airdate = anchor_row['airdate']

        # Always include anchor, distribute remaining (limit-1) slots around it
        remaining_slots = max(0, limit - 1)
        before_limit = remaining_slots // 2
        after_limit = remaining_slots - before_limit

        # Get plays before anchor (excluding anchor)
        query_before = """
            SELECT * FROM fact_plays
            WHERE airdate > ? OR (airdate = ? AND id > ?)
            ORDER BY airdate ASC, id ASC
            LIMIT ?
        """
        cursor_obj.execute(query_before, (anchor_airdate, anchor_airdate, anchor_id, before_limit))
        rows_before = cursor_obj.fetchall()

        # Get plays after anchor (excluding anchor)
        query_after = """
            SELECT * FROM fact_plays
            WHERE airdate < ? OR (airdate = ? AND id < ?)
            ORDER BY airdate DESC, id DESC
            LIMIT ?
        """
        cursor_obj.execute(query_after, (anchor_airdate, anchor_airdate, anchor_id, after_limit + 1))
        rows_after = cursor_obj.fetchall()

        # Check if there are more results after
        has_more = len(rows_after) > after_limit
        if has_more:
            rows_after = rows_after[:after_limit]

        # Combine: before (reversed) + anchor + after
        rows_before.reverse()
        all_rows = rows_before + [anchor_row] + rows_after

        # Convert to dictionaries
        results = [self._row_to_dict(row) for row in all_rows]

        # Find anchor position
        anchor_position = None
        for idx, play in enumerate(results):
            if play['id'] == anchor_id:
                anchor_position = idx
                break

        # Generate next cursor from last result
        next_cursor = None
        if has_more and results:
            last = results[-1]
            next_cursor = self.encode_cursor(last['airdate'], last['id'])

        return {
            'results': results,
            'next_cursor': next_cursor,
            'has_more': has_more,
            'anchor_position': anchor_position
        }

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("Database connection closed")
