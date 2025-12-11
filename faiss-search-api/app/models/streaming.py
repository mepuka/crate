from typing import Literal, Optional, List
from pydantic import BaseModel, Field

StreamingPlatform = Literal["spotify", "apple_music", "bandcamp", "soundcloud", "youtube_music"]
StreamingLinkKind = Literal["track", "album", "artist", "playlist"]
StreamingLinkSource = Literal["recording_mbid", "release_group_mbid", "release_mbid", "artist_mbid"]


class StreamingLink(BaseModel):
    platform: StreamingPlatform
    kind: StreamingLinkKind
    url: str
    id: Optional[str] = None
    display: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source: StreamingLinkSource


class StreamingLinksRequest(BaseModel):
    recording_mbid: Optional[str] = None
    release_group_mbid: Optional[str] = None
    release_mbid: Optional[str] = None
    artist_mbid: Optional[str] = None
    storefront: Optional[str] = Field(
        default=None,
        description="Apple Music storefront code (e.g., 'us'). Defaults to 'us' if not provided."
    )


class StreamingLinksResponse(BaseModel):
    links: List[StreamingLink]
    resolved_from: StreamingLinkSource
    resolved_ids: Optional[dict] = None
