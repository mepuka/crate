"""
Memory-efficient embedding management endpoints.

Implements three endpoints for the embedding pipeline:
1. GET /api/embeddings/pending - Stream pending plays to Colab
2. GET /api/embeddings/pca-model - Stream PCA transformer file
3. POST /api/embeddings/integrate - Receive and integrate embeddings

All operations use streaming, mmap, and temp files to stay within 4GB RAM constraint.
"""
from fastapi import APIRouter, HTTPException, Depends, status, Header
from fastapi.responses import StreamingResponse, FileResponse
from typing import Optional, Iterator, List
import sqlite3
import numpy as np
import json
import logging
from datetime import datetime
from pathlib import Path

from ..services.db_service import DatabaseService
from ..services.embedding_integration_service import EmbeddingIntegrationService
from ..services.sync import IntegrationInProgressError
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


# Pydantic models for request/response
from pydantic import BaseModel, Field


class PendingPlay(BaseModel):
    """Single pending play with enriched text."""
    id: int
    enriched_text: str
    artist: str
    song: str
    album: Optional[str] = None
    airdate: Optional[str] = None


class PendingPlaysResponse(BaseModel):
    """Response for pending plays endpoint."""
    batch_id: str
    plays: List[PendingPlay]
    total_pending: int


class IntegrationMetadata(BaseModel):
    """Metadata about embedding generation."""
    generated_by: str = "colab"
    model_name: str = "BAAI/bge-small-en-v1.5"
    generation_time: str
    device: str = "cpu"


class IntegrationRequest(BaseModel):
    """Request to integrate new embeddings."""
    batch_id: str
    play_ids: List[int]
    embeddings_b64: str = Field(
        ...,
        description="Base64-encoded numpy array of 384d embeddings (BGE-small)",
        alias="embeddings_256d_b64"  # Backwards compatibility
    )
    checksum: str = Field(
        ...,
        description="SHA256 checksum for verification (format: 'sha256:hexdigest')"
    )
    metadata: IntegrationMetadata


class IntegrationResult(BaseModel):
    """Integration result details."""
    plays_integrated: int
    total_embeddings_before: int
    total_embeddings_after: int
    index_rebuilt: bool


class IntegrationResponse(BaseModel):
    """Response from integration endpoint."""
    status: str
    integration: IntegrationResult
    checksum_verified: bool
    message: str


class AddEmbeddingsRequest(BaseModel):
    """Request to add embeddings to in-memory FAISS index."""
    play_ids: List[int] = Field(..., description="List of play IDs")
    embeddings: List[List[float]] = Field(
        ...,
        description="List of embedding vectors (384d each, normalized)"
    )


class AddEmbeddingsResponse(BaseModel):
    """Response from add embeddings endpoint."""
    status: str
    added: int
    total_vectors: int
    persisted: bool


# Dependency injection
def get_db_service() -> DatabaseService:
    """Get database service dependency."""
    # Reuse the global db_service from main.py
    from ..main import db_service
    if db_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service not initialized"
        )
    return db_service


def get_integration_service() -> EmbeddingIntegrationService:
    """Get embedding integration service dependency."""
    return EmbeddingIntegrationService(
        embeddings_path=settings.EMBEDDINGS_PATH,
        play_ids_path=settings.PLAY_IDS_PATH,
        index_path=settings.INDEX_PATH,
        db_path=settings.DATABASE_PATH
    )


@router.get(
    "/pending",
    response_model=PendingPlaysResponse,
    summary="Get pending plays for embedding",
    description="""
    Stream plays that don't have embeddings yet.

    Memory-efficient implementation:
    - Loads play_ids.npy (17MB) into HashSet
    - Streams from database cursor (no bulk load)
    - Generates enriched text on-the-fly
    - Returns paginated JSON response

    Maximum memory usage: ~50MB
    """
)
async def get_pending_embeddings(
    limit: int = 1000,
    offset: int = 0,
    db_svc: DatabaseService = Depends(get_db_service),
    integration_svc: EmbeddingIntegrationService = Depends(get_integration_service)
) -> PendingPlaysResponse:
    """
    Get plays that need embeddings.

    Args:
        limit: Maximum number of plays to return (default 1000, max 5000)
        offset: Pagination offset
        db_svc: Database service dependency
        integration_svc: Integration service dependency

    Returns:
        PendingPlaysResponse with batch_id, plays, and total count
    """
    # Validate limit
    if limit < 1 or limit > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 5000"
        )

    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative"
        )

    try:
        logger.info(f"Fetching pending plays (limit={limit}, offset={offset})")

        # Get pending play IDs (uses optimized indexed query if embedded_play_ids table exists)
        pending_ids = integration_svc.detect_pending_plays_optimized(limit=limit, offset=offset)

        if not pending_ids:
            logger.info("No pending plays found")
            return PendingPlaysResponse(
                batch_id=datetime.utcnow().isoformat(),
                plays=[],
                total_pending=0
            )

        # Fetch play metadata from database
        plays_dict = db_svc.get_plays_by_ids(pending_ids)

        # Generate enriched text and build response
        plays = []
        for play_id in pending_ids:
            play_data = plays_dict.get(play_id)
            if play_data:
                enriched_text = integration_svc.enrich_play_text(play_data)
                plays.append(PendingPlay(
                    id=play_data['id'],
                    enriched_text=enriched_text,
                    artist=play_data['artist'],
                    song=play_data['song'],
                    album=play_data.get('album'),
                    airdate=play_data.get('airdate')
                ))

        # Get total pending count (consistent with detection query)
        total_pending = integration_svc.count_pending_plays_optimized()

        logger.info(f"Returning {len(plays)} pending plays (total pending: {total_pending})")

        return PendingPlaysResponse(
            batch_id=datetime.utcnow().isoformat(),
            plays=plays,
            total_pending=total_pending
        )

    except Exception as e:
        logger.error(f"Failed to fetch pending plays: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch pending plays: {str(e)}"
        )


@router.get(
    "/pca-model",
    summary="Download PCA transformer",
    description="""
    Stream PCA transformer file for dimensionality reduction.

    The PCA model is used to transform 768d embeddings to 256d.
    File size: ~775KB

    Memory usage: Negligible (file streaming)
    """
)
async def get_pca_model() -> FileResponse:
    """
    Download PCA transformer file.

    Returns:
        FileResponse streaming the PCA transformer file
    """
    pca_path = settings.PCA_PATH

    if not pca_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PCA transformer not found at {pca_path}"
        )

    logger.info(f"Streaming PCA transformer from {pca_path}")

    return FileResponse(
        path=str(pca_path),
        media_type="application/octet-stream",
        filename="pca_transformer_256d.joblib"
    )


@router.post(
    "/integrate",
    response_model=IntegrationResponse,
    summary="Integrate new embeddings",
    description="""
    Receive and integrate new embeddings from Colab.

    Memory-efficient implementation:
    - Streams base64 decode to temp file
    - Uses mmap to read large arrays
    - Rebuilds FAISS index in batches
    - Atomic file swaps
    - Hot reloads in-memory index after integration

    Maximum memory usage: ~100MB (no large arrays in memory)

    **Concurrency:** Blocks /add requests during integration.
    Holds exclusive lock from start through hot_reload completion.

    Requires X-API-Key header for authentication.
    """
)
async def integrate_embeddings(
    request: IntegrationRequest,
    x_api_key: Optional[str] = Header(None),
    integration_svc: EmbeddingIntegrationService = Depends(get_integration_service)
) -> IntegrationResponse:
    """
    Integrate new embeddings into the index.

    Uses IndexSynchronizer to block /add during integration.
    Holds lock from start through hot_reload completion.

    Args:
        request: Integration request with embeddings and metadata
        x_api_key: API key for authentication
        integration_svc: Integration service dependency

    Returns:
        IntegrationResponse with status and integration details
    """
    import anyio
    import os
    from ..main import search_service, index_synchronizer

    # Validate API key
    expected_key = os.getenv("FAISS_API_KEY")
    if expected_key:
        if not x_api_key or x_api_key != expected_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key"
            )

    # Blocking acquire - waits for any /add to finish
    async with index_synchronizer.integration_context():
        try:
            logger.info(f"Starting embedding integration for batch {request.batch_id}")
            logger.info(f"Integrating {len(request.play_ids)} plays")
            logger.info(f"Metadata: {request.metadata.model_dump()}")

            # Validate play IDs
            if not request.play_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No play IDs provided"
                )

            # Integrate embeddings (memory-efficient, runs in thread pool)
            result = await anyio.to_thread.run_sync(
                lambda: integration_svc.integrate_embeddings(
                    new_embeddings_b64=request.embeddings_b64,
                    new_ids=request.play_ids,
                    expected_checksum=request.checksum
                )
            )

            logger.info(f"Integration complete: {result}")

            # Hot reload in-memory index under same synchronizer lock
            # FAISSSearchService._mutex provides internal thread safety for atomic swap
            if search_service is not None:
                await anyio.to_thread.run_sync(search_service.hot_reload)
                logger.info("In-memory index hot reloaded")

            # Mark plays as embedded in tracking table
            await anyio.to_thread.run_sync(
                lambda: integration_svc.mark_plays_embedded(request.play_ids)
            )

            return IntegrationResponse(
                status="success",
                integration=IntegrationResult(
                    plays_integrated=result['plays_integrated'],
                    total_embeddings_before=result['total_before'],
                    total_embeddings_after=result['total_after'],
                    index_rebuilt=result['index_rebuilt']
                ),
                checksum_verified=result['checksum_verified'],
                message=f"Successfully integrated {result['plays_integrated']} embeddings and reloaded index"
            )

        except ValueError as e:
            # Validation errors (checksum mismatch, invalid data, etc.)
            logger.error(f"Validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"Integration failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Integration failed: {str(e)}"
            )


@router.post(
    "/add",
    response_model=AddEmbeddingsResponse,
    summary="Add embeddings to in-memory FAISS index",
    description="""
    Add new embeddings directly to the in-memory FAISS index.

    This is designed for incremental updates from the embed_pending cron job.
    Embeddings are added without index retraining (IVFFlat supports this).

    Memory usage: Minimal - only the batch is held in memory.

    **Concurrency:** Returns 409 if integration is in progress.
    Use Retry-After header to know when to retry.

    Requires localhost access (cron job runs inside container).
    """,
    responses={
        409: {"description": "Integration in progress - retry later"}
    }
)
async def add_embeddings(
    request: AddEmbeddingsRequest,
    x_api_key: Optional[str] = Header(None)
) -> AddEmbeddingsResponse:
    """
    Add embeddings to the in-memory FAISS index.

    Uses IndexSynchronizer to prevent /add during /integrate.
    Returns 409 Conflict if integration is running.

    Args:
        request: AddEmbeddingsRequest with play_ids and embeddings
        x_api_key: API key for authentication (same as /integrate)

    Returns:
        AddEmbeddingsResponse with status and counts
    """
    import anyio
    import os
    from ..main import search_service, index_synchronizer

    # Validate API key (same pattern as /integrate)
    expected_key = os.getenv("FAISS_API_KEY")
    if expected_key:
        if not x_api_key or x_api_key != expected_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key"
            )

    if search_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search service not initialized"
        )

    try:
        # Non-blocking acquire - fails fast if integration running
        async with index_synchronizer.add_context():
            logger.info(f"Adding {len(request.play_ids)} embeddings to index")

            # Validate counts match
            if len(request.play_ids) != len(request.embeddings):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Mismatch: {len(request.play_ids)} play_ids vs {len(request.embeddings)} embeddings"
                )

            # Convert to numpy array
            import numpy as np
            embeddings = np.array(request.embeddings, dtype=np.float32)

            # Run in thread pool to avoid blocking the event loop
            # FAISSSearchService._mutex provides internal thread safety
            result = await anyio.to_thread.run_sync(
                lambda: search_service.add_embeddings(
                    play_ids=request.play_ids,
                    embeddings=embeddings
                )
            )

            # Mark plays as embedded in tracking table
            integration_svc = get_integration_service()
            await anyio.to_thread.run_sync(
                lambda: integration_svc.mark_plays_embedded(request.play_ids)
            )

            return AddEmbeddingsResponse(
                status="success",
                added=result["added"],
                total_vectors=result["total_vectors"],
                persisted=result["persisted"]
            )

    except IntegrationInProgressError as e:
        # Return 409 with Retry-After header
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
            headers={"Retry-After": "60"}
        )
    except ValueError as e:
        logger.error(f"Validation error adding embeddings: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to add embeddings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add embeddings: {str(e)}"
        )
