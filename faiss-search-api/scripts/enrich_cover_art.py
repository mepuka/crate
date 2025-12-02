#!/usr/bin/env python3
"""
Cover Art Enrichment Script

Fetches missing album cover art from MusicBrainz Cover Art Archive (CAA)
for plays that have release_mbid or release_group_mbid but no image_uri.

Architecture:
- Queries plays with release_id OR release_group_id but NULL/empty image_uri
- For release_id: fetches from CAA /release/{mbid}/front-500
- For release_group_id: fetches from CAA /release-group/{mbid}/front-500
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

    CAA_RELEASE_URL = "https://coverartarchive.org/release"
    CAA_RELEASE_GROUP_URL = "https://coverartarchive.org/release-group"
    RATE_LIMIT_DELAY = 1.0  # 1 second between requests (CAA guideline)
    REQUEST_TIMEOUT = 10.0
    MAX_RETRIES = 2

    def __init__(self, db_path: str, verbose: bool = False):
        self.db_path = db_path
        self.verbose = verbose
        self.stats = {
            "processed": 0,
            "enriched": 0,
            "enriched_from_release": 0,
            "enriched_from_release_group": 0,
            "not_found": 0,
            "errors": 0
        }

    def get_plays_needing_cover_art(self, limit: int) -> list[dict]:
        """
        Query plays that have release_id OR release_group_id but no image_uri.

        Args:
            limit: Maximum number of plays to return

        Returns:
            List of play dictionaries with id, release_id, release_group_id
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Find plays with release_id OR release_group_id but no image
        # Prioritize plays with release_id (more specific), then release_group_id
        cursor.execute("""
            SELECT id, release_id, release_group_id, artist, album
            FROM fact_plays
            WHERE (
                (release_id IS NOT NULL AND release_id != '')
                OR (release_group_id IS NOT NULL AND release_group_id != '')
            )
            AND (image_uri IS NULL OR image_uri = '')
            ORDER BY
                CASE WHEN release_id IS NOT NULL AND release_id != '' THEN 0 ELSE 1 END,
                airdate DESC
            LIMIT ?
        """, (limit,))

        plays = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return plays

    def fetch_cover_art_url(self, mbid: str, mbid_type: str = "release") -> Optional[tuple[str, str]]:
        """
        Fetch cover art URLs from Cover Art Archive.

        Args:
            mbid: MusicBrainz ID (release or release-group)
            mbid_type: "release" or "release-group"

        Returns:
            Tuple of (image_uri, thumbnail_uri) or None if not found
        """
        # CAA redirects to archive.org - we want the final URL
        # front-500 for image_uri, front-250 for thumbnail_uri
        base_url = self.CAA_RELEASE_URL if mbid_type == "release" else self.CAA_RELEASE_GROUP_URL
        url = f"{base_url}/{mbid}/front-500"

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
                    self._log(f"CAA returned {status_code} for {mbid_type}/{mbid}")
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
                self._log(f"Error fetching cover art for {mbid_type}/{mbid}: {e}")
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

            # Try release_id first (more specific), then release_group_id
            result = None
            source = None

            release_id = play.get("release_id")
            release_group_id = play.get("release_group_id")

            if release_id:
                result = self.fetch_cover_art_url(release_id, "release")
                if result:
                    source = "release"

            # If no result from release_id, try release_group_id
            if result is None and release_group_id:
                # Rate limit between attempts
                if release_id:
                    time.sleep(self.RATE_LIMIT_DELAY)
                result = self.fetch_cover_art_url(release_group_id, "release-group")
                if result:
                    source = "release-group"

            if result is None:
                self.stats["not_found"] += 1
                if self.verbose:
                    mbids = f"release={release_id}" if release_id else ""
                    if release_group_id:
                        mbids += f"{', ' if mbids else ''}release_group={release_group_id}"
                    self._log(f"  No cover art found ({mbids})")
            else:
                image_uri, thumbnail_uri = result

                if dry_run:
                    self._log(f"  [DRY RUN] Would update from {source}: {image_uri[:80]}...")
                    self.stats["enriched"] += 1
                    if source == "release":
                        self.stats["enriched_from_release"] += 1
                    else:
                        self.stats["enriched_from_release_group"] += 1
                else:
                    if self.update_play_cover_art(play["id"], image_uri, thumbnail_uri):
                        self.stats["enriched"] += 1
                        if source == "release":
                            self.stats["enriched_from_release"] += 1
                        else:
                            self.stats["enriched_from_release_group"] += 1
                        if self.verbose:
                            self._log(f"  Updated with cover art from {source}")
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
    print(f"Processed:     {stats['processed']}")
    print(f"Enriched:      {stats['enriched']}")
    print(f"  - from release:       {stats['enriched_from_release']}")
    print(f"  - from release_group: {stats['enriched_from_release_group']}")
    print(f"Not found:     {stats['not_found']}")
    print(f"Errors:        {stats['errors']}")
    print(f"Duration:      {stats.get('duration_s', 0):.1f}s")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
