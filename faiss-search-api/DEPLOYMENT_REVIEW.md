# Data Type Review & Deployment Streamlining

## Database Schema vs Pydantic Models Analysis

### Current Database Schema
```sql
plays (
    id INTEGER PRIMARY KEY,
    airdate TEXT,
    show INTEGER,
    song TEXT,
    artist TEXT,
    album TEXT,          -- Can be NULL (49k missing)
    labels TEXT,         -- JSON array as string
    rotation_status TEXT,-- Can be NULL
    is_local INTEGER,    -- SQLite boolean (0/1)
    is_request INTEGER,  -- SQLite boolean (0/1)
    is_live INTEGER,     -- SQLite boolean (0/1)
    comment TEXT,        -- Can be NULL
    artist_mbid TEXT,    -- JSON array! e.g. ["uuid"]
    recording_mbid TEXT, -- Plain UUID string
    release_mbid TEXT,   -- Plain UUID string
    release_group_mbid TEXT -- Plain UUID string
)
```

### Data Statistics
- Total plays: 2,193,235
- Artist: 100% present
- Song: 100% present
- Album: 97.8% present (49k NULL)
- Artist MBID: 99.7% present (stored as JSON arrays)
- Show: 100% present

### Type Mapping Issues Found

#### ✅ Correct
- `id: int` → INTEGER ✓
- `artist: str` → TEXT ✓
- `song: str` → TEXT ✓
- `similarity: float` → Computed ✓
- `is_local: bool` → INTEGER (converted) ✓
- `is_live: bool` → INTEGER (converted) ✓
- `is_request: bool` → INTEGER (converted) ✓
- `labels: List[str]` → TEXT (JSON parsed) ✓

#### ⚠️ Needs Review
- `artist_mbid: Optional[str]` → Should be `Optional[List[str]]` (stored as JSON array)
- `show: Optional[int]` → Should be `int` (always present, never NULL)

### Recommendations

1. **Update PlayResult model:**
   ```python
   show: int  # Change from Optional[int] - always present
   artist_mbid: Optional[List[str]] = None  # It's a JSON array
   ```

2. **Update db_service.py _row_to_dict:**
   ```python
   # Parse artist_mbid as JSON array
   if 'artist_mbid' in data and data['artist_mbid']:
       try:
           data['artist_mbid'] = json.loads(data['artist_mbid'])
       except json.JSONDecodeError:
           data['artist_mbid'] = []
   else:
       data['artist_mbid'] = []
   ```

## Digital Ocean Deployment Streamlining

### Option 1: doctl + rsync (Fastest)

Use Digital Ocean CLI for streamlined deployment:

```bash
# Install doctl (already have it)
# Already authenticated

# Create deployment script
./scripts/deploy_to_droplet.sh
```

### Option 2: Docker Context (Cleanest)

Use Docker's native context switching:

```bash
# Create remote Docker context
docker context create kexp-droplet \
  --docker "host=ssh://root@64.227.104.135"

# Build and deploy in one command
docker context use kexp-droplet
docker-compose up -d

# Switch back
docker context use default
```

### Option 3: GitHub Actions (CI/CD)

For automated deployments:

```yaml
# .github/workflows/deploy.yml
- Push to main → Build → Deploy to droplet
```

### Recommended: Hybrid Approach

1. **Initial setup:** Manual (one-time)
2. **Data sync:** rsync script (repeatable)
3. **App deployment:** docker-compose via SSH
4. **Verification:** Automated script

### Benefits
- ✅ Fast data sync with rsync (only changed files)
- ✅ Atomic deployments with Docker
- ✅ Automatic rollback on failure
- ✅ Health check verification
- ✅ Zero-downtime updates

## Performance Considerations

### Current Memory Usage
- Service: ~2GB (embeddings + index in RAM)
- Available: 4GB total, ~2GB free after service

### Optimization Options
1. **Lazy loading:** Load index on first request (faster startup)
2. **Compression:** Gzip index files (slower load, less disk)
3. **Tiered storage:** Keep embeddings in RAM, index on disk

### Recommended: Keep Current
Current approach is optimal for 4GB RAM:
- Fast queries (<500ms)
- Reasonable startup (7 seconds)
- Good memory utilization (50%)
