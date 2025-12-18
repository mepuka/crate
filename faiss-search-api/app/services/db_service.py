"""Database service for SQLite queries."""
import sqlite3
import json
import base64
from pathlib import Path
from typing import Optional, Dict, List, Any, Tuple
from datetime import datetime
import logging

try:
    import orjson
    HAS_ORJSON = True
except ImportError:
    HAS_ORJSON = False

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

    def get_first_play_by_mbids(
        self,
        recording_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        artist_mbid: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch a representative play for the given MBIDs, in priority order.

        Preference: recording -> release_group -> release -> artist.
        """
        cursor = self.conn.cursor()

        if recording_mbid:
            cursor.execute(
                "SELECT * FROM fact_plays WHERE recording_id = ? LIMIT 1",
                (recording_mbid,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)

        if release_group_mbid:
            cursor.execute(
                "SELECT * FROM fact_plays WHERE release_group_id = ? LIMIT 1",
                (release_group_mbid,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)

        if release_mbid:
            cursor.execute(
                "SELECT * FROM fact_plays WHERE release_id = ? LIMIT 1",
                (release_mbid,),
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)

        if artist_mbid:
            # Prefer join table when present for accuracy/performance
            try:
                cursor.execute(
                    """
                    SELECT fp.*
                    FROM fact_plays fp
                    INNER JOIN play_artists pa ON pa.play_id = fp.id
                    WHERE pa.artist_mbid = ?
                    LIMIT 1
                    """,
                    (artist_mbid,),
                )
                row = cursor.fetchone()
                if row:
                    return self._row_to_dict(row)
            except sqlite3.OperationalError:
                # Fallback to JSON search in artist_ids column
                cursor.execute(
                    "SELECT * FROM fact_plays WHERE artist_ids LIKE ? LIMIT 1",
                    (f'%"{artist_mbid}"%',),
                )
                row = cursor.fetchone()
                if row:
                    return self._row_to_dict(row)

        return None

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
        if data.get('labels'):
            try:
                if HAS_ORJSON:
                    data['labels'] = orjson.loads(data['labels'])
                else:
                    data['labels'] = json.loads(data['labels'])
            except (json.JSONDecodeError, ValueError):
                data['labels'] = []
        else:
            data['labels'] = []

        # Parse artist_ids as JSON array and map to artist_mbid for PlayResult compatibility
        if data.get('artist_ids'):
            try:
                if HAS_ORJSON:
                    data['artist_mbid'] = orjson.loads(data['artist_ids'])
                else:
                    data['artist_mbid'] = json.loads(data['artist_ids'])
            except (json.JSONDecodeError, ValueError):
                data['artist_mbid'] = []
        else:
            data['artist_mbid'] = []

        # Map MusicBrainz ID fields to PlayResult expected names
        # Use direct assignment for speed
        if 'recording_id' in data:
            data['recording_mbid'] = data['recording_id']
        if 'release_id' in data:
            data['release_mbid'] = data['release_id']
        if 'release_group_id' in data:
            data['release_group_mbid'] = data['release_group_id']

        # Convert integer booleans - optimized
        data['is_local'] = bool(data.get('is_local', 0))
        data['is_request'] = bool(data.get('is_request', 0))
        data['is_live'] = bool(data.get('is_live', 0))

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

    def _build_mbid_filter_clause(
        self,
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> tuple[str, List[Any], bool]:
        """
        Build WHERE clause and parameters for MBID filtering.

        Args:
            artist_mbid: Filter by artist MBID (uses play_artists join table)
            recording_mbid: Filter by recording MBID
            release_mbid: Filter by release MBID
            release_group_mbid: Filter by release group MBID

        Returns:
            Tuple of (where_clause, params, needs_artist_join) for SQL query
        """
        conditions = []
        params = []
        needs_artist_join = False

        if artist_mbid:
            # Use play_artists join table for fast lookups (50x faster than JSON)
            # The caller should join: INNER JOIN play_artists pa ON pa.play_id = fp.id
            conditions.append("pa.artist_mbid = ?")
            params.append(artist_mbid)
            needs_artist_join = True

        if recording_mbid:
            conditions.append("fp.recording_id = ?")
            params.append(recording_mbid)

        if release_mbid:
            conditions.append("fp.release_id = ?")
            params.append(release_mbid)

        if release_group_mbid:
            conditions.append("fp.release_group_id = ?")
            params.append(release_group_mbid)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        return where_clause, params, needs_artist_join

    def get_plays_by_cursor(
        self,
        limit: int = 50,
        cursor: Optional[str] = None,
        direction: str = "next",
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get plays using cursor-based pagination with optional MBID filtering.

        Args:
            limit: Maximum number of results to return
            cursor: Optional cursor for pagination (base64-encoded "airdate:id")
            direction: Pagination direction ("next" or "prev")
            artist_mbid: Optional artist MBID filter
            recording_mbid: Optional recording MBID filter
            release_mbid: Optional release MBID filter
            release_group_mbid: Optional release group MBID filter

        Returns:
            Dictionary with:
                - results: List of play dictionaries
                - next_cursor: Cursor for next page (None if no more results)
                - has_more: Boolean indicating if more results exist
        """
        cursor_obj = self.conn.cursor()

        # Fetch limit+1 to detect if more results exist
        fetch_limit = limit + 1

        # Build MBID filter clause
        mbid_filter, mbid_params, needs_artist_join = self._build_mbid_filter_clause(
            artist_mbid, recording_mbid, release_mbid, release_group_mbid
        )

        # Build FROM clause with optional artist join
        from_clause = "FROM fact_plays fp"
        if needs_artist_join:
            from_clause += " INNER JOIN play_artists pa ON pa.play_id = fp.id"

        if cursor is None:
            # First page: get most recent plays
            query = f"""
                SELECT fp.* {from_clause}
                {mbid_filter}
                ORDER BY fp.airdate DESC, fp.id DESC
                LIMIT ?
            """
            params = mbid_params + [fetch_limit]
            cursor_obj.execute(query, params)
        else:
            # Subsequent page: use compound cursor for stable pagination
            airdate, play_id = self.decode_cursor(cursor)

            if direction == "next":
                # Combine cursor condition with MBID filters
                cursor_condition = "fp.airdate < ? OR (fp.airdate = ? AND fp.id < ?)"
                if mbid_filter:
                    combined_where = f"WHERE ({cursor_condition}) AND ({mbid_filter[6:]})"  # Remove "WHERE " prefix
                else:
                    combined_where = f"WHERE {cursor_condition}"

                query = f"""
                    SELECT fp.* {from_clause}
                    {combined_where}
                    ORDER BY fp.airdate DESC, fp.id DESC
                    LIMIT ?
                """
                params = [airdate, airdate, play_id] + mbid_params + [fetch_limit]
                cursor_obj.execute(query, params)
            else:
                # "prev" direction (for future implementation)
                cursor_condition = "fp.airdate > ? OR (fp.airdate = ? AND fp.id > ?)"
                if mbid_filter:
                    combined_where = f"WHERE ({cursor_condition}) AND ({mbid_filter[6:]})"  # Remove "WHERE " prefix
                else:
                    combined_where = f"WHERE {cursor_condition}"

                query = f"""
                    SELECT fp.* {from_clause}
                    {combined_where}
                    ORDER BY fp.airdate ASC, fp.id ASC
                    LIMIT ?
                """
                params = [airdate, airdate, play_id] + mbid_params + [fetch_limit]
                cursor_obj.execute(query, params)

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
        limit: int = 50,
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get plays within a time range, chronologically ordered (newest first).

        Args:
            since: Start datetime (inclusive). If None, no lower bound.
            until: End datetime (inclusive). If None, no upper bound.
            limit: Maximum number of results to return
            artist_mbid: Optional artist MBID filter
            recording_mbid: Optional recording MBID filter
            release_mbid: Optional release MBID filter
            release_group_mbid: Optional release group MBID filter

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

        # Build MBID filter clause
        mbid_filter, mbid_params, needs_artist_join = self._build_mbid_filter_clause(
            artist_mbid, recording_mbid, release_mbid, release_group_mbid
        )

        # Build FROM clause with optional artist join
        from_clause = "FROM fact_plays fp"
        if needs_artist_join:
            from_clause += " INNER JOIN play_artists pa ON pa.play_id = fp.id"

        # Build query with time constraints
        conditions = []
        params = []

        if since is not None:
            conditions.append("fp.airdate >= ?")
            params.append(since.isoformat())

        if until is not None:
            conditions.append("fp.airdate <= ?")
            params.append(until.isoformat())

        # Add MBID filters
        if mbid_filter:
            # Extract conditions from WHERE clause
            conditions.extend(mbid_filter[6:].split(" AND "))  # Remove "WHERE " and split
            params.extend(mbid_params)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        query = f"""
            SELECT fp.* {from_clause}
            {where_clause}
            ORDER BY fp.airdate DESC, fp.id DESC
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
        limit: int = 50,
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Jump to a percentage position in the timeline.

        Uses OFFSET to jump to the approximate position based on percentage,
        then returns results with cursor for smooth pagination.

        Args:
            percentage: Position in timeline (0.0 to 1.0)
            limit: Maximum number of results to return
            artist_mbid: Optional artist MBID filter
            recording_mbid: Optional recording MBID filter
            release_mbid: Optional release MBID filter
            release_group_mbid: Optional release group MBID filter

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

        # Build MBID filter clause
        mbid_filter, mbid_params, needs_artist_join = self._build_mbid_filter_clause(
            artist_mbid, recording_mbid, release_mbid, release_group_mbid
        )

        # Build FROM clause with optional artist join
        from_clause = "FROM fact_plays fp"
        if needs_artist_join:
            from_clause += " INNER JOIN play_artists pa ON pa.play_id = fp.id"

        # Get total count (with filters if applicable)
        cursor_obj = self.conn.cursor()
        if mbid_filter:
            count_query = f"SELECT COUNT(*) {from_clause} {mbid_filter}"
            cursor_obj.execute(count_query, mbid_params)
        else:
            count_query = "SELECT COUNT(*) FROM fact_plays"
            cursor_obj.execute(count_query)

        total = cursor_obj.fetchone()[0]
        offset = int(total * percentage)

        # Clamp offset to valid range
        if offset >= total:
            offset = max(0, total - limit)

        fetch_limit = limit + 1

        query = f"""
            SELECT fp.* {from_clause}
            {mbid_filter}
            ORDER BY fp.airdate DESC, fp.id DESC
            LIMIT ? OFFSET ?
        """
        params = mbid_params + [fetch_limit, offset]
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
            'has_more': has_more,
            'total_count': total
        }

    def get_plays_around_id(
        self,
        anchor_id: int,
        limit: int = 50,
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get plays centered around a specific play ID.

        Fetches plays before and after the anchor play, returning a view
        centered on the anchor. Useful for "show context around this play".

        Args:
            anchor_id: Play ID to center around
            limit: Total number of results to return (split before/after)
            artist_mbid: Optional artist MBID filter
            recording_mbid: Optional recording MBID filter
            release_mbid: Optional release MBID filter
            release_group_mbid: Optional release group MBID filter

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
        # Build MBID filter clause
        mbid_filter, mbid_params, needs_artist_join = self._build_mbid_filter_clause(
            artist_mbid, recording_mbid, release_mbid, release_group_mbid
        )

        # Build FROM clause with optional artist join
        from_clause = "FROM fact_plays fp"
        if needs_artist_join:
            from_clause += " INNER JOIN play_artists pa ON pa.play_id = fp.id"

        # First, get the anchor play to get its airdate
        cursor_obj = self.conn.cursor()
        anchor_row = cursor_obj.execute("SELECT * FROM fact_plays WHERE id = ?", (anchor_id,)).fetchone()
        if not anchor_row:
            raise ValueError(f"Play ID {anchor_id} not found")

        anchor_airdate = anchor_row['airdate']

        # Always include anchor, distribute remaining (limit-1) slots around it
        remaining_slots = max(0, limit - 1)
        before_limit = remaining_slots // 2
        after_limit = remaining_slots - before_limit

        # Build queries with MBID filters
        if mbid_filter:
            # Combine time/position conditions with MBID filters
            before_conditions = f"(fp.airdate > ? OR (fp.airdate = ? AND fp.id > ?)) AND ({mbid_filter[6:]})"
            after_conditions = f"(fp.airdate < ? OR (fp.airdate = ? AND fp.id < ?)) AND ({mbid_filter[6:]})"
        else:
            before_conditions = "fp.airdate > ? OR (fp.airdate = ? AND fp.id > ?)"
            after_conditions = "fp.airdate < ? OR (fp.airdate = ? AND fp.id < ?)"

        # Get plays before anchor (excluding anchor)
        query_before = f"""
            SELECT fp.* {from_clause}
            WHERE {before_conditions}
            ORDER BY fp.airdate ASC, fp.id ASC
            LIMIT ?
        """
        before_params = [anchor_airdate, anchor_airdate, anchor_id] + mbid_params + [before_limit]
        cursor_obj.execute(query_before, before_params)
        rows_before = cursor_obj.fetchall()

        # Get plays after anchor (excluding anchor)
        query_after = f"""
            SELECT fp.* {from_clause}
            WHERE {after_conditions}
            ORDER BY fp.airdate DESC, fp.id DESC
            LIMIT ?
        """
        after_params = [anchor_airdate, anchor_airdate, anchor_id] + mbid_params + [after_limit + 1]
        cursor_obj.execute(query_after, after_params)
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

    def get_all_plays_for_indexing(self) -> List[Dict[str, Any]]:
        """
        Fetch all plays with fields needed for BM25 indexing.

        Returns lightweight dictionaries with just the fields needed
        for building search documents.

        Returns:
            List of play dictionaries with indexing fields
        """
        cursor = self.conn.cursor()
        query = """
            SELECT id, artist, song, album, comment, labels, rotation_status
            FROM fact_plays
            ORDER BY id
        """
        cursor.execute(query)

        results = []
        for row in cursor.fetchall():
            data = dict(row)
            # Parse labels JSON
            if data.get('labels'):
                try:
                    labels = json.loads(data['labels'])
                    data['labels'] = ' '.join(labels) if isinstance(labels, list) else str(labels)
                except json.JSONDecodeError:
                    data['labels'] = ''
            else:
                data['labels'] = ''
            results.append(data)

        logger.info(f"Fetched {len(results):,} plays for indexing")
        return results

    def ensure_enrichment_type(self, type_name: str) -> int:
        """
        Ensure an enrichment type exists, creating it if necessary.

        Args:
            type_name: Name of the enrichment type

        Returns:
            The enrichment type ID
        """
        cursor = self.conn.cursor()

        # Try to get existing type
        cursor.execute(
            "SELECT id FROM enrichment_types WHERE name = ?",
            (type_name,)
        )
        row = cursor.fetchone()

        if row:
            return row[0]

        # Create new type
        cursor.execute(
            "INSERT INTO enrichment_types (name) VALUES (?)",
            (type_name,)
        )
        self.conn.commit()
        type_id = cursor.lastrowid
        logger.info(f"Created new enrichment type: {type_name} (id={type_id})")
        return type_id

    def bulk_insert_enrichments(
        self,
        enrichment_type_id: int,
        enrichments: List[Dict[str, Any]]
    ) -> int:
        """
        Bulk insert enrichments using executemany for performance.

        Args:
            enrichment_type_id: ID of the enrichment type
            enrichments: List of dicts with 'play_id' and 'data' keys

        Returns:
            Number of enrichments inserted/updated
        """
        cursor = self.conn.cursor()

        # Prepare data for executemany
        insert_data = [
            (
                item['play_id'],
                enrichment_type_id,
                json.dumps(item['data']) if isinstance(item['data'], dict) else item['data']
            )
            for item in enrichments
        ]

        # Use INSERT OR REPLACE for upsert behavior
        cursor.executemany("""
            INSERT INTO enrichments (play_id, enrichment_type_id, data, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(play_id, enrichment_type_id)
            DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
        """, insert_data)

        self.conn.commit()
        count = len(insert_data)
        logger.info(f"Bulk inserted {count:,} enrichments")
        return count

    def get_enrichment_types(self) -> List[Dict[str, Any]]:
        """
        Get all enrichment types.

        Returns:
            List of enrichment type dictionaries
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, name FROM enrichment_types ORDER BY name")
        return [{'id': row[0], 'name': row[1]} for row in cursor.fetchall()]

    def get_play_count(
        self,
        artist_mbid: Optional[str] = None,
        recording_mbid: Optional[str] = None,
        release_mbid: Optional[str] = None,
        release_group_mbid: Optional[str] = None
    ) -> int:
        """
        Get count of plays matching MBID filters.

        Args:
            artist_mbid: Filter by artist MBID
            recording_mbid: Filter by recording MBID
            release_mbid: Filter by release MBID
            release_group_mbid: Filter by release group MBID

        Returns:
            Count of matching plays
        """
        cursor = self.conn.cursor()

        # Build MBID filter clause
        mbid_filter, mbid_params, needs_artist_join = self._build_mbid_filter_clause(
            artist_mbid, recording_mbid, release_mbid, release_group_mbid
        )

        # Build FROM clause with optional artist join
        from_clause = "FROM fact_plays fp"
        if needs_artist_join:
            from_clause += " INNER JOIN play_artists pa ON pa.play_id = fp.id"

        if mbid_filter:
            query = f"SELECT COUNT(*) {from_clause} {mbid_filter}"
            cursor.execute(query, mbid_params)
        else:
            cursor.execute("SELECT COUNT(*) FROM fact_plays")

        return cursor.fetchone()[0]

    # =========================================================================
    # FTS5 Full-Text Search Methods
    # =========================================================================

    def fts5_search(
        self,
        query: str,
        limit: int = 100,
        columns: Optional[List[str]] = None
    ) -> List[Tuple[int, float]]:
        """
        Search plays using FTS5 full-text search.

        Args:
            query: Search query (FTS5 syntax supported)
            limit: Maximum results to return
            columns: Specific columns to search (default: all)
                     Options: artist, song, album, comment

        Returns:
            List of (play_id, bm25_score) tuples, sorted by relevance.
            Note: BM25 scores are negative (more negative = better match).
        """
        cursor = self.conn.cursor()

        # Escape query for FTS5 (handle special characters)
        # FTS5 treats quotes specially, so we escape them
        safe_query = query.replace('"', '""')

        # Build column filter if specified
        if columns:
            # Use column filter syntax: {col1 col2}: query
            col_prefix = f"{{{' '.join(columns)}}}: "
            fts_query = f'{col_prefix}"{safe_query}"'
        else:
            # Search all columns
            fts_query = f'"{safe_query}"'

        try:
            cursor.execute("""
                SELECT rowid, bm25(plays_fts) as score
                FROM plays_fts
                WHERE plays_fts MATCH ?
                ORDER BY score
                LIMIT ?
            """, (fts_query, limit))

            return [(row[0], row[1]) for row in cursor.fetchall()]
        except sqlite3.OperationalError as e:
            logger.warning(f"FTS5 search failed for query '{query}': {e}")
            return []

    def check_fts5_available(self) -> bool:
        """Check if FTS5 table exists and is populated."""
        cursor = self.conn.cursor()
        try:
            cursor.execute("SELECT COUNT(*) FROM plays_fts")
            count = cursor.fetchone()[0]
            return count > 0
        except sqlite3.OperationalError:
            return False

    # =========================================================================
    # Insights Methods (typed insight storage)
    # =========================================================================

    def bulk_insert_insights(
        self,
        insights: List[Dict[str, Any]]
    ) -> List[int]:
        """
        Bulk insert typed insights into the insights table.

        Args:
            insights: List of insight dicts with structure:
                - insight_type: "Concert", "Cover", etc.
                - play_id: Source play ID
                - confidence: "high", "medium", "low"
                - source_type: "extraction", "database", "external"
                - source_recording_mbid: Optional MBID
                - source_release_mbid: Optional MBID
                - source_artist_mbids: List of artist MBIDs
                - referenced_*_mbid: Optional referenced MBIDs
                - data: Full insight JSON
                - summary: Optional generated summary
                - eval_context: Optional evaluation context dict

        Returns:
            List of inserted insight IDs
        """
        cursor = self.conn.cursor()
        inserted_ids = []

        for insight in insights:
            # Serialize eval_context if present
            eval_context_json = None
            if insight.get('eval_context'):
                eval_context_json = json.dumps(insight['eval_context']) if isinstance(insight['eval_context'], dict) else insight['eval_context']

            # Insert into insights table
            cursor.execute("""
                INSERT INTO insights (
                    insight_type,
                    play_id,
                    confidence,
                    source_type,
                    source_recording_mbid,
                    source_release_mbid,
                    referenced_artist_mbid,
                    referenced_recording_mbid,
                    referenced_release_mbid,
                    referenced_label_mbid,
                    data,
                    summary,
                    eval_context,
                    schema_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v1')
            """, (
                insight['insight_type'],
                insight['play_id'],
                insight['confidence'],
                insight['source_type'],
                insight.get('source_recording_mbid'),
                insight.get('source_release_mbid'),
                insight.get('referenced_artist_mbid'),
                insight.get('referenced_recording_mbid'),
                insight.get('referenced_release_mbid'),
                insight.get('referenced_label_mbid'),
                json.dumps(insight['data']) if isinstance(insight['data'], dict) else insight['data'],
                insight.get('summary'),
                eval_context_json,
            ))
            insight_id = cursor.lastrowid
            inserted_ids.append(insight_id)

            # Insert source artists into junction table
            source_artist_mbids = insight.get('source_artist_mbids', [])
            for artist_mbid in source_artist_mbids:
                cursor.execute("""
                    INSERT OR IGNORE INTO insight_source_artists (insight_id, artist_mbid)
                    VALUES (?, ?)
                """, (insight_id, artist_mbid))

        self.conn.commit()
        logger.info(f"Bulk inserted {len(inserted_ids):,} insights")
        return inserted_ids

    def get_insights_for_play(
        self,
        play_id: int,
        include_deleted: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get all insights for a specific play.

        Args:
            play_id: The play ID to fetch insights for
            include_deleted: Whether to include soft-deleted insights

        Returns:
            List of insight dictionaries
        """
        cursor = self.conn.cursor()

        query = """
            SELECT
                id, insight_type, play_id, confidence, source_type,
                source_recording_mbid, source_release_mbid,
                referenced_artist_mbid, referenced_recording_mbid,
                referenced_release_mbid, referenced_label_mbid,
                data, summary, created_at, updated_at, eval_context
            FROM insights
            WHERE play_id = ?
        """
        if not include_deleted:
            query += " AND deleted_at IS NULL"
        query += " ORDER BY created_at DESC"

        cursor.execute(query, (play_id,))
        rows = cursor.fetchall()

        insights = []
        for row in rows:
            data = json.loads(row[11]) if isinstance(row[11], str) else row[11]
            eval_context = json.loads(row[15]) if row[15] and isinstance(row[15], str) else row[15]
            insights.append({
                'id': row[0],
                'insight_type': row[1],
                'play_id': row[2],
                'confidence': row[3],
                'source_type': row[4],
                'source_recording_mbid': row[5],
                'source_release_mbid': row[6],
                'referenced_artist_mbid': row[7],
                'referenced_recording_mbid': row[8],
                'referenced_release_mbid': row[9],
                'referenced_label_mbid': row[10],
                'data': data,
                'summary': row[12],
                'created_at': row[13],
                'updated_at': row[14],
                'eval_context': eval_context,
            })

        return insights

    def get_insights(
        self,
        insight_type: Optional[str] = None,
        play_id: Optional[int] = None,
        artist_mbid: Optional[str] = None,
        confidence: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        include_deleted: bool = False
    ) -> Dict[str, Any]:
        """
        Query insights with filters.

        Args:
            insight_type: Filter by insight type
            play_id: Filter by source play
            artist_mbid: Filter by referenced artist MBID
            confidence: Filter by confidence level
            limit: Max results to return
            offset: Pagination offset
            include_deleted: Whether to include soft-deleted

        Returns:
            Dict with 'insights' list and 'total' count
        """
        cursor = self.conn.cursor()

        # Build WHERE clause
        conditions = []
        params = []

        if not include_deleted:
            conditions.append("deleted_at IS NULL")

        if insight_type:
            conditions.append("insight_type = ?")
            params.append(insight_type)

        if play_id:
            conditions.append("play_id = ?")
            params.append(play_id)

        if artist_mbid:
            conditions.append("referenced_artist_mbid = ?")
            params.append(artist_mbid)

        if confidence:
            conditions.append("confidence = ?")
            params.append(confidence)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Get total count
        count_query = f"SELECT COUNT(*) FROM insights WHERE {where_clause}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]

        # Get paginated results
        query = f"""
            SELECT
                id, insight_type, play_id, confidence, source_type,
                source_recording_mbid, source_release_mbid,
                referenced_artist_mbid, referenced_recording_mbid,
                referenced_release_mbid, referenced_label_mbid,
                data, summary, created_at, updated_at, eval_context
            FROM insights
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, params + [limit, offset])
        rows = cursor.fetchall()

        insights = []
        for row in rows:
            data = json.loads(row[11]) if isinstance(row[11], str) else row[11]
            eval_context = json.loads(row[15]) if row[15] and isinstance(row[15], str) else row[15]
            insights.append({
                'id': row[0],
                'insight_type': row[1],
                'play_id': row[2],
                'confidence': row[3],
                'source_type': row[4],
                'source_recording_mbid': row[5],
                'source_release_mbid': row[6],
                'referenced_artist_mbid': row[7],
                'referenced_recording_mbid': row[8],
                'referenced_release_mbid': row[9],
                'referenced_label_mbid': row[10],
                'data': data,
                'summary': row[12],
                'created_at': row[13],
                'updated_at': row[14],
                'eval_context': eval_context,
            })

        return {'insights': insights, 'total': total}

    def soft_delete_insight(self, insight_id: int) -> bool:
        """
        Soft delete an insight by setting deleted_at.

        Args:
            insight_id: ID of the insight to delete

        Returns:
            True if deleted, False if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE insights
            SET deleted_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ? AND deleted_at IS NULL
        """, (insight_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def get_insights_for_context(
        self,
        play_id: int,
        window_hours: int = 3,
        limit: int = 20,
        include_deleted: bool = False
    ) -> Dict[str, Any]:
        """
        Get insights for plays within a time window around a given play.

        This enables "same show" context - insights from plays aired close
        in time to the target play, providing awareness of what's been
        discussed on the show.

        Args:
            play_id: The center play to build context around
            window_hours: Hours before/after to include (default 3 = typical show length)
            limit: Max insights to return
            include_deleted: Whether to include soft-deleted insights

        Returns:
            Dict with 'insights' list, 'total' count, and 'window_info'
        """
        cursor = self.conn.cursor()

        # First, get the target play's airdate
        cursor.execute("SELECT airdate FROM fact_plays WHERE id = ?", (play_id,))
        row = cursor.fetchone()
        if not row:
            return {'insights': [], 'total': 0, 'window_info': {'error': 'Play not found'}}

        center_airdate = row[0]

        # Calculate time window (SQLite datetime arithmetic)
        # strftime with modifiers: '-N hours' / '+N hours'
        query = """
            SELECT
                i.id, i.insight_type, i.play_id, i.confidence, i.source_type,
                i.source_recording_mbid, i.source_release_mbid,
                i.referenced_artist_mbid, i.referenced_recording_mbid,
                i.referenced_release_mbid, i.referenced_label_mbid,
                i.data, i.summary, i.created_at, i.updated_at, i.eval_context,
                fp.airdate as play_airdate
            FROM insights i
            JOIN fact_plays fp ON i.play_id = fp.id
            WHERE fp.airdate >= datetime(?, '-' || ? || ' hours')
              AND fp.airdate <= datetime(?, '+' || ? || ' hours')
              AND i.play_id != ?
        """
        params = [center_airdate, window_hours, center_airdate, window_hours, play_id]

        if not include_deleted:
            query += " AND i.deleted_at IS NULL"

        query += " ORDER BY fp.airdate DESC, i.created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        insights = []
        for row in rows:
            data = json.loads(row[11]) if isinstance(row[11], str) else row[11]
            eval_context = json.loads(row[15]) if row[15] and isinstance(row[15], str) else row[15]
            insights.append({
                'id': row[0],
                'insight_type': row[1],
                'play_id': row[2],
                'confidence': row[3],
                'source_type': row[4],
                'source_recording_mbid': row[5],
                'source_release_mbid': row[6],
                'referenced_artist_mbid': row[7],
                'referenced_recording_mbid': row[8],
                'referenced_release_mbid': row[9],
                'referenced_label_mbid': row[10],
                'data': data,
                'summary': row[12],
                'created_at': row[13],
                'updated_at': row[14],
                'eval_context': eval_context,
                'play_airdate': row[16],
            })

        return {
            'insights': insights,
            'total': len(insights),
            'window_info': {
                'center_play_id': play_id,
                'center_airdate': center_airdate,
                'window_hours': window_hours,
            }
        }

    # =========================================================================
    # Graph Query Methods
    # =========================================================================

    def query_band_members(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get band members for given band MBIDs."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                target_mbid, target_name, relationship_type,
                attributes, begin_date, end_date,
                source_mbid, source_name
            FROM artist_edges
            WHERE source_mbid IN ({placeholders})
              AND relationship_type = 'band_member'
            ORDER BY target_name
            LIMIT ?
        """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'artist',
                'relationship_type': row[2],
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': row[4],
                'end_date': row[5],
                'via_mbid': row[6],
                'via_name': row[7]
            }
            for row in cursor.fetchall()
        ]

    def query_member_of(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get bands an artist is member of."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                target_mbid, target_name, relationship_type,
                attributes, begin_date, end_date
            FROM artist_edges
            WHERE source_mbid IN ({placeholders})
              AND relationship_type = 'member_of'
            ORDER BY target_name
            LIMIT ?
        """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'band',
                'relationship_type': row[2],
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': row[4],
                'end_date': row[5],
                'via_mbid': None,
                'via_name': None
            }
            for row in cursor.fetchall()
        ]

    def query_labelmates(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get artists who share labels with input artists."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        # Find labelmates via shared labels
        cursor.execute(f"""
            WITH source_labels AS (
                SELECT DISTINCT label_mbid, label_name
                FROM artist_label_edges
                WHERE artist_mbid IN ({placeholders})
            )
            SELECT DISTINCT
                ale.artist_mbid,
                ale.artist_name,
                'labelmate' as relationship_type,
                ale.begin_date,
                ale.end_date,
                sl.label_mbid,
                sl.label_name
            FROM artist_label_edges ale
            JOIN source_labels sl ON ale.label_mbid = sl.label_mbid
            WHERE ale.artist_mbid NOT IN ({placeholders})
            ORDER BY ale.artist_name
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'artist',
                'relationship_type': row[2],
                'attributes': None,
                'begin_date': row[3],
                'end_date': row[4],
                'via_mbid': row[5],
                'via_name': row[6]
            }
            for row in cursor.fetchall()
        ]

    def query_covers(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True,
        version_type: str = None,  # Filter: 'cover', 'live', 'medley', 'instrumental'
        **kwargs  # Accept additional kwargs for API compatibility
    ) -> List[dict]:
        """Get other recordings of the same work(s) - cover/live/other versions.

        Args:
            mbids: Recording MBIDs to find versions of
            limit: Maximum results to return
            include_attributes: Whether to include attribute array
            version_type: Optional filter - 'cover', 'live', 'medley', 'instrumental'
                         If None, returns all versions

        Note: The attributes column stores a JSON array like ["cover"], ["live"], etc.
              We use LIKE queries to filter since SQLite JSON functions may not be available.
        """
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        # Build version type filter using JSON array pattern matching
        # attributes column contains JSON arrays like '["cover"]', '["live"]', '["cover", "live"]'
        version_filter = ""
        params = [*mbids, *mbids]
        if version_type and version_type in ['cover', 'live', 'medley', 'instrumental']:
            # Match the type anywhere in the JSON array
            version_filter = f'AND rwl.attributes LIKE ?'
            params.append(f'%"{version_type}"%')
        params.append(limit)

        cursor.execute(f"""
            WITH source_works AS (
                SELECT DISTINCT work_mbid, work_title
                FROM recording_work_links
                WHERE recording_mbid IN ({placeholders})
            )
            SELECT DISTINCT
                rwl.recording_mbid,
                COALESCE(r.song_title, rwl.work_title) as name,
                rwl.attributes,
                sw.work_mbid,
                sw.work_title
            FROM recording_work_links rwl
            JOIN source_works sw ON rwl.work_mbid = sw.work_mbid
            LEFT JOIN mb_recordings r ON rwl.recording_mbid = r.recording_mbid
            WHERE rwl.recording_mbid NOT IN ({placeholders})
            {version_filter}
            LIMIT ?
        """, params)

        results = []
        for row in cursor.fetchall():
            # Parse attributes JSON to determine relationship type
            attrs = []
            if row[2]:
                try:
                    attrs = json.loads(row[2])
                except json.JSONDecodeError:
                    attrs = []

            # Determine relationship type based on attributes
            rel_type = 'version'  # default
            if 'cover' in attrs:
                rel_type = 'cover'
            elif 'live' in attrs:
                rel_type = 'live'
            elif 'medley' in attrs:
                rel_type = 'medley'
            elif 'instrumental' in attrs:
                rel_type = 'instrumental'

            results.append({
                'mbid': row[0],
                'name': row[1] or 'Unknown',
                'node_type': 'recording',
                'relationship_type': rel_type,
                'attributes': attrs if include_attributes else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[3],
                'via_name': row[4]
            })
        return results

    def query_artist_origin(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get artist's origin area."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                area_mbid,
                area_name,
                relationship_type,
                area_type,
                artist_mbid,
                artist_name
            FROM artist_area_edges
            WHERE artist_mbid IN ({placeholders})
            LIMIT ?
        """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'area',
                'relationship_type': row[2],
                'attributes': [row[3]] if row[3] else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[4],
                'via_name': row[5]
            }
            for row in cursor.fetchall()
        ]

    def query_artists_from_area(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get artists from an area (by MBID or name)."""
        if not mbids:
            return []

        # Support both MBIDs and area names
        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                artist_mbid,
                artist_name,
                relationship_type,
                area_type,
                area_mbid,
                area_name
            FROM artist_area_edges
            WHERE area_mbid IN ({placeholders})
               OR area_name IN ({placeholders})
            ORDER BY artist_name
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'artist',
                'relationship_type': row[2],
                'attributes': [row[3]] if row[3] else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[4],
                'via_name': row[5]
            }
            for row in cursor.fetchall()
        ]

    def query_recorded_at(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get recordings made at a place (by MBID or name)."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                recording_mbid,
                recording_title,
                relationship_type,
                place_type,
                begin_date,
                end_date,
                place_mbid,
                place_name
            FROM place_recording_edges
            WHERE place_mbid IN ({placeholders})
               OR place_name IN ({placeholders})
            ORDER BY recording_title
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1] or 'Unknown',
                'node_type': 'recording',
                'relationship_type': row[2],
                'attributes': [row[3]] if row[3] else None,
                'begin_date': row[4],
                'end_date': row[5],
                'via_mbid': row[6],
                'via_name': row[7]
            }
            for row in cursor.fetchall()
        ]

    def query_collaborators(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get artists who shared bands with input artist."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            WITH source_bands AS (
                SELECT DISTINCT target_mbid as band_mbid, target_name as band_name
                FROM artist_edges
                WHERE source_mbid IN ({placeholders})
                  AND relationship_type = 'member_of'
            )
            SELECT DISTINCT
                ae.source_mbid,
                ae.source_name,
                ae.attributes,
                ae.begin_date,
                ae.end_date,
                sb.band_mbid,
                sb.band_name
            FROM artist_edges ae
            JOIN source_bands sb ON ae.target_mbid = sb.band_mbid
            WHERE ae.source_mbid NOT IN ({placeholders})
              AND ae.relationship_type = 'member_of'
            ORDER BY ae.source_name
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'artist',
                'relationship_type': 'collaborator',
                'attributes': json.loads(row[2]) if row[2] and include_attributes else None,
                'begin_date': row[3],
                'end_date': row[4],
                'via_mbid': row[5],
                'via_name': row[6]
            }
            for row in cursor.fetchall()
        ]

    def query_collaborators_direct(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True,
        collaboration_type: str = None,  # Filter: 'featured', 'production', 'writing'
        **kwargs  # Accept additional kwargs for API compatibility
    ) -> List[dict]:
        """Get direct artist collaborations (not via shared band membership).

        Finds artists who have direct relationships like:
        - Featured performances (vocal, instrumental)
        - Production relationships (producer, engineer, mix)
        - Writing collaborations (composer, lyricist, arranger)
        - Direct collaborations

        Args:
            mbids: Artist MBIDs to find collaborators for
            limit: Maximum results
            include_attributes: Include relationship attributes
            collaboration_type: Optional filter - 'featured', 'production', 'writing', 'all'
        """
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        # Define collaboration relationship types by category
        # These exclude band membership relationships
        collaboration_types = {
            'featured': ['vocal', 'vocals', 'instrumental', 'performer', 'guest'],
            'production': ['producer', 'engineer', 'mix', 'mastering', 'recording'],
            'writing': ['composer', 'lyricist', 'arranger', 'orchestrator', 'writer'],
            'other': ['collaboration', 'tribute', 'personal relationship'],
        }

        # Build type filter
        type_filter = ""
        if collaboration_type and collaboration_type in collaboration_types:
            types = collaboration_types[collaboration_type]
            type_placeholders = ','.join('?' * len(types))
            type_filter = f"AND relationship_type IN ({type_placeholders})"
            type_params = types
        else:
            # All non-band relationships
            type_params = []

        # Exclude band membership relationships
        exclude_types = ['member of band', 'member_of', 'band_member', 'subgroup']

        cursor.execute(f"""
            SELECT DISTINCT
                target_mbid,
                target_name,
                relationship_type,
                attributes,
                begin_date,
                end_date,
                source_mbid,
                source_name,
                target_type
            FROM artist_edges
            WHERE source_mbid IN ({placeholders})
              AND relationship_type NOT IN ('member of band', 'member_of', 'band_member', 'subgroup')
              AND target_type = 'Person'  -- Only person-to-person collaborations
              {type_filter}
            ORDER BY target_name
            LIMIT ?
        """, [*mbids, *type_params, limit] if type_params else [*mbids, limit])

        # Map relationship types to categories for display
        def categorize_relationship(rel_type: str) -> str:
            rel_lower = rel_type.lower()
            for category, types in collaboration_types.items():
                if any(t in rel_lower for t in types):
                    return category
            return 'collaboration'

        return [
            {
                'mbid': row[0],
                'name': row[1] or 'Unknown',
                'node_type': 'artist',
                'relationship_type': row[2],  # Keep original type
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': row[4],
                'end_date': row[5],
                'via_mbid': row[6],  # Source artist
                'via_name': row[7],  # Source artist name
            }
            for row in cursor.fetchall()
        ]

    def query_label_hierarchy(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True
    ) -> List[dict]:
        """Get label ownership/distribution hierarchy."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        # Get both directions: labels owned by and labels that own
        cursor.execute(f"""
            SELECT
                target_mbid,
                target_name,
                relationship_type,
                begin_date,
                end_date,
                source_mbid,
                source_name
            FROM label_edges
            WHERE source_mbid IN ({placeholders})
               OR target_mbid IN ({placeholders})
            ORDER BY target_name
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'label',
                'relationship_type': row[2],
                'attributes': None,
                'begin_date': row[3],
                'end_date': row[4],
                'via_mbid': row[5],
                'via_name': row[6]
            }
            for row in cursor.fetchall()
        ]

    def query_members_by_instrument(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True,
        instrument: str = None,
        **kwargs
    ) -> List[dict]:
        """Get band members filtered by instrument."""
        if not mbids:
            return []
        if not instrument:
            return self.query_band_members(mbids, limit, include_attributes)

        # Map instrument to column
        instrument_column = {
            "vocals": "has_vocals",
            "guitar": "has_guitar",
            "bass": "has_bass",
            "drums": "has_drums",
            "keys": "has_keys",
        }.get(instrument)

        if not instrument_column:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                source_mbid,
                source_name,
                relationship_type,
                attributes,
                begin_date,
                end_date,
                target_mbid,
                target_name,
                primary_role
            FROM artist_edges
            WHERE target_mbid IN ({placeholders})
              AND relationship_type = 'member of band'
              AND {instrument_column} = 1
            ORDER BY source_name
            LIMIT ?
        """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1],
                'node_type': 'artist',
                'relationship_type': row[2],
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': row[4],
                'end_date': row[5],
                'via_mbid': row[6],
                'via_name': row[7]
            }
            for row in cursor.fetchall()
        ]

    def query_works_by_creator(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True,
        creator_type: str = None,
        **kwargs
    ) -> List[dict]:
        """Get works composed/written by artist."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        # Build query with optional creator_type filter
        if creator_type:
            cursor.execute(f"""
                SELECT
                    work_mbid,
                    work_title,
                    relationship_type,
                    attributes,
                    artist_mbid,
                    artist_name
                FROM artist_work_edges
                WHERE artist_mbid IN ({placeholders})
                  AND relationship_type = ?
                ORDER BY work_title
                LIMIT ?
            """, [*mbids, creator_type, limit])
        else:
            cursor.execute(f"""
                SELECT
                    work_mbid,
                    work_title,
                    relationship_type,
                    attributes,
                    artist_mbid,
                    artist_name
                FROM artist_work_edges
                WHERE artist_mbid IN ({placeholders})
                ORDER BY work_title
                LIMIT ?
            """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1] or 'Unknown Work',
                'node_type': 'work',
                'relationship_type': row[2],
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[4],
                'via_name': row[5]
            }
            for row in cursor.fetchall()
        ]

    def query_work_credits(
        self,
        mbids: List[str],
        limit: int = 20,
        include_attributes: bool = True,
        **kwargs
    ) -> List[dict]:
        """Get creators (composers/lyricists) of a work."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

        cursor.execute(f"""
            SELECT
                artist_mbid,
                artist_name,
                relationship_type,
                attributes,
                work_mbid,
                work_title
            FROM artist_work_edges
            WHERE work_mbid IN ({placeholders})
            ORDER BY relationship_type, artist_name
            LIMIT ?
        """, [*mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1] or 'Unknown Artist',
                'node_type': 'artist',
                'relationship_type': row[2],
                'attributes': json.loads(row[3]) if row[3] and include_attributes else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[4],
                'via_name': row[5]
            }
            for row in cursor.fetchall()
        ]

    # =========================================================================
    # Image Validation Methods
    # =========================================================================

    def get_plays_needing_image_validation(
        self,
        limit: int = 1000,
        max_age_days: int = 7
    ) -> list:
        """
        Get plays with image_uri that need validation.

        Returns plays where:
        - image_uri IS NOT NULL
        - AND (image_validated_at IS NULL OR older than max_age_days)

        Args:
            limit: Maximum number of plays to return
            max_age_days: Re-validate images older than this many days

        Returns:
            List of dicts with id, image_uri, thumbnail_uri, image_validated_at
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, image_uri, thumbnail_uri, image_validated_at
            FROM fact_plays
            WHERE image_uri IS NOT NULL
              AND (
                image_validated_at IS NULL
                OR datetime(image_validated_at) < datetime('now', ?)
              )
            ORDER BY image_validated_at ASC NULLS FIRST
            LIMIT ?
        """, (f'-{max_age_days} days', limit))

        return [
            {
                'id': row[0],
                'image_uri': row[1],
                'thumbnail_uri': row[2],
                'image_validated_at': row[3]
            }
            for row in cursor.fetchall()
        ]

    def mark_image_validated(self, play_id: int) -> bool:
        """
        Mark a play's image as validated (URL is working).

        Updates image_validated_at to current timestamp.

        Args:
            play_id: The play ID to mark as validated

        Returns:
            True if updated, False if play not found
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE fact_plays
            SET image_validated_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        """, (play_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def clear_broken_image(self, play_id: int) -> bool:
        """
        Clear broken image URLs and mark as validated.

        Sets image_uri and thumbnail_uri to NULL, updates image_validated_at.
        This prevents repeated validation attempts on known-broken URLs.

        Args:
            play_id: The play ID with broken image

        Returns:
            True if updated, False if play not found
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE fact_plays
            SET image_uri = NULL,
                thumbnail_uri = NULL,
                image_validated_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        """, (play_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def get_image_validation_stats(self) -> dict:
        """
        Get statistics about image validation status.

        Returns:
            Dict with counts for validated, unvalidated, stale, and total images
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                COUNT(*) as total_with_images,
                SUM(CASE WHEN image_validated_at IS NOT NULL THEN 1 ELSE 0 END) as validated,
                SUM(CASE WHEN image_validated_at IS NULL THEN 1 ELSE 0 END) as unvalidated,
                SUM(CASE WHEN datetime(image_validated_at) < datetime('now', '-7 days') THEN 1 ELSE 0 END) as stale
            FROM fact_plays
            WHERE image_uri IS NOT NULL
        """)
        row = cursor.fetchone()
        return {
            'total_with_images': row[0] or 0,
            'validated': row[1] or 0,
            'unvalidated': row[2] or 0,
            'stale': row[3] or 0
        }

    # =========================================================================
    # Agent Runs Methods
    # =========================================================================

    def save_agent_run(self, run_data: Dict[str, Any]) -> Tuple[str, bool]:
        """
        Save or update an agent run.

        Args:
            run_data: Agent run data with sessionId, mode, status, etc.

        Returns:
            Tuple of (session_id, was_created)
        """
        cursor = self.conn.cursor()
        session_id = run_data['sessionId']

        # Serialize JSON columns
        play_ids_json = json.dumps(run_data.get('playIds', []))
        insights_json = json.dumps(run_data.get('insights', []))
        tool_calls_json = json.dumps(run_data.get('toolCalls', []))
        research_steps_json = json.dumps(run_data.get('researchSteps', []))
        entities_json = json.dumps(run_data.get('entities', []))

        # Compute counts
        insight_count = len(run_data.get('insights', []))
        tool_call_count = len(run_data.get('toolCalls', []))
        research_step_count = len(run_data.get('researchSteps', []))
        entity_count = len(run_data.get('entities', []))

        # Compute duration if completed
        duration_ms = None
        if run_data.get('completedAt') and run_data.get('startedAt'):
            duration_ms = run_data['completedAt'] - run_data['startedAt']

        # Check if exists
        cursor.execute("SELECT 1 FROM agent_runs WHERE session_id = ?", (session_id,))
        exists = cursor.fetchone() is not None

        if exists:
            # Update existing
            cursor.execute("""
                UPDATE agent_runs SET
                    mode = ?,
                    started_at = ?,
                    completed_at = ?,
                    status = ?,
                    play_ids = ?,
                    insights = ?,
                    tool_calls = ?,
                    research_steps = ?,
                    entities = ?,
                    error_message = ?,
                    error_stack = ?,
                    insight_count = ?,
                    tool_call_count = ?,
                    research_step_count = ?,
                    entity_count = ?,
                    duration_ms = ?,
                    updated_at = datetime('now')
                WHERE session_id = ?
            """, (
                run_data['mode'],
                run_data['startedAt'],
                run_data.get('completedAt'),
                run_data['status'],
                play_ids_json,
                insights_json,
                tool_calls_json,
                research_steps_json,
                entities_json,
                run_data.get('errorMessage'),
                run_data.get('errorStack'),
                insight_count,
                tool_call_count,
                research_step_count,
                entity_count,
                duration_ms,
                session_id
            ))
        else:
            # Insert new
            cursor.execute("""
                INSERT INTO agent_runs (
                    session_id, mode, started_at, completed_at, status,
                    play_ids, insights, tool_calls, research_steps, entities,
                    error_message, error_stack,
                    insight_count, tool_call_count, research_step_count, entity_count,
                    duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                run_data['mode'],
                run_data['startedAt'],
                run_data.get('completedAt'),
                run_data['status'],
                play_ids_json,
                insights_json,
                tool_calls_json,
                research_steps_json,
                entities_json,
                run_data.get('errorMessage'),
                run_data.get('errorStack'),
                insight_count,
                tool_call_count,
                research_step_count,
                entity_count,
                duration_ms
            ))

        # Update junction table for play lookups
        cursor.execute("DELETE FROM agent_run_plays WHERE session_id = ?", (session_id,))
        play_ids = run_data.get('playIds', [])
        if play_ids:
            cursor.executemany(
                "INSERT INTO agent_run_plays (session_id, play_id) VALUES (?, ?)",
                [(session_id, pid) for pid in play_ids]
            )

        self.conn.commit()
        return session_id, not exists

    def get_agent_run(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single agent run by session ID.

        Args:
            session_id: Session identifier

        Returns:
            Agent run dict or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                session_id, mode, started_at, completed_at, status,
                play_ids, insights, tool_calls, research_steps, entities,
                error_message, error_stack,
                insight_count, tool_call_count, research_step_count, entity_count,
                duration_ms, created_at, updated_at
            FROM agent_runs
            WHERE session_id = ?
        """, (session_id,))
        row = cursor.fetchone()

        if row is None:
            return None

        return self._agent_run_row_to_dict(row, include_full_data=True)

    def list_agent_runs(
        self,
        status: Optional[str] = None,
        mode: Optional[str] = None,
        play_id: Optional[int] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List agent runs with optional filters.

        Args:
            status: Filter by status
            mode: Filter by mode
            play_id: Filter by play ID
            since: Filter runs started after this ISO date
            until: Filter runs started before this ISO date
            limit: Max results
            offset: Pagination offset

        Returns:
            Tuple of (runs list, total count)
        """
        cursor = self.conn.cursor()

        conditions = []
        params: List[Any] = []

        if status:
            conditions.append("ar.status = ?")
            params.append(status)

        if mode:
            conditions.append("ar.mode = ?")
            params.append(mode)

        if play_id:
            conditions.append("ar.session_id IN (SELECT session_id FROM agent_run_plays WHERE play_id = ?)")
            params.append(play_id)

        if since:
            # Convert ISO date to Unix timestamp (ms)
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            since_ts = int(since_dt.timestamp() * 1000)
            conditions.append("ar.started_at >= ?")
            params.append(since_ts)

        if until:
            until_dt = datetime.fromisoformat(until.replace('Z', '+00:00'))
            until_ts = int(until_dt.timestamp() * 1000)
            conditions.append("ar.started_at <= ?")
            params.append(until_ts)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Get total count
        cursor.execute(f"""
            SELECT COUNT(*) FROM agent_runs ar WHERE {where_clause}
        """, params)
        total = cursor.fetchone()[0]

        # Get paginated results
        cursor.execute(f"""
            SELECT
                ar.session_id, ar.mode, ar.started_at, ar.completed_at, ar.status,
                ar.play_ids, ar.error_message,
                ar.insight_count, ar.tool_call_count, ar.research_step_count, ar.entity_count,
                ar.duration_ms, ar.created_at
            FROM agent_runs ar
            WHERE {where_clause}
            ORDER BY ar.started_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset])

        runs = []
        for row in cursor.fetchall():
            runs.append(self._agent_run_row_to_dict(row, include_full_data=False))

        return runs, total

    def delete_agent_run(self, session_id: str) -> bool:
        """
        Delete an agent run.

        Args:
            session_id: Session identifier

        Returns:
            True if deleted, False if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM agent_runs WHERE session_id = ?", (session_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def get_incomplete_agent_runs(self) -> List[Dict[str, Any]]:
        """
        Get agent runs with status='running' for recovery.

        Returns:
            List of incomplete runs ordered by most recent first
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT
                session_id, mode, started_at, completed_at, status,
                play_ids, error_message,
                insight_count, tool_call_count, research_step_count, entity_count,
                duration_ms, created_at
            FROM agent_runs
            WHERE status = 'running'
            ORDER BY started_at DESC
        """)

        runs = []
        for row in cursor.fetchall():
            runs.append(self._agent_run_row_to_dict(row, include_full_data=False))

        return runs

    def _agent_run_row_to_dict(self, row: sqlite3.Row, include_full_data: bool = False) -> Dict[str, Any]:
        """Convert agent_runs row to dictionary."""
        # Parse play_ids JSON
        play_ids_raw = row['play_ids'] if 'play_ids' in row.keys() else '[]'
        play_ids = json.loads(play_ids_raw) if play_ids_raw else []

        result = {
            'sessionId': row['session_id'],
            'mode': row['mode'],
            'startedAt': row['started_at'],
            'completedAt': row['completed_at'],
            'status': row['status'],
            'playIds': play_ids,
            'insightCount': row['insight_count'],
            'toolCallCount': row['tool_call_count'],
            'researchStepCount': row['research_step_count'] if 'research_step_count' in row.keys() else 0,
            'entityCount': row['entity_count'] if 'entity_count' in row.keys() else 0,
            'durationMs': row['duration_ms'],
            'errorMessage': row['error_message'] if 'error_message' in row.keys() else None,
            'createdAt': row['created_at'],
        }

        if include_full_data:
            # Parse full JSON columns
            result['insights'] = json.loads(row['insights'] or '[]')
            result['toolCalls'] = json.loads(row['tool_calls'] or '[]')
            result['researchSteps'] = json.loads(row['research_steps'] or '[]')
            result['entities'] = json.loads(row['entities'] or '[]')
            result['errorStack'] = row['error_stack']
            result['updatedAt'] = row['updated_at']

        return result

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("Database connection closed")
