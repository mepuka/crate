# Python API Streaming Integration Proposal

## Executive Summary

This document outlines research findings and implementation proposals for adding streaming capabilities to the KEXP Music Search Python API. The goal is to enable efficient streaming of search result sets and time-based ranges while maintaining simplicity, performance, and robustness suitable for Digital Ocean droplet deployment.

**Recommended Approach:** Server-Sent Events (SSE) with async generators and aiosqlite integration.

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Streaming Options Overview](#streaming-options-overview)
3. [Recommended Approach: SSE](#recommended-approach-sse)
4. [Implementation Patterns](#implementation-patterns)
5. [Performance Considerations](#performance-considerations)
6. [Digital Ocean Deployment](#digital-ocean-deployment)
7. [Testing Strategy](#testing-strategy)
8. [Migration Path](#migration-path)
9. [Code Examples](#code-examples)

---

## Current Architecture Analysis

### Strengths
- **Clean separation:** FAISS (vector search) + SQLite (metadata)
- **Efficient pagination:** Cursor-based pagination with <5ms queries
- **Type safety:** Pydantic V2 models with validation
- **Scale:** 2.2M+ music plays, proven production workload

### Current Limitations for Streaming
- ❌ Full response materialization before sending
- ❌ No incremental result delivery
- ❌ Blocking SQLite operations (sqlite3 synchronous)
- ❌ Large result sets consume memory before transmission

### Key Use Cases for Streaming
1. **Search Results:** Stream top-1000 FAISS results incrementally
2. **Time Ranges:** Stream plays within date ranges (e.g., entire years)
3. **Timeline Navigation:** Stream large cursor-based result sets
4. **Real-time Updates:** (Future) Stream new plays as they're indexed

---

## Streaming Options Overview

### Option 1: Server-Sent Events (SSE) ⭐ RECOMMENDED

**Description:** HTTP-based, unidirectional streaming protocol

**Pros:**
- ✅ Simple HTTP/1.1 protocol (no WebSocket complexity)
- ✅ Firewall and proxy-friendly
- ✅ Built-in automatic reconnection
- ✅ Easy to implement with FastAPI StreamingResponse
- ✅ Native EventSource browser API support
- ✅ Low overhead (text-based protocol)
- ✅ Works with existing CORS/auth middleware

**Cons:**
- ⚠️ Unidirectional (server → client only)
- ⚠️ Text-based (JSON requires serialization per event)
- ⚠️ HTTP/1.1 connection per stream (not multiplexed)

**Best For:** Search results, timeline streaming, data exports

---

### Option 2: WebSockets

**Description:** Full-duplex communication protocol

**Pros:**
- ✅ Bidirectional messaging
- ✅ Binary data support
- ✅ Lower overhead after handshake
- ✅ Multiplexed messaging

**Cons:**
- ❌ Overly complex for one-way streaming
- ❌ Requires separate connection management
- ❌ More difficult to debug
- ❌ Proxy/load balancer complications
- ❌ Not necessary for our use cases

**Best For:** Chat, collaborative editing, gaming (NOT our use case)

---

### Option 3: HTTP Chunked Transfer (StreamingResponse only)

**Description:** HTTP chunked encoding without SSE format

**Pros:**
- ✅ Simplest implementation
- ✅ No protocol overhead
- ✅ Direct JSON streaming

**Cons:**
- ⚠️ No automatic reconnection
- ⚠️ No event naming/typing
- ⚠️ Manual client parsing required
- ⚠️ Less standardized

**Best For:** Simple progress indicators, file downloads

---

### Option 4: GraphQL Subscriptions

**Description:** GraphQL protocol extension for streaming

**Cons:**
- ❌ Requires full GraphQL stack adoption
- ❌ Overkill for REST API extension
- ❌ Increased complexity and dependencies

**Not Recommended** for this project.

---

## Recommended Approach: SSE

### Why SSE for This Project?

1. **Simplicity:** Minimal code changes, uses existing FastAPI patterns
2. **Performance:** Low overhead, efficient for text-based JSON streaming
3. **Robustness:** Built-in reconnection, well-tested protocol
4. **Compatibility:** Works with existing infrastructure (nginx, load balancers)
5. **Resource Efficient:** Suitable for Digital Ocean droplets (no connection pooling complexity)
6. **Incremental Adoption:** Can coexist with existing REST endpoints

### SSE Protocol Basics

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: search_result
data: {"id": 123, "artist": "Artist Name", "song": "Song Title"}

event: search_result
data: {"id": 124, "artist": "Another Artist", "song": "Another Song"}

event: complete
data: {"total": 2, "query_time_ms": 45.2}

```

**Key Features:**
- `event:` field specifies event type (optional)
- `data:` field contains payload (can be multiline)
- Double newline `\n\n` separates events
- `retry:` field sets reconnection delay (milliseconds)
- `id:` field enables resume from last event

---

## Implementation Patterns

### Pattern 1: Async Generator with aiosqlite

**Core Concept:** Replace synchronous sqlite3 with aiosqlite for non-blocking queries

```python
import aiosqlite
from typing import AsyncGenerator

async def stream_search_results(
    play_ids: List[int],
    batch_size: int = 50
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream search results in batches"""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Process in batches to avoid blocking
        for i in range(0, len(play_ids), batch_size):
            batch_ids = play_ids[i:i + batch_size]
            placeholders = ",".join("?" * len(batch_ids))

            query = f"""
                SELECT * FROM fact_plays
                WHERE id IN ({placeholders})
                ORDER BY airdate DESC
            """

            async with db.execute(query, batch_ids) as cursor:
                async for row in cursor:
                    yield dict(row)
```

**Advantages:**
- Non-blocking database I/O
- Memory efficient (streaming cursor)
- Batching prevents overwhelming client
- Compatible with existing schema

---

### Pattern 2: SSE Response Formatter

```python
from fastapi.responses import StreamingResponse
import json

async def sse_generator(
    data_generator: AsyncGenerator[Dict, None],
    event_name: str = "message"
) -> AsyncGenerator[str, None]:
    """Format data as SSE events"""
    try:
        async for item in data_generator:
            # Format as SSE
            yield f"event: {event_name}\n"
            yield f"data: {json.dumps(item)}\n\n"
    except Exception as e:
        # Send error event
        yield f"event: error\n"
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        # Send completion event
        yield f"event: complete\n"
        yield f"data: {json.dumps({'status': 'done'})}\n\n"

@app.get("/api/stream/search")
async def stream_search(
    query: str,
    limit: int = 1000
):
    """Stream search results via SSE"""
    # Perform FAISS search (fast, in-memory)
    search_results = await search_service.search(query, limit)
    play_ids = [r.play_id for r in search_results]

    # Stream database results
    data_gen = stream_search_results(play_ids)
    sse_gen = sse_generator(data_gen, event_name="search_result")

    return StreamingResponse(
        sse_gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
```

---

### Pattern 3: Time Range Streaming

```python
async def stream_plays_by_time_range(
    since: datetime,
    until: datetime,
    batch_size: int = 100
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream plays within time range"""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        query = """
            SELECT * FROM fact_plays
            WHERE airdate BETWEEN ? AND ?
            ORDER BY airdate DESC, id DESC
        """

        async with db.execute(query, (since.isoformat(), until.isoformat())) as cursor:
            batch = []
            async for row in cursor:
                batch.append(dict(row))

                if len(batch) >= batch_size:
                    # Yield batch as single event
                    yield {"type": "batch", "results": batch, "count": len(batch)}
                    batch = []

            # Yield remaining items
            if batch:
                yield {"type": "batch", "results": batch, "count": len(batch)}
```

---

### Pattern 4: Resumable Streaming with Cursor

```python
async def stream_plays_with_cursor(
    cursor: Optional[str] = None,
    limit: int = 1000,
    batch_size: int = 50
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream with resumable cursor support"""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        if cursor:
            airdate, play_id = decode_cursor(cursor)
            query = """
                SELECT * FROM fact_plays
                WHERE (airdate, id) < (?, ?)
                ORDER BY airdate DESC, id DESC
                LIMIT ?
            """
            params = (airdate, play_id, limit)
        else:
            query = """
                SELECT * FROM fact_plays
                ORDER BY airdate DESC, id DESC
                LIMIT ?
            """
            params = (limit,)

        count = 0
        last_row = None

        async with db.execute(query, params) as cursor_db:
            batch = []
            async for row in cursor_db:
                batch.append(dict(row))
                last_row = row
                count += 1

                if len(batch) >= batch_size:
                    # Generate resumption cursor
                    next_cursor = encode_cursor(last_row['airdate'], last_row['id'])
                    yield {
                        "type": "batch",
                        "results": batch,
                        "count": len(batch),
                        "cursor": next_cursor
                    }
                    batch = []

            if batch:
                next_cursor = encode_cursor(last_row['airdate'], last_row['id']) if last_row else None
                yield {
                    "type": "batch",
                    "results": batch,
                    "count": len(batch),
                    "cursor": next_cursor
                }
```

---

### Pattern 5: Client-Side Disconnect Detection

```python
from fastapi import Request

async def safe_sse_generator(
    request: Request,
    data_generator: AsyncGenerator[Dict, None]
) -> AsyncGenerator[str, None]:
    """SSE generator with disconnect detection"""
    try:
        async for item in data_generator:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            yield f"event: data\n"
            yield f"data: {json.dumps(item)}\n\n"
    except asyncio.CancelledError:
        # Client disconnected, cleanup
        pass
    finally:
        # Always send completion (if still connected)
        if not await request.is_disconnected():
            yield f"event: complete\n"
            yield f"data: {json.dumps({'status': 'done'})}\n\n"
```

---

## Performance Considerations

### Memory Efficiency

**Current (Non-Streaming):**
```
Query returns 1000 results
→ Fully materialize 1000 rows in memory
→ Serialize entire response (~500KB)
→ Send to client
→ Peak memory: ~500KB per request
```

**Streaming Approach:**
```
Query returns 1000 results
→ Fetch 50 rows (batch)
→ Serialize and send batch (~25KB)
→ Fetch next 50 rows
→ Peak memory: ~25KB per request (20x reduction)
```

### Database Performance

**aiosqlite Considerations:**
- Uses thread pool for blocking SQLite operations
- Connection pooling not needed (SQLite file-based)
- Read-only queries safe for concurrent access (`check_same_thread=False`)
- Cursor-based streaming uses less memory than OFFSET pagination

**Benchmark Estimates (2.2M rows, 256D embeddings):**

| Operation | Non-Streaming | Streaming | Improvement |
|-----------|---------------|-----------|-------------|
| Search 1000 results | ~150ms | ~50ms (first batch) | 3x faster TTFB |
| Memory per request | ~500KB | ~25KB | 20x reduction |
| Time range (10K results) | ~2s | ~100ms (first batch) | 20x faster TTFB |
| Concurrent requests | ~20/sec | ~100/sec | 5x throughput |

*Note: TTFB = Time To First Byte*

### Network Efficiency

**Compression:**
- SSE text compresses well with GZip (already enabled)
- JSON compression ratio: ~60-70% for structured data
- Streaming maintains compression benefits

**Batching Strategy:**
```python
# Optimal batch sizes for different scenarios
SEARCH_BATCH_SIZE = 50      # Search results (fast TTFB)
TIMELINE_BATCH_SIZE = 100   # Timeline browsing (balanced)
EXPORT_BATCH_SIZE = 500     # Data export (throughput optimized)
```

### CPU Impact

**FAISS Search:** Still synchronous (fast, <50ms for top-1000)
**Serialization:** Incremental JSON serialization per batch
**Thread Pool:** aiosqlite uses default ThreadPoolExecutor

**Expected CPU overhead:** +5-10% due to event loop overhead, acceptable for the performance gains.

---

## Digital Ocean Deployment

### Droplet Size Recommendations

**Minimum (Current):**
- 2 vCPUs, 2GB RAM
- Can handle 20-30 concurrent streaming connections
- Suitable for light production load

**Recommended (Streaming):**
- 2 vCPUs, 4GB RAM (1 tier up)
- Can handle 100+ concurrent streaming connections
- Buffer for FAISS index memory + SQLite cache

**Scaling Considerations:**
- Each SSE connection: ~1MB RAM overhead (including buffers)
- 100 concurrent streams: ~100MB RAM
- FAISS index: ~2-4GB (in memory)
- SQLite: ~500MB-1GB cache

### Deployment Configuration

**Uvicorn Workers:**
```python
# Single worker for FAISS (shared memory)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1

# Alternative: Multi-worker with shared FAISS (advanced)
# Requires preloading FAISS index before fork
gunicorn main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --preload
```

**Nginx Configuration (if using reverse proxy):**
```nginx
location /api/stream/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;

    # Disable buffering for SSE
    proxy_buffering off;
    proxy_cache off;

    # Timeouts for long-lived connections
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # SSE-specific headers
    proxy_set_header X-Accel-Buffering no;
}
```

### Connection Limits

**Linux Defaults:**
- File descriptors: 1024 per process (can increase to 65535)
- TCP connections: Virtually unlimited (memory-bound)

**Recommended Limits:**
```bash
# /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535

# Set in Docker/systemd
ulimit -n 65535
```

---

## Testing Strategy

### Unit Tests

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_sse_search_stream():
    """Test SSE search streaming endpoint"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        async with client.stream("GET", "/api/stream/search?query=test") as response:
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/event-stream"

            events = []
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    events.append(data)

            assert len(events) > 0
            assert "id" in events[0]
```

### Load Testing

**Use `wrk` or `vegeta` for SSE load testing:**

```bash
# Test 100 concurrent SSE connections
wrk -t 4 -c 100 -d 30s -H "Accept: text/event-stream" \
    http://localhost:8000/api/stream/search?query=test
```

**Metrics to Monitor:**
- Time to first byte (TTFB)
- Events per second
- Memory usage per connection
- Connection drop rate

### Integration Tests

```python
@pytest.mark.asyncio
async def test_stream_disconnect_cleanup():
    """Test that disconnected clients are properly cleaned up"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        async with client.stream("GET", "/api/stream/timeline") as response:
            # Read first event
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    break  # Disconnect after first event

            # Verify connection closed cleanly (no errors logged)
```

---

## Migration Path

### Phase 1: Add SSE Endpoints (Non-Breaking)

1. Install dependencies: `pip install aiosqlite`
2. Create new streaming service layer
3. Add new SSE endpoints alongside existing REST endpoints
   - `/api/stream/search` (new) alongside `/api/search` (existing)
   - `/api/stream/timeline` (new) alongside `/api/plays/timeline` (existing)
4. Update API documentation

**Timeline:** 1-2 weeks

### Phase 2: Client Adoption (Gradual)

1. Update frontend to use SSE for large result sets
2. A/B test performance improvements
3. Monitor error rates and connection stability
4. Keep REST endpoints as fallback

**Timeline:** 2-3 weeks

### Phase 3: Optimize and Scale (Optional)

1. Implement connection pooling if needed
2. Add streaming compression (Brotli)
3. Fine-tune batch sizes based on metrics
4. Consider PostgreSQL migration for better async support (future)

**Timeline:** Ongoing

---

## Code Examples

### Complete Streaming Endpoint Example

```python
# app/services/streaming_service.py
import aiosqlite
import json
from typing import AsyncGenerator, Dict, List, Any, Optional
from pathlib import Path
import asyncio

class StreamingService:
    """Service for streaming database results"""

    def __init__(self, db_path: Path, batch_size: int = 50):
        self.db_path = db_path
        self.batch_size = batch_size

    async def stream_plays_by_ids(
        self,
        play_ids: List[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream plays by IDs in batches"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            for i in range(0, len(play_ids), self.batch_size):
                batch_ids = play_ids[i:i + self.batch_size]
                placeholders = ",".join("?" * len(batch_ids))

                query = f"""
                    SELECT id, artist, song, album, airdate,
                           labels, rotation_status, is_local, is_live,
                           is_request, comment, show, image_uri, thumbnail_uri
                    FROM fact_plays
                    WHERE id IN ({placeholders})
                """

                async with db.execute(query, batch_ids) as cursor:
                    async for row in cursor:
                        # Convert to dict and parse JSON fields
                        play = dict(row)
                        play['labels'] = json.loads(play['labels']) if play['labels'] else []
                        play['is_local'] = bool(play['is_local'])
                        play['is_live'] = bool(play['is_live'])
                        play['is_request'] = bool(play['is_request'])
                        yield play

                # Small delay to prevent overwhelming client
                await asyncio.sleep(0.01)

    async def stream_plays_by_time_range(
        self,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: Optional[int] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream plays within time range"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            conditions = []
            params = []

            if since:
                conditions.append("airdate >= ?")
                params.append(since)
            if until:
                conditions.append("airdate <= ?")
                params.append(until)

            where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            limit_clause = f"LIMIT {limit}" if limit else ""

            query = f"""
                SELECT id, artist, song, album, airdate,
                       labels, rotation_status, is_local, is_live,
                       is_request, comment, show, image_uri, thumbnail_uri
                FROM fact_plays
                {where_clause}
                ORDER BY airdate DESC, id DESC
                {limit_clause}
            """

            count = 0
            async with db.execute(query, params) as cursor:
                async for row in cursor:
                    play = dict(row)
                    play['labels'] = json.loads(play['labels']) if play['labels'] else []
                    play['is_local'] = bool(play['is_local'])
                    play['is_live'] = bool(play['is_live'])
                    play['is_request'] = bool(play['is_request'])

                    yield play
                    count += 1

                    # Batch delay every 50 items
                    if count % 50 == 0:
                        await asyncio.sleep(0.01)


# app/utils/sse.py
from typing import AsyncGenerator, Dict, Any
import json

async def format_sse(
    data_generator: AsyncGenerator[Dict[str, Any], None],
    event_name: str = "message"
) -> AsyncGenerator[str, None]:
    """Format async generator as SSE stream"""
    count = 0

    try:
        async for item in data_generator:
            yield f"event: {event_name}\n"
            yield f"data: {json.dumps(item)}\n\n"
            count += 1
    except Exception as e:
        # Send error event
        yield f"event: error\n"
        yield f"data: {json.dumps({'error': str(e), 'type': type(e).__name__})}\n\n"
    finally:
        # Send completion event with stats
        yield f"event: complete\n"
        yield f"data: {json.dumps({'status': 'done', 'total': count})}\n\n"


# app/main.py additions
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from app.services.streaming_service import StreamingService
from app.utils.sse import format_sse
import time

# Initialize streaming service
streaming_service = StreamingService(
    db_path=settings.DATABASE_PATH,
    batch_size=50
)

@app.get("/api/stream/search")
async def stream_search(
    request: Request,
    query: str,
    limit: int = 1000
):
    """
    Stream search results via Server-Sent Events

    Returns results incrementally as they are retrieved from the database,
    enabling faster time-to-first-byte and lower memory usage.
    """
    start_time = time.time()

    # Step 1: FAISS search (fast, in-memory)
    search_results = search_service.search(query, k=limit)
    play_ids = [r['play_id'] for r in search_results if r['play_id'] != -1]

    # Step 2: Create streaming response
    async def generate():
        # Send metadata event
        yield f"event: metadata\n"
        yield f"data: {json.dumps({'total': len(play_ids), 'query': query})}\n\n"

        # Stream database results
        async for play in streaming_service.stream_plays_by_ids(play_ids):
            # Check for client disconnect
            if await request.is_disconnected():
                break

            yield f"event: result\n"
            yield f"data: {json.dumps(play)}\n\n"

        # Send completion event
        query_time = (time.time() - start_time) * 1000
        yield f"event: complete\n"
        yield f"data: {json.dumps({'query_time_ms': query_time})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/stream/timeline")
async def stream_timeline(
    request: Request,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = 1000
):
    """
    Stream timeline plays via Server-Sent Events

    Supports time-based filtering with `since` and `until` parameters (ISO 8601).
    """
    async def generate():
        count = 0
        async for play in streaming_service.stream_plays_by_time_range(since, until, limit):
            # Check for client disconnect
            if await request.is_disconnected():
                break

            yield f"event: play\n"
            yield f"data: {json.dumps(play)}\n\n"
            count += 1

        yield f"event: complete\n"
        yield f"data: {json.dumps({'total': count})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
```

### Client-Side JavaScript Example

```javascript
// Simple SSE client for streaming search results
async function streamSearch(query) {
    const eventSource = new EventSource(
        `/api/stream/search?query=${encodeURIComponent(query)}&limit=1000`
    );

    const results = [];

    eventSource.addEventListener('metadata', (e) => {
        const metadata = JSON.parse(e.data);
        console.log(`Streaming ${metadata.total} results for: ${metadata.query}`);
    });

    eventSource.addEventListener('result', (e) => {
        const play = JSON.parse(e.data);
        results.push(play);

        // Update UI incrementally (fast perceived performance)
        displayResult(play);
    });

    eventSource.addEventListener('complete', (e) => {
        const stats = JSON.parse(e.data);
        console.log(`Completed in ${stats.query_time_ms}ms`);
        eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
        console.error('Stream error:', e);
        eventSource.close();
    });

    return results;
}

// React hook example
function useStreamingSearch(query) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [complete, setComplete] = useState(false);

    useEffect(() => {
        if (!query) return;

        setLoading(true);
        setResults([]);
        setComplete(false);

        const eventSource = new EventSource(
            `/api/stream/search?query=${encodeURIComponent(query)}`
        );

        eventSource.addEventListener('result', (e) => {
            const play = JSON.parse(e.data);
            setResults(prev => [...prev, play]);
        });

        eventSource.addEventListener('complete', () => {
            setLoading(false);
            setComplete(true);
            eventSource.close();
        });

        eventSource.addEventListener('error', () => {
            setLoading(false);
            eventSource.close();
        });

        return () => eventSource.close();
    }, [query]);

    return { results, loading, complete };
}
```

---

## Dependency Changes

### requirements.txt Additions

```txt
# Existing dependencies
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.8.0
sentence-transformers==3.0.0
faiss-cpu==1.8.0
numpy==1.26.0
scikit-learn==1.5.0
joblib==1.4.0

# NEW: Async SQLite support
aiosqlite==0.20.0

# Optional: Enhanced async support
anyio==4.3.0
```

### Installation

```bash
pip install aiosqlite==0.20.0
```

**No breaking changes:** aiosqlite can coexist with sqlite3, allowing gradual migration.

---

## Security Considerations

### Rate Limiting

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.get("/api/stream/search")
@limiter.limit("10/minute")  # Limit streaming endpoints
async def stream_search(request: Request, query: str):
    ...
```

### Connection Timeouts

```python
# Prevent indefinite connections
STREAM_TIMEOUT = 300  # 5 minutes

async def generate_with_timeout():
    start_time = time.time()
    async for item in data_generator():
        if time.time() - start_time > STREAM_TIMEOUT:
            yield f"event: timeout\n"
            yield f"data: {json.dumps({'error': 'Stream timeout'})}\n\n"
            break
        yield item
```

### Input Validation

```python
from pydantic import BaseModel, Field, validator

class StreamSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=1000, ge=1, le=10000)

    @validator('query')
    def query_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Query cannot be empty')
        return v.strip()
```

---

## Monitoring and Observability

### Metrics to Track

```python
from prometheus_client import Counter, Histogram, Gauge

# Request counters
stream_requests = Counter('stream_requests_total', 'Total streaming requests', ['endpoint'])
stream_errors = Counter('stream_errors_total', 'Streaming errors', ['endpoint', 'error_type'])

# Performance metrics
stream_duration = Histogram('stream_duration_seconds', 'Stream duration', ['endpoint'])
items_streamed = Histogram('stream_items_total', 'Items streamed per request', ['endpoint'])

# Active connections
active_streams = Gauge('stream_connections_active', 'Active streaming connections')

@app.get("/api/stream/search")
async def stream_search(request: Request, query: str):
    stream_requests.labels(endpoint='search').inc()
    active_streams.inc()

    try:
        # ... streaming logic
        pass
    except Exception as e:
        stream_errors.labels(endpoint='search', error_type=type(e).__name__).inc()
        raise
    finally:
        active_streams.dec()
```

### Logging

```python
import logging

logger = logging.getLogger(__name__)

async def generate():
    logger.info(f"Starting stream for query: {query[:50]}")
    count = 0

    try:
        async for item in data_generator():
            yield format_sse(item)
            count += 1
    except asyncio.CancelledError:
        logger.info(f"Stream cancelled after {count} items")
    except Exception as e:
        logger.error(f"Stream error after {count} items: {e}")
        raise
    finally:
        logger.info(f"Stream completed: {count} items")
```

---

## Alternative Approaches (For Future Consideration)

### 1. GraphQL Subscriptions (via Strawberry)

**When to Consider:** If adopting GraphQL across the entire API

```python
import strawberry
from typing import AsyncGenerator

@strawberry.type
class Subscription:
    @strawberry.subscription
    async def search_results(self, query: str) -> AsyncGenerator[Play, None]:
        results = await search_service.search(query)
        for result in results:
            yield result
```

### 2. gRPC Streaming

**When to Consider:** If building microservices or need bi-directional streaming

```protobuf
service SearchService {
  rpc StreamSearch(SearchRequest) returns (stream Play) {}
}
```

### 3. Apache Arrow Flight

**When to Consider:** Very large dataset transfers (10M+ rows), columnar data

---

## Conclusion

### Summary of Recommendations

1. **Implement SSE with aiosqlite** for streaming search results and timeline data
2. **Use batch sizes of 50-100** for optimal balance of TTFB and throughput
3. **Add streaming endpoints alongside existing REST APIs** (non-breaking)
4. **Monitor connection counts and memory usage** in production
5. **Consider 4GB RAM droplet** for production streaming workloads

### Expected Benefits

- **3-20x faster time-to-first-byte** for large result sets
- **20x lower memory usage** per request
- **5x higher concurrent request capacity**
- **Better user experience** with incremental loading

### Next Steps

1. **Review and approve** this proposal
2. **Prototype** single streaming endpoint (`/api/stream/search`)
3. **Load test** on staging environment
4. **Deploy** to production with monitoring
5. **Iterate** based on real-world metrics

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Increased connection count | Implement rate limiting, monitor with Prometheus |
| Database locks (write contention) | Use read-only connections, SQLite WAL mode |
| Client disconnect handling | Implement disconnect detection in all generators |
| Memory leaks | Proper async cleanup, connection pooling |
| Network interruptions | SSE automatic reconnection, cursor resumption |

---

## Appendix A: Benchmarking Script

```python
# benchmark_streaming.py
import asyncio
import aiohttp
import time
from statistics import mean, median

async def benchmark_stream(url: str, num_requests: int = 10):
    """Benchmark SSE endpoint"""
    results = {
        'ttfb': [],
        'total_time': [],
        'item_count': [],
        'errors': 0
    }

    async with aiohttp.ClientSession() as session:
        for i in range(num_requests):
            start = time.time()
            first_item_time = None
            item_count = 0

            try:
                async with session.get(url) as response:
                    async for line in response.content:
                        if first_item_time is None and line.startswith(b'data:'):
                            first_item_time = time.time() - start

                        if line.startswith(b'data:'):
                            item_count += 1

                total_time = time.time() - start
                results['ttfb'].append(first_item_time)
                results['total_time'].append(total_time)
                results['item_count'].append(item_count)

            except Exception as e:
                print(f"Request {i+1} failed: {e}")
                results['errors'] += 1

    print(f"\nBenchmark Results ({num_requests} requests):")
    print(f"  TTFB: {mean(results['ttfb']):.3f}s (median: {median(results['ttfb']):.3f}s)")
    print(f"  Total time: {mean(results['total_time']):.3f}s")
    print(f"  Items per request: {mean(results['item_count']):.0f}")
    print(f"  Errors: {results['errors']}")

if __name__ == "__main__":
    asyncio.run(benchmark_stream("http://localhost:8000/api/stream/search?query=test"))
```

---

## Appendix B: References

- [FastAPI StreamingResponse Documentation](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [aiosqlite Documentation](https://aiosqlite.omnilib.dev/)
- [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

---

**Document Version:** 1.0
**Date:** 2025-11-13
**Author:** Research for KEXP Music Search API
