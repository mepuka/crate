"""
Pydantic models for generated assets (liner notes, enhanced art, etc.)
"""

from typing import Literal

from pydantic import BaseModel, Field

# Era types for visual styling context
Era = Literal[
    "pre-vinyl",
    "golden-age",
    "classic-rock",
    "new-wave",
    "grunge",
    "digital",
    "streaming",
    "contemporary",
]

# Visual style types
Style = Literal["art-forward", "editorial", "archival", "collage"]

# Asset types
AssetType = Literal["liner_note", "enhanced_art", "show_graphic", "character", "gatefold", "insert"]


class AssetMetadata(BaseModel):
    """Metadata extracted from generation params."""

    era: str | None = None
    style: str | None = None
    placement: str | None = None
    page_number: int | None = None
    mood: str | None = None
    description: str | None = None


class StoreGeneratedAssetRequest(BaseModel):
    """Request to store a new generated asset."""

    play_id: int | None = Field(None, description="Play ID (null for artist-level assets)")
    asset_type: str = Field(..., description="Type: liner_note, enhanced_art, etc.")
    params_hash: str = Field(..., description="SHA256 hash of generation params for deduplication")
    generation_params: str | None = Field(None, description="Full JSON params for reproducibility")
    image_base64: str = Field(..., description="Base64-encoded image data")
    mime_type: str = Field("image/png", description="MIME type of the image")
    era: str | None = Field(None, description="Detected era (golden-age, classic-rock, etc.)")
    style: str | None = Field(None, description="Style used (art-forward, editorial, etc.)")
    model_notes: str | None = Field(None, description="Notes from the generation model")
    prompt_used: str | None = Field(None, description="Full prompt for debugging")
    gcs_url: str | None = Field(None, description="GCS public URL if uploaded")


class StoreGeneratedAssetResponse(BaseModel):
    """Response from storing a generated asset."""

    id: int = Field(..., description="Database ID of the stored asset")
    params_hash: str = Field(..., description="Hash used for deduplication")
    was_existing: bool = Field(..., description="True if asset already existed (idempotent)")


class GeneratedAsset(BaseModel):
    """A generated asset for API responses."""

    id: str = Field(..., description="Asset ID as string")
    play_id: int = Field(..., description="Associated play ID")
    asset_type: str = Field(..., description="Type of asset")
    image_url: str = Field(..., description="URL to access the image (GCS or data URL)")
    thumbnail_url: str | None = Field(None, description="Optional thumbnail URL")
    metadata: AssetMetadata = Field(default_factory=AssetMetadata)
    created_at: str = Field(..., description="ISO timestamp of creation")


class GetGeneratedAssetsResponse(BaseModel):
    """Response containing generated assets for a play."""

    play_id: int = Field(..., description="The queried play ID")
    assets: list[GeneratedAsset] = Field(default_factory=list)
    count: int = Field(..., description="Number of assets returned")
