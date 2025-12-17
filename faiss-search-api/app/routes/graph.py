"""
Graph Connections API Router.

Provides fast graph traversal queries for the agent.
"""

from fastapi import APIRouter, Depends, HTTPException, status
import time
import logging

from ..models.graph import (
    GraphConnectionsRequest,
    GraphConnectionsResponse,
    ConnectionNode,
)
from ..services.db_service import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graph", tags=["graph"])


# Query handler mapping
QUERY_HANDLERS = {
    "band_members": "query_band_members",
    "member_of": "query_member_of",
    "labelmates": "query_labelmates",
    "label_hierarchy": "query_label_hierarchy",
    "covers": "query_covers",
    "artist_origin": "query_artist_origin",
    "artists_from_area": "query_artists_from_area",
    "recorded_at": "query_recorded_at",
    "collaborators": "query_collaborators",
    # New queries
    "members_by_instrument": "query_members_by_instrument",
    "works_by_creator": "query_works_by_creator",
    "work_credits": "query_work_credits",
}


def get_db_service():
    """Dependency placeholder - will be overridden by main.py."""
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Database service not initialized"
    )


@router.post(
    "/connections",
    response_model=GraphConnectionsResponse,
    summary="Query graph connections",
    description="""
    Query the music knowledge graph for connections.

    **Query Types:**
    - `band_members`: Get members of a band (input: band MBIDs)
    - `member_of`: Get bands an artist is member of (input: artist MBIDs)
    - `labelmates`: Get artists on same label(s) (input: artist MBIDs)
    - `covers`: Get cover versions (input: recording MBIDs)
    - `artist_origin`: Get artist's origin area (input: artist MBIDs)
    - `artists_from_area`: Get artists from area (input: area MBIDs or names like "Seattle")
    - `recorded_at`: Get recordings from place (input: place MBIDs or names like "Abbey Road")
    - `collaborators`: Get artists who shared bands (input: artist MBIDs)
    - `label_hierarchy`: Get label ownership tree (input: label MBIDs)

    **Caching:** Results cached for 1 week (deterministic graph data).
    """,
    responses={
        200: {"description": "Connections found"},
        400: {"description": "Invalid query type or MBIDs"},
        500: {"description": "Query failed"}
    }
)
async def query_connections(
    request: GraphConnectionsRequest,
    db: DatabaseService = Depends(get_db_service)
) -> GraphConnectionsResponse:
    """Execute graph connection query."""
    start_time = time.time()

    # Get handler method name
    handler_name = QUERY_HANDLERS.get(request.query_type)
    if not handler_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown query type: {request.query_type}"
        )

    try:
        # Get handler method from db service
        handler = getattr(db, handler_name, None)
        if handler is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Handler not implemented: {handler_name}"
            )

        # Execute query with optional filters
        kwargs = {
            "mbids": request.mbids,
            "limit": request.limit,
            "include_attributes": request.include_attributes,
        }
        # Add optional filters if present
        if request.instrument:
            kwargs["instrument"] = request.instrument
        if request.creator_type:
            kwargs["creator_type"] = request.creator_type

        results = handler(**kwargs)

        # Convert to ConnectionNode models
        connections = [
            ConnectionNode(**result)
            for result in results
        ]

        query_time = (time.time() - start_time) * 1000

        logger.info(
            f"Graph query {request.query_type}: {len(connections)} results in {query_time:.1f}ms"
        )

        return GraphConnectionsResponse(
            query_type=request.query_type,
            source_mbids=request.mbids,
            connections=connections,
            total=len(connections),
            query_time_ms=query_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Graph query failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Graph query failed: {str(e)}"
        )
