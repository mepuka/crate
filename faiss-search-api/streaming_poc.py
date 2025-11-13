"""
Proof of Concept: Streaming API Implementation

This file demonstrates the core streaming patterns proposed for the Python API.
NOT FOR PRODUCTION - This is a reference implementation for evaluation.

Usage:
    python streaming_poc.py

Then test with:
    curl -N http://localhost:8000/api/stream/search?query=radiohead&limit=100
"""

import asyncio
import aiosqlite
import json
import time
from typing import AsyncGenerator, Dict, Any, List, Optional
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager

# Configuration
DB_PATH = Path("data/music_kb.sqlite")
BATCH_SIZE = 50


# ============================================================================
# Streaming Service Layer
# ============================================================================

class StreamingDatabaseService:
    """Async database service for streaming results"""

    def __init__(self, db_path: Path, batch_size: int = 50):
        self.db_path = db_path
        self.batch_size = batch_size

    async def stream_plays_by_ids(
        self,
        play_ids: List[int]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream plays by IDs in batches.

        This demonstrates the core pattern:
        1. Process IDs in batches to avoid overwhelming the database
        2. Use async cursor iteration for non-blocking I/O
        3. Yield one row at a time for memory efficiency
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            # Process in batches
            for i in range(0, len(play_ids), self.batch_size):
                batch_ids = play_ids[i:i + self.batch_size]
                placeholders = ",".join("?" * len(batch_ids))

                query = f"""
                    SELECT
                        id, artist, song, album, airdate,
                        labels, rotation_status,
                        is_local, is_live, is_request,
                        comment, show,
                        image_uri, thumbnail_uri,
                        artist_ids as artist_mbid,
                        recording_id as recording_mbid,
                        release_id as release_mbid,
                        release_group_id as release_group_mbid
                    FROM fact_plays
                    WHERE id IN ({placeholders})
                """

                async with db.execute(query, batch_ids) as cursor:
                    async for row in cursor:
                        # Convert row to dict and parse JSON fields
                        play = dict(row)

                        # Parse JSON fields
                        play['labels'] = json.loads(play['labels']) if play['labels'] else []
                        if play['artist_mbid']:
                            play['artist_mbid'] = json.loads(play['artist_mbid'])

                        # Convert boolean fields
                        play['is_local'] = bool(play['is_local'])
                        play['is_live'] = bool(play['is_live'])
                        play['is_request'] = bool(play['is_request'])

                        yield play

                # Small delay between batches to prevent overwhelming client
                await asyncio.sleep(0.01)

    async def stream_plays_by_time_range(
        self,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: Optional[int] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream plays within a time range.

        Demonstrates time-based filtering with streaming.
        Useful for: year exports, date range queries, timeline views.
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            # Build dynamic query
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
                SELECT
                    id, artist, song, album, airdate,
                    labels, rotation_status,
                    is_local, is_live, is_request,
                    comment, show,
                    image_uri, thumbnail_uri
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

                    # Periodic yield to event loop
                    if count % 50 == 0:
                        await asyncio.sleep(0.01)

    async def stream_plays_with_cursor(
        self,
        cursor: Optional[str] = None,
        limit: int = 1000
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream plays with cursor-based pagination support.

        Demonstrates resumable streaming - client can reconnect
        and continue from last received cursor.
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            if cursor:
                # Decode cursor (format: "airdate:id")
                airdate, play_id = cursor.split(":")
                query = """
                    SELECT * FROM fact_plays
                    WHERE (airdate, id) < (?, ?)
                    ORDER BY airdate DESC, id DESC
                    LIMIT ?
                """
                params = (airdate, int(play_id), limit)
            else:
                query = """
                    SELECT * FROM fact_plays
                    ORDER BY airdate DESC, id DESC
                    LIMIT ?
                """
                params = (limit,)

            async with db.execute(query, params) as cursor_db:
                async for row in cursor_db:
                    play = dict(row)
                    play['labels'] = json.loads(play['labels']) if play['labels'] else []
                    play['is_local'] = bool(play['is_local'])
                    play['is_live'] = bool(play['is_live'])
                    play['is_request'] = bool(play['is_request'])

                    # Include cursor for resumption
                    play['_cursor'] = f"{play['airdate']}:{play['id']}"

                    yield play


# ============================================================================
# SSE Formatting Utilities
# ============================================================================

async def format_sse_stream(
    data_generator: AsyncGenerator[Dict[str, Any], None],
    event_name: str = "message"
) -> AsyncGenerator[str, None]:
    """
    Format data generator as Server-Sent Events (SSE).

    SSE Format:
        event: <event_name>
        data: <json_payload>
        <blank line>
    """
    count = 0

    try:
        async for item in data_generator:
            # Format as SSE event
            yield f"event: {event_name}\n"
            yield f"data: {json.dumps(item)}\n\n"
            count += 1

    except asyncio.CancelledError:
        # Client disconnected - send partial completion
        yield f"event: cancelled\n"
        yield f"data: {json.dumps({'status': 'cancelled', 'items_sent': count})}\n\n"

    except Exception as e:
        # Send error event
        yield f"event: error\n"
        yield f"data: {json.dumps({'error': str(e), 'type': type(e).__name__})}\n\n"

    finally:
        # Always send completion event
        yield f"event: complete\n"
        yield f"data: {json.dumps({'status': 'done', 'total': count})}\n\n"


# ============================================================================
# Mock Search Service (for POC)
# ============================================================================

class MockSearchService:
    """Mock FAISS search for demonstration"""

    async def search(self, query: str, k: int = 1000) -> List[Dict[str, Any]]:
        """Simulate FAISS search returning play IDs"""
        # In real implementation, this would be:
        # return faiss_service.search(query, k)

        # For POC, return mock data
        await asyncio.sleep(0.05)  # Simulate search time
        return [
            {'play_id': i, 'similarity': 0.9 - (i * 0.001)}
            for i in range(1, min(k + 1, 101))  # Mock: return first 100 IDs
        ]


# ============================================================================
# FastAPI Application
# ============================================================================

# Initialize services
streaming_service = StreamingDatabaseService(DB_PATH, batch_size=BATCH_SIZE)
search_service = MockSearchService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    print("🚀 Streaming POC server starting...")
    yield
    print("🛑 Streaming POC server shutting down...")


app = FastAPI(
    title="Streaming API POC",
    version="0.1.0",
    lifespan=lifespan
)


@app.get("/")
async def root():
    """API information"""
    return {
        "name": "Streaming API Proof of Concept",
        "version": "0.1.0",
        "endpoints": {
            "/api/stream/search": "Stream search results via SSE",
            "/api/stream/timeline": "Stream timeline plays via SSE",
            "/api/stream/cursor": "Stream with cursor pagination"
        },
        "test_commands": {
            "search": "curl -N 'http://localhost:8000/api/stream/search?query=test&limit=100'",
            "timeline": "curl -N 'http://localhost:8000/api/stream/timeline?limit=50'",
            "cursor": "curl -N 'http://localhost:8000/api/stream/cursor?limit=100'"
        }
    }


@app.get("/api/stream/search")
async def stream_search(
    request: Request,
    query: str,
    limit: int = 1000
):
    """
    Stream search results via Server-Sent Events.

    This endpoint demonstrates:
    1. Fast FAISS search (synchronous, in-memory)
    2. Streaming database results (async, incremental)
    3. Client disconnect detection
    4. Progress events (metadata, results, completion)

    Query Parameters:
        query: Search query string
        limit: Maximum results (1-10000)

    Response: text/event-stream
        - event: metadata (search stats)
        - event: result (individual plays)
        - event: complete (final stats)
    """
    start_time = time.time()

    # Step 1: Perform FAISS search (fast, in-memory)
    search_results = await search_service.search(query, k=limit)
    play_ids = [r['play_id'] for r in search_results]

    search_time = (time.time() - start_time) * 1000

    # Step 2: Stream results
    async def generate():
        # Send metadata event first
        yield f"event: metadata\n"
        yield f"data: {json.dumps({
            'query': query,
            'total_ids': len(play_ids),
            'search_time_ms': search_time
        })}\n\n"

        # Stream database results
        count = 0
        async for play in streaming_service.stream_plays_by_ids(play_ids):
            # Check for client disconnect
            if await request.is_disconnected():
                print(f"Client disconnected after {count} results")
                break

            yield f"event: result\n"
            yield f"data: {json.dumps(play)}\n\n"
            count += 1

        # Send completion event
        total_time = (time.time() - start_time) * 1000
        yield f"event: complete\n"
        yield f"data: {json.dumps({
            'status': 'done',
            'total_results': count,
            'total_time_ms': total_time
        })}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
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
    Stream timeline plays via Server-Sent Events.

    Query Parameters:
        since: ISO 8601 start date (optional)
        until: ISO 8601 end date (optional)
        limit: Maximum results (1-10000)

    Response: text/event-stream
        - event: play (individual plays)
        - event: complete (final stats)
    """
    start_time = time.time()

    async def generate():
        count = 0

        async for play in streaming_service.stream_plays_by_time_range(since, until, limit):
            # Check for client disconnect
            if await request.is_disconnected():
                break

            yield f"event: play\n"
            yield f"data: {json.dumps(play)}\n\n"
            count += 1

        # Completion event
        total_time = (time.time() - start_time) * 1000
        yield f"event: complete\n"
        yield f"data: {json.dumps({
            'status': 'done',
            'total': count,
            'time_ms': total_time
        })}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/stream/cursor")
async def stream_with_cursor(
    request: Request,
    cursor: Optional[str] = None,
    limit: int = 1000
):
    """
    Stream plays with cursor-based pagination.

    Demonstrates resumable streaming - clients can disconnect
    and reconnect using the last received cursor.

    Query Parameters:
        cursor: Resume cursor (format: "airdate:id")
        limit: Maximum results (1-10000)

    Response: text/event-stream
        - event: play (includes _cursor field for resumption)
        - event: complete
    """
    async def generate():
        count = 0
        last_cursor = None

        async for play in streaming_service.stream_plays_with_cursor(cursor, limit):
            if await request.is_disconnected():
                break

            last_cursor = play.get('_cursor')
            yield f"event: play\n"
            yield f"data: {json.dumps(play)}\n\n"
            count += 1

        yield f"event: complete\n"
        yield f"data: {json.dumps({
            'status': 'done',
            'total': count,
            'last_cursor': last_cursor
        })}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ============================================================================
# Run Server (for testing)
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*70)
    print("🎵 KEXP Music Search - Streaming API Proof of Concept")
    print("="*70)
    print("\nThis POC demonstrates Server-Sent Events (SSE) streaming patterns.")
    print("\n📝 Note: This requires the database file at:", DB_PATH)
    print("\n🧪 Test endpoints:")
    print("  - http://localhost:8000/api/stream/search?query=radiohead&limit=100")
    print("  - http://localhost:8000/api/stream/timeline?limit=50")
    print("  - http://localhost:8000/api/stream/cursor?limit=100")
    print("\n💡 Use curl with -N flag to disable buffering:")
    print("  curl -N 'http://localhost:8000/api/stream/search?query=test'")
    print("\n" + "="*70 + "\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
