#!/usr/bin/env python3
"""
Test script for unified timeline API.

Tests all navigation methods:
- Cursor pagination
- Time-based jump
- Percentage jump
- Anchor jump
"""
import sys
from pathlib import Path
from datetime import datetime
import time

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.db_service import DatabaseService
from app.config import settings


def test_cursor_pagination(db_svc: DatabaseService):
    """Test standard cursor-based pagination."""
    print("\n=== Testing Cursor Pagination ===")

    start = time.time()
    result = db_svc.get_plays_by_cursor(limit=20)
    elapsed = (time.time() - start) * 1000

    print(f"Query time: {elapsed:.2f}ms")
    print(f"Results: {len(result['results'])}")
    print(f"Has more: {result['has_more']}")
    print(f"Next cursor: {result['next_cursor'][:50] if result['next_cursor'] else None}...")

    if result['results']:
        first = result['results'][0]
        print(f"First play: {first['artist']} - {first['song']} ({first['airdate']})")

    # Test pagination with cursor
    if result['next_cursor']:
        start = time.time()
        page2 = db_svc.get_plays_by_cursor(limit=20, cursor=result['next_cursor'])
        elapsed = (time.time() - start) * 1000
        print(f"\nPage 2 query time: {elapsed:.2f}ms")
        print(f"Page 2 results: {len(page2['results'])}")

    return elapsed < 50  # Should be under 50ms


def test_time_based_query(db_svc: DatabaseService):
    """Test time-based queries."""
    print("\n=== Testing Time-Based Queries ===")

    # Test with since parameter (March 2015)
    since = datetime(2015, 3, 1)
    until = datetime(2015, 4, 1)

    start = time.time()
    result = db_svc.get_plays_by_time_range(since=since, until=until, limit=20)
    elapsed = (time.time() - start) * 1000

    print(f"Query time: {elapsed:.2f}ms")
    print(f"Results: {len(result['results'])}")
    print(f"Has more: {result['has_more']}")

    if result['results']:
        first = result['results'][0]
        last = result['results'][-1]
        print(f"Date range: {last['airdate']} to {first['airdate']}")
        print(f"First play: {first['artist']} - {first['song']}")

    return elapsed < 50


def test_percentage_jump(db_svc: DatabaseService):
    """Test percentage-based jump."""
    print("\n=== Testing Percentage Jump ===")

    # Test 50% jump
    start = time.time()
    result = db_svc.get_plays_by_percentage(percentage=0.5, limit=20)
    elapsed = (time.time() - start) * 1000

    print(f"Query time: {elapsed:.2f}ms")
    print(f"Results: {len(result['results'])}")
    print(f"Total count: {result.get('total_count')}")
    print(f"Has more: {result['has_more']}")

    if result['results']:
        first = result['results'][0]
        print(f"First play at 50%: {first['artist']} - {first['song']} ({first['airdate']})")

    # Test 0% (newest)
    result_start = db_svc.get_plays_by_percentage(percentage=0.0, limit=5)
    print(f"\n0% (newest): {result_start['results'][0]['airdate']}")

    # Test 100% (oldest)
    result_end = db_svc.get_plays_by_percentage(percentage=1.0, limit=5)
    print(f"100% (oldest): {result_end['results'][0]['airdate']}")

    return elapsed < 100  # OFFSET queries might be slightly slower


def test_anchor_jump(db_svc: DatabaseService):
    """Test anchor-based context queries."""
    print("\n=== Testing Anchor Jump ===")

    # Get a play from the middle of the timeline
    mid_result = db_svc.get_plays_by_percentage(percentage=0.5, limit=1)
    if not mid_result['results']:
        print("Could not get anchor play")
        return False

    anchor_id = mid_result['results'][0]['id']
    print(f"Using anchor ID: {anchor_id}")

    start = time.time()
    result = db_svc.get_plays_around_id(anchor_id=anchor_id, limit=50)
    elapsed = (time.time() - start) * 1000

    print(f"Query time: {elapsed:.2f}ms")
    print(f"Results: {len(result['results'])}")
    print(f"Anchor position: {result.get('anchor_position')}")

    if result['results'] and result.get('anchor_position') is not None:
        anchor_idx = result['anchor_position']
        anchor = result['results'][anchor_idx]
        print(f"Anchor play: {anchor['artist']} - {anchor['song']}")
        print(f"Context: {anchor_idx} plays before, {len(result['results']) - anchor_idx - 1} plays after")

    return elapsed < 150  # Anchor queries do multiple lookups, so allow more time


def test_validation(db_svc: DatabaseService):
    """Test validation and error handling."""
    print("\n=== Testing Validation ===")

    # Test invalid percentage
    try:
        db_svc.get_plays_by_percentage(percentage=1.5, limit=20)
        print("ERROR: Should have raised ValueError for invalid percentage")
        return False
    except ValueError as e:
        print(f"✓ Invalid percentage rejected: {e}")

    # Test invalid anchor ID
    try:
        db_svc.get_plays_around_id(anchor_id=999999999, limit=20)
        print("ERROR: Should have raised ValueError for invalid anchor ID")
        return False
    except ValueError as e:
        print(f"✓ Invalid anchor ID rejected: {e}")

    # Test invalid cursor
    try:
        db_svc.decode_cursor("invalid_cursor")
        print("ERROR: Should have raised ValueError for invalid cursor")
        return False
    except ValueError as e:
        print(f"✓ Invalid cursor rejected: {e}")

    return True


def main():
    """Run all tests."""
    print("=" * 60)
    print("KEXP Timeline API Test Suite")
    print("=" * 60)

    # Initialize database service
    db_path = settings.DATABASE_PATH
    print(f"\nDatabase: {db_path}")

    if not db_path.exists():
        print(f"ERROR: Database not found at {db_path}")
        return 1

    db_svc = DatabaseService(db_path)

    # Run tests
    tests = [
        ("Cursor Pagination", test_cursor_pagination),
        ("Time-Based Queries", test_time_based_query),
        ("Percentage Jump", test_percentage_jump),
        ("Anchor Jump", test_anchor_jump),
        ("Validation", test_validation),
    ]

    results = []
    for name, test_func in tests:
        try:
            passed = test_func(db_svc)
            results.append((name, passed))
        except Exception as e:
            print(f"\nERROR in {name}: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")

    total = len(results)
    passed = sum(1 for _, p in results if p)
    print(f"\nTotal: {passed}/{total} tests passed")

    # Clean up
    db_svc.close()

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
