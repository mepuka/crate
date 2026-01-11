"""
Daily Summary API endpoints.

Provides endpoints for:
- POST /api/summary/generate - Trigger summary pipeline
- POST /api/summary/research - Save research context (Phase 1 output)
- POST /api/summary/save - Save final summary (Phase 2 output)
- GET /api/summary/{date} - Get summary for specific date
- GET /api/summary/latest - Get most recent summary
- GET /api/research/{date} - Get research context (debugging)
- GET /api/summaries - List all summaries
"""
from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
import anyio

from pydantic import BaseModel, Field

from ..services.db_service import DatabaseService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["summary"])


# =============================================================================
# Pydantic Models
# =============================================================================

class GenerateSummaryRequest(BaseModel):
    """Request to generate a daily summary."""
    date: Optional[str] = Field(
        None,
        description="Date to generate summary for (YYYY-MM-DD). Defaults to yesterday."
    )
    regenerate: bool = Field(
        False,
        description="Force regeneration even if summary exists"
    )


class GenerateSummaryResponse(BaseModel):
    """Response from generate endpoint."""
    status: str  # "started", "exists", "regenerating"
    date: str
    message: str
    summary_id: Optional[int] = None


class DayStats(BaseModel):
    """Statistics for the day."""
    totalPlays: int
    uniqueArtists: int
    uniqueAlbums: int
    newToKexp: int
    localArtists: int
    livePerformances: int
    listenerRequests: int
    showCount: int


class SummaryListItem(BaseModel):
    """Summary metadata for list endpoint."""
    id: int
    date: str
    research_id: Optional[int]
    created_at: str
    regenerated_count: int
    headline: Optional[str]
    total_plays: Optional[int]


class SummaryListResponse(BaseModel):
    """Response for list summaries endpoint."""
    summaries: List[SummaryListItem]
    total: int


class ResearchResponse(BaseModel):
    """Response for research endpoint."""
    id: int
    date: str
    research_context: Dict[str, Any]
    created_at: str
    duration_ms: Optional[int]
    tool_call_count: int


class TokenUsage(BaseModel):
    """Token usage statistics."""
    inputTokens: int = 0
    outputTokens: int = 0
    cacheReadTokens: int = 0
    cacheWriteTokens: int = 0
    totalTokens: int = 0


class SaveResearchRequest(BaseModel):
    """Request to save research context."""
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    research_context: Dict[str, Any] = Field(..., description="Full research context JSON")
    duration_ms: int = Field(0, description="How long research phase took")
    tool_call_count: int = Field(0, description="Number of tool calls made")
    token_usage: Optional[TokenUsage] = Field(None, description="Token usage statistics")


class SaveResearchResponse(BaseModel):
    """Response from saving research."""
    id: int
    date: str
    status: str  # "created" or "updated"


class SaveSummaryRequest(BaseModel):
    """Request to save daily summary."""
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    summary: Dict[str, Any] = Field(..., description="Full summary JSON")
    research_id: int = Field(..., description="Reference to research phase ID")


class SaveSummaryResponse(BaseModel):
    """Response from saving summary."""
    id: int
    date: str
    status: str  # "created" or "updated"
    regenerated_count: int


# =============================================================================
# Dependencies
# =============================================================================

def get_db_service() -> DatabaseService:
    """Get database service dependency."""
    from ..main import db_service
    if db_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service not initialized"
        )
    return db_service


# =============================================================================
# Endpoints
# =============================================================================

@router.post(
    "/api/summary/generate",
    response_model=GenerateSummaryResponse,
    summary="Trigger summary generation",
    description="""
    Trigger the daily summary pipeline for a specific date.

    The pipeline runs in two phases:
    1. ResearchAgent - Deep analysis of the day's plays
    2. WriterAgent - Narrative synthesis from research

    If a summary already exists for the date and regenerate=false,
    returns the existing summary info without regenerating.
    """
)
async def generate_summary(
    request: GenerateSummaryRequest,
    background_tasks: BackgroundTasks,
    db_svc: DatabaseService = Depends(get_db_service)
) -> GenerateSummaryResponse:
    """Trigger summary generation for a date."""
    # Default to yesterday
    if request.date:
        target_date = request.date
    else:
        yesterday = datetime.utcnow() - timedelta(days=1)
        target_date = yesterday.strftime("%Y-%m-%d")

    # Validate date format
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {target_date}. Expected YYYY-MM-DD"
        )

    # Check if summary exists (run in thread pool)
    existing = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_summary(target_date))

    if existing and not request.regenerate:
        return GenerateSummaryResponse(
            status="exists",
            date=target_date,
            message=f"Summary already exists for {target_date}. Use regenerate=true to regenerate.",
            summary_id=existing['id']
        )

    # TODO: Actually trigger the summary pipeline
    # For now, return a placeholder indicating the endpoint is ready
    # The actual implementation will come with the DailySummaryAgent

    logger.info(f"Summary generation requested for {target_date} (regenerate={request.regenerate})")

    return GenerateSummaryResponse(
        status="regenerating" if existing else "started",
        date=target_date,
        message=f"Summary generation queued for {target_date}. Pipeline not yet implemented.",
        summary_id=existing['id'] if existing else None
    )


@router.post(
    "/api/summary/research",
    response_model=SaveResearchResponse,
    summary="Save research context",
    description="""
    Save the research context from Phase 1 of the daily summary pipeline.

    This stores the full research findings (discoveries, themes, cultural moments, etc.)
    which are used by Phase 2 (writing) to generate the final summary.

    Upserts by date - if research for this date exists, it will be updated.
    """
)
async def save_research(
    request: SaveResearchRequest,
    db_svc: DatabaseService = Depends(get_db_service)
) -> SaveResearchResponse:
    """Save research context for a date."""
    # Validate date format
    try:
        datetime.strptime(request.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {request.date}. Expected YYYY-MM-DD"
        )

    # Check if research already exists
    existing = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_research(request.date))

    # Prepare token usage dict
    token_usage_dict = None
    if request.token_usage:
        token_usage_dict = {
            'inputTokens': request.token_usage.inputTokens,
            'outputTokens': request.token_usage.outputTokens,
            'cacheReadTokens': request.token_usage.cacheReadTokens,
            'cacheWriteTokens': request.token_usage.cacheWriteTokens,
            'totalTokens': request.token_usage.totalTokens
        }

    # Save research (upsert)
    research_id = await anyio.to_thread.run_sync(lambda: db_svc.save_daily_research(
        date=request.date,
        research_context=request.research_context,
        duration_ms=request.duration_ms,
        tool_call_count=request.tool_call_count,
        token_usage=token_usage_dict
    ))

    logger.info(f"Saved research for {request.date}: id={research_id}, tool_calls={request.tool_call_count}")

    return SaveResearchResponse(
        id=research_id,
        date=request.date,
        status="updated" if existing else "created"
    )


@router.post(
    "/api/summary/save",
    response_model=SaveSummaryResponse,
    summary="Save daily summary",
    description="""
    Save the final daily summary from Phase 2 of the pipeline.

    This stores the complete summary including headline, narrative, highlights,
    discoveries, fresh releases, themes, and all play references.

    Upserts by date - if summary for this date exists, it will be updated
    and regenerated_count will be incremented.
    """
)
async def save_summary(
    request: SaveSummaryRequest,
    db_svc: DatabaseService = Depends(get_db_service)
) -> SaveSummaryResponse:
    """Save daily summary."""
    # Validate date format
    try:
        datetime.strptime(request.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {request.date}. Expected YYYY-MM-DD"
        )

    # Check if summary already exists
    existing = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_summary(request.date))

    # Save summary (upsert)
    summary_id = await anyio.to_thread.run_sync(lambda: db_svc.save_daily_summary(
        date=request.date,
        summary=request.summary,
        research_id=request.research_id
    ))

    # Get the updated record to return regenerated_count
    updated = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_summary(request.date))
    regenerated_count = updated['regenerated_count'] if updated else 0

    logger.info(f"Saved summary for {request.date}: id={summary_id}, regenerated_count={regenerated_count}")

    return SaveSummaryResponse(
        id=summary_id,
        date=request.date,
        status="updated" if existing else "created",
        regenerated_count=regenerated_count
    )


@router.get(
    "/api/summary/latest",
    summary="Get latest summary",
    description="Get the most recent daily summary."
)
async def get_latest_summary(
    db_svc: DatabaseService = Depends(get_db_service)
) -> Dict[str, Any]:
    """Get the most recent daily summary."""
    result = await anyio.to_thread.run_sync(db_svc.get_latest_summary)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No summaries found"
        )

    # Resolve plays if needed
    summary = result['summary']
    play_ids = summary.get('playIds', [])

    # Get all referenced plays (run in thread pool)
    plays = {}
    if play_ids:
        plays_data = await anyio.to_thread.run_sync(lambda: db_svc.get_plays_by_ids(play_ids))
        for play_id, play_data in plays_data.items():
            plays[str(play_id)] = play_data

    return {
        'id': result['id'],
        'date': result['date'],
        'summary': summary,
        'plays': plays,
        'created_at': result['created_at'],
        'regenerated_count': result['regenerated_count']
    }


@router.get(
    "/api/summary/{date}",
    summary="Get summary by date",
    description="Get the daily summary for a specific date."
)
async def get_summary_by_date(
    date: str,
    db_svc: DatabaseService = Depends(get_db_service)
) -> Dict[str, Any]:
    """Get daily summary by date."""
    # Validate date format
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {date}. Expected YYYY-MM-DD"
        )

    result = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_summary(date))

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No summary found for {date}"
        )

    # Resolve plays (run in thread pool)
    summary = result['summary']
    play_ids = summary.get('playIds', [])

    plays = {}
    if play_ids:
        plays_data = await anyio.to_thread.run_sync(lambda: db_svc.get_plays_by_ids(play_ids))
        for play_id, play_data in plays_data.items():
            plays[str(play_id)] = play_data

    return {
        'id': result['id'],
        'date': result['date'],
        'summary': summary,
        'plays': plays,
        'created_at': result['created_at'],
        'regenerated_count': result['regenerated_count']
    }


@router.get(
    "/api/summaries",
    response_model=SummaryListResponse,
    summary="List summaries",
    description="List all daily summaries with pagination."
)
async def list_summaries(
    limit: int = 30,
    offset: int = 0,
    db_svc: DatabaseService = Depends(get_db_service)
) -> SummaryListResponse:
    """List daily summaries."""
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 100"
        )

    summaries, total = await anyio.to_thread.run_sync(
        lambda: db_svc.list_daily_summaries(limit=limit, offset=offset)
    )

    return SummaryListResponse(
        summaries=[SummaryListItem(**s) for s in summaries],
        total=total
    )


@router.get(
    "/api/research/{date}",
    response_model=ResearchResponse,
    summary="Get research context",
    description="Get the research context for a specific date. Useful for debugging."
)
async def get_research_by_date(
    date: str,
    db_svc: DatabaseService = Depends(get_db_service)
) -> ResearchResponse:
    """Get research context by date."""
    # Validate date format
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {date}. Expected YYYY-MM-DD"
        )

    result = await anyio.to_thread.run_sync(lambda: db_svc.get_daily_research(date))

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No research found for {date}"
        )

    return ResearchResponse(
        id=result['id'],
        date=result['date'],
        research_context=result['research_context'],
        created_at=result['created_at'],
        duration_ms=result['duration_ms'],
        tool_call_count=result['tool_call_count']
    )
