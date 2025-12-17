#!/usr/bin/env python3
"""
Extract artist→work credits from MB work dump.

Creates artist_work_edges table linking artists to works they created:
- composer: wrote the music
- lyricist: wrote the lyrics
- writer: wrote both (general credit)
- arranger: arranged the work
- orchestrator: created orchestration

Usage:
    python scripts/extract_work_credits.py --db-path data/music_kb.sqlite --dump-path mb_dumps/work.tar.xz
"""

import argparse
import json
import os
import sqlite3
import subprocess
from datetime import datetime, timezone
from typing import Set, List, Dict, Any


# Credit types we care about
CREDIT_TYPES = {
    "composer",
    "lyricist",
    "writer",
    "arranger",
    "orchestrator",
    "librettist",
    "translator",
}


class WorkCreditsExtractor:
    def __init__(self, db_path: str, dump_path: str, batch_size: int = 5000):
        self.db_path = db_path
        self.dump_path = dump_path
        self.batch_size = batch_size
        self.stats = {
            "processed": 0,
            "works_with_credits": 0,
            "edges_created": 0,
            "artists_matched": 0,
        }

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def get_known_artists(self) -> Set[str]:
        """Get set of artist MBIDs in our database."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT artist_mbid FROM mb_artists")
        mbids = {row[0] for row in cursor.fetchall()}
        conn.close()
        print(f"Loaded {len(mbids):,} known artist MBIDs")
        return mbids

    def create_table(self):
        """Create artist_work_edges table."""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS artist_work_edges (
                artist_mbid TEXT NOT NULL,
                work_mbid TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                artist_name TEXT,
                work_title TEXT,
                attributes TEXT,
                PRIMARY KEY (artist_mbid, work_mbid, relationship_type)
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_awe_artist ON artist_work_edges(artist_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_awe_work ON artist_work_edges(work_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_awe_type ON artist_work_edges(relationship_type)")

        conn.commit()
        conn.close()
        print("Table artist_work_edges created")

    def extract_credits(self, data: Dict[str, Any], known_artists: Set[str]) -> List[tuple]:
        """Extract artist credits from work data."""
        credits = []
        work_mbid = data.get("id")
        work_title = data.get("title")

        for rel in data.get("relations", []):
            if rel.get("target-type") != "artist":
                continue

            rel_type = rel.get("type", "").lower()
            if rel_type not in CREDIT_TYPES:
                continue

            artist = rel.get("artist", {})
            artist_mbid = artist.get("id")

            if not artist_mbid:
                continue

            # Only include if artist is in our database
            if artist_mbid in known_artists:
                self.stats["artists_matched"] += 1
                credits.append((
                    artist_mbid,
                    work_mbid,
                    rel_type,
                    artist.get("name"),
                    work_title,
                    json.dumps(rel.get("attributes", []))
                ))

        return credits

    def process_dump(self):
        """Stream work dump and extract credits."""
        known_artists = self.get_known_artists()

        if not os.path.exists(self.dump_path):
            print(f"Dump not found: {self.dump_path}")
            return

        file_size = os.path.getsize(self.dump_path)
        print(f"Processing {self.dump_path} ({file_size / 1e6:.1f}MB)...")

        # Use shell extraction for xz
        cmd = f"xz -dc '{self.dump_path}' | tar -xO 'mbdump/work'"
        proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        conn = self._get_connection()
        cursor = conn.cursor()
        batch = []

        try:
            for line in proc.stdout:
                self.stats["processed"] += 1

                if self.stats["processed"] % 100000 == 0:
                    print(f"  Processed: {self.stats['processed']:,}, "
                          f"Works w/credits: {self.stats['works_with_credits']:,}, "
                          f"Edges: {self.stats['edges_created']:,}")
                    if batch:
                        self._commit_batch(cursor, batch)
                        batch = []
                        conn.commit()

                try:
                    data = json.loads(line)
                    credits = self.extract_credits(data, known_artists)

                    if credits:
                        self.stats["works_with_credits"] += 1
                        batch.extend(credits)

                        if len(batch) >= self.batch_size:
                            self._commit_batch(cursor, batch)
                            batch = []
                            conn.commit()

                except json.JSONDecodeError:
                    continue

            # Final batch
            if batch:
                self._commit_batch(cursor, batch)
                conn.commit()

        finally:
            proc.stdout.close()
            proc.wait()
            conn.close()

    def _commit_batch(self, cursor, batch: List[tuple]):
        """Insert batch of credits."""
        cursor.executemany("""
            INSERT OR IGNORE INTO artist_work_edges
            (artist_mbid, work_mbid, relationship_type, artist_name, work_title, attributes)
            VALUES (?, ?, ?, ?, ?, ?)
        """, batch)
        self.stats["edges_created"] += len(batch)

    def print_stats(self):
        """Print extraction statistics."""
        conn = self._get_connection()
        cursor = conn.cursor()

        print("\n" + "=" * 60)
        print("EXTRACTION STATISTICS")
        print("=" * 60)
        print(f"Works processed: {self.stats['processed']:,}")
        print(f"Works with credits: {self.stats['works_with_credits']:,}")
        print(f"Edges created: {self.stats['edges_created']:,}")
        print(f"Artists matched: {self.stats['artists_matched']:,}")

        # Count by type
        print("\n=== Credits by Type ===")
        cursor.execute("""
            SELECT relationship_type, COUNT(*) as cnt
            FROM artist_work_edges
            GROUP BY relationship_type
            ORDER BY cnt DESC
        """)
        for rel_type, count in cursor.fetchall():
            print(f"  {rel_type}: {count:,}")

        # Top credited artists
        print("\n=== Top Credited Artists ===")
        cursor.execute("""
            SELECT artist_name, COUNT(*) as cnt
            FROM artist_work_edges
            GROUP BY artist_mbid
            ORDER BY cnt DESC
            LIMIT 10
        """)
        for name, count in cursor.fetchall():
            print(f"  {count:5,}: {name}")

        conn.close()

    def run(self):
        """Run full extraction."""
        print("=" * 60)
        print("EXTRACT ARTIST→WORK CREDITS")
        print("=" * 60)
        print(f"Database: {self.db_path}")
        print(f"Dump: {self.dump_path}")
        print()

        self.create_table()
        self.process_dump()
        self.print_stats()

        print("\nDone!")


def main():
    parser = argparse.ArgumentParser(description="Extract artist→work credits from MB dump")
    parser.add_argument("--db-path", default="data/music_kb.sqlite", help="Database path")
    parser.add_argument("--dump-path", default="mb_dumps/work.tar.xz", help="Work dump path")
    parser.add_argument("--batch-size", type=int, default=5000, help="Batch size")

    args = parser.parse_args()

    extractor = WorkCreditsExtractor(args.db_path, args.dump_path, args.batch_size)
    extractor.run()


if __name__ == "__main__":
    main()
