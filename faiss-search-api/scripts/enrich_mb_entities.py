#!/usr/bin/env python3
"""
MusicBrainz Entity Enrichment Script

Fetches rich metadata from MusicBrainz API for entities in mb_* tables
that have MBIDs but haven't been enriched yet.

Entities enriched:
- Artists: country, type, disambiguation, begin_area, URLs (official, wikipedia, etc.)
- Labels: country, type, disambiguation, label_code, URLs
- Recordings: length, disambiguation, ISRC
- Releases: country, status, disambiguation, barcode
- Release Groups: primary_type, secondary_types, first_release_date, URLs

Architecture:
- Queries mb_* tables for entities where enriched_at IS NULL
- Fetches from MusicBrainz API: /ws/2/{entity}/{mbid}?fmt=json&inc=url-rels
- Extracts and stores relevant metadata
- Rate-limited to 1 request/second (MB API guideline)

Usage:
    python scripts/enrich_mb_entities.py [--db-path PATH] [--batch-size N] [--entity-type TYPE]

Options:
    --db-path       Path to SQLite database (default: data/music_kb.sqlite)
    --batch-size    Number of entities to process per run (default: 100)
    --entity-type   Which entity type to enrich: artist, label, recording, release, release_group, all
    --dry-run       Preview changes without writing to database
    --verbose       Show detailed progress

Example:
    # Enrich 100 artists
    python scripts/enrich_mb_entities.py --entity-type artist --batch-size 100

    # Enrich all entity types
    python scripts/enrich_mb_entities.py --entity-type all --batch-size 50 --verbose
"""

import argparse
import json
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any

try:
    import httpx
    USE_HTTPX = True
except ImportError:
    import requests
    USE_HTTPX = False


class MusicBrainzEnrichmentService:
    """
    Service for enriching MB entities with metadata from MusicBrainz API.
    """

    MB_API_BASE = "https://musicbrainz.org/ws/2"
    USER_AGENT = "Crate/1.0 (https://crate.fm; dev@crate.fm)"
    RATE_LIMIT_DELAY = 1.1  # Slightly over 1 second to be safe
    REQUEST_TIMEOUT = 15.0
    MAX_RETRIES = 3
    RETRY_DELAY = 5.0  # Delay after 503

    def __init__(self, db_path: str, verbose: bool = False):
        self.db_path = db_path
        self.verbose = verbose
        self.stats = {
            "processed": 0,
            "enriched": 0,
            "not_found": 0,
            "errors": 0,
            "rate_limited": 0
        }

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with proper settings."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def log(self, message: str) -> None:
        """Print message if verbose mode enabled."""
        if self.verbose:
            print(f"[{datetime.now().isoformat()}] {message}")

    def fetch_from_mb(self, entity_type: str, mbid: str, inc: str = "url-rels") -> Optional[dict]:
        """
        Fetch entity data from MusicBrainz API.

        Args:
            entity_type: artist, label, recording, release, release-group
            mbid: MusicBrainz ID
            inc: Include parameters (default: url-rels)

        Returns:
            JSON response dict or None on error
        """
        url = f"{self.MB_API_BASE}/{entity_type}/{mbid}"
        params = {"fmt": "json", "inc": inc}
        headers = {"User-Agent": self.USER_AGENT}

        for attempt in range(self.MAX_RETRIES):
            try:
                if USE_HTTPX:
                    with httpx.Client(timeout=self.REQUEST_TIMEOUT, follow_redirects=True) as client:
                        response = client.get(url, params=params, headers=headers)
                else:
                    response = requests.get(
                        url, params=params, headers=headers,
                        timeout=self.REQUEST_TIMEOUT,
                        allow_redirects=True
                    )

                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    self.log(f"  Not found: {entity_type}/{mbid}")
                    return None
                elif response.status_code == 503:
                    self.stats["rate_limited"] += 1
                    self.log(f"  Rate limited (503), waiting {self.RETRY_DELAY}s...")
                    time.sleep(self.RETRY_DELAY)
                    continue
                else:
                    self.log(f"  HTTP {response.status_code} for {entity_type}/{mbid}")
                    return None

            except Exception as e:
                self.log(f"  Error fetching {entity_type}/{mbid}: {e}")
                if attempt < self.MAX_RETRIES - 1:
                    time.sleep(self.RETRY_DELAY)
                    continue
                return None

        return None

    def extract_urls(self, data: dict) -> list[dict]:
        """Extract URL relationships from MB response."""
        urls = []
        for rel in data.get("relations", []):
            if rel.get("target-type") == "url":
                url_info = rel.get("url", {})
                urls.append({
                    "type": rel.get("type", "unknown"),
                    "url": url_info.get("resource", "")
                })
        return urls

    # =========================================================
    # ARTIST ENRICHMENT
    # =========================================================

    def get_artists_needing_enrichment(self, limit: int) -> list[dict]:
        """Query artists that haven't been enriched yet."""
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT artist_mbid, artist_name
            FROM mb_artists
            WHERE enriched_at IS NULL
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

    def enrich_artist(self, mbid: str) -> Optional[dict]:
        """Fetch and extract artist metadata from MB."""
        data = self.fetch_from_mb("artist", mbid)
        if not data:
            return None

        begin_area = data.get("begin-area", {})

        return {
            "sort_name": data.get("sort-name"),
            "country": data.get("country"),
            "artist_type": data.get("type"),
            "disambiguation": data.get("disambiguation"),
            "begin_area": begin_area.get("name") if begin_area else None,
            "begin_date": data.get("life-span", {}).get("begin"),
            "end_date": data.get("life-span", {}).get("end"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def update_artist(self, mbid: str, metadata: dict, dry_run: bool = False) -> bool:
        """Update artist record with enriched metadata."""
        if dry_run:
            self.log(f"  [DRY RUN] Would update artist {mbid}")
            return True

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE mb_artists SET
                sort_name = ?,
                country = ?,
                artist_type = ?,
                disambiguation = ?,
                begin_area = ?,
                begin_date = ?,
                end_date = ?,
                urls = ?,
                enriched_at = ?,
                updated_at = ?
            WHERE artist_mbid = ?
        """, (
            metadata["sort_name"],
            metadata["country"],
            metadata["artist_type"],
            metadata["disambiguation"],
            metadata["begin_area"],
            metadata["begin_date"],
            metadata["end_date"],
            metadata["urls"],
            datetime.now(timezone.utc).isoformat(),
            datetime.now(timezone.utc).isoformat(),
            mbid
        ))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # =========================================================
    # LABEL ENRICHMENT
    # =========================================================

    def get_labels_needing_enrichment(self, limit: int) -> list[dict]:
        """Query labels that haven't been enriched yet."""
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT label_mbid, label_name
            FROM mb_labels
            WHERE enriched_at IS NULL
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

    def enrich_label(self, mbid: str) -> Optional[dict]:
        """Fetch and extract label metadata from MB."""
        data = self.fetch_from_mb("label", mbid)
        if not data:
            return None

        return {
            "country": data.get("country"),
            "label_type": data.get("type"),
            "disambiguation": data.get("disambiguation"),
            "label_code": data.get("label-code"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def update_label(self, mbid: str, metadata: dict, dry_run: bool = False) -> bool:
        """Update label record with enriched metadata."""
        if dry_run:
            self.log(f"  [DRY RUN] Would update label {mbid}")
            return True

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE mb_labels SET
                country = ?,
                label_type = ?,
                disambiguation = ?,
                label_code = ?,
                urls = ?,
                enriched_at = ?,
                updated_at = ?
            WHERE label_mbid = ?
        """, (
            metadata["country"],
            metadata["label_type"],
            metadata["disambiguation"],
            metadata["label_code"],
            metadata["urls"],
            datetime.now(timezone.utc).isoformat(),
            datetime.now(timezone.utc).isoformat(),
            mbid
        ))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # =========================================================
    # RECORDING ENRICHMENT
    # =========================================================

    def get_recordings_needing_enrichment(self, limit: int) -> list[dict]:
        """Query recordings that haven't been enriched yet."""
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT recording_mbid, song_title
            FROM mb_recordings
            WHERE enriched_at IS NULL
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

    def enrich_recording(self, mbid: str) -> Optional[dict]:
        """Fetch and extract recording metadata from MB."""
        data = self.fetch_from_mb("recording", mbid, inc="isrcs")
        if not data:
            return None

        isrcs = data.get("isrcs", [])

        return {
            "length_ms": data.get("length"),
            "disambiguation": data.get("disambiguation"),
            "isrc": isrcs[0] if isrcs else None
        }

    def update_recording(self, mbid: str, metadata: dict, dry_run: bool = False) -> bool:
        """Update recording record with enriched metadata."""
        if dry_run:
            self.log(f"  [DRY RUN] Would update recording {mbid}")
            return True

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE mb_recordings SET
                length_ms = ?,
                disambiguation = ?,
                isrc = ?,
                enriched_at = ?,
                updated_at = ?
            WHERE recording_mbid = ?
        """, (
            metadata["length_ms"],
            metadata["disambiguation"],
            metadata["isrc"],
            datetime.now(timezone.utc).isoformat(),
            datetime.now(timezone.utc).isoformat(),
            mbid
        ))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # =========================================================
    # RELEASE ENRICHMENT
    # =========================================================

    def get_releases_needing_enrichment(self, limit: int) -> list[dict]:
        """Query releases that haven't been enriched yet."""
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT release_mbid, album_title
            FROM mb_releases
            WHERE enriched_at IS NULL
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

    def enrich_release(self, mbid: str) -> Optional[dict]:
        """Fetch and extract release metadata from MB."""
        data = self.fetch_from_mb("release", mbid, inc="url-rels")
        if not data:
            return None

        return {
            "country": data.get("country"),
            "status": data.get("status"),
            "disambiguation": data.get("disambiguation"),
            "barcode": data.get("barcode"),
            "asin": data.get("asin"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def update_release(self, mbid: str, metadata: dict, dry_run: bool = False) -> bool:
        """Update release record with enriched metadata."""
        if dry_run:
            self.log(f"  [DRY RUN] Would update release {mbid}")
            return True

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE mb_releases SET
                country = ?,
                status = ?,
                disambiguation = ?,
                barcode = ?,
                asin = ?,
                urls = ?,
                enriched_at = ?,
                updated_at = ?
            WHERE release_mbid = ?
        """, (
            metadata["country"],
            metadata["status"],
            metadata["disambiguation"],
            metadata["barcode"],
            metadata["asin"],
            metadata["urls"],
            datetime.now(timezone.utc).isoformat(),
            datetime.now(timezone.utc).isoformat(),
            mbid
        ))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # =========================================================
    # RELEASE GROUP ENRICHMENT
    # =========================================================

    def get_release_groups_needing_enrichment(self, limit: int) -> list[dict]:
        """Query release groups that haven't been enriched yet."""
        conn = self._get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT release_group_mbid, album_title
            FROM mb_release_groups
            WHERE enriched_at IS NULL
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,))

        results = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return results

    def enrich_release_group(self, mbid: str) -> Optional[dict]:
        """Fetch and extract release group metadata from MB."""
        data = self.fetch_from_mb("release-group", mbid, inc="url-rels")
        if not data:
            return None

        return {
            "primary_type": data.get("primary-type"),
            "secondary_types": json.dumps(data.get("secondary-types", [])),
            "disambiguation": data.get("disambiguation"),
            "first_release_date": data.get("first-release-date"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def update_release_group(self, mbid: str, metadata: dict, dry_run: bool = False) -> bool:
        """Update release group record with enriched metadata."""
        if dry_run:
            self.log(f"  [DRY RUN] Would update release_group {mbid}")
            return True

        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE mb_release_groups SET
                primary_type = ?,
                secondary_types = ?,
                disambiguation = ?,
                first_release_date = ?,
                urls = ?,
                enriched_at = ?,
                updated_at = ?
            WHERE release_group_mbid = ?
        """, (
            metadata["primary_type"],
            metadata["secondary_types"],
            metadata["disambiguation"],
            metadata["first_release_date"],
            metadata["urls"],
            datetime.now(timezone.utc).isoformat(),
            datetime.now(timezone.utc).isoformat(),
            mbid
        ))

        conn.commit()
        conn.close()
        return cursor.rowcount > 0

    # =========================================================
    # MAIN ENRICHMENT LOOP
    # =========================================================

    def enrich_entity_type(
        self,
        entity_type: str,
        batch_size: int,
        dry_run: bool = False
    ) -> dict:
        """
        Enrich a single entity type.

        Args:
            entity_type: artist, label, recording, release, release_group
            batch_size: Number of entities to process
            dry_run: If True, don't write to database

        Returns:
            Stats dictionary
        """
        # Map entity type to methods
        config = {
            "artist": (
                self.get_artists_needing_enrichment,
                self.enrich_artist,
                self.update_artist,
                "artist_mbid",
                "artist_name"
            ),
            "label": (
                self.get_labels_needing_enrichment,
                self.enrich_label,
                self.update_label,
                "label_mbid",
                "label_name"
            ),
            "recording": (
                self.get_recordings_needing_enrichment,
                self.enrich_recording,
                self.update_recording,
                "recording_mbid",
                "song_title"
            ),
            "release": (
                self.get_releases_needing_enrichment,
                self.enrich_release,
                self.update_release,
                "release_mbid",
                "album_title"
            ),
            "release_group": (
                self.get_release_groups_needing_enrichment,
                self.enrich_release_group,
                self.update_release_group,
                "release_group_mbid",
                "album_title"
            )
        }

        if entity_type not in config:
            print(f"Unknown entity type: {entity_type}")
            return self.stats

        get_entities, enrich_fn, update_fn, mbid_col, name_col = config[entity_type]

        print(f"\n=== Enriching {entity_type}s ===")
        entities = get_entities(batch_size)
        print(f"Found {len(entities)} {entity_type}s needing enrichment")

        for entity in entities:
            mbid = entity[mbid_col]
            name = entity.get(name_col, "Unknown")

            self.log(f"Processing {entity_type}: {name} ({mbid})")
            self.stats["processed"] += 1

            metadata = enrich_fn(mbid)

            if metadata:
                if update_fn(mbid, metadata, dry_run):
                    self.stats["enriched"] += 1
                    self.log(f"  Enriched: {metadata.get('country', 'N/A')} / {metadata.get('artist_type') or metadata.get('label_type') or metadata.get('primary_type', 'N/A')}")
            else:
                self.stats["not_found"] += 1

            # Rate limiting
            time.sleep(self.RATE_LIMIT_DELAY)

        return self.stats

    def enrich_all(self, batch_size: int, dry_run: bool = False) -> dict:
        """Enrich all entity types."""
        for entity_type in ["artist", "label", "recording", "release", "release_group"]:
            self.enrich_entity_type(entity_type, batch_size, dry_run)
        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Enrich MusicBrainz entities with API metadata"
    )
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of entities to process per type"
    )
    parser.add_argument(
        "--entity-type",
        choices=["artist", "label", "recording", "release", "release_group", "all"],
        default="all",
        help="Which entity type to enrich"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed progress"
    )

    args = parser.parse_args()

    # Check database exists
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        sys.exit(1)

    service = MusicBrainzEnrichmentService(
        db_path=str(db_path),
        verbose=args.verbose
    )

    if args.dry_run:
        print("=== DRY RUN MODE ===")

    try:
        if args.entity_type == "all":
            stats = service.enrich_all(args.batch_size, args.dry_run)
        else:
            stats = service.enrich_entity_type(
                args.entity_type,
                args.batch_size,
                args.dry_run
            )

        print(f"\n=== Summary ===")
        print(f"Processed: {stats['processed']}")
        print(f"Enriched:  {stats['enriched']}")
        print(f"Not found: {stats['not_found']}")
        print(f"Errors:    {stats['errors']}")
        print(f"Rate limited: {stats['rate_limited']}")

    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(1)


if __name__ == "__main__":
    main()
