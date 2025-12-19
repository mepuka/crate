#!/usr/bin/env python3
"""
Backfill MusicBrainz metadata from JSON dumps.

Streams a MusicBrainz JSON dump (.tar.xz), filters for entities that exist
in our local database but are missing metadata (enriched_at IS NULL),
and updates them in batches.

Usage:
    python scripts/backfill_mb_metadata.py --entity-type artist --dump-path mb_dumps/artist.tar.xz
"""

import argparse
import json
import lzma
import sqlite3
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Set, Dict, Any, List


class BackfillService:
    def __init__(self, db_path: str, batch_size: int = 1000):
        self.db_path = db_path
        self.batch_size = batch_size
        self.stats = {
            "processed": 0,
            "matched": 0,
            "updated": 0,
            "errors": 0
        }

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def get_target_mbids(self, entity_type: str) -> Set[str]:
        """Get set of MBIDs that need enrichment."""
        table_map = {
            "artist": "mb_artists",
            "label": "mb_labels",
            "recording": "mb_recordings",
            "release": "mb_releases",
            "release_group": "mb_release_groups"
        }
        
        if entity_type not in table_map:
            raise ValueError(f"Unknown entity type: {entity_type}")
            
        table = table_map[entity_type]
        col = f"{entity_type}_mbid"
        
        print(f"Loading target MBIDs from {table}...")
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(f"SELECT {col} FROM {table} WHERE enriched_at IS NULL")
        mbids = {row[0] for row in cursor.fetchall()}
        
        conn.close()
        print(f"Found {len(mbids)} entities needing enrichment.")
        return mbids

    def extract_urls(self, data: dict) -> list[dict]:
        """Extract URL relationships."""
        urls = []
        for rel in data.get("relations", []):
            if rel.get("target-type") == "url":
                url_info = rel.get("url", {})
                urls.append({
                    "type": rel.get("type", "unknown"),
                    "url": url_info.get("resource", "")
                })
        return urls

    def parse_artist(self, data: dict) -> dict:
        begin_area = data.get("begin-area", {})
        return {
            "artist_name": data.get("name"),  # Include name!
            "sort_name": data.get("sort-name"),
            "country": data.get("country"),
            "artist_type": data.get("type"),
            "disambiguation": data.get("disambiguation"),
            "begin_area": begin_area.get("name") if begin_area else None,
            "begin_date": data.get("life-span", {}).get("begin"),
            "end_date": data.get("life-span", {}).get("end"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def parse_label(self, data: dict) -> dict:
        return {
            "label_name": data.get("name"),  # Include name!
            "country": data.get("country"),
            "label_type": data.get("type"),
            "disambiguation": data.get("disambiguation"),
            "label_code": data.get("label-code"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def parse_recording(self, data: dict) -> dict:
        isrcs = data.get("isrcs", [])
        return {
            "song_title": data.get("title"),  # Include title!
            "length_ms": data.get("length"),
            "disambiguation": data.get("disambiguation"),
            "isrc": isrcs[0] if isrcs else None
        }

    def parse_release(self, data: dict) -> dict:
        return {
            "album_title": data.get("title"),  # Schema uses album_title
            "country": data.get("country"),
            "status": data.get("status"),
            "disambiguation": data.get("disambiguation"),
            "barcode": data.get("barcode"),
            "asin": data.get("asin"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def parse_release_group(self, data: dict) -> dict:
        return {
            "album_title": data.get("title"),  # Schema uses album_title
            "primary_type": data.get("primary-type"),
            "secondary_types": json.dumps(data.get("secondary-types", [])),
            "disambiguation": data.get("disambiguation"),
            "first_release_date": data.get("first-release-date"),
            "urls": json.dumps(self.extract_urls(data))
        }

    def update_batch(self, entity_type: str, updates: List[tuple]):
        """Execute batch update."""
        if not updates:
            return

        conn = self._get_connection()
        cursor = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()

        queries = {
            "artist": """
                UPDATE mb_artists SET
                    artist_name = ?, sort_name = ?, country = ?, artist_type = ?,
                    disambiguation = ?, begin_area = ?, begin_date = ?, end_date = ?,
                    urls = ?, enriched_at = ?, updated_at = ?
                WHERE artist_mbid = ?
            """,
            "label": """
                UPDATE mb_labels SET
                    label_name = ?, country = ?, label_type = ?, disambiguation = ?,
                    label_code = ?, urls = ?, enriched_at = ?, updated_at = ?
                WHERE label_mbid = ?
            """,
            "recording": """
                UPDATE mb_recordings SET
                    song_title = ?, length_ms = ?, disambiguation = ?, isrc = ?,
                    enriched_at = ?, updated_at = ?
                WHERE recording_mbid = ?
            """,
            "release": """
                UPDATE mb_releases SET
                    album_title = ?, country = ?, status = ?, disambiguation = ?,
                    barcode = ?, asin = ?, urls = ?, enriched_at = ?, updated_at = ?
                WHERE release_mbid = ?
            """,
            "release_group": """
                UPDATE mb_release_groups SET
                    album_title = ?, primary_type = ?, secondary_types = ?,
                    disambiguation = ?, first_release_date = ?, urls = ?,
                    enriched_at = ?, updated_at = ?
                WHERE release_group_mbid = ?
            """
        }

        query = queries[entity_type]
        
        # Add timestamp and mbid to each update tuple
        final_updates = []
        for mbid, data in updates:
            # Extract values in correct order based on parse function
            if entity_type == "artist":
                vals = (
                    data["artist_name"], data["sort_name"], data["country"],
                    data["artist_type"], data["disambiguation"], data["begin_area"],
                    data["begin_date"], data["end_date"], data["urls"]
                )
            elif entity_type == "label":
                vals = (
                    data["label_name"], data["country"], data["label_type"],
                    data["disambiguation"], data["label_code"], data["urls"]
                )
            elif entity_type == "recording":
                vals = (
                    data["song_title"], data["length_ms"], data["disambiguation"],
                    data["isrc"]
                )
            elif entity_type == "release":
                vals = (
                    data["album_title"], data["country"], data["status"],
                    data["disambiguation"], data["barcode"], data["asin"], data["urls"]
                )
            elif entity_type == "release_group":
                vals = (
                    data["album_title"], data["primary_type"],
                    data["secondary_types"], data["disambiguation"],
                    data["first_release_date"], data["urls"]
                )

            final_updates.append(vals + (now, now, mbid))

        try:
            cursor.executemany(query, final_updates)
            conn.commit()
            self.stats["updated"] += cursor.rowcount
        except Exception as e:
            print(f"Error updating batch: {e}")
            self.stats["errors"] += 1
        finally:
            conn.close()

    def process_dump(self, entity_type: str, dump_path: str):
        """Stream dump and update matching entities."""
        target_mbids = self.get_target_mbids(entity_type)
        if not target_mbids:
            print("No entities need enrichment.")
            return

        parsers = {
            "artist": self.parse_artist,
            "label": self.parse_label,
            "recording": self.parse_recording,
            "release": self.parse_release,
            "release_group": self.parse_release_group
        }
        parse_fn = parsers[entity_type]

        print(f"Streaming {dump_path}...")

        batch = []

        # MB dumps use hyphens, not underscores
        dump_entity_name = entity_type.replace("_", "-")

        # Use fast shell-based extraction for large xz files
        # This is 10-20x faster than Python's tarfile for xz archives
        import subprocess
        import os

        file_size = os.path.getsize(dump_path)
        use_shell_extraction = file_size > 1_000_000_000  # > 1GB use shell

        if use_shell_extraction:
            print(f"Using fast shell extraction for {file_size / 1e9:.1f}GB file...")
            # Use xz | tar pipeline which is much faster than Python's tarfile
            cmd = f"xz -dc '{dump_path}' | tar -xO 'mbdump/{dump_entity_name}'"
            proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            f = proc.stdout
        else:
            # For smaller files, use Python's tarfile (simpler)
            tar = tarfile.open(dump_path, "r:xz")
            member = None
            for m in tar.getmembers():
                if m.name.endswith(f"/{dump_entity_name}") or m.name == dump_entity_name:
                    member = m
                    break

            if not member:
                print(f"Could not find data file for {entity_type} in archive")
                return

            f = tar.extractfile(member)
            if not f:
                print("Could not extract file")
                return
            proc = None

        try:
            # Stream lines
            for line in f:
                self.stats["processed"] += 1

                if self.stats["processed"] % 100000 == 0:
                    print(f"Processed: {self.stats['processed']}, Matched: {self.stats['matched']}, Updated: {self.stats['updated']}")

                try:
                    data = json.loads(line)
                    mbid = data.get("id")

                    if mbid in target_mbids:
                        self.stats["matched"] += 1
                        metadata = parse_fn(data)
                        batch.append((mbid, metadata))

                        if len(batch) >= self.batch_size:
                            self.update_batch(entity_type, batch)
                            batch = []

                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    self.stats["errors"] += 1

            # Final batch
            if batch:
                self.update_batch(entity_type, batch)

        except Exception as e:
            print(f"Error processing dump: {e}")
            raise
        finally:
            # Cleanup subprocess if used
            if use_shell_extraction and proc:
                proc.stdout.close()
                proc.wait()

        print("\n=== Backfill Complete ===")
        print(f"Processed: {self.stats['processed']}")
        print(f"Matched:   {self.stats['matched']}")
        print(f"Updated:   {self.stats['updated']}")
        print(f"Errors:    {self.stats['errors']}")


def main():
    parser = argparse.ArgumentParser(description="Backfill MB metadata")
    parser.add_argument("--db-path", default="data/music_kb.sqlite")
    parser.add_argument("--entity-type", required=True, choices=["artist", "label", "recording", "release", "release_group"])
    parser.add_argument("--dump-path", required=True, help="Path to .tar.xz dump file")
    
    args = parser.parse_args()
    
    service = BackfillService(args.db_path)
    service.process_dump(args.entity_type, args.dump_path)


if __name__ == "__main__":
    main()
