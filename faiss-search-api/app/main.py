"""FastAPI application for FAISS semantic search."""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from contextlib import asynccontextmanager
import time
import logging
from typing import Optional
import anyio

from .services.search_service import FAISSSearchService
from .services.db_service import DatabaseService
from .models import (
    SearchRequest, SearchResponse, HealthResponse, PlayResult, TimelineResponse,
    EnrichmentRequest, EnrichmentResponse, BatchPlaysResponse,
    EnrichmentData, GetEnrichmentsResponse
)
from .config import settings
import json
import os
from fastapi import Header

# Logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global service instances
search_service: Optional[FAISSSearchService] = None
db_service: Optional[DatabaseService] = None
startup_time: float = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    global search_service, db_service, startup_time

    # Startup
    logger.info("Starting FAISS Search API...")
    startup_time = time.time()

    try:
        # Initialize search service
        search_service = FAISSSearchService(
            embeddings_path=settings.EMBEDDINGS_PATH,
            play_ids_path=settings.PLAY_IDS_PATH,
            pca_path=settings.PCA_PATH,
            index_path=settings.INDEX_PATH,
            metadata_path=settings.METADATA_PATH,
            nlist=settings.FAISS_NLIST,
            nprobe=settings.FAISS_NPROBE
        )
        search_service.initialize()

        # Initialize database service
        db_service = DatabaseService(settings.DATABASE_PATH)

        logger.info("Services initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}", exc_info=True)
        raise

    yield  # Server runs

    # Shutdown
    logger.info("Shutting down...")
    if db_service:
        db_service.close()


class CacheHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add cache headers and security headers to responses.

    Cache strategy:
    - Health endpoint: 30 seconds (dynamic health status)
    - Search endpoint: 1 week (deterministic results, static data)
    - Timeline endpoint: 1 week (historical data is static)
    - Single play endpoint: 1 week (play data doesn't change)
    - OpenAPI/Docs: 1 hour (metadata endpoints)
    """

    # Cache durations in seconds
    CACHE_DURATIONS = {
        "/api/health": 30,                    # 30 seconds - health should be fresh
        "/api/search": 604800,                # 1 week (7 days)
        "/api/plays/timeline": 604800,        # 1 week
        "/api/plays/": 604800,                # 1 week (for /api/plays/{id} pattern)
        "/openapi.json": 3600,                # 1 hour
        "/docs": 3600,                        # 1 hour
        "/redoc": 3600,                       # 1 hour
    }

    async def dispatch(self, request: Request, call_next):
        """Process request and add headers to response."""
        # Get response from endpoint
        response: Response = await call_next(request)

        # Determine cache duration based on path
        cache_max_age = None
        path = request.url.path

        # Check exact matches first
        if path in self.CACHE_DURATIONS:
            cache_max_age = self.CACHE_DURATIONS[path]
        # Check pattern matches (e.g., /api/plays/{id})
        elif path.startswith("/api/plays/") and path != "/api/plays/timeline":
            cache_max_age = self.CACHE_DURATIONS["/api/plays/"]

        # Add Cache-Control header if we have a duration
        if cache_max_age is not None:
            # Use 'public' for GET requests (cacheable by browsers and CDNs)
            # For POST requests, still add cache headers but browsers typically won't cache
            cache_directive = f"public, max-age={cache_max_age}"
            response.headers["Cache-Control"] = cache_directive

            # Add Vary header to ensure proper caching with gzip
            response.headers["Vary"] = "Accept-Encoding"

        # Add security headers to all responses
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"

        return response


# Create app
app = FastAPI(
    title="KEXP Music Search API",
    description="Semantic search over 2.2M KEXP play history using FAISS embeddings",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Middleware
# Note: Middleware is applied in reverse order (last added = first executed)
# Order: Cache Headers -> GZip -> CORS

# CORS Configuration:
# allow_credentials MUST be False because nginx.conf sets wildcard CORS headers
# (Access-Control-Allow-Origin: *). The CORS specification forbids combining
# credentials with wildcard origins as it creates a security vulnerability.
# See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials
#
# Security implications:
# - Browsers will reject responses with both allow_credentials=true and wildcard origins
# - This prevents cookies/auth headers from being exposed to untrusted origins
# - If credentials are needed in the future, nginx.conf must use specific origins
#   instead of wildcards (e.g., the values from CORS_ORIGINS env var)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,  # Must be False when nginx uses wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CacheHeadersMiddleware)


# Dependency injection
def get_search_service() -> FAISSSearchService:
    """Get search service dependency."""
    if search_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search service not initialized"
        )
    return search_service


def get_db_service() -> DatabaseService:
    """Get database service dependency."""
    if db_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service not initialized"
        )
    return db_service


# Endpoints
@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Health check",
    description="Check service health and readiness"
)
async def health_check(
    search: FAISSSearchService = Depends(get_search_service),
    db: DatabaseService = Depends(get_db_service)
) -> HealthResponse:
    """Health check endpoint."""
    try:
        import psutil
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024
    except ImportError:
        memory_mb = 0.0

    # Check database connectivity with lightweight query
    db_connected = False
    try:
        cursor = db.conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        db_connected = True
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        db_connected = False

    return HealthResponse(
        status="ok" if (search.index is not None and db_connected) else "degraded",
        index_loaded=search.index is not None,
        database_connected=db_connected,
        total_vectors=len(search.embeddings) if search.embeddings is not None else 0,
        embedding_dimension=search.embeddings.shape[1] if search.embeddings is not None else 0,
        memory_usage_mb=memory_mb,
        uptime_seconds=time.time() - startup_time
    )


@app.post(
    "/api/search",
    response_model=SearchResponse,
    tags=["search"],
    summary="Semantic search",
    description="Search for music plays using semantic similarity",
    responses={
        200: {"description": "Successful search"},
        400: {"description": "Invalid request"},
        500: {"description": "Search failed"}
    }
)
async def search(
    request: SearchRequest,
    search_svc: FAISSSearchService = Depends(get_search_service),
    db_svc: DatabaseService = Depends(get_db_service)
) -> SearchResponse:
    """Semantic search endpoint."""
    try:
        start_time = time.time()

        # FAISS search (get top 1000)
        faiss_indices, distances = search_svc.search(request.query, k=1000)

        # Map to play IDs
        play_ids = search_svc.get_play_ids(faiss_indices)

        # Apply pagination
        paginated_ids = play_ids[request.offset:request.offset + request.limit]
        paginated_distances = distances[request.offset:request.offset + request.limit]

        # Fetch from SQL
        plays_dict = db_svc.get_plays_by_ids(paginated_ids.tolist())

        # Merge with similarity scores
        results = []
        for play_id, similarity in zip(paginated_ids, paginated_distances):
            play_data = plays_dict.get(int(play_id))
            if play_data:
                results.append(PlayResult(**play_data, similarity=float(similarity)))

        query_time = (time.time() - start_time) * 1000

        return SearchResponse(
            results=results,
            total=len(play_ids),
            query_time_ms=query_time,
            query=request.query
        )

    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@app.get(
    "/api/plays/timeline",
    response_model=TimelineResponse,
    tags=["plays"],
    summary="Get plays chronologically with flexible navigation and MBID filtering",
    description="""
    Browse plays in chronological order (newest first) with multiple navigation methods:
    - **Cursor pagination**: Standard forward/backward navigation
    - **Time-based jump**: Jump to a specific date/time range
    - **Percentage jump**: Jump to a percentage position in the timeline
    - **Anchor jump**: Show plays centered around a specific play ID

    **MBID Filtering** (optional, can be combined with navigation methods):
    - **artist_mbid**: Filter by artist MusicBrainz ID
    - **recording_mbid**: Filter by recording MusicBrainz ID
    - **release_mbid**: Filter by release MusicBrainz ID
    - **release_group_mbid**: Filter by release group MusicBrainz ID

    All methods return the same chronological list with pagination cursor.
    """,
    responses={
        200: {"description": "Timeline page retrieved successfully"},
        400: {"description": "Invalid cursor, parameters, or multiple jump methods"},
        500: {"description": "Query failed"}
    }
)
async def get_timeline(
    limit: int = 50,
    cursor: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    percentage: Optional[float] = None,
    anchor_id: Optional[int] = None,
    artist_mbid: Optional[str] = None,
    recording_mbid: Optional[str] = None,
    release_mbid: Optional[str] = None,
    release_group_mbid: Optional[str] = None,
    db_svc: DatabaseService = Depends(get_db_service)
) -> TimelineResponse:
    """
    Get plays in chronological timeline (newest first) with unified navigation.

    Supports multiple navigation methods (only one at a time):

    **Standard Pagination:**
    - `cursor`: Base64-encoded cursor from previous response
    - `limit`: Number of results (1-200, default 50)

    **Time-Based Jump:**
    - `since`: ISO 8601 datetime (e.g., "2015-03-15T00:00:00")
    - `until`: ISO 8601 datetime (optional, for date range)
    - Example: `/api/plays/timeline?since=2015-03-15T00:00:00&limit=20`

    **Percentage Jump:**
    - `percentage`: Float 0.0-1.0 (0.0 = newest, 1.0 = oldest)
    - Example: `/api/plays/timeline?percentage=0.5&limit=20`

    **Anchor Jump:**
    - `anchor_id`: Play ID to center results around
    - Example: `/api/plays/timeline?anchor_id=3576848&limit=50`

    Args:
        limit: Number of results per page (default 50, max 200)
        cursor: Optional cursor from previous page for pagination
        since: Optional ISO 8601 datetime for time-based filtering (start)
        until: Optional ISO 8601 datetime for time-based filtering (end)
        percentage: Optional float 0.0-1.0 for percentage-based jump
        anchor_id: Optional play ID to center results around
        db_svc: Database service dependency

    Returns:
        TimelineResponse with results, next_cursor, has_more, and optional metadata
    """
    # Validate limit
    if limit < 1 or limit > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 200"
        )

    # Count how many jump methods are being used
    jump_methods = sum([
        cursor is not None,
        since is not None or until is not None,
        percentage is not None,
        anchor_id is not None
    ])

    if jump_methods > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only one navigation method allowed: cursor, time range (since/until), percentage, or anchor_id"
        )

    try:
        start_time = time.time()
        result = None

        # Route to appropriate method based on parameters
        if percentage is not None:
            # Percentage-based jump (uses OFFSET - run in thread to avoid blocking)
            if not 0.0 <= percentage <= 1.0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Percentage must be between 0.0 and 1.0"
                )
            result = await anyio.to_thread.run_sync(
                db_svc.get_plays_by_percentage,
                percentage,
                limit,
                artist_mbid,
                recording_mbid,
                release_mbid,
                release_group_mbid
            )

        elif anchor_id is not None:
            # Anchor-based jump (multiple queries - run in thread)
            result = await anyio.to_thread.run_sync(
                db_svc.get_plays_around_id,
                anchor_id,
                limit,
                artist_mbid,
                recording_mbid,
                release_mbid,
                release_group_mbid
            )

        elif since is not None or until is not None:
            # Time-based jump
            from datetime import datetime
            since_dt = datetime.fromisoformat(since) if since else None
            until_dt = datetime.fromisoformat(until) if until else None
            result = await anyio.to_thread.run_sync(
                db_svc.get_plays_by_time_range,
                since_dt,
                until_dt,
                limit,
                artist_mbid,
                recording_mbid,
                release_mbid,
                release_group_mbid
            )

        else:
            # Standard cursor pagination (fast indexed query - can run directly)
            result = db_svc.get_plays_by_cursor(
                limit=limit,
                cursor=cursor,
                artist_mbid=artist_mbid,
                recording_mbid=recording_mbid,
                release_mbid=release_mbid,
                release_group_mbid=release_group_mbid
            )

        # Convert to PlayResult models (similarity=0 for timeline browsing)
        play_results = [
            PlayResult(**play_data, similarity=0.0)
            for play_data in result['results']
        ]

        query_time = (time.time() - start_time) * 1000

        return TimelineResponse(
            results=play_results,
            next_cursor=result['next_cursor'],
            has_more=result['has_more'],
            query_time_ms=query_time,
            total_count=result.get('total_count'),
            anchor_position=result.get('anchor_position')
        )

    except HTTPException:
        # Re-raise HTTP exceptions (from validation)
        raise
    except ValueError as e:
        # Invalid cursor, datetime, or parameters
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Timeline query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Timeline query failed: {str(e)}"
        )


@app.get(
    "/api/plays/{play_id}",
    response_model=PlayResult,
    tags=["plays"],
    summary="Get play by ID",
    responses={
        200: {"description": "Play found"},
        404: {"description": "Play not found"}
    }
)
async def get_play(
    play_id: int,
    db_svc: DatabaseService = Depends(get_db_service)
) -> PlayResult:
    """Get single play by ID."""
    play = db_svc.get_play_by_id(play_id)
    if not play:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Play {play_id} not found"
        )
    return PlayResult(**play, similarity=0.0)


# Enrichment endpoints

@app.get(
    "/api/plays/batch",
    response_model=BatchPlaysResponse,
    tags=["enrichments"],
    summary="Get multiple plays by IDs",
    description="Fetch multiple plays in a single request using comma-separated IDs",
    responses={
        200: {"description": "Plays retrieved successfully"},
        400: {"description": "Invalid play IDs format"},
        500: {"description": "Batch fetch failed"}
    }
)
async def get_plays_batch(
    play_ids: str,
    db_svc: DatabaseService = Depends(get_db_service)
) -> BatchPlaysResponse:
    """
    Fetch multiple plays by comma-separated IDs.

    Used by the agent to fetch play data for enrichment.
    """
    try:
        # Parse comma-separated IDs
        ids = [int(id.strip()) for id in play_ids.split(",")]

        if not ids:
            raise HTTPException(
                status_code=400,
                detail="No play IDs provided"
            )

        # Fetch plays from database
        plays_dict = db_svc.get_plays_by_ids(ids)

        # Convert to list maintaining order
        plays = []
        for play_id in ids:
            play_data = plays_dict.get(play_id)
            if play_data:
                plays.append(PlayResult(**play_data, similarity=1.0))

        logger.info(f"Fetched {len(plays)} plays for batch request")
        return BatchPlaysResponse(plays=plays)

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid play IDs format: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Batch fetch failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Batch fetch failed: {str(e)}"
        )


@app.post(
    "/api/enrichments",
    response_model=EnrichmentResponse,
    tags=["enrichments"],
    summary="Store enrichments from agent",
    description="Store play enrichments sent from the Cloud Run agent",
    responses={
        200: {"description": "Enrichments stored successfully"},
        401: {"description": "Invalid or missing API key"},
        400: {"description": "Invalid enrichment type"},
        500: {"description": "Failed to store enrichments"}
    }
)
async def create_enrichments(
    request: EnrichmentRequest,
    db_svc: DatabaseService = Depends(get_db_service),
    x_api_key: Optional[str] = Header(None)
) -> EnrichmentResponse:
    """
    Store enrichments from agent.

    Requires X-API-Key header for authentication.
    """
    # Validate API key
    expected_key = os.getenv("FAISS_API_KEY")
    if expected_key:
        if not x_api_key or x_api_key != expected_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key"
            )

    try:
        cursor = db_svc.conn.cursor()

        # Get enrichment type ID
        cursor.execute(
            "SELECT id FROM enrichment_types WHERE name = ?",
            (request.enrichment_type,)
        )
        type_row = cursor.fetchone()

        if not type_row:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown enrichment type: {request.enrichment_type}"
            )

        enrichment_type_id = type_row[0]

        # Insert or update enrichments
        count = 0
        for item in request.enrichments:
            data_json = json.dumps(item.data)

            cursor.execute("""
                INSERT INTO enrichments (play_id, enrichment_type_id, data, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(play_id, enrichment_type_id)
                DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP
            """, (item.play_id, enrichment_type_id, data_json))

            count += 1

        db_svc.conn.commit()

        logger.info(f"Stored {count} enrichments of type '{request.enrichment_type}'")
        return EnrichmentResponse(status="success", count=count)

    except Exception as e:
        db_svc.conn.rollback()
        logger.error(f"Failed to store enrichments: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store enrichments: {str(e)}"
        )


@app.get(
    "/api/enrichments",
    response_model=GetEnrichmentsResponse,
    summary="Get enrichments",
    description="Fetch enrichments with optional filtering by play_id and enrichment_type",
    responses={
        200: {"description": "Enrichments retrieved successfully"},
        500: {"description": "Failed to fetch enrichments"}
    }
)
async def get_enrichments(
    play_id: Optional[int] = None,
    enrichment_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db_svc: DatabaseService = Depends(get_db_service)
) -> GetEnrichmentsResponse:
    """
    Fetch enrichments from database.

    Query parameters:
    - play_id: Filter by specific play ID
    - enrichment_type: Filter by enrichment type name
    - limit: Maximum number of results (default 100)
    - offset: Pagination offset (default 0)
    """
    try:
        cursor = db_svc.conn.cursor()

        # Build query with optional filters
        query = """
            SELECT
                e.id,
                e.play_id,
                et.name as enrichment_type,
                e.data,
                e.created_at,
                e.updated_at
            FROM enrichments e
            JOIN enrichment_types et ON e.enrichment_type_id = et.id
            WHERE 1=1
        """
        params = []

        if play_id is not None:
            query += " AND e.play_id = ?"
            params.append(play_id)

        if enrichment_type is not None:
            query += " AND et.name = ?"
            params.append(enrichment_type)

        # Count total matching records
        count_query = f"SELECT COUNT(*) FROM ({query}) as filtered"
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]

        # Add pagination
        query += " ORDER BY e.updated_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        enrichments = []
        for row in rows:
            enrichments.append(EnrichmentData(
                id=row[0],
                play_id=row[1],
                enrichment_type=row[2],
                data=json.loads(row[3]),
                created_at=row[4],
                updated_at=row[5]
            ))

        logger.info(f"Retrieved {len(enrichments)} enrichments (total: {total})")
        return GetEnrichmentsResponse(enrichments=enrichments, total=total)

    except Exception as e:
        logger.error(f"Failed to fetch enrichments: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch enrichments: {str(e)}"
        )
