#!/usr/bin/env python3
"""
Run SQL migrations on the database.

Usage:
    python scripts/run_migration.py [--db-path PATH] [--migration FILE]

Example:
    python scripts/run_migration.py --migration migrations/002_add_mb_entity_metadata.sql
"""

import argparse
import sqlite3
import sys
from pathlib import Path


def run_migration(db_path: str, migration_file: str, dry_run: bool = False) -> bool:
    """
    Execute a SQL migration file against the database.

    Args:
        db_path: Path to SQLite database
        migration_file: Path to SQL migration file
        dry_run: If True, just validate SQL without executing

    Returns:
        True if successful
    """
    # Read migration SQL
    migration_path = Path(migration_file)
    if not migration_path.exists():
        print(f"Migration file not found: {migration_file}")
        return False

    sql = migration_path.read_text()

    # Split into statements (handle ALTER TABLE which can't be batched in SQLite)
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

    print(f"Migration: {migration_file}")
    print(f"Database: {db_path}")
    print(f"Statements: {len(statements)}")

    if dry_run:
        print("\n=== DRY RUN - Statements to execute ===")
        for i, stmt in enumerate(statements, 1):
            print(f"\n-- Statement {i}:")
            print(stmt[:200] + "..." if len(stmt) > 200 else stmt)
        return True

    # Connect and execute
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    success_count = 0
    error_count = 0

    for i, stmt in enumerate(statements, 1):
        try:
            cursor.execute(stmt)
            success_count += 1
            # Show progress for ALTER TABLE statements
            if stmt.upper().startswith('ALTER'):
                print(f"  [{i}/{len(statements)}] {stmt[:60]}...")
        except sqlite3.OperationalError as e:
            error_str = str(e)
            # Ignore "duplicate column" errors (migration already run)
            if "duplicate column name" in error_str:
                print(f"  [{i}/{len(statements)}] Skipped (column exists): {stmt[:40]}...")
            elif "already exists" in error_str:
                print(f"  [{i}/{len(statements)}] Skipped (table exists): {stmt[:40]}...")
            else:
                print(f"  [{i}/{len(statements)}] ERROR: {e}")
                print(f"    Statement: {stmt[:100]}")
                error_count += 1

    conn.commit()
    conn.close()

    print(f"\n=== Migration Complete ===")
    print(f"Successful: {success_count}")
    print(f"Errors: {error_count}")

    return error_count == 0


def main():
    parser = argparse.ArgumentParser(description="Run SQL migrations")
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database"
    )
    parser.add_argument(
        "--migration",
        required=True,
        help="Path to SQL migration file"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview statements without executing"
    )

    args = parser.parse_args()

    # Check database exists
    db_path = Path(args.db_path)
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        sys.exit(1)

    success = run_migration(
        str(db_path),
        args.migration,
        args.dry_run
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
