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
        include_attributes: bool = True
    ) -> List[dict]:
        """Get other recordings of the same work(s) - cover versions."""
        if not mbids:
            return []

        placeholders = ','.join('?' * len(mbids))
        cursor = self.conn.cursor()

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
            LIMIT ?
        """, [*mbids, *mbids, limit])

        return [
            {
                'mbid': row[0],
                'name': row[1] or 'Unknown',
                'node_type': 'recording',
                'relationship_type': 'cover',
                'attributes': json.loads(row[2]) if row[2] and include_attributes else None,
                'begin_date': None,
                'end_date': None,
                'via_mbid': row[3],
                'via_name': row[4]
            }
            for row in cursor.fetchall()
        ]

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

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("Database connection closed")
