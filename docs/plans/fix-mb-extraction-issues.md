# Fix MusicBrainz Extraction Issues

Plan to address important issues identified in code review of `claude/add-mb-id-extraction-utils-01VuwJspxKjNS2VGJGTzEbtz`.

## Task 1: Fix first_seen Logic in Database Triggers

**Issue:** Triggers don't preserve earliest `first_seen` date when updating canonical tables.

**What to do:**
1. Open `packages/server/src/knowledge_base/migrations/0029_create_mb_canonical_triggers.ts`
2. In all INSERT trigger ON CONFLICT clauses (lines ~50-150):
   - Add `first_seen = MIN(mb_[entity].first_seen, excluded.first_seen)` to UPDATE SET clause
   - Apply to all 6 entity types: artists, labels, recordings, tracks, releases, release_groups
3. In all UPDATE trigger ON CONFLICT clauses (lines ~163-280):
   - Add same `first_seen = MIN(...)` logic
   - Apply to all 6 entity types
4. Verify the fix matches the pattern in `faiss-search-api/scripts/initialize_mb_canonical_tables.py:92`

**Files to modify:**
- `packages/server/src/knowledge_base/migrations/0029_create_mb_canonical_triggers.ts`

**Success criteria:**
- All INSERT trigger ON CONFLICT clauses use MIN for first_seen
- All UPDATE trigger ON CONFLICT clauses use MIN for first_seen
- Pattern matches initialization script

## Task 2: Add Test Coverage for MusicBrainz Utilities

**Issue:** No tests exist for extraction, services, or trigger behavior.

**What to do:**
1. Create `faiss-search-api/tests/test_mb_extraction.py`:
   - Test `MBIDExtractor.validate_mb_uuid()` with valid/invalid UUIDs
   - Test `MBIDExtractor.normalize_mb_uuid()` with various formats
   - Test `extract_artist_mbids()`, `extract_track_mbid()`, etc.
   - Test JSON parsing edge cases (malformed JSON, wrong types, None values)
   - Test `MBIDStats.calculate_coverage()` accuracy
2. Create `faiss-search-api/tests/test_mb_canonical_service.py`:
   - Test service methods with test database
   - Test query methods return correct results
   - Test connection handling
3. Add integration test for triggers (optional but recommended):
   - Insert a play and verify canonical tables update
   - Update a play and verify counts/dates update correctly
   - Delete a play and verify decrement

**Files to create:**
- `faiss-search-api/tests/test_mb_extraction.py`
- `faiss-search-api/tests/test_mb_canonical_service.py`

**Success criteria:**
- All extraction methods have unit tests
- UUID validation covers valid and invalid cases
- JSON parsing edge cases are tested
- Tests pass with 100% coverage of critical paths

## Task 3: Document Breaking Changes

**Issue:** `kexp_models.py` has undocumented breaking changes.

**What to do:**
1. Create `faiss-search-api/CHANGELOG.md` or update existing changelog
2. Document breaking changes:
   - `TrackPlay.release_date` was changed from `str` to `str | None` in commit 45bb4ad on adjunct_new branch
   - Current fix-mb-extraction-issues branch has original `str` (branched before 45bb4ad)
   - Migration guide: Document both scenarios depending on which approach is adopted
3. Add comment in `faiss-search-api/app/kexp_models.py:477` explaining the change
4. Consider if this change is necessary or if `None` should be restored

**Files to modify:**
- `faiss-search-api/CHANGELOG.md` (create or update)
- `faiss-search-api/app/kexp_models.py` (add comment)

**Success criteria:**
- Breaking changes are documented
- Migration path is clear for API consumers
- Rationale for change is explained

## Task 4: Review and Document CORS Configuration Change

**Issue:** `allow_credentials` changed to `True` without documentation.

**What to do:**
1. Review `faiss-search-api/app/main.py:83` CORS configuration
2. Verify the change doesn't conflict with wildcard origin configuration
3. Add comment explaining why `allow_credentials=True` is needed
4. Document any security implications
5. If change is incorrect, restore `allow_credentials=False`

**Files to modify:**
- `faiss-search-api/app/main.py` (add comment or revert)

**Success criteria:**
- CORS configuration is correct and safe
- Change is documented with rationale
- Security implications are understood

## Task 5: Add Performance Benchmarks for Triggers

**Issue:** No validation of trigger performance impact on bulk writes.

**What to do:**
1. Create `faiss-search-api/tests/test_trigger_performance.py`:
   - Benchmark bulk insert of 10k plays with triggers enabled
   - Measure time and memory usage
   - Compare with reasonable baseline (e.g., <5 seconds for 10k inserts)
2. Or create `faiss-search-api/scripts/benchmark_triggers.py`:
   - Standalone script to measure trigger overhead
   - Reports inserts/second and average time per insert
3. Document expected performance characteristics in README or migrations

**Files to create:**
- `faiss-search-api/tests/test_trigger_performance.py` OR
- `faiss-search-api/scripts/benchmark_triggers.py`

**Success criteria:**
- Performance benchmark exists and runs
- Baseline performance is documented
- Any performance issues are identified

## Notes

- Tasks 1-2 are highest priority (data correctness and quality)
- Tasks 3-4 are important for production readiness
- Task 5 is good to have but can be done last
- Use TDD approach where applicable
- Commit after each task
