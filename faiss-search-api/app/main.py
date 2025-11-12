"""FastAPI application for FAISS semantic search."""
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import time
import logging
from typing import Optional

from .services.search_service import FAISSSearchService
from .services.db_service import DatabaseService
from .models import SearchRequest, SearchResponse, HealthResponse, PlayResult
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
    search: FAISSSearchService = Depends(get_search_service)
) -> HealthResponse:
    """Health check endpoint."""
    try:
        import psutil
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024
    except ImportError:
        memory_mb = 0.0

    return HealthResponse(
        status="ok",
        index_loaded=search.index is not None,
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
