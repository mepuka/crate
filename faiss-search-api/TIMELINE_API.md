# KEXP Timeline API - Unified MVP Documentation

## Overview

The KEXP Timeline API provides a single, unified endpoint for browsing the complete play history chronologically (newest first) with multiple flexible navigation methods. All methods return the same response format with pagination cursor support.

**Base URL:** `/api/plays/timeline`

## Features

- **2.2M+ plays** spanning from 2007 to present
- **Sub-millisecond performance** for cursor-based navigation
- **Flexible jump methods** for different access patterns
- **Consistent API** - all methods return the same chronological list
- **Cursor pagination** - smooth scrolling after initial jump

## Navigation Methods

### 1. Standard Cursor Pagination (Default)

Navigate through the timeline page by page using cursor-based pagination.

```bash
# First page (newest plays)
GET /api/plays/timeline?limit=50

# Next page using cursor from previous response
GET /api/plays/timeline?cursor={next_cursor}&limit=50
```

**Performance:** < 5ms per query

**Use cases:**
- Default browsing experience
- Infinite scroll implementations
- Sequential timeline navigation

---

### 2. Time-Based Jump

Jump to a specific date or date range in the timeline.

```bash
# Jump to March 15, 2015
GET /api/plays/timeline?since=2015-03-15T00:00:00&limit=50

# Date range: March 2015
GET /api/plays/timeline?since=2015-03-01T00:00:00&until=2015-04-01T00:00:00&limit=50

# Recent plays (last 7 days)
GET /api/plays/timeline?since=2024-11-05T00:00:00&limit=100
```

**Performance:** < 1ms per query

**Parameters:**
- `since` (optional): ISO 8601 datetime (e.g., "2015-03-15T00:00:00")
- `until` (optional): ISO 8601 datetime (e.g., "2015-04-01T00:00:00")
- `limit`: Number of results (1-200)

**Use cases:**
- "Show me plays from March 2015"
- Date picker / calendar navigation
- Historical browsing by date
- Time-based filters

---

### 3. Percentage Jump

Jump to any position in the timeline using a percentage (0.0 = newest, 1.0 = oldest).

```bash
# Jump to 50% through the timeline (approximately 2016)
GET /api/plays/timeline?percentage=0.5&limit=50

# Jump to 25% (more recent)
GET /api/plays/timeline?percentage=0.25&limit=50

# Jump to 75% (older plays)
GET /api/plays/timeline?percentage=0.75&limit=50
```

**Performance:** ~50ms per query (uses OFFSET)

**Parameters:**
- `percentage`: Float between 0.0 and 1.0
  - `0.0` = newest plays (2025)
  - `0.5` = middle of timeline (~2016)
  - `1.0` = oldest plays (2007)
- `limit`: Number of results (1-200)

**Response includes:**
- `total_count`: Total number of plays in database

**Use cases:**
- Scrubber / slider UI implementations
- "Jump to middle" feature
- Proportional timeline navigation
- Random exploration

---

### 4. Anchor Jump

Center results around a specific play ID, showing context before and after.

```bash
# Show 50 plays centered around play ID 3576848
GET /api/plays/timeline?anchor_id=3576848&limit=50
```

**Performance:** ~100ms per query (multiple lookups)

**Parameters:**
- `anchor_id`: Play ID to center around
- `limit`: Total number of results (split evenly before/after)

**Response includes:**
- `anchor_position`: Index of anchor play in results array

**Use cases:**
- "Show context around this play"
- "What was playing before/after?"
- Linking to specific plays with context
- Related plays exploration

---

## Response Format

All navigation methods return the same `TimelineResponse` format:

```json
{
  "results": [
    {
      "id": 3576848,
      "artist": "Radiohead",
      "song": "Paranoid Android",
      "album": "OK Computer",
      "airdate": "2025-11-11T14:18:29-08:00",
      "similarity": 0.0,
      "rotation_status": "Heavy",
      "is_local": false,
      "is_live": false,
      "is_request": false,
      "show": 63830,
      "labels": ["Parlophone", "Capitol Records"],
      "artist_mbid": ["a74b1b7f-71a5-4011-9441-d0b5e4122711"],
      "recording_mbid": "8084a525-c1f7-4a33-8e72-e5f6de90a284",
      "release_mbid": "6a09041b-0f79-3278-88d0-0c6ff8a4e3e0",
      "release_group_mbid": "5cfa82c6-47e0-31ff-9b0c-01b42f06e5d1",
      "comment": null
    }
    // ... more plays
  ],
  "next_cursor": "MjAyNS0xMS0xMVQxMjo1ODoyNS0wODowMDozNTc2ODM2",
  "has_more": true,
  "query_time_ms": 2.43,
  "total_count": 2193235,      // Only for percentage-based queries
  "anchor_position": 24         // Only for anchor-based queries
}
```

### Fields

- `results`: Array of play objects
- `next_cursor`: Base64 cursor for next page (use with `cursor` parameter)
- `has_more`: Boolean indicating if more results exist
- `query_time_ms`: Query execution time in milliseconds
- `total_count`: Total plays (percentage queries only)
- `anchor_position`: Index of anchor in results (anchor queries only)

---

## Validation & Error Handling

### Multiple Method Validation

**Only one navigation method allowed per request:**

```bash
# ❌ INVALID - Multiple methods
GET /api/plays/timeline?cursor=abc&percentage=0.5

# Response: 400 Bad Request
{
  "detail": "Only one navigation method allowed: cursor, time range (since/until), percentage, or anchor_id"
}
```

### Parameter Validation

```bash
# ❌ Invalid percentage
GET /api/plays/timeline?percentage=1.5
# Response: 400 - "Percentage must be between 0.0 and 1.0"

# ❌ Invalid limit
GET /api/plays/timeline?limit=500
# Response: 400 - "Limit must be between 1 and 200"

# ❌ Invalid anchor ID
GET /api/plays/timeline?anchor_id=999999999
# Response: 400 - "Play ID 999999999 not found"

# ❌ Invalid date format
GET /api/plays/timeline?since=2015-03-15
# Response: 400 - "Invalid isoformat string"

# ❌ Invalid cursor
GET /api/plays/timeline?cursor=invalid
# Response: 400 - "Invalid cursor: ..."
```

---

## Usage Patterns

### Pattern 1: Infinite Scroll

```javascript
// Initial load
const response = await fetch('/api/plays/timeline?limit=50');
const data = await response.json();

// Load more
if (data.has_more) {
  const nextPage = await fetch(
    `/api/plays/timeline?cursor=${data.next_cursor}&limit=50`
  );
}
```

### Pattern 2: Date Navigation

```javascript
// User selects "March 2015" from date picker
const response = await fetch(
  '/api/plays/timeline?' +
  'since=2015-03-01T00:00:00&' +
  'until=2015-04-01T00:00:00&' +
  'limit=50'
);
```

### Pattern 3: Timeline Scrubber

```javascript
// User drags scrubber to 35%
const response = await fetch('/api/plays/timeline?percentage=0.35&limit=50');
const data = await response.json();

// Show position: "~2016" based on first result's airdate
```

### Pattern 4: Context Around Play

```javascript
// User clicks "Show context" on a play
const response = await fetch(
  `/api/plays/timeline?anchor_id=${playId}&limit=50`
);
const data = await response.json();

// Highlight the anchor play at data.anchor_position
```

---

## Performance Characteristics

| Method | Performance | Use Case |
|--------|-------------|----------|
| Cursor Pagination | < 5ms | Sequential browsing, infinite scroll |
| Time-Based Query | < 1ms | Date selection, time filters |
| Percentage Jump | ~50ms | Scrubber UI, proportional navigation |
| Anchor Jump | ~100ms | Context around specific play |

**Note:** All queries use indexes for optimal performance. The compound index on `(airdate DESC, id DESC)` enables fast cursor-based pagination.

---

## Database Schema

The API queries the `fact_plays` table with the following relevant fields:

```sql
CREATE TABLE fact_plays (
  id INTEGER PRIMARY KEY,
  airdate TEXT NOT NULL,          -- ISO 8601 timestamp
  show INTEGER NOT NULL,
  artist TEXT,
  song TEXT,
  album TEXT,
  labels TEXT,                    -- JSON array
  artist_ids TEXT,                -- JSON array of MusicBrainz IDs
  recording_id TEXT,              -- MusicBrainz recording ID
  release_id TEXT,                -- MusicBrainz release ID
  release_group_id TEXT,          -- MusicBrainz release group ID
  rotation_status TEXT,
  is_local INTEGER,
  is_live INTEGER,
  is_request INTEGER,
  comment TEXT,
  -- ... other fields
);

-- Indexes for performance
CREATE INDEX idx_fp_airdate ON fact_plays(airdate);
CREATE INDEX idx_plays_airdate_id ON fact_plays(airdate DESC, id DESC);
CREATE UNIQUE INDEX idx_fact_plays_id ON fact_plays(id);
```

---

## Migration Notes

### Breaking Changes from Previous Version

1. **Table name changed:** `plays` → `fact_plays`
2. **Field mappings:**
   - `artist_ids` → `artist_mbid` (in response)
   - `recording_id` → `recording_mbid` (in response)
   - `release_id` → `release_mbid` (in response)
   - `release_group_id` → `release_group_mbid` (in response)

3. **New features:**
   - Time-based queries (`since`, `until`)
   - Percentage-based jump (`percentage`)
   - Anchor-based context (`anchor_id`)
   - Validation for multiple navigation methods

---

## Examples

### Complete Timeline Browser

```python
import requests

BASE_URL = "http://localhost:8000/api/plays/timeline"

# Start at the top
response = requests.get(BASE_URL, params={"limit": 50})
data = response.json()

print(f"Query time: {data['query_time_ms']}ms")
print(f"First play: {data['results'][0]['artist']} - {data['results'][0]['song']}")

# Continue pagination
while data['has_more']:
    response = requests.get(BASE_URL, params={
        "cursor": data['next_cursor'],
        "limit": 50
    })
    data = response.json()
    # Process more results...
```

### Jump to Historical Date

```python
# Show plays from when Radiohead's OK Computer was released (1997)
response = requests.get(BASE_URL, params={
    "since": "1997-05-01T00:00:00",
    "until": "1997-06-01T00:00:00",
    "limit": 100
})
```

### Timeline Scrubber

```python
# Jump to 60% through timeline
response = requests.get(BASE_URL, params={
    "percentage": 0.6,
    "limit": 50
})

data = response.json()
print(f"Total plays in database: {data['total_count']}")
print(f"Showing plays from: {data['results'][0]['airdate']}")
```

---

## Future Enhancements (Not in MVP)

- Backward cursor pagination (`direction=prev`)
- Full-text search integration
- Genre/label filtering
- Show/program filtering
- Aggregations (plays per day/month/year)
- Caching layer for popular queries

---

## Support

For issues or questions:
- Check OpenAPI documentation at `/docs`
- Review test suite: `test_timeline_api.py`
- Run endpoint tests: `./test_api_endpoints.sh`

**API Version:** 1.0.0
**Last Updated:** 2025-11-12
