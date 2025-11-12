"""FastAPI application for FAISS semantic search."""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import time
import logging
from typing import Optional
import anyio

from .services.search_service import FAISSSearchService
from .services.db_service import DatabaseService
from .models import SearchRequest, SearchResponse, HealthResponse, PlayResult, TimelineResponse
from .config import settings

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


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
    summary="Get plays chronologically with flexible navigation",
    description="""
    Browse plays in chronological order (newest first) with multiple navigation methods:
    - **Cursor pagination**: Standard forward/backward navigation
    - **Time-based jump**: Jump to a specific date/time range
    - **Percentage jump**: Jump to a percentage position in the timeline
    - **Anchor jump**: Show plays centered around a specific play ID

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
                limit
            )

        elif anchor_id is not None:
            # Anchor-based jump (multiple queries - run in thread)
            result = await anyio.to_thread.run_sync(
                db_svc.get_plays_around_id,
                anchor_id,
                limit
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
                limit
            )

        else:
            # Standard cursor pagination (fast indexed query - can run directly)
            result = db_svc.get_plays_by_cursor(limit=limit, cursor=cursor)

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
