from typing import Literal

from pydantic import BaseModel, Field

StreamingPlatform = Literal["spotify", "apple_music", "bandcamp", "soundcloud", "youtube_music"]
StreamingLinkKind = Literal["track", "album", "artist", "playlist"]
StreamingLinkSource = Literal["recording_mbid", "release_group_mbid", "release_mbid", "artist_mbid"]


class StreamingLink(BaseModel):
    platform: StreamingPlatform
    kind: StreamingLinkKind
    url: str
    id: str | None = None
    display: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    source: StreamingLinkSource


class StreamingLinksRequest(BaseModel):
    recording_mbid: str | None = None
    release_group_mbid: str | None = None
    release_mbid: str | None = None
    artist_mbid: str | None = None
    storefront: str | None = Field(
        default=None,
        description="Apple Music storefront code (e.g., 'us'). Defaults to 'us' if not provided.",
    )


class StreamingLinksResponse(BaseModel):
    links: list[StreamingLink]
    resolved_from: StreamingLinkSource
    resolved_ids: dict | None = None
