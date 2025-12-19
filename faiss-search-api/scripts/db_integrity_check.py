#!/usr/bin/env python3
"""
Database integrity check script for pre/post deployment validation.

Usage:
    # Run integrity check and save baseline
    python scripts/db_integrity_check.py --db-path data/music_kb.sqlite --save-baseline

    # Run integrity check and compare against baseline
    python scripts/db_integrity_check.py --db-path data/music_kb.sqlite --compare-baseline

    # Run on remote (via SSH)
    python scripts/db_integrity_check.py --remote root@cratemusic.duckdns.org

    # Quick check (no baseline operations)
    python scripts/db_integrity_check.py --db-path data/music_kb.sqlite
"""

import argparse
import json
import sqlite3
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional


# Critical tables with minimum expected row counts
# These are production minimums - a database with fewer rows is likely corrupt
# Updated based on actual production data as of 2025-12-19
CRITICAL_TABLES = {
    "fact_plays": 2_000_000,      # ~2.2M plays - CRITICAL if empty
    "insights": 0,                 # ~362 - grows over time, may be empty
    "enrichments": 0,              # Deprecated - replaced by insights
    "agent_runs": 0,               # Session tracking - may be empty
    "mb_artists": 50_000,          # ~68K expected
    "mb_recordings": 100_000,      # ~163K expected
    "mb_releases": 0,              # May not be fully populated
    "mb_release_groups": 0,        # May not be fully populated
    "play_artists": 1_500_000,     # ~1.8M expected (junction table)
}

# Required indexes for performance
REQUIRED_INDEXES = [
    "idx_plays_airdate",
    "idx_plays_artist",
    "idx_plays_recording_id",
    "idx_plays_release_group_id",
    "idx_insights_play_id",
    "idx_insights_type",
    "idx_play_artists_artist_mbid",
    "idx_play_artists_play_id",
]

# FTS5 tables that should exist
FTS_TABLES = ["plays_fts"]

BASELINE_FILE = ".db_integrity_baseline.json"


@dataclass
class TableStats:
    """Statistics for a single table."""
    name: str
    row_count: int
    min_expected: int
    status: str  # "ok", "warning", "critical"
    message: str = ""


@dataclass
class IntegrityReport:
    """Full integrity check report."""
    timestamp: str
    db_path: str
    db_size_bytes: int
    sqlite_integrity_ok: bool
    table_stats: list
    missing_indexes: list
    missing_fts_tables: list
    overall_status: str  # "healthy", "warning", "critical"
    warnings: list
    errors: list


def get_db_connection(db_path: str) -> sqlite3.Connection:
    """Create a database connection."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def check_sqlite_integrity(conn: sqlite3.Connection) -> bool:
    """Run SQLite integrity check."""
    cursor = conn.execute("PRAGMA integrity_check")
    result = cursor.fetchone()[0]
    return result == "ok"


def get_table_row_count(conn: sqlite3.Connection, table_name: str) -> int:
    """Get row count for a table."""
    try:
        cursor = conn.execute(f"SELECT COUNT(*) FROM {table_name}")
        return cursor.fetchone()[0]
    except sqlite3.OperationalError:
        return -1  # Table doesn't exist


def get_existing_indexes(conn: sqlite3.Connection) -> set:
    """Get all existing index names."""
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    )
    return {row[0] for row in cursor.fetchall()}


def get_existing_tables(conn: sqlite3.Connection) -> set:
    """Get all existing table names."""
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )
    return {row[0] for row in cursor.fetchall()}


def check_fts_tables(conn: sqlite3.Connection) -> list:
    """Check for missing FTS5 tables."""
    existing = get_existing_tables(conn)
    return [t for t in FTS_TABLES if t not in existing]


def run_integrity_check(db_path: str) -> IntegrityReport:
    """Run full integrity check on database."""
    path = Path(db_path)

    if not path.exists():
        return IntegrityReport(
            timestamp=datetime.now().isoformat(),
            db_path=str(db_path),
            db_size_bytes=0,
            sqlite_integrity_ok=False,
            table_stats=[],
            missing_indexes=[],
            missing_fts_tables=[],
            overall_status="critical",
            warnings=[],
            errors=[f"Database file not found: {db_path}"]
        )

    db_size = path.stat().st_size
    warnings = []
    errors = []

    conn = get_db_connection(db_path)

    # SQLite integrity check
    integrity_ok = check_sqlite_integrity(conn)
    if not integrity_ok:
        errors.append("SQLite integrity check failed")

    # Check table row counts
    table_stats = []
    for table_name, min_expected in CRITICAL_TABLES.items():
        count = get_table_row_count(conn, table_name)

        if count == -1:
            status = "critical"
            message = "Table does not exist"
            errors.append(f"Missing table: {table_name}")
        elif count == 0 and min_expected > 0:
            status = "critical"
            message = f"Table is EMPTY (expected >= {min_expected:,})"
            errors.append(f"Empty table: {table_name}")
        elif count < min_expected:
            status = "warning"
            message = f"Below minimum ({count:,} < {min_expected:,})"
            warnings.append(f"Low row count in {table_name}: {count:,} < {min_expected:,}")
        else:
            status = "ok"
            message = f"{count:,} rows"

        table_stats.append(TableStats(
            name=table_name,
            row_count=count,
            min_expected=min_expected,
            status=status,
            message=message
        ))

    # Check indexes
    existing_indexes = get_existing_indexes(conn)
    missing_indexes = [idx for idx in REQUIRED_INDEXES if idx not in existing_indexes]
    if missing_indexes:
        warnings.append(f"Missing indexes: {', '.join(missing_indexes)}")

    # Check FTS tables
    missing_fts = check_fts_tables(conn)
    if missing_fts:
        warnings.append(f"Missing FTS tables: {', '.join(missing_fts)}")

    conn.close()

    # Determine overall status
    if errors:
        overall_status = "critical"
    elif warnings:
        overall_status = "warning"
    else:
        overall_status = "healthy"

    return IntegrityReport(
        timestamp=datetime.now().isoformat(),
        db_path=str(db_path),
        db_size_bytes=db_size,
        sqlite_integrity_ok=integrity_ok,
        table_stats=[asdict(s) for s in table_stats],
        missing_indexes=missing_indexes,
        missing_fts_tables=missing_fts,
        overall_status=overall_status,
        warnings=warnings,
        errors=errors
    )


def save_baseline(report: IntegrityReport, baseline_path: str):
    """Save integrity report as baseline for future comparisons."""
    with open(baseline_path, 'w') as f:
        json.dump(asdict(report), f, indent=2)
    print(f"Baseline saved to {baseline_path}")


def load_baseline(baseline_path: str) -> Optional[IntegrityReport]:
    """Load baseline report."""
    path = Path(baseline_path)
    if not path.exists():
        return None

    with open(baseline_path, 'r') as f:
        data = json.load(f)

    # Convert back to dataclass (table_stats are already dicts)
    return IntegrityReport(**data)


def compare_with_baseline(current: IntegrityReport, baseline: IntegrityReport) -> list:
    """Compare current report with baseline and return issues."""
    issues = []

    # Check for size regression (more than 10% smaller)
    if current.db_size_bytes < baseline.db_size_bytes * 0.9:
        pct = (1 - current.db_size_bytes / baseline.db_size_bytes) * 100
        issues.append(f"CRITICAL: Database size decreased by {pct:.1f}% ({baseline.db_size_bytes:,} -> {current.db_size_bytes:,} bytes)")

    # Build lookup for baseline stats
    baseline_stats = {s['name']: s for s in baseline.table_stats}

    # Check for row count regressions
    for stat in current.table_stats:
        table_name = stat['name']
        if table_name not in baseline_stats:
            continue

        baseline_count = baseline_stats[table_name]['row_count']
        current_count = stat['row_count']

        # Skip tables that were empty in baseline
        if baseline_count <= 0:
            continue

        # Check for significant decrease (more than 5%)
        if current_count < baseline_count * 0.95:
            pct = (1 - current_count / baseline_count) * 100
            issues.append(f"WARNING: {table_name} row count decreased by {pct:.1f}% ({baseline_count:,} -> {current_count:,})")

        # Check for complete data loss
        if current_count == 0 and baseline_count > 0:
            issues.append(f"CRITICAL: {table_name} is now EMPTY (was {baseline_count:,} rows)")

    return issues


def print_report(report: IntegrityReport, verbose: bool = False):
    """Print integrity report to console."""
    status_colors = {
        "healthy": "\033[92m",  # Green
        "warning": "\033[93m",  # Yellow
        "critical": "\033[91m",  # Red
        "ok": "\033[92m",
    }
    reset = "\033[0m"

    print("\n" + "=" * 60)
    print("DATABASE INTEGRITY REPORT")
    print("=" * 60)
    print(f"Timestamp: {report.timestamp}")
    print(f"Database: {report.db_path}")
    print(f"Size: {report.db_size_bytes:,} bytes ({report.db_size_bytes / 1024 / 1024:.1f} MB)")
    print(f"SQLite Integrity: {'OK' if report.sqlite_integrity_ok else 'FAILED'}")

    color = status_colors.get(report.overall_status, "")
    print(f"\nOverall Status: {color}{report.overall_status.upper()}{reset}")

    print("\n--- Table Statistics ---")
    for stat in report.table_stats:
        color = status_colors.get(stat['status'], "")
        print(f"  {stat['name']}: {color}{stat['message']}{reset}")

    if report.missing_indexes:
        print(f"\n--- Missing Indexes ({len(report.missing_indexes)}) ---")
        for idx in report.missing_indexes:
            print(f"  - {idx}")

    if report.missing_fts_tables:
        print(f"\n--- Missing FTS Tables ({len(report.missing_fts_tables)}) ---")
        for fts in report.missing_fts_tables:
            print(f"  - {fts}")

    if report.warnings:
        print(f"\n--- Warnings ({len(report.warnings)}) ---")
        for warn in report.warnings:
            print(f"  \033[93m{warn}{reset}")

    if report.errors:
        print(f"\n--- Errors ({len(report.errors)}) ---")
        for err in report.errors:
            print(f"  \033[91m{err}{reset}")

    print("\n" + "=" * 60)


def run_remote_check(remote_host: str, db_path: str = "/root/faiss-search-api/data/music_kb.sqlite") -> int:
    """Run integrity check on remote host via SSH."""
    # Copy this script to remote and run it
    script_path = Path(__file__).resolve()
    remote_script = "/tmp/db_integrity_check.py"

    print(f"Running integrity check on {remote_host}...")

    # Copy script to remote
    subprocess.run(["scp", str(script_path), f"{remote_host}:{remote_script}"], check=True)

    # Run on remote
    result = subprocess.run(
        ["ssh", remote_host, f"python3 {remote_script} --db-path {db_path}"],
        capture_output=False
    )

    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Database integrity check for deployment validation")
    parser.add_argument("--db-path", default="data/music_kb.sqlite", help="Path to SQLite database")
    parser.add_argument("--save-baseline", action="store_true", help="Save current state as baseline")
    parser.add_argument("--compare-baseline", action="store_true", help="Compare against saved baseline")
    parser.add_argument("--baseline-file", default=BASELINE_FILE, help="Path to baseline file")
    parser.add_argument("--remote", help="Run on remote host (e.g., root@cratemusic.duckdns.org)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Handle remote execution
    if args.remote:
        return run_remote_check(args.remote, args.db_path)

    # Run local integrity check
    report = run_integrity_check(args.db_path)

    # JSON output mode
    if args.json:
        print(json.dumps(asdict(report), indent=2))
        return 0 if report.overall_status == "healthy" else 1

    # Print report
    print_report(report, args.verbose)

    # Save baseline if requested
    if args.save_baseline:
        save_baseline(report, args.baseline_file)

    # Compare with baseline if requested
    if args.compare_baseline:
        baseline = load_baseline(args.baseline_file)
        if baseline:
            print("\n--- Baseline Comparison ---")
            print(f"Baseline from: {baseline.timestamp}")
            issues = compare_with_baseline(report, baseline)
            if issues:
                for issue in issues:
                    if "CRITICAL" in issue:
                        print(f"\033[91m{issue}\033[0m")
                    else:
                        print(f"\033[93m{issue}\033[0m")
                print("\n\033[91mBASELINE COMPARISON FAILED\033[0m")
                return 2
            else:
                print("\033[92mNo regressions detected from baseline\033[0m")
        else:
            print(f"\033[93mNo baseline found at {args.baseline_file}\033[0m")

    # Exit with appropriate code
    if report.overall_status == "critical":
        return 1
    elif report.overall_status == "warning":
        return 0  # Warnings don't fail the check
    return 0


if __name__ == "__main__":
    sys.exit(main())
