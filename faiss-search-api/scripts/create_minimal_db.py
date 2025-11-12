#!/usr/bin/env python3
"""
Create minimal production database with only fact_plays table.

This script:
1. Exports fact_plays table from full database
2. Creates optimized read-only database without triggers
3. Validates schema compatibility with PlayResult model
4. Tests queries to ensure API compatibility
5. Generates database ready for deployment

Usage:
    python scripts/create_minimal_db.py [--output data/music_kb_minimal.sqlite]
"""
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Any
import json

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models import PlayResult
from app.services.db_service import DatabaseService
from pydantic import ValidationError


class MinimalDatabaseCreator:
    """Creates minimal production database for KEXP Search API."""

    def __init__(self, source_db: Path, output_db: Path):
        self.source_db = Path(source_db)
        self.output_db = Path(output_db)

        if not self.source_db.exists():
            raise FileNotFoundError(f"Source database not found: {self.source_db}")

    def create_minimal_database(self) -> None:
        """Create minimal database with fact_plays table only."""
        print("=" * 80)
        print("Creating Minimal Production Database")
        print("=" * 80)
        print()

        # Step 1: Connect to source database
        print("📂 Step 1: Connecting to source database...")
        source_conn = sqlite3.connect(self.source_db)
        source_conn.row_factory = sqlite3.Row
        print(f"   ✓ Connected: {self.source_db}")

        # Get source stats
        cursor = source_conn.cursor()
        play_count = cursor.execute("SELECT COUNT(*) FROM fact_plays").fetchone()[0]
        print(f"   ✓ Found {play_count:,} plays")
        print()

        # Step 2: Create output database
        print("📝 Step 2: Creating minimal database...")
        if self.output_db.exists():
            print(f"   ⚠ Removing existing: {self.output_db}")
            self.output_db.unlink()

        output_conn = sqlite3.connect(self.output_db)
        output_cursor = output_conn.cursor()
        print(f"   ✓ Created: {self.output_db}")
        print()

        # Step 3: Export table schema (no triggers)
        print("🔧 Step 3: Exporting table schema (read-only optimized)...")

        # Get table creation SQL
        table_sql = cursor.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='fact_plays'"
        ).fetchone()[0]

        output_cursor.execute(table_sql)
        print("   ✓ Table schema created")

        # Export essential indexes only
        essential_indexes = ['idx_plays_airdate_id', 'idx_fact_plays_id']
        for index_name in essential_indexes:
            index_sql = cursor.execute(
                "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
                (index_name,)
            ).fetchone()

            if index_sql and index_sql[0]:
                output_cursor.execute(index_sql[0])
                print(f"   ✓ Index created: {index_name}")
        print()

        # Step 4: Copy data
        print("📦 Step 4: Copying play data (this may take a moment)...")

        # Get all rows
        rows = cursor.execute("SELECT * FROM fact_plays").fetchall()

        # Get column names
        column_names = [description[0] for description in cursor.description]
        placeholders = ','.join(['?' for _ in column_names])
        columns_str = ','.join(column_names)

        # Insert data
        insert_sql = f"INSERT INTO fact_plays ({columns_str}) VALUES ({placeholders})"
        output_cursor.executemany(insert_sql, rows)
        output_conn.commit()

        exported_count = output_cursor.execute("SELECT COUNT(*) FROM fact_plays").fetchone()[0]
        print(f"   ✓ Copied {exported_count:,} plays")

        if exported_count != play_count:
            raise ValueError(f"Row count mismatch: {play_count} → {exported_count}")
        print()

        # Step 5: Optimize database
        print("⚡ Step 5: Optimizing database...")
        output_cursor.execute("VACUUM")
        output_cursor.execute("ANALYZE")
        output_conn.commit()
        print("   ✓ Database optimized")
        print()

        # Close connections
        source_conn.close()
        output_conn.close()

        # Get file sizes
        source_size_mb = self.source_db.stat().st_size / (1024 * 1024)
        output_size_mb = self.output_db.stat().st_size / (1024 * 1024)

        print("📊 Database Size Comparison:")
        print(f"   Source: {source_size_mb:,.1f} MB")
        print(f"   Minimal: {output_size_mb:,.1f} MB")
        print(f"   Reduction: {(1 - output_size_mb/source_size_mb)*100:.1f}%")
        print()

    def validate_schema(self) -> None:
        """Validate minimal database schema against PlayResult model."""
        print("✅ Step 6: Validating schema compatibility...")

        conn = sqlite3.connect(self.output_db)
        cursor = conn.cursor()

        # Get table schema
        schema_info = cursor.execute("PRAGMA table_info(fact_plays)").fetchall()
        db_columns = {row[1] for row in schema_info}  # row[1] is column name

        # Check required fields from PlayResult model
        # Map database column names to PlayResult field names
        required_mappings = {
            'id': 'id',
            'airdate': 'airdate',
            'show': 'show',
            'song': 'song',
            'artist': 'artist',
            'album': 'album',
            'artist_ids': 'artist_mbid',  # mapped in db_service
            'recording_id': 'recording_mbid',  # mapped in db_service
            'release_id': 'release_mbid',  # mapped in db_service
            'release_group_id': 'release_group_mbid',  # mapped in db_service
            'labels': 'labels',
            'rotation_status': 'rotation_status',
            'is_local': 'is_local',
            'is_live': 'is_live',
            'is_request': 'is_request',
            'comment': 'comment',
        }

        missing_fields = []
        for db_col, model_field in required_mappings.items():
            if db_col not in db_columns:
                missing_fields.append(f"{db_col} (→ {model_field})")
            else:
                print(f"   ✓ {db_col} → PlayResult.{model_field}")

        if missing_fields:
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

        print()

        # Verify indexes
        print("📑 Verifying indexes...")
        indexes = cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fact_plays'"
        ).fetchall()

        for index in indexes:
            print(f"   ✓ {index[0]}")
        print()

        # Verify no triggers (read-only optimization)
        print("🔒 Verifying read-only optimization...")
        trigger_count = cursor.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='fact_plays'"
        ).fetchone()[0]

        if trigger_count == 0:
            print("   ✓ No triggers (read-only optimized)")
        else:
            print(f"   ⚠ Warning: {trigger_count} triggers found")
        print()

        conn.close()

    def test_api_compatibility(self) -> None:
        """Test that minimal database works with DatabaseService and PlayResult model."""
        print("🧪 Step 7: Testing API compatibility...")

        # Initialize DatabaseService with minimal database
        db_service = DatabaseService(self.output_db)

        # Test 1: Get single play by ID
        print("   Test 1: Single play lookup...")
        play_data = db_service.get_play_by_id(1)
        if not play_data:
            # Try first available ID
            conn = sqlite3.connect(self.output_db)
            first_id = conn.execute("SELECT id FROM fact_plays LIMIT 1").fetchone()[0]
            conn.close()
            play_data = db_service.get_play_by_id(first_id)

        if not play_data:
            raise ValueError("Could not fetch any play")

        # Validate with Pydantic model
        try:
            play_result = PlayResult(**play_data, similarity=0.0)
            print(f"      ✓ Play {play_result.id}: {play_result.artist} - {play_result.song}")
        except ValidationError as e:
            raise ValueError(f"PlayResult validation failed: {e}")

        # Test 2: Cursor pagination
        print("   Test 2: Cursor pagination...")
        result = db_service.get_plays_by_cursor(limit=10)
        if len(result['results']) == 0:
            raise ValueError("Cursor pagination returned no results")

        for play_data in result['results'][:3]:
            try:
                play_result = PlayResult(**play_data, similarity=0.0)
                print(f"      ✓ {play_result.artist} - {play_result.song}")
            except ValidationError as e:
                raise ValueError(f"PlayResult validation failed: {e}")

        print(f"      ✓ {len(result['results'])} plays retrieved")

        # Test 3: Batch lookup
        print("   Test 3: Batch play lookup...")
        play_ids = [play['id'] for play in result['results'][:5]]
        plays_dict = db_service.get_plays_by_ids(play_ids)

        if len(plays_dict) != len(play_ids):
            raise ValueError(f"Batch lookup mismatch: expected {len(play_ids)}, got {len(plays_dict)}")

        print(f"      ✓ {len(plays_dict)} plays retrieved")

        # Test 4: Field mappings
        print("   Test 4: Database field mappings...")
        sample_play = result['results'][0]

        # Check critical mappings
        if 'artist_mbid' in sample_play:
            if not isinstance(sample_play['artist_mbid'], list):
                raise ValueError("artist_mbid should be list (from artist_ids JSON)")
            print("      ✓ artist_ids → artist_mbid (JSON array)")

        if 'recording_mbid' in sample_play:
            print("      ✓ recording_id → recording_mbid")

        if 'release_mbid' in sample_play:
            print("      ✓ release_id → release_mbid")

        if 'release_group_mbid' in sample_play:
            print("      ✓ release_group_id → release_group_mbid")

        # Test 5: Boolean conversions
        print("   Test 5: Boolean field conversions...")
        if isinstance(sample_play['is_local'], bool):
            print("      ✓ is_local: INTEGER → bool")
        else:
            raise ValueError("is_local not converted to bool")

        db_service.close()
        print()

    def generate_report(self) -> Dict[str, Any]:
        """Generate deployment report."""
        conn = sqlite3.connect(self.output_db)
        cursor = conn.cursor()

        play_count = cursor.execute("SELECT COUNT(*) FROM fact_plays").fetchone()[0]

        # Sample data
        sample = cursor.execute(
            "SELECT id, airdate, artist, song FROM fact_plays ORDER BY airdate DESC LIMIT 1"
        ).fetchone()

        conn.close()

        return {
            'database_path': str(self.output_db),
            'total_plays': play_count,
            'size_mb': self.output_db.stat().st_size / (1024 * 1024),
            'latest_play': {
                'id': sample[0],
                'airdate': sample[1],
                'artist': sample[2],
                'song': sample[3]
            } if sample else None
        }


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Create minimal production database')
    parser.add_argument(
        '--source',
        type=Path,
        default=Path('data/music_kb.sqlite'),
        help='Source database path (default: data/music_kb.sqlite)'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('data/music_kb_minimal.sqlite'),
        help='Output database path (default: data/music_kb_minimal.sqlite)'
    )

    args = parser.parse_args()

    try:
        creator = MinimalDatabaseCreator(args.source, args.output)

        # Create minimal database
        creator.create_minimal_database()

        # Validate schema
        creator.validate_schema()

        # Test API compatibility
        creator.test_api_compatibility()

        # Generate report
        report = creator.generate_report()

        # Success!
        print("=" * 80)
        print("✅ Minimal Database Created Successfully")
        print("=" * 80)
        print()
        print(f"📁 Database: {report['database_path']}")
        print(f"📊 Size: {report['size_mb']:.1f} MB")
        print(f"🎵 Total Plays: {report['total_plays']:,}")

        if report['latest_play']:
            print()
            print("Latest Play:")
            print(f"   ID: {report['latest_play']['id']}")
            print(f"   Date: {report['latest_play']['airdate']}")
            print(f"   Artist: {report['latest_play']['artist']}")
            print(f"   Song: {report['latest_play']['song']}")

        print()
        print("✅ All validations passed")
        print("✅ Ready for deployment")
        print()
        print("Next steps:")
        print("  1. Test locally: Update .env to use DATABASE_PATH=data/music_kb_minimal.sqlite")
        print("  2. Run verify_deployment.sh to test all endpoints")
        print("  3. Deploy to droplet with scripts/deploy_to_droplet.sh")

    except Exception as e:
        print()
        print("=" * 80)
        print("❌ Error Creating Minimal Database")
        print("=" * 80)
        print()
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
