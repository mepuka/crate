#!/usr/bin/env python3
"""
Image URL Validation Script

Validates image URLs in the database and clears broken ones.
Designed for manual execution or cron job scheduling.

Architecture:
- Queries plays with image_uri that need validation (unvalidated or stale)
- Sends HEAD request to check URL validity (5s timeout)
- On 404/timeout: Clears image_uri and thumbnail_uri
- On success: Updates image_validated_at timestamp
- Rate-limited to avoid overwhelming origin servers

Usage:
    python scripts/validate_image_urls.py [options]

Options:
    --db-path       Path to SQLite database (default: data/music_kb.sqlite)
    --limit         Maximum URLs to validate per run (default: 1000)
    --max-age-days  Re-validate images older than N days (default: 7)
    --batch-size    Commit after N updates (default: 100)
    --rate-limit    Requests per second (default: 1.67, ~100/min)
    --dry-run       Preview changes without writing to database
    --verbose       Show detailed progress
    --stats-only    Only show validation statistics, don't validate

Example:
    # Validate up to 1000 images
    python scripts/validate_image_urls.py --limit 1000

    # Preview without changes
    python scripts/validate_image_urls.py --limit 100 --dry-run --verbose

    # Cron job: validate 5000 images daily at 3 AM
    # 0 3 * * * /path/to/validate_image_urls.py --limit 5000

    # Check current validation status
    python scripts/validate_image_urls.py --stats-only
"""

import argparse
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


class ImageValidationService:
    """
    Service for validating image URLs and clearing broken ones.
    """

    REQUEST_TIMEOUT = 5.0  # 5 seconds for HEAD request
    USER_AGENT = "CrateBot/1.0 (https://github.com/crate-music; image-validation)"

    def __init__(
        self,
        db_path: str,
        rate_limit: float = 1.67,  # ~100 requests/minute
        verbose: bool = False
    ):
        self.db_path = db_path
        self.rate_limit = rate_limit
        self.delay = 1.0 / rate_limit if rate_limit > 0 else 0
        self.verbose = verbose
        self.stats = {
            "checked": 0,
            "valid": 0,
            "broken": 0,
            "errors": 0,
            "skipped": 0
        }

    def _log(self, message: str, force: bool = False):
        """Log message if verbose mode or forced."""
        if self.verbose or force:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{timestamp}] {message}")

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with proper settings."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def get_validation_stats(self) -> dict:
        """Get statistics about image validation status."""
        conn = self._get_connection()
        cursor = conn.cursor()
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
        conn.close()
        return {
            'total_with_images': row[0] or 0,
            'validated': row[1] or 0,
            'unvalidated': row[2] or 0,
            'stale': row[3] or 0
        }

    def get_plays_needing_validation(self, limit: int, max_age_days: int) -> list[dict]:
        """
        Get plays with image_uri that need validation.

        Args:
            limit: Maximum number of plays to return
            max_age_days: Re-validate images older than this

        Returns:
            List of play dicts with id, image_uri, thumbnail_uri
        """
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

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

        plays = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return plays

    def validate_url(self, url: str) -> tuple[bool, Optional[str]]:
        """
        Validate a URL with HEAD request.

        Args:
            url: The URL to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        headers = {"User-Agent": self.USER_AGENT}

        try:
            if USE_HTTPX:
                with httpx.Client(timeout=self.REQUEST_TIMEOUT) as client:
                    response = client.head(url, headers=headers, follow_redirects=True)
            else:
                response = requests.head(
                    url,
                    headers=headers,
                    timeout=self.REQUEST_TIMEOUT,
                    allow_redirects=True
                )

            if response.status_code == 200:
                return (True, None)
            elif response.status_code == 404:
                return (False, "404 Not Found")
            else:
                return (False, f"HTTP {response.status_code}")

        except (httpx.TimeoutException if USE_HTTPX else requests.Timeout):
            return (False, "Timeout")
        except Exception as e:
            return (False, f"Error: {str(e)[:50]}")

    def mark_validated(self, conn: sqlite3.Connection, play_id: int):
        """Mark a play's image as validated."""
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE fact_plays
            SET image_validated_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        """, (play_id,))

    def clear_broken_image(self, conn: sqlite3.Connection, play_id: int):
        """Clear broken image URLs and mark as validated."""
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE fact_plays
            SET image_uri = NULL,
                thumbnail_uri = NULL,
                image_validated_at = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        """, (play_id,))

    def run_validation(
        self,
        limit: int = 1000,
        max_age_days: int = 7,
        batch_size: int = 100,
        dry_run: bool = False
    ):
        """
        Run the validation process.

        Args:
            limit: Maximum URLs to validate
            max_age_days: Re-validate images older than this
            batch_size: Commit after N updates
            dry_run: If True, don't write to database
        """
        self._log(f"Starting image URL validation (limit={limit}, max_age={max_age_days}d)", force=True)

        # Get plays needing validation
        plays = self.get_plays_needing_validation(limit, max_age_days)
        self._log(f"Found {len(plays)} plays needing validation", force=True)

        if not plays:
            self._log("No plays to validate", force=True)
            return

        conn = self._get_connection() if not dry_run else None
        batch_count = 0

        for i, play in enumerate(plays, 1):
            play_id = play['id']
            image_uri = play['image_uri']

            self._log(f"[{i}/{len(plays)}] Validating play {play_id}: {image_uri[:60]}...")

            # Validate the URL
            is_valid, error = self.validate_url(image_uri)

            if is_valid:
                self.stats['valid'] += 1
                self._log(f"  -> Valid")
                if not dry_run:
                    self.mark_validated(conn, play_id)
            else:
                self.stats['broken'] += 1
                self._log(f"  -> Broken: {error}", force=True)
                if not dry_run:
                    self.clear_broken_image(conn, play_id)

            self.stats['checked'] += 1
            batch_count += 1

            # Commit in batches
            if not dry_run and batch_count >= batch_size:
                conn.commit()
                self._log(f"Committed batch ({batch_count} updates)")
                batch_count = 0

            # Rate limiting
            if self.delay > 0 and i < len(plays):
                time.sleep(self.delay)

        # Final commit
        if not dry_run and batch_count > 0:
            conn.commit()
            self._log(f"Committed final batch ({batch_count} updates)")

        if conn:
            conn.close()

        # Print summary
        self._print_summary(dry_run)

    def _print_summary(self, dry_run: bool):
        """Print validation summary."""
        prefix = "[DRY RUN] " if dry_run else ""
        print(f"\n{prefix}Validation Summary:")
        print(f"  Checked:  {self.stats['checked']}")
        print(f"  Valid:    {self.stats['valid']}")
        print(f"  Broken:   {self.stats['broken']}")
        print(f"  Errors:   {self.stats['errors']}")


def main():
    parser = argparse.ArgumentParser(
        description="Validate image URLs and clear broken ones",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/validate_image_urls.py --limit 1000
  python scripts/validate_image_urls.py --limit 100 --dry-run --verbose
  python scripts/validate_image_urls.py --stats-only
        """
    )
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database (default: data/music_kb.sqlite)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=1000,
        help="Maximum URLs to validate (default: 1000)"
    )
    parser.add_argument(
        "--max-age-days",
        type=int,
        default=7,
        help="Re-validate images older than N days (default: 7)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Commit after N updates (default: 100)"
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=1.67,
        help="Requests per second (default: 1.67, ~100/min)"
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
    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Only show validation statistics"
    )

    args = parser.parse_args()

    # Check database exists
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"Error: Database not found: {db_path}")
        sys.exit(1)

    # Initialize service
    service = ImageValidationService(
        db_path=str(db_path),
        rate_limit=args.rate_limit,
        verbose=args.verbose
    )

    # Stats only mode
    if args.stats_only:
        stats = service.get_validation_stats()
        print("Image Validation Status:")
        print(f"  Total with images:  {stats['total_with_images']:,}")
        print(f"  Validated:          {stats['validated']:,}")
        print(f"  Unvalidated:        {stats['unvalidated']:,}")
        print(f"  Stale (>7 days):    {stats['stale']:,}")
        return

    # Run validation
    service.run_validation(
        limit=args.limit,
        max_age_days=args.max_age_days,
        batch_size=args.batch_size,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
