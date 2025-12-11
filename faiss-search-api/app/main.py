"""FastAPI application for FAISS semantic search."""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import httpx
from urllib.parse import urlparse, quote
from contextlib import asynccontextmanager
import time
import logging
from typing import Optional
import anyio
import asyncio

from .services.search_service import FAISSSearchService
from .services.db_service import DatabaseService
from .services.hybrid_search_service import HybridSearchService
from .models import (
    SearchRequest, SearchResponse, HealthResponse, PlayResult, TimelineResponse,
    EnrichmentRequest, EnrichmentResponse, BatchPlaysResponse,
    EnrichmentData, GetEnrichmentsResponse, PlayCountResponse,
    HybridSearchRequest, HybridSearchResponse, HybridPlayResult,
    StreamingLinksRequest, StreamingLinksResponse, StreamingLink
)
from .models.insights import (
    CreateInsightsRequest, InsightsResponse, GetInsightsResponse,
    Insight, extract_referenced_mbids, generate_summary
)
from .config import settings
from .routes import embeddings, graph
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
hybrid_search_service: Optional[HybridSearchService] = None
db_service: Optional[DatabaseService] = None
db_service: Optional[DatabaseService] = None
startup_time: float = 0
persistence_task: Optional[asyncio.Task] = None

async def background_persistence_loop():
    """Background task to persist index periodically."""
    logger.info("Starting background persistence loop")
    while True:
        try:
            await asyncio.sleep(60)  # Check every minute
            if search_service:
                search_service.persist_if_needed()
        except asyncio.CancelledError:
            logger.info("Persistence loop cancelled")
            break
        except Exception as e:
            logger.error(f"Persistence loop error: {e}")
            await asyncio.sleep(60)  # Wait before retrying


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    global search_service, hybrid_search_service, db_service, startup_time, persistence_task

    # Startup
    logger.info("Starting FAISS Search API...")
    startup_time = time.time()

    try:
        # Initialize database service (required for timeline)
        db_service = DatabaseService(settings.DATABASE_PATH)
        logger.info("Database service initialized")

        # Initialize search service (requires embedding files)
        # For BGE-small: play_ids.npy, embeddings_384d.index, metadata.json
        # For legacy mpnet: also needs pca_transformer_256d.joblib
        try:
            search_service = FAISSSearchService(
                embeddings_path=settings.EMBEDDINGS_PATH,
                play_ids_path=settings.PLAY_IDS_PATH,
                pca_path=settings.PCA_PATH,
                index_path=settings.INDEX_PATH,
                metadata_path=settings.METADATA_PATH,
                nlist=settings.FAISS_NLIST,
                nprobe=settings.FAISS_NPROBE,
                skip_embeddings_load=True  # FAISS index contains vectors, .npy not needed
            )
            search_service.initialize()
            logger.info("Search service initialized")

            # Initialize hybrid search with FTS5 (zero RAM overhead)
            # FTS5 runs in SQLite - no memory cost vs rank_bm25 Python library
            hybrid_search_service = HybridSearchService(
                db_service=db_service,
                search_service=search_service
            )
            logger.info(f"Hybrid search initialized (FTS5: {hybrid_search_service.fts5_available})")

        except FileNotFoundError as e:
            logger.warning(f"Search service disabled - missing embedding files: {e}")
            logger.warning("To enable search, upload: play_ids.npy, embeddings_384d.index, metadata.json")
            search_service = None
            hybrid_search_service = None

        logger.info("Services initialized successfully")

        # Start persistence loop
        persistence_task = asyncio.create_task(background_persistence_loop())

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}", exc_info=True)
        raise

    yield  # Server runs

    # Shutdown
    # Shutdown
    logger.info("Shutting down...")
    
    # Cancel persistence loop
    if persistence_task:
        persistence_task.cancel()
        try:
            await persistence_task
        except asyncio.CancelledError:
            pass
            
    # Final persist
    if search_service:
        logger.info("Running final index persistence...")
        search_service.persist_if_needed()

    if db_service:
        db_service.close()


class CacheHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add cache headers and security headers to responses.

    Cache strategy:
    - Health endpoint: 30 seconds (dynamic health status)
    - Search endpoint: 1 week (deterministic results, static data)
    - Timeline endpoint: 30 seconds (live updates need fresh data)
    - Single play endpoint: 1 week (play data doesn't change)
    - OpenAPI/Docs: 1 hour (metadata endpoints)
    """

    # Cache durations in seconds
    CACHE_DURATIONS = {
        "/api/health": 30,                    # 30 seconds - health should be fresh
        "/api/search": 604800,                # 1 week (7 days)
        "/api/plays/timeline": 30,            # 30 seconds - live updates need fresh data
        "/api/plays/count": 300,              # 5 minutes - entity play counts are semi-stable
        "/api/plays/": 604800,                # 1 week (for /api/plays/{id} pattern)
        "/api/graph/connections": 604800,     # 1 week - deterministic graph data
        "/api/image-proxy": 2592000,          # 30 days - images are static
        "/openapi.json": 3600,                # 1 hour
        "/docs": 3600,                        # 1 hour
        "/redoc": 3600,                       # 1 hour
    }

    async def dispatch(self, request: Request, call_next):
        """Process request and add headers to response."""
        # Get response from endpoint
        response: Response = await call_next(request)

        # Determine cache duration based on path (GET-only to avoid caching POST bodies)
        if request.method == "GET":
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

# Include routers
app.include_router(embeddings.router)
app.include_router(graph.router)


# Dependency injection
def get_search_service() -> FAISSSearchService:
    """Get search service dependency (required for search endpoints)."""
    if search_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search service not available - embedding files missing"
        )
    return search_service


def get_search_service_optional() -> Optional[FAISSSearchService]:
    """Get search service (optional - returns None if not available)."""
    return search_service


def get_db_service() -> DatabaseService:
    """Get database service dependency."""
    if db_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service not initialized"
        )
    return db_service


def get_hybrid_search_service() -> HybridSearchService:
    """Get hybrid search service dependency (required for hybrid search)."""
    if hybrid_search_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Hybrid search service not available - BM25 index not built"
        )
    return hybrid_search_service


# Wire up graph router's dependency to use our get_db_service
app.dependency_overrides[graph.get_db_service] = get_db_service


# Endpoints
@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Health check",
    description="Check service health and readiness"
)
async def health_check(
    search: Optional[FAISSSearchService] = Depends(get_search_service_optional),
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

    # Determine search status
    search_available = search is not None and search.index is not None
    index_loaded = search_available
    total_vectors = search.index.ntotal if search_available else 0

    # Status: ok if db works, degraded if search missing
    if db_connected:
        api_status = "ok" if search_available else "degraded"
    else:
        api_status = "error"

    # Get embedding dimension from search service
    embedding_dim = search.embedding_dim if search_available else settings.EMBEDDING_DIM

    return HealthResponse(
        status=api_status,
        index_loaded=index_loaded,
        database_connected=db_connected,
        total_vectors=total_vectors,
        embedding_dimension=embedding_dim,
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

        # FAISS search - fetch only what's needed for pagination
        # Add buffer of 100 to handle potential filtering
        internal_k = min(1000, request.offset + request.limit + 100)
        faiss_indices, distances = search_svc.search(request.query, k=internal_k)

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


@app.post(
    "/api/search/hybrid",
    response_model=HybridSearchResponse,
    tags=["search"],
    summary="Hybrid search (BM25 + FAISS)",
    description="""
    Hybrid search combining BM25 keyword search with FAISS semantic search.

    Uses Reciprocal Rank Fusion (RRF) to merge results from both methods.

    **When to use:**
    - Exact matches (artist names, track titles): BM25 excels
    - Semantic queries (mood, style, related concepts): FAISS excels
    - Combined: Best of both worlds

    **Weights:**
    - bm25_weight: Influence of keyword matches (default 0.5)
    - faiss_weight: Influence of semantic similarity (default 0.5)
    - Use bm25_weight=1.0, faiss_weight=0.0 for pure keyword search
    """,
    responses={
        200: {"description": "Successful search"},
        400: {"description": "Invalid request"},
        503: {"description": "Hybrid search not available"},
        500: {"description": "Search failed"}
    }
)
async def hybrid_search(
    request: HybridSearchRequest,
    hybrid_svc: HybridSearchService = Depends(get_hybrid_search_service),
    db_svc: DatabaseService = Depends(get_db_service)
) -> HybridSearchResponse:
    """Hybrid search endpoint combining BM25 and FAISS."""
    try:
        start_time = time.time()

        # Perform hybrid search
        results = hybrid_svc.search(
            query=request.query,
            k=request.limit,
            bm25_weight=request.bm25_weight,
            faiss_weight=request.faiss_weight,
            use_expansion=request.use_expansion
        )

        # Get play IDs for database lookup
        play_ids = [r.play_id for r in results]

        # Fetch full play data from database
        plays_dict = db_svc.get_plays_by_ids(play_ids)

        # Merge hybrid results with play data
        hybrid_results = []
        for result in results:
            play_data = plays_dict.get(result.play_id)
            if play_data:
                hybrid_results.append(HybridPlayResult(
                    id=result.play_id,
                    artist=play_data.get('artist', ''),
                    song=play_data.get('song', ''),
                    rrf_score=result.rrf_score,
                    bm25_rank=result.bm25_rank,
                    faiss_rank=result.faiss_rank,
                    faiss_score=result.faiss_score,
                    album=play_data.get('album'),
                    airdate=play_data.get('airdate'),
                    release_date=play_data.get('release_date'),
                    labels=play_data.get('labels', []),
                    rotation_status=play_data.get('rotation_status'),
                    is_local=play_data.get('is_local', False),
                    is_live=play_data.get('is_live', False),
                    is_request=play_data.get('is_request', False),
                    comment=play_data.get('comment'),
                    show=play_data.get('show', 0),
                    image_uri=play_data.get('image_uri'),
                    thumbnail_uri=play_data.get('thumbnail_uri'),
                    artist_mbid=play_data.get('artist_mbid'),
                    recording_mbid=play_data.get('recording_mbid'),
                    release_mbid=play_data.get('release_mbid'),
                    release_group_mbid=play_data.get('release_group_mbid')
                ))

        query_time = (time.time() - start_time) * 1000

        return HybridSearchResponse(
            results=hybrid_results,
            total=len(hybrid_results),
            query_time_ms=query_time,
            query=request.query,
            bm25_weight=request.bm25_weight,
            faiss_weight=request.faiss_weight
        )

    except Exception as e:
        logger.error(f"Hybrid search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hybrid search failed: {str(e)}"
        )


def _choose_source(req: StreamingLinksRequest) -> Optional[str]:
    if req.recording_mbid:
        return "recording_mbid"
    if req.release_group_mbid:
        return "release_group_mbid"
    if req.release_mbid:
        return "release_mbid"
    if req.artist_mbid:
        return "artist_mbid"
    return None


@app.get(
    "/api/streaming-links",
    response_model=StreamingLinksResponse,
    tags=["streaming"],
    summary="Build streaming links from MBIDs",
    description="Returns Spotify/Apple Music search links using play metadata resolved from MusicBrainz IDs."
)
async def streaming_links(
    request: StreamingLinksRequest = Depends(),
    db_svc: DatabaseService = Depends(get_db_service),
) -> StreamingLinksResponse:
    """Create platform search links based on MBIDs."""
    source = _choose_source(request)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one MBID (recording_mbid, release_group_mbid, release_mbid, artist_mbid)"
        )

    play = db_svc.get_first_play_by_mbids(
        recording_mbid=request.recording_mbid,
        release_group_mbid=request.release_group_mbid,
        release_mbid=request.release_mbid,
        artist_mbid=request.artist_mbid
    )

    if play is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No play found for {source}"
        )

    artist = play.get("artist") or ""
    song = play.get("song") or ""
    album = play.get("album") or ""

    # Prefer song + artist; fallback to album or artist-only search
    primary_term = f"{artist} {song}".strip() or f"{artist} {album}".strip() or artist or album
    album_term = f"{artist} {album}".strip() if album else None

    storefront = request.storefront or "us"

    def spotify_search(term: str) -> str:
        return f"https://open.spotify.com/search/{quote(term)}"

    def apple_music_search(term: str) -> str:
        return f"https://music.apple.com/{storefront}/search?term={quote(term)}"

    links: list[StreamingLink] = []

    if primary_term:
        confidence = 0.8 if source == "recording_mbid" else 0.6
        links.append(StreamingLink(
            platform="spotify",
            kind="track",
            url=spotify_search(primary_term),
            display=primary_term,
            confidence=confidence,
            source=source,  # type: ignore[arg-type]
        ))
        links.append(StreamingLink(
            platform="apple_music",
            kind="track",
            url=apple_music_search(primary_term),
            display=primary_term,
            confidence=confidence,
            source=source,  # type: ignore[arg-type]
        ))

    if album_term:
        confidence = 0.5 if source in {"release_group_mbid", "release_mbid"} else 0.4
        links.append(StreamingLink(
            platform="spotify",
            kind="album",
            url=spotify_search(album_term),
            display=album_term,
            confidence=confidence,
            source=source,  # type: ignore[arg-type]
        ))
        links.append(StreamingLink(
            platform="apple_music",
            kind="album",
            url=apple_music_search(album_term),
            display=album_term,
            confidence=confidence,
            source=source,  # type: ignore[arg-type]
        ))

    if not links:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unable to build streaming links from provided MBIDs"
        )

    return StreamingLinksResponse(
        links=links,
        resolved_from=source,  # type: ignore[arg-type]
        resolved_ids=None,
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
    "/api/plays/count",
    response_model=PlayCountResponse,
    tags=["plays"],
    summary="Get play count by MBID",
    description="""
    Count plays matching MBID filters. Used for entity page headers.

    At least one MBID filter must be provided. Returns the count of matching plays.

    **Examples:**
    - `/api/plays/count?artist_mbid=a74b1b7f-71a5-4011-9441-d0b5e4122711` - Count plays by Radiohead
    - `/api/plays/count?recording_mbid=...` - Count plays of a specific recording
    - `/api/plays/count?release_group_mbid=...` - Count plays from an album
    """,
    responses={
        200: {"description": "Count retrieved successfully"},
        400: {"description": "No MBID filter provided"},
        500: {"description": "Query failed"}
    }
)
async def get_play_count(
    artist_mbid: Optional[str] = None,
    recording_mbid: Optional[str] = None,
    release_mbid: Optional[str] = None,
    release_group_mbid: Optional[str] = None,
    db_svc: DatabaseService = Depends(get_db_service)
) -> PlayCountResponse:
    """Get count of plays matching MBID filter."""
    # Require at least one MBID filter
    if not any([artist_mbid, recording_mbid, release_mbid, release_group_mbid]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one MBID filter is required (artist_mbid, recording_mbid, release_mbid, or release_group_mbid)"
        )

    try:
        start_time = time.time()

        count = db_svc.get_play_count(
            artist_mbid=artist_mbid,
            recording_mbid=recording_mbid,
            release_mbid=release_mbid,
            release_group_mbid=release_group_mbid
        )

        query_time = (time.time() - start_time) * 1000

        # Determine which entity type was filtered
        entity_type = None
        mbid = None
        if artist_mbid:
            entity_type = "artist"
            mbid = artist_mbid
        elif recording_mbid:
            entity_type = "recording"
            mbid = recording_mbid
        elif release_mbid:
            entity_type = "release"
            mbid = release_mbid
        elif release_group_mbid:
            entity_type = "release_group"
            mbid = release_group_mbid

        return PlayCountResponse(
            count=count,
            entity_type=entity_type,
            mbid=mbid,
            query_time_ms=query_time
        )

    except Exception as e:
        logger.error(f"Play count query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Play count query failed: {str(e)}"
        )


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

        # Enforce maximum batch size for safety
        if len(ids) > 500:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum 500 IDs allowed, got {len(ids)}"
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


@app.post(
    "/api/enrichments",
    response_model=EnrichmentResponse,
    tags=["enrichments"],
    summary="Bulk store enrichments",
    description="""
    Store play enrichments in bulk.

    **Optimized for large uploads:** Uses bulk insert for high throughput (~10k items/sec).

    **Auto-creates enrichment types:** If the type doesn't exist, it will be created.

    **Authentication:** Requires X-API-Key header if FAISS_API_KEY is set.

    **Usage from Colab:**
    ```python
    import httpx
    with open('chunk_0000.json', 'r') as f:
        data = json.load(f)
    response = httpx.post(
        'https://api.example.com/api/enrichments',
        json=data,
        headers={'X-API-Key': 'your-key'},
        timeout=300
    )
    ```
    """,
    responses={
        200: {"description": "Enrichments stored successfully"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Failed to store enrichments"}
    }
)
async def create_enrichments(
    request: EnrichmentRequest,
    db_svc: DatabaseService = Depends(get_db_service),
    x_api_key: Optional[str] = Header(None)
) -> EnrichmentResponse:
    """
    Bulk store enrichments.

    Optimized for large uploads with:
    - Auto-creation of enrichment types
    - Bulk insert using executemany
    - Upsert behavior (update if exists)

    Requires X-API-Key header for authentication if FAISS_API_KEY env var is set.
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
        # Auto-create enrichment type if it doesn't exist
        enrichment_type_id = db_svc.ensure_enrichment_type(request.enrichment_type)

        # Prepare enrichments for bulk insert
        enrichments = [
            {'play_id': item.play_id, 'data': item.data}
            for item in request.enrichments
        ]

        # Bulk insert using optimized method
        count = db_svc.bulk_insert_enrichments(enrichment_type_id, enrichments)

        logger.info(f"Bulk stored {count:,} enrichments of type '{request.enrichment_type}'")
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


# =============================================================================
# Insights API - Typed insight storage
# =============================================================================

@app.post(
    "/api/insights",
    response_model=InsightsResponse,
    tags=["insights"],
    summary="Bulk store typed insights",
    description="""
    Store typed insights from the Crate Research Agent.

    Unlike the generic `/api/enrichments` endpoint, this validates insight
    structure using discriminated union types (Concert, Cover, Sample, etc.)
    and extracts referenced MBIDs for efficient entity queries.

    **Insight Types:**
    - `Concert`: Live performance mention
    - `Cover`: Cover song reference
    - `Sample`: Sampling relationship
    - `PlayHistory`: Play history statistics
    - `Connection`: Artist/label connection
    - `Link`: External link content
    """,
    responses={
        200: {"description": "Insights stored successfully"},
        400: {"description": "Invalid insight structure"},
        401: {"description": "Invalid API key"},
        500: {"description": "Failed to store insights"}
    }
)
async def create_insights(
    request: CreateInsightsRequest,
    x_api_key: str = Header(None)
):
    """
    Store typed insights from agent.

    Validates insight structure and extracts MBIDs for indexing.
    """
    global db_service

    # API key check (if configured)
    api_key = os.getenv("FAISS_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        # Transform Pydantic models to dicts for database
        insight_dicts = []

        # Convert eval_context to dict if present
        eval_context_dict = request.eval_context.model_dump() if request.eval_context else None

        for insight in request.insights:
            # Get the insight tag (type discriminator)
            tag = insight.tag if hasattr(insight, 'tag') else insight.model_dump().get("_tag")

            # Extract referenced MBIDs for indexing
            ref_mbids = extract_referenced_mbids(insight)

            # Generate summary
            summary = generate_summary(insight)

            # Prepare dict for database
            insight_dict = {
                'insight_type': tag,
                'play_id': insight.playId,
                'confidence': insight.confidence,
                'source_type': insight.sourceType,
                'source_recording_mbid': insight.sourceRecordingMbid,
                'source_release_mbid': insight.sourceReleaseMbid,
                'source_artist_mbids': insight.sourceArtistMbids,
                'referenced_artist_mbid': ref_mbids.get('referenced_artist_mbid'),
                'referenced_recording_mbid': ref_mbids.get('referenced_recording_mbid'),
                'referenced_release_mbid': ref_mbids.get('referenced_release_mbid'),
                'referenced_label_mbid': ref_mbids.get('referenced_label_mbid'),
                'data': insight.model_dump(),
                'summary': summary,
                'eval_context': eval_context_dict,  # Shared across all insights in batch
            }
            insight_dicts.append(insight_dict)

        # Bulk insert
        insight_ids = db_service.bulk_insert_insights(insight_dicts)

        logger.info(f"Stored {len(insight_ids)} typed insights")
        return InsightsResponse(
            status="success",
            count=len(insight_ids),
            insight_ids=insight_ids
        )

    except Exception as e:
        logger.error(f"Failed to store insights: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store insights: {str(e)}"
        )


@app.get(
    "/api/insights",
    response_model=GetInsightsResponse,
    tags=["insights"],
    summary="Query insights",
    description="""
    Query typed insights with filters.

    **Filters:**
    - `play_id`: Get insights for a specific play
    - `insight_type`: Filter by type (Concert, Cover, etc.)
    - `artist_mbid`: Find insights referencing an artist
    - `confidence`: Filter by confidence level
    """,
    responses={
        200: {"description": "Insights retrieved successfully"},
        500: {"description": "Failed to query insights"}
    }
)
async def get_insights(
    play_id: Optional[int] = None,
    insight_type: Optional[str] = None,
    artist_mbid: Optional[str] = None,
    confidence: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Query insights with optional filters.
    """
    global db_service

    try:
        result = db_service.get_insights(
            insight_type=insight_type,
            play_id=play_id,
            artist_mbid=artist_mbid,
            confidence=confidence,
            limit=limit,
            offset=offset
        )

        logger.info(f"Retrieved {len(result['insights'])} insights (total: {result['total']})")
        return GetInsightsResponse(
            insights=result['insights'],
            total=result['total']
        )

    except Exception as e:
        logger.error(f"Failed to query insights: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query insights: {str(e)}"
        )


@app.get(
    "/api/insights/plays/{play_id}",
    tags=["insights"],
    summary="Get insights for a play",
    description="Get all insights for a specific play, optionally grouped by type.",
    responses={
        200: {"description": "Insights retrieved successfully"},
        500: {"description": "Failed to fetch insights"}
    }
)
async def get_insights_for_play(play_id: int):
    """
    Get all insights for a specific play.
    """
    global db_service

    try:
        insights = db_service.get_insights_for_play(play_id)

        logger.info(f"Retrieved {len(insights)} insights for play {play_id}")
        return {
            "play_id": play_id,
            "insights": insights,
            "total": len(insights)
        }

    except Exception as e:
        logger.error(f"Failed to get insights for play {play_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get insights: {str(e)}"
        )


@app.get(
    "/api/insights/context",
    tags=["insights"],
    summary="Get insights from same show context",
    description="Get insights for plays within a time window around a given play. "
                "Provides 'same show' context for what's been discussed nearby on the timeline.",
    responses={
        200: {"description": "Context insights retrieved successfully"},
        500: {"description": "Failed to fetch context insights"}
    }
)
async def get_insights_for_context(
    play_id: int,
    window_hours: int = 3,
    limit: int = 20
):
    """
    Get insights for plays within a time window around a given play.

    This enables "same show" context - insights from plays aired close
    in time to the target play, providing awareness of what's been
    discussed on the show.

    Args:
        play_id: The center play to build context around
        window_hours: Hours before/after to include (default 3 = typical show length)
        limit: Max insights to return (default 20)
    """
    global db_service

    try:
        result = db_service.get_insights_for_context(
            play_id=play_id,
            window_hours=window_hours,
            limit=limit
        )

        logger.info(
            f"Retrieved {result['total']} context insights for play {play_id} "
            f"(±{window_hours}h window)"
        )
        return result

    except Exception as e:
        logger.error(
            f"Failed to get context insights for play {play_id}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get context insights: {str(e)}"
        )


@app.delete(
    "/api/insights/{insight_id}",
    tags=["insights"],
    summary="Soft delete an insight",
    description="Soft delete an insight (sets deleted_at timestamp).",
    responses={
        200: {"description": "Insight deleted successfully"},
        404: {"description": "Insight not found"},
        401: {"description": "Invalid API key"},
        500: {"description": "Failed to delete insight"}
    }
)
async def delete_insight(
    insight_id: int,
    x_api_key: str = Header(None)
):
    """
    Soft delete an insight.
    """
    global db_service

    # API key check (if configured)
    api_key = os.getenv("FAISS_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        deleted = db_service.soft_delete_insight(insight_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Insight not found")

        logger.info(f"Soft deleted insight {insight_id}")
        return {"status": "deleted", "insight_id": insight_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete insight {insight_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete insight: {str(e)}"
        )


# Image proxy endpoint - bypasses CORS for album art
# Allowed domains for security (prevent open proxy abuse)
ALLOWED_IMAGE_DOMAINS = {
    "archive.org",
    "ia601500.us.archive.org",  # archive.org CDN variants
    "ia800100.us.archive.org",
    "coverartarchive.org",
    "kexp.org",
    "www.kexp.org",
    "static.kexp.org",
}


@app.get(
    "/api/image-proxy",
    tags=["media"],
    summary="Proxy images to bypass CORS",
    description="""
    Proxies external images through the API server to bypass CORS restrictions.

    **Security:** Only allows images from trusted domains (archive.org, kexp.org, coverartarchive.org).

    **Caching:** Responses are cached for 30 days by both the server and client.

    **Usage:** `/api/image-proxy?url=https://archive.org/...`
    """,
    responses={
        200: {"description": "Image content streamed"},
        400: {"description": "Invalid URL or domain not allowed"},
        404: {"description": "Image not found"},
        502: {"description": "Failed to fetch image from origin"}
    }
)
async def image_proxy(url: str):
    """
    Proxy image requests to bypass CORS.

    Validates the domain is in the allowed list to prevent open proxy abuse.
    Streams the image content with appropriate content-type headers.
    """
    # Parse and validate URL
    try:
        parsed = urlparse(url)
        if not parsed.scheme in ('http', 'https'):
            raise ValueError("Invalid URL scheme")
        if not parsed.netloc:
            raise ValueError("Invalid URL format")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid URL: {str(e)}"
        )

    # Check domain is allowed - also check if it ends with allowed domain (for CDN subdomains)
    domain = parsed.netloc.lower()
    allowed = domain in ALLOWED_IMAGE_DOMAINS
    if not allowed:
        # Check if it's a subdomain of an allowed domain
        for allowed_domain in ALLOWED_IMAGE_DOMAINS:
            if domain.endswith('.' + allowed_domain) or domain.endswith('archive.org'):
                allowed = True
                break

    if not allowed:
        logger.warning(f"Image proxy: blocked domain {domain}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain not allowed: {domain}. Only archive.org, kexp.org, and coverartarchive.org images can be proxied."
        )

    # Fetch the image
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, follow_redirects=True)

            if response.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Image not found"
                )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to fetch image: HTTP {response.status_code}"
                )

            # Validate content type is an image
            content_type = response.headers.get('content-type', '')
            if not content_type.startswith('image/'):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"URL does not point to an image: {content_type}"
                )

            # Return streaming response with proper headers
            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=2592000",  # 30 days
                    "Access-Control-Allow-Origin": "*",
                }
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timeout fetching image from origin"
        )
    except httpx.RequestError as e:
        logger.error(f"Image proxy fetch error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch image: {str(e)}"
        )
