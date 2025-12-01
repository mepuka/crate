#!/usr/bin/env python3
"""
Cover Art Enrichment Script

Fetches missing album cover art from MusicBrainz Cover Art Archive (CAA)
for plays that have release_mbid but no image_uri.

Architecture:
- Queries plays with release_mbid but NULL/empty image_uri
- Fetches cover art URL from CAA: https://coverartarchive.org/release/{mbid}/front-500
- Follows redirect to get archive.org URL
- Updates database with discovered image URLs
- Rate-limited to respect CAA guidelines (1 request/second)

Usage:
    python scripts/enrich_cover_art.py [--db-path PATH] [--batch-size N] [--dry-run]

Options:
    --db-path       Path to SQLite database (default: data/music_kb.sqlite)
    --batch-size    Number of plays to process per run (default: 100)
    --dry-run       Preview changes without writing to database
    --verbose       Show detailed progress

Example:
    # Enrich 100 plays
    python scripts/enrich_cover_art.py --batch-size 100

    # Preview without changes
    python scripts/enrich_cover_art.py --batch-size 10 --dry-run --verbose
"""

import argparse
import json
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import httpx
    USE_HTTPX = True
except ImportError:
    import requests
    USE_HTTPX = False


class CoverArtEnrichmentService:
    """
    Service for enriching plays with cover art from MusicBrainz Cover Art Archive.
    """

    CAA_BASE_URL = "https://coverartarchive.org/release"
    RATE_LIMIT_DELAY = 1.0  # 1 second between requests (CAA guideline)
    REQUEST_TIMEOUT = 10.0
    MAX_RETRIES = 2

    def __init__(self, db_path: str, verbose: bool = False):
        self.db_path = db_path
        self.verbose = verbose
        self.stats = {
            "processed": 0,
            "enriched": 0,
            "not_found": 0,
            "errors": 0
        }

    def get_plays_needing_cover_art(self, limit: int) -> list[dict]:
        """
        Query plays that have release_mbid but no image_uri.

        Args:
            limit: Maximum number of plays to return

        Returns:
            List of play dictionaries with id and release_mbid
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Find plays with release_id (MusicBrainz release MBID) but no image
        # release_id column stores the MBID in the database
        cursor.execute("""
            SELECT id, release_id, artist, album
            FROM fact_plays
            WHERE release_id IS NOT NULL
              AND release_id != ''
              AND (image_uri IS NULL OR image_uri = '')
            ORDER BY airdate DESC
            LIMIT ?
        """, (limit,))

        plays = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return plays

    def fetch_cover_art_url(self, release_mbid: str) -> Optional[tuple[str, str]]:
        """
        Fetch cover art URLs from Cover Art Archive.

        Args:
            release_mbid: MusicBrainz release ID

        Returns:
            Tuple of (image_uri, thumbnail_uri) or None if not found
        """
        # CAA redirects to archive.org - we want the final URL
        # front-500 for image_uri, front-250 for thumbnail_uri
        url = f"{self.CAA_BASE_URL}/{release_mbid}/front-500"

        try:
            if USE_HTTPX:
                with httpx.Client(timeout=self.REQUEST_TIMEOUT, follow_redirects=True) as client:
                    response = client.get(url)
                    status_code = response.status_code
                    final_url = str(response.url)
            else:
                # Use requests library
                response = requests.get(url, timeout=self.REQUEST_TIMEOUT, allow_redirects=True)
                status_code = response.status_code
                final_url = response.url

            if status_code == 404:
                return None
            elif status_code != 200:
                if self.verbose:
                    self._log(f"CAA returned {status_code} for {release_mbid}")
                return None

            # Get the final URL after redirect
            image_uri = final_url

            # Construct thumbnail URL (replace -500 with -250)
            # archive.org URLs: *_thumb500.jpg -> *_thumb250.jpg
            thumbnail_uri = image_uri.replace("_thumb500.", "_thumb250.")
            if "_thumb500." not in image_uri:
                # Fallback: try replacing -500. with -250.
                thumbnail_uri = image_uri.replace("-500.", "-250.")

            return (image_uri, thumbnail_uri)

        except Exception as e:
            if self.verbose:
                self._log(f"Error fetching cover art for {release_mbid}: {e}")
            return None

    def update_play_cover_art(self, play_id: int, image_uri: str, thumbnail_uri: str) -> bool:
        """
        Update play with cover art URLs.

        Args:
            play_id: Play ID to update
            image_uri: Full-size image URL
            thumbnail_uri: Thumbnail image URL

        Returns:
            True if update succeeded
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute("""
                UPDATE fact_plays
                SET image_uri = ?, thumbnail_uri = ?, updated_at = ?
                WHERE id = ?
            """, (image_uri, thumbnail_uri, datetime.now(timezone.utc).isoformat(), play_id))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            self._log(f"Failed to update play {play_id}: {e}")
            return False

    def enrich(self, batch_size: int, dry_run: bool = False) -> dict:
        """
        Main enrichment logic.

        Args:
            batch_size: Number of plays to process
            dry_run: If True, don't write changes to database

        Returns:
            Statistics dictionary
        """
        start_time = time.time()

        # Get plays needing enrichment
        plays = self.get_plays_needing_cover_art(batch_size)
        self._log(f"Found {len(plays)} plays needing cover art")

        if not plays:
            return self.stats

        for i, play in enumerate(plays):
            self.stats["processed"] += 1

            if self.verbose:
                self._log(f"[{i+1}/{len(plays)}] Processing play {play['id']}: {play.get('artist', 'Unknown')} - {play.get('album', 'Unknown')}")

            # Fetch cover art
            result = self.fetch_cover_art_url(play["release_id"])

            if result is None:
                self.stats["not_found"] += 1
                if self.verbose:
                    self._log(f"  No cover art found for release {play['release_id']}")
            else:
                image_uri, thumbnail_uri = result

                if dry_run:
                    self._log(f"  [DRY RUN] Would update with: {image_uri[:80]}...")
                    self.stats["enriched"] += 1
                else:
                    if self.update_play_cover_art(play["id"], image_uri, thumbnail_uri):
                        self.stats["enriched"] += 1
                        if self.verbose:
                            self._log(f"  Updated with cover art from archive.org")
                    else:
                        self.stats["errors"] += 1

            # Rate limit (skip on last iteration)
            if i < len(plays) - 1:
                time.sleep(self.RATE_LIMIT_DELAY)

        duration_s = time.time() - start_time
        self.stats["duration_s"] = round(duration_s, 2)

        return self.stats

    def _log(self, message: str):
        """Log message as JSON to stdout."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "message": message
        }
        print(json.dumps(log_entry), flush=True)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Enrich plays with cover art from MusicBrainz Cover Art Archive"
    )
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database (default: data/music_kb.sqlite)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of plays to process per run (default: 100)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing to database"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed progress"
    )

    args = parser.parse_args()

    # Initialize service
    service = CoverArtEnrichmentService(args.db_path, verbose=args.verbose)

    # Run enrichment
    stats = service.enrich(args.batch_size, dry_run=args.dry_run)

    # Log results
    mode = "[DRY RUN] " if args.dry_run else ""
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "INFO",
        "event": f"{mode}enrichment_complete",
        **stats
    }
    print(json.dumps(log_entry), flush=True)

    # Summary
    print(f"\n{'='*50}")
    print(f"Cover Art Enrichment {'(DRY RUN) ' if args.dry_run else ''}Complete")
    print(f"{'='*50}")
    print(f"Processed:  {stats['processed']}")
    print(f"Enriched:   {stats['enriched']}")
    print(f"Not found:  {stats['not_found']}")
    print(f"Errors:     {stats['errors']}")
    print(f"Duration:   {stats.get('duration_s', 0):.1f}s")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
