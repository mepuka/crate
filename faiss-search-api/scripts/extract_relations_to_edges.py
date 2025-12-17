#!/usr/bin/env python3
"""
Extract relations from MB dumps directly into edge tables.

Streams MB JSON dumps and extracts relationship data for entities that exist
in our database, populating edge tables for graph queries.

Usage:
    python scripts/extract_relations_to_edges.py --db-path data/music_kb.sqlite --dump-dir mb_dumps/
"""

import argparse
import json
import os
import sqlite3
import subprocess
from datetime import datetime, timezone
from typing import Set, Dict, List, Any


class RelationExtractor:
    def __init__(self, db_path: str, dump_dir: str):
        self.db_path = db_path
        self.dump_dir = dump_dir
        self.stats = {
            "artist_edges": 0,
            "label_edges": 0,
            "artist_label_edges": 0,
            "recording_work_links": 0
        }

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def get_target_mbids(self, entity_type: str) -> Set[str]:
        """Get set of MBIDs that exist in our database."""
        table_map = {
            "artist": ("mb_artists", "artist_mbid"),
            "label": ("mb_labels", "label_mbid"),
            "recording": ("mb_recordings", "recording_mbid"),
        }

        table, col = table_map[entity_type]
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SELECT {col} FROM {table}")
        mbids = {row[0] for row in cursor.fetchall()}
        conn.close()
        print(f"Loaded {len(mbids):,} {entity_type} MBIDs from database")
        return mbids

    def create_edge_tables(self):
        """Ensure edge tables exist."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Artist-to-Artist edges
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS artist_edges (
                source_mbid TEXT NOT NULL,
                target_mbid TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                source_name TEXT,
                target_name TEXT,
                target_type TEXT,
                attributes TEXT,
                begin_date TEXT,
                end_date TEXT,
                PRIMARY KEY (source_mbid, target_mbid, relationship_type)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_source ON artist_edges(source_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_target ON artist_edges(target_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ae_type ON artist_edges(relationship_type)")

        # Label-to-Label edges
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS label_edges (
                source_mbid TEXT NOT NULL,
                target_mbid TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                source_name TEXT,
                target_name TEXT,
                begin_date TEXT,
                end_date TEXT,
                PRIMARY KEY (source_mbid, target_mbid, relationship_type)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_le_source ON label_edges(source_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_le_target ON label_edges(target_mbid)")

        # Artist-to-Label edges
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS artist_label_edges (
                artist_mbid TEXT NOT NULL,
                label_mbid TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                artist_name TEXT,
                label_name TEXT,
                begin_date TEXT,
                end_date TEXT,
                PRIMARY KEY (artist_mbid, label_mbid, relationship_type)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ale_artist ON artist_label_edges(artist_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ale_label ON artist_label_edges(label_mbid)")

        # Recording-Work links
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recording_work_links (
                recording_mbid TEXT NOT NULL,
                work_mbid TEXT NOT NULL,
                work_title TEXT,
                relationship_type TEXT DEFAULT 'performance',
                attributes TEXT,
                PRIMARY KEY (recording_mbid, work_mbid)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_recording ON recording_work_links(recording_mbid)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rwl_work ON recording_work_links(work_mbid)")

        conn.commit()
        conn.close()
        print("✓ Edge tables ready")

    def extract_artist_relations(self, data: dict, source_mbid: str, target_mbids: Set[str]) -> List[tuple]:
        """Extract artist relations from MB artist data."""
        edges = []
        source_name = data.get("name")

        for rel in data.get("relations", []):
            target_type = rel.get("target-type")
            rel_type = rel.get("type")

            if target_type == "artist":
                target = rel.get("artist", {})
                target_mbid = target.get("id")
                # Include edge if target is in our database OR if source is (we have source)
                edges.append((
                    source_mbid,
                    target_mbid,
                    rel_type,
                    source_name,
                    target.get("name"),
                    target.get("type"),  # Person, Group, etc.
                    json.dumps(rel.get("attributes", [])),
                    rel.get("begin"),
                    rel.get("end")
                ))
            elif target_type == "label":
                target = rel.get("label", {})
                target_mbid = target.get("id")
                edges.append((
                    "artist_label",  # marker for artist-label edge
                    source_mbid,
                    target_mbid,
                    rel_type,
                    source_name,
                    target.get("name"),
                    rel.get("begin"),
                    rel.get("end")
                ))

        return edges

    def extract_label_relations(self, data: dict, source_mbid: str) -> List[tuple]:
        """Extract label relations from MB label data."""
        edges = []
        source_name = data.get("name")

        for rel in data.get("relations", []):
            target_type = rel.get("target-type")
            rel_type = rel.get("type")

            if target_type == "label":
                target = rel.get("label", {})
                target_mbid = target.get("id")
                edges.append((
                    source_mbid,
                    target_mbid,
                    rel_type,
                    source_name,
                    target.get("name"),
                    rel.get("begin"),
                    rel.get("end")
                ))

        return edges

    def extract_recording_work_links(self, data: dict, source_mbid: str) -> List[tuple]:
        """Extract recording-to-work links."""
        links = []

        for rel in data.get("relations", []):
            if rel.get("target-type") == "work":
                work = rel.get("work", {})
                work_mbid = work.get("id")
                if work_mbid:
                    links.append((
                        source_mbid,
                        work_mbid,
                        work.get("title"),
                        rel.get("type", "performance"),
                        json.dumps(rel.get("attributes", []))
                    ))

        return links

    def process_dump(self, entity_type: str):
        """Process a single entity type dump."""
        dump_name = entity_type.replace("_", "-")
        dump_path = os.path.join(self.dump_dir, f"{dump_name}.tar.xz")

        if not os.path.exists(dump_path):
            print(f"Dump not found: {dump_path}")
            return

        target_mbids = self.get_target_mbids(entity_type)
        if not target_mbids:
            print(f"No {entity_type} entities in database")
            return

        file_size = os.path.getsize(dump_path)
        print(f"Processing {dump_path} ({file_size / 1e9:.1f}GB)...")

        # Use shell extraction for speed
        cmd = f"xz -dc '{dump_path}' | tar -xO 'mbdump/{dump_name}'"
        proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        conn = self._get_connection()
        cursor = conn.cursor()

        artist_edges_batch = []
        artist_label_batch = []
        label_edges_batch = []
        recording_work_batch = []

        processed = 0
        matched = 0

        try:
            for line in proc.stdout:
                processed += 1

                if processed % 100000 == 0:
                    print(f"  Processed: {processed:,}, Matched: {matched:,}")
                    # Commit batches
                    self._commit_batches(cursor, artist_edges_batch, artist_label_batch,
                                        label_edges_batch, recording_work_batch)
                    artist_edges_batch = []
                    artist_label_batch = []
                    label_edges_batch = []
                    recording_work_batch = []
                    conn.commit()

                try:
                    data = json.loads(line)
                    mbid = data.get("id")

                    if mbid not in target_mbids:
                        continue

                    matched += 1

                    if entity_type == "artist":
                        edges = self.extract_artist_relations(data, mbid, target_mbids)
                        for edge in edges:
                            if edge[0] == "artist_label":
                                artist_label_batch.append(edge[1:])
                            else:
                                artist_edges_batch.append(edge)

                    elif entity_type == "label":
                        edges = self.extract_label_relations(data, mbid)
                        label_edges_batch.extend(edges)

                    elif entity_type == "recording":
                        links = self.extract_recording_work_links(data, mbid)
                        recording_work_batch.extend(links)

                except json.JSONDecodeError:
                    continue

            # Final commit
            self._commit_batches(cursor, artist_edges_batch, artist_label_batch,
                               label_edges_batch, recording_work_batch)
            conn.commit()

        finally:
            proc.stdout.close()
            proc.wait()
            conn.close()

        print(f"  Completed: {processed:,} processed, {matched:,} matched")

    def _commit_batches(self, cursor, artist_edges, artist_label, label_edges, recording_work):
        """Insert batched edges."""
        if artist_edges:
            cursor.executemany("""
                INSERT OR IGNORE INTO artist_edges
                (source_mbid, target_mbid, relationship_type, source_name, target_name,
                 target_type, attributes, begin_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, artist_edges)
            self.stats["artist_edges"] += len(artist_edges)

        if artist_label:
            cursor.executemany("""
                INSERT OR IGNORE INTO artist_label_edges
                (artist_mbid, label_mbid, relationship_type, artist_name, label_name,
                 begin_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, artist_label)
            self.stats["artist_label_edges"] += len(artist_label)

        if label_edges:
            cursor.executemany("""
                INSERT OR IGNORE INTO label_edges
                (source_mbid, target_mbid, relationship_type, source_name, target_name,
                 begin_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, label_edges)
            self.stats["label_edges"] += len(label_edges)

        if recording_work:
            cursor.executemany("""
                INSERT OR IGNORE INTO recording_work_links
                (recording_mbid, work_mbid, work_title, relationship_type, attributes)
                VALUES (?, ?, ?, ?, ?)
            """, recording_work)
            self.stats["recording_work_links"] += len(recording_work)

    def run(self, entity_types=None):
        """Run full extraction."""
        if entity_types is None:
            entity_types = ["artist", "label", "recording"]

        print(f"\n{'='*60}")
        print("RELATION EXTRACTION TO EDGE TABLES")
        print(f"{'='*60}")
        print(f"Database: {self.db_path}")
        print(f"Dump directory: {self.dump_dir}")
        print(f"Entity types: {', '.join(entity_types)}")
        print()

        self.create_edge_tables()

        # Process each entity type
        for entity_type in entity_types:
            print(f"\n--- {entity_type.upper()} ---")
            self.process_dump(entity_type)

        # Print final stats
        print(f"\n{'='*60}")
        print("FINAL STATISTICS")
        print(f"{'='*60}")
        conn = self._get_connection()
        cursor = conn.cursor()

        for table in ["artist_edges", "label_edges", "artist_label_edges", "recording_work_links"]:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count:,}")

        conn.close()
        print("\nDone!")


def main():
    parser = argparse.ArgumentParser(description="Extract relations from MB dumps to edge tables")
    parser.add_argument("--db-path", default="data/music_kb.sqlite", help="Database path")
    parser.add_argument("--dump-dir", default="mb_dumps", help="Directory containing MB dumps")
    parser.add_argument("--entity-types", default="artist,label,recording",
                        help="Comma-separated entity types to process (default: all)")

    args = parser.parse_args()
    entity_types = [e.strip() for e in args.entity_types.split(",")]

    extractor = RelationExtractor(args.db_path, args.dump_dir)
    extractor.run(entity_types=entity_types)


if __name__ == "__main__":
    main()
