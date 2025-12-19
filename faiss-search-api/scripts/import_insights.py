#!/usr/bin/env python3
"""
Import insights from JSON export file.
"""
import argparse
import json
import sqlite3
from datetime import datetime


def import_insights(db_path: str, export_path: str):
    """Import insights from JSON export."""
    with open(export_path, "r") as f:
        insights = json.load(f)

    print(f"Loaded {len(insights)} insights from {export_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check existing count
    cursor.execute("SELECT COUNT(*) FROM insights")
    existing = cursor.fetchone()[0]
    print(f"Existing insights in DB: {existing}")

    inserted = 0
    skipped = 0

    for insight in insights:
        try:
            # Use INSERT OR IGNORE to skip duplicates
            cursor.execute("""
                INSERT OR IGNORE INTO insights (
                    id, insight_type, play_id, confidence, source_type,
                    data, summary, created_at, updated_at,
                    source_recording_mbid, source_release_mbid,
                    referenced_artist_mbid, referenced_recording_mbid,
                    referenced_release_mbid, referenced_label_mbid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                insight["id"],
                insight["insight_type"],
                insight["play_id"],
                insight["confidence"],
                insight["source_type"],
                json.dumps(insight["data"]),
                insight.get("summary"),
                insight.get("created_at"),
                insight.get("updated_at"),
                insight.get("source_recording_mbid"),
                insight.get("source_release_mbid"),
                insight.get("referenced_artist_mbid"),
                insight.get("referenced_recording_mbid"),
                insight.get("referenced_release_mbid"),
                insight.get("referenced_label_mbid")
            ))

            if cursor.rowcount > 0:
                inserted += 1
            else:
                skipped += 1

        except Exception as e:
            print(f"Error inserting insight {insight.get('id')}: {e}")
            skipped += 1

    conn.commit()

    # Final count
    cursor.execute("SELECT COUNT(*) FROM insights")
    final = cursor.fetchone()[0]

    conn.close()

    print(f"\nResults:")
    print(f"  Inserted: {inserted}")
    print(f"  Skipped (duplicates): {skipped}")
    print(f"  Final count: {final}")


def main():
    parser = argparse.ArgumentParser(description="Import insights from JSON export")
    parser.add_argument("--db-path", default="data/music_kb.sqlite", help="Database path")
    parser.add_argument("--export-path", default="data/insights_export.json", help="Export file path")

    args = parser.parse_args()
    import_insights(args.db_path, args.export_path)


if __name__ == "__main__":
    main()
