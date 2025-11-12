# KEXP Incremental Play Sync Design

**Date:** 2025-11-12
**Status:** Approved
**Author:** Claude Code

## Overview

Design for a rock-solid incremental sync system that fetches new KEXP plays every 2 minutes and updates the production database and play_ids alignment file. New plays will be visible in timeline/lookup endpoints but NOT in semantic search (no embeddings generated).

## Requirements

### Core Requirements
- Run on production droplet (64.227.104.135) every 2 minutes
- Fetch new plays from KEXP API (https://api.kexp.org/v2/plays/)
- Update SQLite database (`music_kb.sqlite`) with new plays
- Update play_ids alignment file (`play_ids.npy`) to maintain index alignment
- Include image fields (`image_uri`, `thumbnail_uri`) in ingestion
- Skip embedding generation (new plays won't be semantically searchable)
- Handle errors with exponential backoff retry logic

### Non-Requirements
- Semantic search for new plays (FAISS index not updated)
- Real-time hot reload of API (database updated directly)
- Schema migration scripts (local database already has image fields)
- Full database rebuild (separate concern)

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│  Droplet (64.227.104.135)                                   │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Host Cron (every 2 minutes)                          │  │
│  │  */2 * * * * docker exec kexp-search-api \            │  │
│  │              python /app/scripts/sync_plays.py        │  │
│  └─────────────────────┬─────────────────────────────────┘  │
│                        │                                     │
│  ┌─────────────────────▼─────────────────────────────────┐  │
│  │  Docker Container: kexp-search-api                    │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │  scripts/sync_plays.py                           │ │  │
│  │  │  1. Acquire lock (/tmp/kexp_sync.lock)          │ │  │
│  │  │  2. Query MAX(id) from database                  │ │  │
│  │  │  3. Fetch KEXP API (with retry)                  │ │  │
│  │  │  4. Filter new plays (id > max_id)               │ │  │
│  │  │  5. INSERT OR IGNORE into database               │ │  │
│  │  │  6. Append to play_ids.npy                       │ │  │
│  │  │  7. Log results                                   │ │  │
│  │  │  8. Release lock                                  │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │                        │                                │  │
│  │  ┌─────────────────────▼─────────────────────────────┐ │  │
│  │  │  Mounted Volume: /app/data/                       │ │  │
│  │  │  - music_kb.sqlite (written by sync script)      │ │  │
│  │  │  - play_ids.npy (appended by sync script)        │ │  │
│  │  └───────────────────────────────────────────────────┘ │  │
│  │                                                         │  │
│  │  ┌───────────────────────────────────────────────────┐ │  │
│  │  │  FastAPI Service (running concurrently)           │ │  │
│  │  │  - Reads database (SQLite locking handles sync)  │ │  │
│  │  │  - Serves /api/plays/timeline endpoint            │ │  │
│  │  │  - Serves /api/plays/{id} endpoint                │ │  │
│  │  └───────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  External: KEXP API                                   │  │
│  │  https://api.kexp.org/v2/plays/?ordering=-id         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Execution Environment

**Container-based execution** via `docker exec`:
- Script runs inside existing `kexp-search-api` Docker container
- Uses container's Python environment (numpy, httpx, pydantic already installed)
- Accesses data files via mounted volume at `/app/data/`
- No duplicate dependencies needed

### State Tracking

**Database as source of truth:**
- Query `SELECT MAX(id) FROM fact_plays` on each run
- Fetch plays from KEXP API where `id > max_id`
- No external state files needed

## Data Flow

### Every 2 Minutes

1. **Lock Acquisition**
   - Check for `/tmp/kexp_sync.lock` file
   - Exit early if lock exists (previous run still executing)
   - Create lock file with PID

2. **Query Current State**
   ```sql
   SELECT MAX(id) FROM fact_plays
   ```
   - Returns `last_id` or NULL if empty database

3. **Fetch New Plays**
   ```
   GET https://api.kexp.org/v2/plays/?ordering=-id&limit=100
   ```
   - Ordering by `-id` (descending) gets newest plays first
   - Limit 100 handles bulk ingestion if sync was down
   - Parse response using `app.kexp_models.PlayResponse`

4. **Filter & Transform**
   - Filter: `play.id > last_id` AND `play.play_type == 'trackplay'`
   - Skip airbreaks (no metadata worth storing)
   - Map TrackPlay fields to database columns

5. **Database Transaction**
   ```python
   with conn:  # Atomic transaction
       cursor.executemany(
           "INSERT OR IGNORE INTO fact_plays (...) VALUES (...)",
           play_rows
       )
       inserted_count = cursor.rowcount
   ```
   - `INSERT OR IGNORE` prevents duplicates
   - Transaction rollback on any error

6. **Update Alignment File**
   ```python
   # Only after successful DB commit
   play_ids = np.load('/app/data/play_ids.npy')
   new_ids = np.array([p['id'] for p in inserted_plays], dtype=np.int64)
   play_ids = np.append(play_ids, new_ids)

   # Atomic write
   np.save('/app/data/play_ids.npy.tmp', play_ids)
   os.rename('/app/data/play_ids.npy.tmp', '/app/data/play_ids.npy')
   ```

7. **Logging**
   ```json
   {
     "timestamp": "2025-11-12T10:30:00Z",
     "level": "INFO",
     "new_plays": 5,
     "last_id": 3576864,
     "duration_ms": 1234
   }
   ```

8. **Lock Release**
   - Remove `/tmp/kexp_sync.lock`

## Data Safety

### Duplicate Prevention

**Primary key constraint:**
- `id` column is PRIMARY KEY in `fact_plays` table
- `INSERT OR IGNORE` silently skips existing IDs
- Safe even if KEXP API returns duplicates or sync runs overlap

### Transaction Safety

**SQLite ACID guarantees:**
```python
try:
    with conn:  # BEGIN TRANSACTION
        cursor.executemany("INSERT OR IGNORE ...", rows)
        # COMMIT if no errors
except Exception:
    # ROLLBACK automatically
```

**Alignment file only updated after commit:**
- If database write fails, play_ids.npy remains unchanged
- No risk of misalignment between database and alignment file

### Lock Safety

**File-based locking:**
```python
import fcntl

lock_fd = open('/tmp/kexp_sync.lock', 'w')
try:
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    # Run sync logic
except BlockingIOError:
    # Previous run still executing, exit early
finally:
    fcntl.flock(lock_fd, fcntl.LOCK_UN)
    lock_fd.close()
```

Prevents concurrent executions if a run takes longer than 2 minutes.

### Atomic File Updates

**Temp file + rename pattern:**
```python
np.save('/app/data/play_ids.npy.tmp', play_ids)
os.rename('/app/data/play_ids.npy.tmp', '/app/data/play_ids.npy')
```

POSIX rename is atomic - no risk of partial writes or corrupted files.

## Error Handling

### Exponential Backoff Retry

**Transient failures (network, rate limits):**
```python
max_retries = 3
base_delay = 2  # seconds

for attempt in range(max_retries):
    try:
        response = httpx.get(kexp_api_url, timeout=10.0)
        response.raise_for_status()
        break
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        if attempt < max_retries - 1:
            delay = base_delay * (2 ** attempt)  # 2s, 4s, 8s
            time.sleep(delay)
        else:
            log_error(f"Failed after {max_retries} attempts: {e}")
            sys.exit(1)  # Cron will try again in 2 minutes
```

**Delay progression:** 2s → 4s → 8s (max 3 attempts)

### Logging

**Structured JSON logs to `/app/logs/sync_plays.log`:**

Success:
```json
{
  "timestamp": "2025-11-12T10:30:00Z",
  "level": "INFO",
  "event": "sync_complete",
  "new_plays": 5,
  "last_id": 3576864,
  "duration_ms": 1234
}
```

Error:
```json
{
  "timestamp": "2025-11-12T10:32:00Z",
  "level": "ERROR",
  "event": "sync_failed",
  "error_type": "HTTPError",
  "error_message": "503 Service Unavailable",
  "retries": 3,
  "last_successful_id": 3576859
}
```

## Field Mapping

### KEXP API → Database

From `app.kexp_models.TrackPlay` to `fact_plays` table:

| KEXP Field | Database Column | Type | Notes |
|------------|----------------|------|-------|
| `id` | `id` | INTEGER PRIMARY KEY | Unique play ID |
| `airdate` | `airdate` | TEXT | ISO 8601 timestamp |
| `artist` | `artist` | TEXT | Artist name |
| `song` | `song` | TEXT | Track title |
| `album` | `album` | TEXT | Album/release title |
| `labels` | `labels` | TEXT | JSON array of label names |
| `rotation_status` | `rotation_status` | TEXT | Heavy/Medium/Light/Library |
| `is_local` | `is_local` | INTEGER | Boolean (0/1) |
| `is_live` | `is_live` | INTEGER | Boolean (0/1) |
| `is_request` | `is_request` | INTEGER | Boolean (0/1) |
| `comment` | `comment` | TEXT | DJ comment/note |
| `show` | `show` | INTEGER | Show ID |
| `artist_ids` | `artist_ids` | TEXT | JSON array of MusicBrainz UUIDs |
| `recording_id` | `recording_id` | TEXT | MusicBrainz recording UUID |
| `release_id` | `release_id` | TEXT | MusicBrainz release UUID |
| `release_group_id` | `release_group_id` | TEXT | MusicBrainz release group UUID |
| **`image_uri`** | **`image_uri`** | **TEXT** | **Album artwork URL** |
| **`thumbnail_uri`** | **`thumbnail_uri`** | **TEXT** | **Thumbnail artwork URL** |

**Bold fields** are newly added image columns.

### JSON Serialization

**UUID lists:**
```python
artist_ids_json = json.dumps([str(uuid) for uuid in play.artist_ids])
labels_json = json.dumps(play.labels)
```

**Optional UUIDs:**
```python
recording_id = str(play.recording_id) if play.recording_id else None
```

**Boolean conversion:**
```python
is_local_int = 1 if play.is_local else 0
```

## Implementation Details

### File Structure

```
/Users/pooks/Dev/crate/faiss-search-api/
├── scripts/
│   └── sync_plays.py              # New: Incremental sync script
├── app/
│   ├── kexp_models.py              # Existing: TrackPlay, PlayResponse models
│   └── services/
│       └── db_service.py           # Existing: Database service (for reference)
├── data/
│   ├── music_kb.sqlite             # Updated by sync script
│   └── play_ids.npy                # Updated by sync script
└── logs/
    └── sync_plays.log              # Written by sync script
```

### Key Classes

**`PlaySyncService`:**
```python
class PlaySyncService:
    def __init__(self, db_path: str, play_ids_path: str):
        self.db_path = db_path
        self.play_ids_path = play_ids_path
        self.kexp_api_base = "https://api.kexp.org/v2"

    def get_last_play_id(self) -> int | None:
        """Query MAX(id) from database."""

    def fetch_new_plays(self, last_id: int | None) -> list[TrackPlay]:
        """Fetch plays from KEXP API with retry logic."""

    def insert_plays(self, plays: list[TrackPlay]) -> int:
        """Insert plays into database with transaction."""

    def update_play_ids_alignment(self, new_ids: list[int]):
        """Append new IDs to play_ids.npy atomically."""

    def sync(self) -> dict:
        """Main sync logic. Returns stats dict."""
```

### Dependencies

**Already in container:**
- `httpx` - HTTP client
- `numpy` - Array operations
- `pydantic` - Model validation (TrackPlay)
- `sqlite3` - Database operations (stdlib)

**No new dependencies needed.**

## Deployment

### Phase 1: Database Update (Local)

1. **Add image columns to local database:**
   ```bash
   cd /Users/pooks/Dev/crate/data/
   sqlite3 music_kb.sqlite
   ```
   ```sql
   ALTER TABLE fact_plays ADD COLUMN image_uri TEXT;
   ALTER TABLE fact_plays ADD COLUMN thumbnail_uri TEXT;
   ```

2. **Verify schema:**
   ```sql
   PRAGMA table_info(fact_plays);
   ```

3. **Upload updated database to droplet:**
   ```bash
   rsync -avz music_kb.sqlite root@64.227.104.135:/root/faiss-search-api/data/
   ```

### Phase 2: Script Development (Local)

1. **Create sync script:**
   ```bash
   cd /Users/pooks/Dev/crate/faiss-search-api
   # Implement scripts/sync_plays.py
   ```

2. **Test locally:**
   ```bash
   source .venv/bin/activate
   python scripts/sync_plays.py
   ```

3. **Verify:**
   - Check logs for successful execution
   - Query database for new plays
   - Verify play_ids.npy updated

### Phase 3: Deployment (Droplet)

1. **Upload script to droplet:**
   ```bash
   rsync -avz scripts/sync_plays.py root@64.227.104.135:/root/faiss-search-api/scripts/
   ```

2. **Test manual execution:**
   ```bash
   ssh root@64.227.104.135
   docker exec kexp-search-api python /app/scripts/sync_plays.py
   ```

3. **Install cron job:**
   ```bash
   cat > /etc/cron.d/kexp-sync <<'EOF'
   */2 * * * * root docker exec kexp-search-api python /app/scripts/sync_plays.py >> /root/faiss-search-api/logs/cron.log 2>&1
   EOF
   ```

4. **Monitor first few cycles:**
   ```bash
   tail -f /root/faiss-search-api/logs/sync_plays.log
   tail -f /root/faiss-search-api/logs/cron.log
   ```

### Verification

**Check sync is running:**
```bash
# View cron logs
tail -f /root/faiss-search-api/logs/cron.log

# View sync logs
docker exec kexp-search-api tail -f /app/logs/sync_plays.log

# Check database
docker exec kexp-search-api sqlite3 /app/data/music_kb.sqlite "SELECT MAX(id), COUNT(*) FROM fact_plays"

# Test API
curl http://64.227.104.135/api/plays/timeline?limit=5
```

## Limitations & Trade-offs

### Known Limitations

1. **No semantic search for new plays**
   - New plays appear in timeline/lookups but not in `/api/search` results
   - FAISS index not updated (no embeddings generated)
   - Future work: Batch embedding generation and FAISS index updates

2. **No hot reload**
   - API continues reading database while sync writes
   - SQLite locking handles concurrency (readers don't block writers)
   - New plays visible on next database query (typically <1s)

3. **Potential for brief lock contention**
   - If API is serving many timeline queries while sync runs
   - SQLite's default locking should handle this transparently
   - Monitor for `database is locked` errors in logs

4. **Cron-based scheduling limitations**
   - No sub-minute granularity (2 minutes is minimum)
   - No built-in monitoring/alerting
   - Manual monitoring via logs required

### Trade-offs Made

| Decision | Pro | Con |
|----------|-----|-----|
| Direct database writes | Simple, no API changes | Brief lock contention possible |
| Query MAX(id) for state | No external state files | Database query on every run |
| Skip embeddings | Fast, simple implementation | New plays not searchable |
| docker exec execution | Uses existing environment | Requires container running |
| Cron scheduling | Simple, standard tool | No built-in monitoring |
| INSERT OR IGNORE | Duplicate-safe, idempotent | Doesn't detect duplicates |

## Future Enhancements

### Phase 2: Embedding Generation

1. Add embedding model to container (sentence-transformers)
2. Generate embeddings for new plays in sync script
3. Append to embeddings_256d.npy
4. Rebuild FAISS index incrementally or nightly

### Phase 3: Hot Reload

1. Add `/admin/reload` endpoint to API
2. Reload FAISS index from file without restart
3. Call from sync script after updates

### Phase 4: Monitoring

1. Add Prometheus metrics export
2. Track sync failures, duration, play counts
3. Alert on repeated failures

## Success Criteria

**MVP Success:**
- [ ] Sync script runs successfully every 2 minutes
- [ ] New plays appear in database within 2 minutes of KEXP broadcast
- [ ] Timeline endpoint returns new plays
- [ ] Play lookup endpoint returns new plays
- [ ] No database corruption or alignment issues
- [ ] Error logs show proper retry behavior

**Production Success (1 week):**
- [ ] 99%+ successful sync rate
- [ ] Average sync duration < 5 seconds
- [ ] No database lock errors in API logs
- [ ] play_ids.npy stays aligned with database

## References

- KEXP API Docs: https://api.kexp.org/v2/
- SQLite Locking: https://www.sqlite.org/lockingv3.html
- Existing Models: `app/kexp_models.py`
- Database Service: `app/services/db_service.py`
