#!/usr/bin/env python3
"""
KEXP Incremental Play Sync Script

Fetches new plays from the KEXP API and updates the local database and play_ids
alignment file. Designed to run every 30 seconds via cron.

Architecture:
- Uses MAX(id) from database to determine last synced play
- Fetches new plays from KEXP API with exponential backoff retry
- Inserts plays into SQLite database with INSERT OR IGNORE
- Inline cover art enrichment from Cover Art Archive for plays without images
- Updates play_ids.npy atomically with temp file + rename
- File-based locking to prevent concurrent executions
- Structured JSON logging to stdout

Usage:
    python scripts/sync_plays.py [--db-path PATH] [--play-ids-path PATH]

Options:
    --db-path           Path to SQLite database (default: data/music_kb.sqlite)
    --play-ids-path     Path to play_ids.npy file (default: data/play_ids.npy)

Example:
    docker exec kexp-search-api python /app/scripts/sync_plays.py
"""

import argparse
import fcntl
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import numpy as np

# Add app directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.kexp_models import TrackPlay, NonTrackPlay, Airbreak, PlayResponse


class PlaySyncService:
    """
    Service for syncing new KEXP plays to local database and alignment files.

    Handles:
    - Querying current state from database
    - Fetching new plays from KEXP API with retry logic
    - Inserting plays into database with transaction safety
    - Updating play_ids.npy alignment file atomically
    """

    KEXP_API_BASE = "https://api.kexp.org/v2"
    CAA_RELEASE_URL = "https://coverartarchive.org/release"
    CAA_RELEASE_GROUP_URL = "https://coverartarchive.org/release-group"
    LOCK_FILE = "/tmp/kexp_sync.lock"
    MAX_RETRIES = 3
    BASE_DELAY = 2  # seconds
    CAA_RATE_LIMIT_DELAY = 1.0  # 1 second between CAA requests

    def __init__(self, db_path: str, play_ids_path: str):
        """
        Initialize sync service.

        Args:
            db_path: Path to SQLite database file
            play_ids_path: Path to play_ids.npy alignment file
        """
        self.db_path = db_path
        self.play_ids_path = play_ids_path
        self.lock_fd = None

    def acquire_lock(self) -> bool:
        """
        Acquire exclusive lock to prevent concurrent executions.

        Returns:
            True if lock acquired, False if lock already held
        """
        try:
            self.lock_fd = open(self.LOCK_FILE, 'w')
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_fd.write(str(os.getpid()))
            self.lock_fd.flush()
            return True
        except BlockingIOError:
            if self.lock_fd:
                self.lock_fd.close()
                self.lock_fd = None
            return False
        except Exception as e:
            if self.lock_fd:
                self.lock_fd.close()
                self.lock_fd = None
            self._log_error(f"Failed to acquire lock: {e}")
            return False

    def release_lock(self):
        """Release the exclusive lock."""
        if self.lock_fd:
            try:
                fcntl.flock(self.lock_fd, fcntl.LOCK_UN)
                self.lock_fd.close()
            except Exception as e:
                self._log_error(f"Failed to release lock: {e}")
            finally:
                self.lock_fd = None

    def get_last_play_id(self) -> int | None:
        """
        Query MAX(id) from database to find last synced play.

        Returns:
            Last play ID or None if database is empty
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(id) FROM fact_plays")
            result = cursor.fetchone()
            conn.close()

            return result[0] if result and result[0] is not None else None
        except Exception as e:
            self._log_error(f"Failed to query last play ID: {e}")
            raise

    def fetch_new_plays(self, last_id: int | None) -> list[TrackPlay | NonTrackPlay]:
        """
        Fetch all new plays from KEXP API with continuous pagination and exponential backoff retry.

        Args:
            last_id: Last synced play ID, or None to fetch from scratch

        Returns:
            List of new TrackPlay and NonTrackPlay objects (airbreaks filtered out)
        """
        all_new_plays = []
        url = f"{self.KEXP_API_BASE}/plays/?limit=100"
        pages_fetched = 0
        max_pages = 1000  # Safety limit to prevent infinite loops

        while url and pages_fetched < max_pages:
            for attempt in range(self.MAX_RETRIES):
                try:
                    response = httpx.get(url, timeout=10.0)
                    response.raise_for_status()

                    # Parse response using Pydantic models
                    play_response = PlayResponse.model_validate_json(response.text)

                    # Filter to trackplays only and filter by ID
                    page_new_plays = []
                    has_old_play = False

                    for play in play_response.results:
                        # Skip airbreaks (keep trackplays and nontrackplays)
                        if isinstance(play, Airbreak):
                            continue

                        # Check if we've reached plays we already have
                        if last_id is not None and play.id <= last_id:
                            has_old_play = True
                            continue

                        page_new_plays.append(play)

                    all_new_plays.extend(page_new_plays)
                    pages_fetched += 1

                    self._log_info(f"Fetched page {pages_fetched}: {len(page_new_plays)} new plays, total: {len(all_new_plays)}")

                    # Stop if we've reached plays we already have or no next page
                    if has_old_play or not play_response.next:
                        self._log_info(f"Reached end of new plays after {pages_fetched} pages")
                        return all_new_plays

                    # Continue to next page
                    url = play_response.next
                    break  # Break retry loop on success

                except (httpx.HTTPError, httpx.TimeoutException) as e:
                    if attempt < self.MAX_RETRIES - 1:
                        delay = self.BASE_DELAY * (2 ** attempt)  # 2s, 4s, 8s
                        self._log_info(f"API request failed (attempt {attempt + 1}/{self.MAX_RETRIES}), retrying in {delay}s: {e}")
                        time.sleep(delay)
                    else:
                        self._log_error(f"Failed to fetch plays after {self.MAX_RETRIES} attempts: {e}")
                        raise
                except Exception as e:
                    self._log_error(f"Unexpected error fetching plays: {e}")
                    raise

        if pages_fetched >= max_pages:
            self._log_error(f"Reached max pages limit ({max_pages}), stopping pagination")

        return all_new_plays

    def insert_plays(self, plays: list[TrackPlay | NonTrackPlay]) -> list[int]:
        """
        Insert plays into database with transaction safety.

        Uses INSERT OR IGNORE to handle duplicates gracefully.

        Args:
            plays: List of TrackPlay and NonTrackPlay objects to insert

        Returns:
            List of successfully inserted play IDs
        """
        if not plays:
            return []

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Prepare rows for insertion
            rows = []
            for play in plays:
                rows.append(self._play_to_row(play))

            # Execute transaction
            with conn:
                cursor.executemany(
                    """
                    INSERT OR IGNORE INTO fact_plays (
                        id, airdate, show, show_uri, image_uri, thumbnail_uri,
                        song, track_id, recording_id, artist, artist_ids,
                        album, release_id, release_group_id, labels, label_ids,
                        release_date, rotation_status, is_local, is_request,
                        is_live, comment, play_type, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?, ?
                    )
                    """,
                    rows
                )

                # Get list of successfully inserted IDs
                # Note: executemany doesn't return rowcount per row, so we query
                inserted_ids = []
                for play in plays:
                    cursor.execute("SELECT id FROM fact_plays WHERE id = ?", (play.id,))
                    if cursor.fetchone():
                        inserted_ids.append(play.id)

            conn.close()
            return inserted_ids

        except Exception as e:
            self._log_error(f"Failed to insert plays: {e}")
            raise

    def update_play_ids_alignment(self, new_ids: list[int]):
        """
        Append new IDs to play_ids.npy alignment file atomically.

        Uses temp file + rename pattern for atomic updates.

        Args:
            new_ids: List of new play IDs to append
        """
        if not new_ids:
            return

        try:
            # Load existing play_ids
            if os.path.exists(self.play_ids_path):
                play_ids = np.load(self.play_ids_path)
            else:
                play_ids = np.array([], dtype=np.int64)

            # Append new IDs
            new_ids_array = np.array(new_ids, dtype=np.int64)
            play_ids = np.append(play_ids, new_ids_array)

            # Atomic write: temp file + rename
            # Note: np.save() adds .npy extension automatically, so we need to account for that
            temp_path = self.play_ids_path.replace('.npy', '.tmp.npy')
            np.save(temp_path.replace('.npy', ''), play_ids)  # np.save adds .npy
            os.rename(temp_path, self.play_ids_path)

        except Exception as e:
            self._log_error(f"Failed to update play_ids alignment: {e}")
            raise

    def fetch_cover_art_url(self, mbid: str, mbid_type: str = "release") -> tuple[str, str] | None:
        """
        Fetch cover art URLs from Cover Art Archive.

        Args:
            mbid: MusicBrainz ID (release or release-group)
            mbid_type: "release" or "release-group"

        Returns:
            Tuple of (image_uri, thumbnail_uri) or None if not found
        """
        base_url = self.CAA_RELEASE_URL if mbid_type == "release" else self.CAA_RELEASE_GROUP_URL
        url = f"{base_url}/{mbid}/front-500"

        try:
            response = httpx.get(url, timeout=10.0, follow_redirects=True)
            if response.status_code == 404:
                return None
            elif response.status_code != 200:
                return None

            # Get the final URL after redirect
            image_uri = str(response.url)

            # Construct thumbnail URL
            thumbnail_uri = image_uri.replace("_thumb500.", "_thumb250.")
            if "_thumb500." not in image_uri:
                thumbnail_uri = image_uri.replace("-500.", "-250.")

            return (image_uri, thumbnail_uri)

        except Exception:
            return None

    def enrich_plays_cover_art(self, plays: list[TrackPlay | NonTrackPlay]) -> dict[str, int]:
        """
        Enrich newly inserted plays with cover art from Cover Art Archive.

        Only enriches plays that:
        - Have no image_uri from KEXP
        - Have release_id or release_group_id for CAA lookup

        Args:
            plays: List of plays to potentially enrich

        Returns:
            Statistics dict with enrichment counts
        """
        stats = {"enriched": 0, "not_found": 0, "skipped": 0}

        # Filter to plays needing enrichment
        plays_to_enrich = [
            p for p in plays
            if isinstance(p, TrackPlay)
            and not p.image_uri  # No image from KEXP
            and (p.release_id or p.release_group_id)  # Has MBID for CAA lookup
        ]

        if not plays_to_enrich:
            return stats

        self._log_info(f"Enriching {len(plays_to_enrich)} plays with cover art from CAA")

        for i, play in enumerate(plays_to_enrich):
            result = None
            source = None

            # Try release_id first (more specific)
            if play.release_id:
                result = self.fetch_cover_art_url(str(play.release_id), "release")
                if result:
                    source = "release"

            # If no result, try release_group_id
            if result is None and play.release_group_id:
                if play.release_id:
                    time.sleep(self.CAA_RATE_LIMIT_DELAY)
                result = self.fetch_cover_art_url(str(play.release_group_id), "release-group")
                if result:
                    source = "release-group"

            if result:
                image_uri, thumbnail_uri = result
                try:
                    conn = sqlite3.connect(self.db_path)
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE fact_plays SET image_uri = ?, thumbnail_uri = ?, updated_at = ? WHERE id = ?",
                        (image_uri, thumbnail_uri, datetime.now(timezone.utc).isoformat(), play.id)
                    )
                    conn.commit()
                    conn.close()
                    stats["enriched"] += 1
                    self._log_info(f"Enriched play {play.id} with cover art from {source}")
                except Exception as e:
                    self._log_error(f"Failed to update play {play.id}: {e}")
            else:
                stats["not_found"] += 1

            # Rate limit between plays
            if i < len(plays_to_enrich) - 1:
                time.sleep(self.CAA_RATE_LIMIT_DELAY)

        return stats

    def sync(self) -> dict[str, Any]:
        """
        Main sync logic.

        Returns:
            Statistics dict with sync results
        """
        start_time = time.time()

        try:
            # Query current state
            last_id = self.get_last_play_id()
            self._log_info(f"Last synced play ID: {last_id}")

            # Fetch new plays
            new_plays = self.fetch_new_plays(last_id)
            self._log_info(f"Fetched {len(new_plays)} new plays from API")

            if not new_plays:
                duration_ms = int((time.time() - start_time) * 1000)
                return {
                    "new_plays": 0,
                    "last_id": last_id,
                    "duration_ms": duration_ms
                }

            # Insert plays into database
            inserted_ids = self.insert_plays(new_plays)
            self._log_info(f"Inserted {len(inserted_ids)} new plays into database")

            # Enrich plays with cover art from CAA (for plays without KEXP images)
            enrichment_stats = self.enrich_plays_cover_art(new_plays)
            if enrichment_stats["enriched"] > 0:
                self._log_info(f"Enriched {enrichment_stats['enriched']} plays with cover art")

            # TODO: Update alignment file when embedding generation is implemented
            # Skipping play_ids.npy update to avoid mismatch with embeddings
            # self.update_play_ids_alignment(inserted_ids)
            # self._log_info(f"Updated play_ids.npy with {len(inserted_ids)} new IDs")

            # Calculate stats
            duration_ms = int((time.time() - start_time) * 1000)
            new_last_id = max(inserted_ids) if inserted_ids else last_id

            return {
                "new_plays": len(inserted_ids),
                "enriched": enrichment_stats["enriched"],
                "last_id": new_last_id,
                "duration_ms": duration_ms
            }

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            self._log_error(f"Sync failed: {e}")
            return {
                "new_plays": 0,
                "last_id": last_id,
                "duration_ms": duration_ms,
                "error": str(e)
            }

    def _play_to_row(self, play: TrackPlay | NonTrackPlay) -> tuple:
        """
        Convert TrackPlay or NonTrackPlay object to database row tuple.

        Handles:
        - UUID to string conversion
        - List to JSON serialization
        - Boolean to integer conversion
        - None/null handling

        Args:
            play: TrackPlay or NonTrackPlay object

        Returns:
            Tuple of values for database insertion
        """
        now = datetime.now(timezone.utc).isoformat()

        return (
            play.id,
            play.airdate.isoformat(),
            play.show,
            play.show_uri,
            play.image_uri,
            play.thumbnail_uri,
            play.song if isinstance(play, TrackPlay) else "",
            str(play.track_id) if isinstance(play, TrackPlay) and play.track_id else None,
            str(play.recording_id) if isinstance(play, TrackPlay) and play.recording_id else None,
            play.artist if isinstance(play, TrackPlay) else "",
            json.dumps([str(uuid) for uuid in play.artist_ids]) if isinstance(play, TrackPlay) else json.dumps([]),
            play.album if isinstance(play, TrackPlay) else "",
            str(play.release_id) if isinstance(play, TrackPlay) and play.release_id else None,
            str(play.release_group_id) if isinstance(play, TrackPlay) and play.release_group_id else None,
            json.dumps(play.labels) if isinstance(play, TrackPlay) else json.dumps([]),
            json.dumps([str(uuid) for uuid in play.label_ids]) if isinstance(play, TrackPlay) else json.dumps([]),
            play.release_date if isinstance(play, TrackPlay) else None,
            play.rotation_status if isinstance(play, TrackPlay) else None,
            1 if (isinstance(play, TrackPlay) and play.is_local) else 0,
            1 if (isinstance(play, TrackPlay) and play.is_request) else 0,
            1 if (isinstance(play, TrackPlay) and play.is_live) else 0,
            play.comment,
            play.play_type,
            now,
            now
        )

    def _log_info(self, message: str):
        """Log info message as JSON to stdout."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "message": message
        }
        print(json.dumps(log_entry), flush=True)

    def _log_error(self, message: str):
        """Log error message as JSON to stdout."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "ERROR",
            "message": message
        }
        print(json.dumps(log_entry), flush=True)


def main():
    """Main entry point for sync script."""
    parser = argparse.ArgumentParser(
        description="Sync new KEXP plays to local database and alignment files"
    )
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database (default: data/music_kb.sqlite)"
    )
    parser.add_argument(
        "--play-ids-path",
        default="data/play_ids.npy",
        help="Path to play_ids.npy file (default: data/play_ids.npy)"
    )

    args = parser.parse_args()

    # Initialize service
    service = PlaySyncService(args.db_path, args.play_ids_path)

    # Acquire lock
    if not service.acquire_lock():
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "message": "Previous sync still running, exiting"
        }
        print(json.dumps(log_entry), flush=True)
        sys.exit(0)

    try:
        # Run sync
        stats = service.sync()

        # Log results
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "event": "sync_complete" if "error" not in stats else "sync_failed",
            **stats
        }
        print(json.dumps(log_entry), flush=True)

        # Exit with appropriate code
        sys.exit(0 if "error" not in stats else 1)

    finally:
        # Always release lock
        service.release_lock()


if __name__ == "__main__":
    main()
