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
from .services.sync import IndexSynchronizer
from .models import (
    SearchRequest, SearchResponse, HealthResponse, PlayResult, TimelineResponse,
    EnrichmentRequest, EnrichmentResponse, BatchPlaysResponse,
    EnrichmentData, GetEnrichmentsResponse, PlayCountResponse, UnprocessedPlaysResponse,
    HybridSearchRequest, HybridSearchResponse, HybridPlayResult,
    StreamingLinksRequest, StreamingLinksResponse, StreamingLink,
    DataHealthResponse, TableHealth
)
from .models.insights import (
    CreateInsightsRequest, InsightsResponse, GetInsightsResponse,
    Insight, extract_referenced_mbids, generate_summary
)
from .models.agent_runs import (
    SaveAgentRunRequest, SaveAgentRunResponse,
    ListAgentRunsResponse, AgentRunSummary, AgentRunDetail,
    DeleteAgentRunResponse
)
from .models.generated_assets import (
    StoreGeneratedAssetRequest, StoreGeneratedAssetResponse,
    GeneratedAsset, GetGeneratedAssetsResponse,
)
from .config import settings
from .routes import embeddings, graph, summary
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
index_synchronizer: IndexSynchronizer = IndexSynchronizer()  # Shared lock for /add vs /integrate
startup_time: float = 0
persistence_task: Optional[asyncio.Task] = None

# Request size limits
MAX_EMBEDDING_REQUEST_SIZE = 500 * 1024 * 1024  # 500MB - aligned with nginx

async def background_persistence_loop():
    """Background task to persist index periodically.

    Uses asyncio.to_thread() to run sync persistence in thread pool,
    preventing event loop stalls as persistence data grows.

    IMPORTANT: Skips persistence if integration is in progress to avoid
    overwriting a freshly rebuilt index.
    """
    logger.info("Starting background persistence loop")
    while True:
        try:
            await asyncio.sleep(60)  # Check every minute
            if search_service:
                # Skip if integration is running - index is being rebuilt
                # This prevents overwriting a freshly rebuilt index on disk
                if index_synchronizer.is_locked:
                    logger.debug("Skipping persistence: integration in progress")
                    continue

                # Run sync persistence in thread pool to avoid blocking event loop
                await asyncio.to_thread(search_service.persist_if_needed)
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

        # Initialize daily summary tables
        db_service.init_daily_summary_tables()

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


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce request size limits on embedding endpoints.

    Prevents memory exhaustion from oversized requests.
    Returns 413 (Request Entity Too Large) if limit exceeded.
    """

    async def dispatch(self, request: Request, call_next):
        """Check content-length for embedding endpoints."""
        if request.url.path.startswith("/api/embeddings"):
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > MAX_EMBEDDING_REQUEST_SIZE:
                        return Response(
                            content=f"Request too large. Max: {MAX_EMBEDDING_REQUEST_SIZE // (1024*1024)}MB",
                            status_code=413,
                            headers={"Content-Type": "text/plain"}
                        )
                except ValueError:
                    pass  # Invalid content-length header, let it through
        return await call_next(request)


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
# CORS is handled by nginx reverse proxy (nginx.conf) to avoid duplicate headers.
# Do NOT add CORSMiddleware here - nginx adds Access-Control-Allow-* headers
# for all responses including preflight OPTIONS requests.
#
# If running without nginx (local development), uncomment the middleware below:
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.cors_origins_list,
#     allow_credentials=False,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CacheHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)  # Enforce 500MB limit on embedding endpoints

# Include routers
app.include_router(embeddings.router)
app.include_router(graph.router)
app.include_router(summary.router)


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


# Critical tables with minimum expected row counts for data completeness
CRITICAL_TABLES = {
    "fact_plays": 2_000_000,      # ~2.2M plays - CRITICAL if empty
    "insights": 0,                 # Grows over time, may be empty
    "mb_artists": 50_000,          # ~68K expected
    "mb_recordings": 100_000,      # ~163K expected
    "play_artists": 1_500_000,     # ~1.8M expected
}


@app.get(
    "/api/health/data",
    response_model=DataHealthResponse,
    tags=["health"],
    summary="Data completeness check",
    description="Verify database data completeness - row counts, recent data, critical tables"
)
async def data_health_check(
    db: DatabaseService = Depends(get_db_service)
) -> DataHealthResponse:
    """Data completeness health check endpoint."""
    from datetime import datetime, timedelta

    warnings = []
    errors = []
    tables = []

    # Get database file size
    db_size = 0
    try:
        import os
        db_size = os.path.getsize(db.db_path)
    except Exception:
        pass

    # Check table row counts
    cursor = db.conn.cursor()
    for table_name, min_expected in CRITICAL_TABLES.items():
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]

            if count == 0 and min_expected > 0:
                status = "critical"
                message = f"EMPTY (expected >= {min_expected:,})"
                errors.append(f"Empty table: {table_name}")
            elif count < min_expected:
                status = "warning"
                message = f"Below minimum ({count:,} < {min_expected:,})"
                warnings.append(f"Low row count in {table_name}: {count:,}")
            else:
                status = "ok"
                message = f"{count:,} rows"

            tables.append(TableHealth(
                name=table_name,
                row_count=count,
                min_expected=min_expected,
                status=status,
                message=message
            ))
        except Exception as e:
            tables.append(TableHealth(
                name=table_name,
                row_count=-1,
                min_expected=min_expected,
                status="critical",
                message=f"Table missing: {str(e)}"
            ))
            errors.append(f"Missing table: {table_name}")

    # Check for recent plays (within last 7 days)
    recent_plays_exist = False
    latest_play_date = None
    try:
        cursor.execute("SELECT MAX(airdate) FROM fact_plays")
        result = cursor.fetchone()
        if result and result[0]:
            latest_play_date = result[0]
            # Parse the date and check if it's recent
            try:
                latest_dt = datetime.fromisoformat(latest_play_date.replace('Z', '+00:00'))
                seven_days_ago = datetime.now(latest_dt.tzinfo) - timedelta(days=7)
                recent_plays_exist = latest_dt > seven_days_ago
                if not recent_plays_exist:
                    warnings.append(f"No plays in last 7 days (latest: {latest_play_date})")
            except Exception:
                # If date parsing fails, just report the date
                pass
    except Exception as e:
        errors.append(f"Could not check recent plays: {str(e)}")

    # Determine overall status
    if errors:
        overall_status = "critical"
    elif warnings:
        overall_status = "warning"
    else:
        overall_status = "healthy"

    return DataHealthResponse(
        status=overall_status,
        checked_at=datetime.now().isoformat(),
        db_size_bytes=db_size,
        tables=tables,
        recent_plays_exist=recent_plays_exist,
        latest_play_date=latest_play_date,
        warnings=warnings,
        errors=errors
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
    # FAISS limitation: we can only retrieve top-k results, not true pagination
    # Max offset of 900 allows for limit up to 100 within the 1000 result cap
    MAX_OFFSET = 900
    if request.offset > MAX_OFFSET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Offset exceeds maximum of {MAX_OFFSET}. "
                   "FAISS semantic search is limited to the top ~1000 most similar results. "
                   "Consider using more specific search terms to narrow results."
        )

    try:
        start_time = time.time()

        # FAISS search - fetch only what's needed for pagination
        # Add buffer of 100 to handle potential filtering
        internal_k = min(1000, request.offset + request.limit + 100)

        # ATOMIC: search + ID mapping under same lock in thread pool
        # Uses search_and_map() to prevent hot_reload() from interleaving
        # between search and ID mapping (race condition fix)
        play_ids, distances = await asyncio.to_thread(
            search_svc.search_and_map, request.query, internal_k
        )

        # Apply pagination
        paginated_ids = play_ids[request.offset:request.offset + request.limit]
        paginated_distances = distances[request.offset:request.offset + request.limit]

        # Fetch from SQL (run in thread pool for consistency)
        plays_dict = await asyncio.to_thread(
            db_svc.get_plays_by_ids, paginated_ids.tolist()
        )

        # Merge with similarity scores
        results = []
        for play_id, similarity in zip(paginated_ids, paginated_distances):
            play_data = plays_dict.get(int(play_id))
            if play_data:
                results.append(PlayResult(**play_data, similarity=float(similarity)))

        query_time = (time.time() - start_time) * 1000

        # Add note if results may be capped by FAISS limit
        note = None
        if len(play_ids) >= internal_k - 10:  # Close to the cap
            note = (
                f"Showing top {len(play_ids)} most similar results. "
                "FAISS returns approximate nearest neighbors, not exhaustive search."
            )

        return SearchResponse(
            results=results,
            total=len(play_ids),
            query_time_ms=query_time,
            query=request.query,
            note=note
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

        # Perform hybrid search (run in thread pool - involves embedding + FAISS)
        results = await asyncio.to_thread(
            hybrid_svc.search,
            request.query,
            request.limit,
            request.bm25_weight,
            request.faiss_weight,
            request.use_expansion
        )

        # Get play IDs for database lookup
        play_ids = [r.play_id for r in results]

        # Fetch full play data from database (run in thread pool)
        plays_dict = await asyncio.to_thread(
            db_svc.get_plays_by_ids, play_ids
        )

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


@app.get(
    "/api/plays/unprocessed",
    response_model=UnprocessedPlaysResponse,
    tags=["plays"],
    summary="Get plays without insights",
    description="""
    Find plays that haven't been enriched with insights yet.

    Used by Cloud Scheduler to trigger batch enrichment jobs.
    Supports different selection strategies for varied processing patterns.

    **Strategies:**
    - `oldest_first` (default): Process oldest unprocessed plays first
    - `newest_first`: Process most recent unprocessed plays first
    - `random`: Random sample for varied coverage

    **Example Cloud Scheduler usage:**
    ```
    GET /api/plays/unprocessed?limit=10&strategy=oldest_first
    ```
    """,
    responses={
        200: {"description": "Unprocessed plays retrieved successfully"},
        500: {"description": "Query failed"}
    }
)
async def get_unprocessed_plays(
    limit: int = 50,
    strategy: str = "oldest_first",
    min_play_id: Optional[int] = None,
    db_svc: DatabaseService = Depends(get_db_service)
) -> UnprocessedPlaysResponse:
    """
    Get plays that don't have any insights yet.

    Returns play IDs for use with the agent /enrich-batch endpoint.
    """
    if strategy not in ["oldest_first", "newest_first", "random"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid strategy: {strategy}. Must be one of: oldest_first, newest_first, random"
        )

    if limit < 1 or limit > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 500"
        )

    try:
        start_time = time.time()

        result = db_svc.get_unprocessed_plays(
            limit=limit,
            strategy=strategy,
            min_play_id=min_play_id
        )

        query_time = (time.time() - start_time) * 1000

        return UnprocessedPlaysResponse(
            play_ids=result['play_ids'],
            count=result['count'],
            total_unprocessed=result['total_unprocessed'],
            strategy=result['strategy'],
            query_time_ms=query_time
        )

    except Exception as e:
        logger.error(f"Unprocessed plays query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unprocessed plays query failed: {str(e)}"
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

# Maximum redirects to follow for image proxy (prevents redirect loops)
MAX_IMAGE_PROXY_REDIRECTS = 5


def is_domain_allowed(domain: str) -> bool:
    """Check if a domain is in the allowed list for image proxy."""
    domain = domain.lower()
    if domain in ALLOWED_IMAGE_DOMAINS:
        return True
    # Check if it's a subdomain of an allowed domain
    # SECURITY: Must use '.' prefix to prevent evilarchive.org from matching archive.org
    for allowed_domain in ALLOWED_IMAGE_DOMAINS:
        if domain.endswith('.' + allowed_domain):
            return True
    return False


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

    # Check domain is allowed
    domain = parsed.netloc.lower()
    if not is_domain_allowed(domain):
        logger.warning(f"Image proxy: blocked domain {domain}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Domain not allowed: {domain}. Only archive.org, kexp.org, and coverartarchive.org images can be proxied."
        )

    # Fetch the image with manual redirect handling (SSRF protection)
    # We validate each redirect target to prevent redirecting to internal/disallowed hosts
    try:
        current_url = url
        async with httpx.AsyncClient(timeout=30.0) as client:
            for redirect_count in range(MAX_IMAGE_PROXY_REDIRECTS + 1):
                response = await client.get(current_url, follow_redirects=False)

                # Handle redirects manually
                if response.status_code in (301, 302, 303, 307, 308):
                    redirect_url = response.headers.get('location')
                    if not redirect_url:
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Redirect response missing location header"
                        )

                    # Resolve relative redirects
                    from urllib.parse import urljoin
                    redirect_url = urljoin(current_url, redirect_url)

                    # Validate redirect target domain
                    redirect_parsed = urlparse(redirect_url)
                    redirect_domain = redirect_parsed.netloc.lower()

                    if not is_domain_allowed(redirect_domain):
                        logger.warning(
                            f"Image proxy: blocked redirect to {redirect_domain} (from {domain})"
                        )
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Redirect to disallowed domain: {redirect_domain}"
                        )

                    current_url = redirect_url
                    continue  # Follow the redirect

                # Not a redirect, break the loop
                break
            else:
                # Exceeded max redirects
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Too many redirects (>{MAX_IMAGE_PROXY_REDIRECTS})"
                )

            if response.status_code == 404:
                # Return cacheable 404 to prevent repeated requests for known-broken images
                return Response(
                    content=b'',
                    status_code=404,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # 1 hour
                    }
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
            # Note: CORS headers are handled by nginx, don't add them here
            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=604800",  # 7 days
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


# =============================================================================
# Agent Runs API - Session persistence for crash recovery and observability
# =============================================================================

@app.post(
    "/api/agent-runs",
    response_model=SaveAgentRunResponse,
    tags=["agent-runs"],
    summary="Save agent run checkpoint",
    description="""
    Save or update an agent session checkpoint.

    Used for:
    - Crash recovery: Resume interrupted sessions
    - Multi-agent handoff: Pass session state between agents
    - Observability: Audit trail of agent activity

    **Status Values:**
    - `running`: Session in progress
    - `completed`: Finished successfully
    - `failed`: Terminated with error
    - `paused`: Manually paused for handoff
    """,
    responses={
        200: {"description": "Checkpoint saved successfully"},
        401: {"description": "Invalid API key"},
        500: {"description": "Failed to save checkpoint"}
    }
)
async def save_agent_run(
    request: SaveAgentRunRequest,
    x_api_key: str = Header(None)
):
    """Save or update an agent run checkpoint."""
    global db_service

    # Check if agent runs are paused
    if os.getenv("PAUSE_AGENT_RUNS", "").lower() in ("1", "true", "yes"):
        logger.info("Agent runs paused - skipping save")
        return SaveAgentRunResponse(
            status="paused",
            session_id=request.sessionId,
            insight_count=0,
            tool_call_count=0
        )

    # API key check (if configured)
    api_key = os.getenv("FAISS_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        # Convert Pydantic model to dict
        run_data = request.model_dump(by_alias=False)

        session_id, was_created = db_service.save_agent_run(run_data)

        logger.info(
            f"{'Created' if was_created else 'Updated'} agent run: {session_id} "
            f"({len(run_data.get('insights', []))} insights, "
            f"{len(run_data.get('toolCalls', []))} tool calls)"
        )

        return SaveAgentRunResponse(
            status="created" if was_created else "updated",
            session_id=session_id,
            insight_count=len(run_data.get('insights', [])),
            tool_call_count=len(run_data.get('toolCalls', []))
        )

    except Exception as e:
        logger.error(f"Failed to save agent run: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save agent run: {str(e)}"
        )


@app.get(
    "/api/agent-runs/incomplete",
    response_model=ListAgentRunsResponse,
    tags=["agent-runs"],
    summary="Find incomplete runs for recovery",
    description="Find agent runs with status='running' that may need recovery after a crash.",
    responses={
        200: {"description": "List of incomplete runs"},
        500: {"description": "Failed to fetch incomplete runs"}
    }
)
async def get_incomplete_agent_runs():
    """Find incomplete agent runs for crash recovery."""
    global db_service

    try:
        runs = db_service.get_incomplete_agent_runs()

        return ListAgentRunsResponse(
            runs=[AgentRunSummary(**r) for r in runs],
            total=len(runs),
            limit=100,
            offset=0
        )

    except Exception as e:
        logger.error(f"Failed to fetch incomplete runs: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch incomplete runs: {str(e)}"
        )


@app.get(
    "/api/agent-runs/{session_id}",
    response_model=AgentRunDetail,
    tags=["agent-runs"],
    summary="Get agent run by session ID",
    description="Retrieve full agent run data including insights, tool calls, and entities.",
    responses={
        200: {"description": "Agent run data"},
        404: {"description": "Session not found"},
        500: {"description": "Failed to fetch agent run"}
    }
)
async def get_agent_run(session_id: str):
    """Get a single agent run by session ID."""
    global db_service

    try:
        run = db_service.get_agent_run(session_id)

        if run is None:
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

        return AgentRunDetail(**run)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch agent run: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch agent run: {str(e)}"
        )


@app.get(
    "/api/agent-runs",
    response_model=ListAgentRunsResponse,
    tags=["agent-runs"],
    summary="List agent runs",
    description="""
    List agent runs with optional filters.

    **Filters:**
    - `status`: running, completed, failed, paused
    - `mode`: enrich, discover
    - `play_id`: Find runs that processed a specific play
    - `since`/`until`: Date range (ISO format)
    """,
    responses={
        200: {"description": "List of agent runs"},
        500: {"description": "Failed to list agent runs"}
    }
)
async def list_agent_runs(
    status: Optional[str] = None,
    mode: Optional[str] = None,
    play_id: Optional[int] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = 20,
    offset: int = 0
):
    """List agent runs with optional filters."""
    global db_service

    try:
        runs, total = db_service.list_agent_runs(
            status=status,
            mode=mode,
            play_id=play_id,
            since=since,
            until=until,
            limit=min(limit, 100),
            offset=offset
        )

        return ListAgentRunsResponse(
            runs=[AgentRunSummary(**r) for r in runs],
            total=total,
            limit=limit,
            offset=offset
        )

    except Exception as e:
        logger.error(f"Failed to list agent runs: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list agent runs: {str(e)}"
        )


@app.delete(
    "/api/agent-runs/{session_id}",
    response_model=DeleteAgentRunResponse,
    tags=["agent-runs"],
    summary="Delete agent run",
    description="Delete an agent run by session ID.",
    responses={
        200: {"description": "Agent run deleted"},
        401: {"description": "Invalid API key"},
        404: {"description": "Session not found"},
        500: {"description": "Failed to delete agent run"}
    }
)
async def delete_agent_run(
    session_id: str,
    x_api_key: str = Header(None)
):
    """Delete an agent run."""
    global db_service

    # API key check (if configured)
    api_key = os.getenv("FAISS_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        deleted = db_service.delete_agent_run(session_id)

        if not deleted:
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

        logger.info(f"Deleted agent run: {session_id}")
        return DeleteAgentRunResponse(status="deleted", session_id=session_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete agent run: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete agent run: {str(e)}"
        )


# =============================================================================
# Generated Assets Endpoints
# =============================================================================

@app.post(
    "/api/generated-assets",
    response_model=StoreGeneratedAssetResponse,
    tags=["generated-assets"],
    summary="Store a generated asset",
    description="""
    Store an AI-generated visual asset (liner note, enhanced art, etc.).

    **Idempotent:** If an asset with the same (play_id, asset_type, params_hash)
    already exists, returns the existing record instead of creating a duplicate.

    **Authentication:** Requires X-API-Key header if FAISS_API_KEY is set.
    """,
    responses={
        200: {"description": "Asset stored successfully"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Failed to store asset"}
    }
)
async def store_generated_asset(
    request: StoreGeneratedAssetRequest,
    x_api_key: Optional[str] = Header(None)
) -> StoreGeneratedAssetResponse:
    """Store a generated asset."""
    global db_service

    # API key check (if configured)
    api_key = os.getenv("FAISS_API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        result = db_service.store_generated_asset(
            play_id=request.play_id,
            asset_type=request.asset_type,
            params_hash=request.params_hash,
            image_base64=request.image_base64,
            mime_type=request.mime_type,
            generation_params=request.generation_params,
            era=request.era,
            style=request.style,
            model_notes=request.model_notes,
            prompt_used=request.prompt_used,
            gcs_url=request.gcs_url,
        )

        return StoreGeneratedAssetResponse(
            id=result['id'],
            params_hash=result['params_hash'],
            was_existing=result['was_existing']
        )

    except Exception as e:
        logger.error(f"Failed to store generated asset: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store generated asset: {str(e)}"
        )


@app.get(
    "/api/generated-assets/play/{play_id}",
    response_model=GetGeneratedAssetsResponse,
    tags=["generated-assets"],
    summary="Get generated assets for a play",
    description="""
    Get all AI-generated visual assets for a specific play.

    Returns assets with their image URLs (GCS or data URL fallback)
    and metadata (era, style, placement, etc.).
    """,
    responses={
        200: {"description": "Assets retrieved successfully"},
        400: {"description": "Missing play_id parameter"},
        500: {"description": "Failed to fetch assets"}
    }
)
async def get_generated_assets(
    play_id: int
) -> GetGeneratedAssetsResponse:
    """Get generated assets for a play."""
    global db_service

    try:
        assets = db_service.get_generated_assets_by_play_id(play_id)

        return GetGeneratedAssetsResponse(
            play_id=play_id,
            assets=[GeneratedAsset(**a) for a in assets],
            count=len(assets)
        )

    except Exception as e:
        logger.error(f"Failed to fetch generated assets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch generated assets: {str(e)}"
        )


@app.get(
    "/api/generated-assets/recent",
    response_model=list[GeneratedAsset],
    tags=["generated-assets"],
    summary="Get recently generated assets",
    description="Get the most recently generated assets across all plays.",
    responses={
        200: {"description": "Assets retrieved successfully"},
        500: {"description": "Failed to fetch assets"}
    }
)
async def get_recent_generated_assets(
    limit: int = 20
) -> list[GeneratedAsset]:
    """Get recently generated assets."""
    global db_service

    try:
        assets = db_service.get_recent_generated_assets(limit=min(limit, 100))
        return [GeneratedAsset(**a) for a in assets]

    except Exception as e:
        logger.error(f"Failed to fetch recent assets: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch recent assets: {str(e)}"
        )
