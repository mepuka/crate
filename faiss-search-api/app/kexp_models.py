"""
KEXP API Pydantic Models

Comprehensive type-safe models for the KEXP API (https://api.kexp.org/v2/).
These models represent all entity types exposed by the KEXP API including:
- Hosts: Radio hosts and DJs
- Programs: Radio programs/shows
- Shows: Individual broadcast instances
- Plays: Track plays and airbreaks
- Timeslots: Scheduled broadcast times

All models use Pydantic V2 with modern Python 3.12+ type hints.
"""

from datetime import datetime, date, time
from typing import Literal, Any
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator, HttpUrl


# ============================================================================
# Pagination Models
# ============================================================================


class PaginatedResponse[T](BaseModel):
    """
    Generic paginated response wrapper used by all KEXP API list endpoints.

    The API uses limit/offset pagination with URLs to next/previous pages.
    Note: Some endpoints (like plays) may not return a count field.
    """
    model_config = ConfigDict(frozen=False, extra="allow")

    count: int | None = Field(
        None,
        description="Total number of items available across all pages (not provided by plays endpoint)",
        examples=[65000, 102, 45]
    )
    next: str | None = Field(
        None,
        description="URL to the next page of results, null if on last page",
        examples=["https://api.kexp.org/v2/plays/?limit=20&offset=20"]
    )
    previous: str | None = Field(
        None,
        description="URL to the previous page of results, null if on first page",
        examples=["https://api.kexp.org/v2/plays/?limit=20&offset=0"]
    )
    results: list[T] = Field(
        default_factory=list,
        description="Array of entity objects for the current page"
    )


# ============================================================================
# Host Models
# ============================================================================


class Host(BaseModel):
    """
    KEXP radio host/DJ entity.

    Represents individual hosts who present shows on KEXP. Hosts can be
    associated with multiple shows and programs.
    """
    model_config = ConfigDict(
        frozen=False,
        str_strip_whitespace=True,
        populate_by_name=True
    )

    id: int = Field(
        ...,
        description="Unique identifier for the host",
        examples=[1, 42, 123]
    )
    uri: str = Field(
        ...,
        description="API endpoint URL for this specific host",
        examples=["https://api.kexp.org/v2/hosts/1/"]
    )
    name: str = Field(
        ...,
        description="Host's display name",
        examples=["John Richards", "Cheryl Waters", "DJ Sharlese"]
    )
    image_uri: str = Field(
        default="",
        description="URL to full-size host photo (typically 800x800px), empty string if unavailable",
        examples=["https://kexp-cdn.imgix.net/hosts/john-richards.jpg"]
    )
    thumbnail_uri: str = Field(
        default="",
        description="URL to thumbnail image (typically 100x100px), empty string if unavailable",
        examples=["https://kexp-cdn.imgix.net/hosts/john-richards-thumb.jpg"]
    )
    is_active: bool = Field(
        ...,
        description="Whether the host is currently active on KEXP",
        examples=[True, False]
    )
    location: int = Field(
        ...,
        description="Location identifier (1 = Seattle, other values for remote/satellite)",
        examples=[1, 2, 3]
    )


class HostResponse(PaginatedResponse[Host]):
    """Paginated response for the /hosts/ endpoint."""
    results: list[Host] = Field(default_factory=list)


# ============================================================================
# Program Models
# ============================================================================


class Program(BaseModel):
    """
    KEXP radio program entity.

    Programs are recurring show concepts (e.g., "Morning Show", "Audioasis").
    Each program can have multiple shows (broadcast instances) and may be
    associated with multiple hosts.
    """
    model_config = ConfigDict(
        frozen=False,
        str_strip_whitespace=True,
        populate_by_name=True
    )

    id: int = Field(
        ...,
        description="Unique identifier for the program",
        examples=[1, 15, 87]
    )
    uri: str = Field(
        ...,
        description="API endpoint URL for this specific program",
        examples=["https://api.kexp.org/v2/programs/1/"]
    )
    name: str = Field(
        ...,
        description="Program title/name",
        examples=["Morning Show", "Audioasis", "Overnight"]
    )
    description: str = Field(
        default="",
        description="Detailed description of the program's format and content",
        examples=["Your daily source for new music discovery and emerging artists"]
    )
    tags: str = Field(
        default="",
        description="Comma-separated genre and category tags",
        examples=["Rock,Eclectic,Variety Mix", "Electronic,World", "Jazz,Blues"]
    )
    image_uri: str = Field(
        default="",
        description="URL to full-resolution program artwork/logo",
        examples=["https://kexp-cdn.imgix.net/programs/morning-show.jpg"]
    )
    thumbnail_uri: str = Field(
        default="",
        description="URL to thumbnail version of program artwork",
        examples=["https://kexp-cdn.imgix.net/programs/morning-show-thumb.jpg"]
    )
    is_active: bool = Field(
        ...,
        description="Whether the program is currently broadcasting",
        examples=[True, False]
    )
    location: int = Field(
        ...,
        description="Location identifier for the program's broadcast origin",
        examples=[1, 2]
    )
    location_name: str = Field(
        default="",
        description="Human-readable location name",
        examples=["Seattle", "Remote", "London"]
    )

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, v: str) -> str:
        """Ensure tags is a string (may be empty)."""
        if v is None:
            return ""
        return v.strip()

    @property
    def tag_list(self) -> list[str]:
        """Parse comma-separated tags into a list."""
        if not self.tags:
            return []
        return [tag.strip() for tag in self.tags.split(",") if tag.strip()]


class ProgramResponse(PaginatedResponse[Program]):
    """Paginated response for the /programs/ endpoint."""
    results: list[Program] = Field(default_factory=list)


# ============================================================================
# Show Models
# ============================================================================


class Show(BaseModel):
    """
    KEXP show entity (individual broadcast instance).

    A Show represents a specific broadcast instance of a Program.
    For example, "Morning Show" (Program) might have a Show for each day
    it airs. Shows are associated with hosts and occur at specific times.
    """
    model_config = ConfigDict(
        frozen=False,
        str_strip_whitespace=True,
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    id: int = Field(
        ...,
        description="Unique identifier for this show instance",
        examples=[12345, 67890]
    )
    uri: str = Field(
        ...,
        description="API endpoint URL for this specific show",
        examples=["https://api.kexp.org/v2/shows/12345/"]
    )
    program: int = Field(
        ...,
        description="ID of the parent program",
        examples=[1, 15, 87]
    )
    program_uri: str = Field(
        ...,
        description="API endpoint URL for the parent program",
        examples=["https://api.kexp.org/v2/programs/1/"]
    )
    program_name: str = Field(
        ...,
        description="Name of the parent program",
        examples=["Morning Show", "Audioasis"]
    )
    program_tags: str = Field(
        default="",
        description="Comma-separated tags from the parent program",
        examples=["Rock,Eclectic,Variety Mix"]
    )
    hosts: list[int] = Field(
        default_factory=list,
        description="List of host IDs for this show instance",
        examples=[[1, 2], [42]]
    )
    host_uris: list[str] = Field(
        default_factory=list,
        description="List of API endpoint URLs for the hosts (parallel to hosts array)",
        examples=[["https://api.kexp.org/v2/hosts/1/", "https://api.kexp.org/v2/hosts/2/"]]
    )
    host_names: list[str] = Field(
        default_factory=list,
        description="List of host names (parallel to hosts array)",
        examples=[["John Richards", "Cheryl Waters"]]
    )
    tagline: str = Field(
        default="",
        description="Promotional tagline or description for this specific show",
        examples=["Join us for an eclectic mix of new music"]
    )
    image_uri: str = Field(
        default="",
        description="URL to show-specific image (often host photo)",
        examples=["https://kexp-cdn.imgix.net/shows/12345.jpg"]
    )
    program_image_uri: str = Field(
        default="",
        description="URL to the program's image/logo",
        examples=["https://kexp-cdn.imgix.net/programs/morning-show.jpg"]
    )
    start_time: datetime = Field(
        ...,
        description="ISO 8601 timestamp when the show started/starts",
        examples=["2025-11-11T22:00:59-08:00"]
    )
    location: int = Field(
        ...,
        description="Location identifier for the show",
        examples=[1, 2]
    )
    location_name: str = Field(
        default="",
        description="Human-readable location name",
        examples=["Seattle", "Remote"]
    )

    @property
    def program_tag_list(self) -> list[str]:
        """Parse comma-separated program tags into a list."""
        if not self.program_tags:
            return []
        return [tag.strip() for tag in self.program_tags.split(",") if tag.strip()]


class ShowResponse(PaginatedResponse[Show]):
    """Paginated response for the /shows/ endpoint."""
    results: list[Show] = Field(default_factory=list)


# ============================================================================
# Play Models
# ============================================================================


RotationStatus = Literal["Heavy", "Medium", "Light", "Library", "R/N"]
PlayType = Literal["trackplay", "airbreak"]


class BasePlay(BaseModel):
    """
    Base model for all play types (tracks and airbreaks).

    Contains fields common to both trackplay and airbreak entities.
    """
    model_config = ConfigDict(
        frozen=False,
        str_strip_whitespace=True,
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

    id: int = Field(
        ...,
        description="Unique identifier for this play",
        examples=[1234567, 9876543]
    )
    uri: str = Field(
        ...,
        description="API endpoint URL for this specific play",
        examples=["https://api.kexp.org/v2/plays/1234567/"]
    )
    airdate: datetime = Field(
        ...,
        description="ISO 8601 timestamp when this item aired",
        examples=["2025-11-11T22:00:59-08:00"]
    )
    show: int = Field(
        ...,
        description="ID of the show during which this aired",
        examples=[12345]
    )
    show_uri: str = Field(
        ...,
        description="API endpoint URL for the associated show",
        examples=["https://api.kexp.org/v2/shows/12345/"]
    )
    location: int = Field(
        ...,
        description="Location identifier",
        examples=[1, 2]
    )
    location_name: str = Field(
        default="",
        description="Human-readable location name",
        examples=["Seattle", "Remote"]
    )
    play_type: PlayType = Field(
        ...,
        description="Type of play entry: 'trackplay' for music or 'airbreak' for non-music breaks",
        examples=["trackplay", "airbreak"]
    )


class Airbreak(BasePlay):
    """
    Airbreak entity (non-music content).

    Represents breaks in music programming such as station IDs, news,
    weather, or other non-music content. Airbreaks have minimal metadata
    compared to track plays.
    """
    play_type: Literal["airbreak"] = Field(
        default="airbreak",
        description="Always 'airbreak' for this entity type"
    )
    image_uri: str = Field(
        default="",
        description="Always empty for airbreaks"
    )
    thumbnail_uri: str = Field(
        default="",
        description="Always empty for airbreaks"
    )
    comment: str = Field(
        default="",
        description="Usually empty for airbreaks"
    )

    @field_validator("comment", mode="before")
    @classmethod
    def validate_comment(cls, v: Any) -> str:
        """Convert None to empty string for comment."""
        if v is None:
            return ""
        return v


class TrackPlay(BasePlay):
    """
    Track play entity (music playback).

    Represents a single music track played on KEXP. Contains comprehensive
    metadata about the song, artist, album, and labels. May include
    MusicBrainz IDs for enhanced music database integration.
    """
    play_type: Literal["trackplay"] = Field(
        default="trackplay",
        description="Always 'trackplay' for this entity type"
    )

    # Image metadata
    image_uri: str = Field(
        default="",
        description="URL to album artwork or artist image, may be empty",
        examples=["https://kexp-cdn.imgix.net/albums/12345.jpg"]
    )
    thumbnail_uri: str = Field(
        default="",
        description="URL to thumbnail version of artwork, may be empty",
        examples=["https://kexp-cdn.imgix.net/albums/12345-thumb.jpg"]
    )

    # Track information
    song: str = Field(
        ...,
        description="Track/song title",
        examples=["Cosmic Dancer", "Bittersweet Symphony", "Such Great Heights"]
    )
    track_id: UUID | None = Field(
        None,
        description="MusicBrainz track ID (UUID), null if not available",
        examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"]
    )
    recording_id: UUID | None = Field(
        None,
        description="MusicBrainz recording ID (UUID), null if not available",
        examples=["b2c3d4e5-f6a7-8901-bcde-f12345678901"]
    )

    # Artist information
    artist: str = Field(
        ...,
        description="Artist name",
        examples=["T. Rex", "The Verve", "The Postal Service"]
    )
    artist_ids: list[UUID] = Field(
        default_factory=list,
        description="List of MusicBrainz artist IDs (UUIDs)",
        examples=[["c3d4e5f6-a7b8-9012-cdef-123456789012"]]
    )

    # Album/Release information
    album: str = Field(
        default="",
        description="Album/release title",
        examples=["Electric Warrior", "Urban Hymns", "Give Up"]
    )
    release_id: UUID | None = Field(
        None,
        description="MusicBrainz release ID (UUID) for the specific release, null if not available",
        examples=["d4e5f6a7-b8c9-0123-def1-234567890123"]
    )
    release_group_id: UUID | None = Field(
        None,
        description="MusicBrainz release group ID (UUID), groups all versions of an album",
        examples=["e5f6a7b8-c9d0-1234-ef12-345678901234"]
    )
    # IMPORTANT: This field's type has varied across branches:
    # - Original: str with default="" (empty string for missing dates)
    # - Commit 45bb4ad: Changed to str | None with default=None
    # - Current branch: Reverted to str with default=""
    #
    # This is a BREAKING CHANGE for API consumers:
    # - Nullable version: Consumers receive null instead of "" for missing dates
    # - Non-nullable version: Consumers receive "" instead of null
    #
    # See CHANGELOG.md for migration guidance and rationale for each approach.
    # The team should standardize on one approach before merging to production.
    release_date: str = Field(
        default="",
        description="Release date in YYYY-MM-DD format, may be partial (YYYY or YYYY-MM)",
        examples=["2003-02-19", "2003-02", "2003"]
    )

    @field_validator("release_date", mode="before")
    @classmethod
    def validate_release_date(cls, v: Any) -> str:
        """Convert None to empty string for release_date."""
        if v is None:
            return ""
        return v

    @field_validator("album", mode="before")
    @classmethod
    def validate_album(cls, v: Any) -> str:
        """Convert None to empty string for album."""
        if v is None:
            return ""
        return v

    # Label information
    labels: list[str] = Field(
        default_factory=list,
        description="List of record label names",
        examples=[["Sub Pop", "Barsuk Records"]]
    )
    label_ids: list[UUID] = Field(
        default_factory=list,
        description="List of MusicBrainz label IDs (UUIDs)",
        examples=[["f6a7b8c9-d0e1-2345-f123-456789012345"]]
    )

    # Rotation and classification
    rotation_status: RotationStatus | None = Field(
        None,
        description="KEXP rotation status: Heavy (high rotation), Medium, Light, or Library (catalog)",
        examples=["Heavy", "Medium", "Light", "Library"]
    )
    is_local: bool = Field(
        default=False,
        description="Whether the artist is from the Seattle/Pacific Northwest area",
        examples=[True, False]
    )
    is_request: bool = Field(
        default=False,
        description="Whether this track was played due to a listener request",
        examples=[True, False]
    )
    is_live: bool = Field(
        default=False,
        description="Whether this is a live performance/recording",
        examples=[True, False]
    )

    # Additional metadata
    comment: str | None = Field(
        None,
        description="Optional DJ comment or note about the track",
        examples=["Live from KEXP", "New release!", "Listener request"]
    )

    @field_validator("artist_ids", "label_ids", mode="before")
    @classmethod
    def validate_uuid_lists(cls, v: Any) -> list[UUID]:
        """Convert string UUIDs to UUID objects."""
        if not v:
            return []
        if isinstance(v, list):
            result = []
            for item in v:
                if isinstance(item, UUID):
                    result.append(item)
                elif isinstance(item, str):
                    result.append(UUID(item))
            return result
        return []

    @field_validator("track_id", "recording_id", "release_id", "release_group_id", mode="before")
    @classmethod
    def validate_uuid(cls, v: Any) -> UUID | None:
        """Convert string UUIDs to UUID objects."""
        if v is None or v == "":
            return None
        if isinstance(v, UUID):
            return v
        if isinstance(v, str):
            return UUID(v)
        return None


# Union type for all play types
Play = TrackPlay | Airbreak


class PlayResponse(PaginatedResponse[Play]):
    """
    Paginated response for the /plays/ endpoint.

    Note: The results list contains a mix of TrackPlay and Airbreak objects.
    Use the play_type field to discriminate between types.
    """
    results: list[Play] = Field(default_factory=list)


# ============================================================================
# Timeslot Models
# ============================================================================


class Timeslot(BaseModel):
    """
    KEXP timeslot entity (scheduled broadcast window).

    Timeslots define the recurring schedule for programs. They specify
    which program airs on which day(s) of the week, at what time, and
    with which hosts. A single program may have multiple timeslots
    (e.g., different times on different days).
    """
    model_config = ConfigDict(
        frozen=False,
        str_strip_whitespace=True,
        populate_by_name=True,
        json_encoders={
            date: lambda v: v.isoformat(),
            time: lambda v: v.isoformat()
        }
    )

    id: int = Field(
        ...,
        description="Unique identifier for this timeslot",
        examples=[123, 456, 789]
    )
    uri: str = Field(
        ...,
        description="API endpoint URL for this specific timeslot",
        examples=["https://api.kexp.org/v2/timeslots/123/"]
    )

    # Program association
    program: int = Field(
        ...,
        description="ID of the program scheduled in this timeslot",
        examples=[1, 15, 87]
    )
    program_uri: str = Field(
        ...,
        description="API endpoint URL for the associated program",
        examples=["https://api.kexp.org/v2/programs/1/"]
    )
    program_name: str = Field(
        ...,
        description="Name of the associated program",
        examples=["Morning Show", "Audioasis"]
    )
    program_tags: str = Field(
        default="",
        description="Comma-separated tags from the associated program",
        examples=["Rock,Eclectic,Variety Mix"]
    )

    # Host associations (parallel arrays)
    hosts: list[int] = Field(
        default_factory=list,
        description="List of host IDs for this timeslot",
        examples=[[1, 2], [42]]
    )
    host_uris: list[str] = Field(
        default_factory=list,
        description="List of API endpoint URLs for the hosts (parallel to hosts array)",
        examples=[["https://api.kexp.org/v2/hosts/1/", "https://api.kexp.org/v2/hosts/2/"]]
    )
    host_names: list[str] = Field(
        default_factory=list,
        description="List of host names (parallel to hosts array)",
        examples=[["John Richards", "Cheryl Waters"]]
    )

    # Schedule information
    weekday: int = Field(
        ...,
        ge=0,
        le=6,
        description="Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday (ISO 8601 weekday)",
        examples=[0, 3, 6]
    )
    start_date: date = Field(
        ...,
        description="Date when this timeslot schedule begins",
        examples=["2025-01-01"]
    )
    end_date: date | None = Field(
        None,
        description="Date when this timeslot schedule ends, null if ongoing",
        examples=["2025-12-31", None]
    )
    start_time: time = Field(
        ...,
        description="Time when the program starts (24-hour format)",
        examples=["06:00:00", "14:30:00", "22:00:00"]
    )
    end_time: time = Field(
        ...,
        description="Time when the program ends (24-hour format)",
        examples=["10:00:00", "16:30:00", "02:00:00"]
    )
    duration: time = Field(
        ...,
        description="Duration of the timeslot in HH:MM:SS format (stored as time object)",
        examples=["04:00:00", "02:00:00", "01:30:00"]
    )

    @field_validator("weekday")
    @classmethod
    def validate_weekday(cls, v: int) -> int:
        """Ensure weekday is in valid range 0-6."""
        if not 0 <= v <= 6:
            raise ValueError("weekday must be between 0 (Monday) and 6 (Sunday)")
        return v

    @property
    def weekday_name(self) -> str:
        """Get human-readable weekday name."""
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return days[self.weekday]

    @property
    def program_tag_list(self) -> list[str]:
        """Parse comma-separated program tags into a list."""
        if not self.program_tags:
            return []
        return [tag.strip() for tag in self.program_tags.split(",") if tag.strip()]

    @property
    def is_active(self) -> bool:
        """Check if timeslot is currently active (not ended)."""
        if self.end_date is None:
            return True
        from datetime import date as date_class
        return self.end_date >= date_class.today()


class TimeslotResponse(PaginatedResponse[Timeslot]):
    """Paginated response for the /timeslots/ endpoint."""
    results: list[Timeslot] = Field(default_factory=list)


# ============================================================================
# Example Usage and Type Helpers
# ============================================================================


def example_usage():
    """
    Example usage of the KEXP models.

    This demonstrates how to use these models with the KEXP API.
    """
    import httpx

    # Fetch and parse hosts
    response = httpx.get("https://api.kexp.org/v2/hosts/")
    hosts_response = HostResponse.model_validate_json(response.text)

    for host in hosts_response.results:
        print(f"Host: {host.name} (Active: {host.is_active})")

    # Fetch and parse plays
    response = httpx.get("https://api.kexp.org/v2/plays/")
    plays_response = PlayResponse.model_validate_json(response.text)

    for play in plays_response.results:
        if isinstance(play, TrackPlay):
            print(f"Track: {play.artist} - {play.song} from {play.album}")
            print(f"  Rotation: {play.rotation_status}, Local: {play.is_local}")
        elif isinstance(play, Airbreak):
            print(f"Airbreak at {play.airdate}")

    # Fetch and parse timeslots
    response = httpx.get("https://api.kexp.org/v2/timeslots/")
    timeslots_response = TimeslotResponse.model_validate_json(response.text)

    for slot in timeslots_response.results:
        print(f"{slot.weekday_name} {slot.start_time}-{slot.end_time}: {slot.program_name}")
        print(f"  Hosts: {', '.join(slot.host_names)}")
        print(f"  Active: {slot.is_active}")


# Type aliases for convenience
HostList = list[Host]
ProgramList = list[Program]
ShowList = list[Show]
PlayList = list[Play]
TimeslotList = list[Timeslot]


# Export all models
__all__ = [
    # Pagination
    "PaginatedResponse",

    # Hosts
    "Host",
    "HostResponse",
    "HostList",

    # Programs
    "Program",
    "ProgramResponse",
    "ProgramList",

    # Shows
    "Show",
    "ShowResponse",
    "ShowList",

    # Plays
    "BasePlay",
    "TrackPlay",
    "Airbreak",
    "Play",
    "PlayResponse",
    "PlayList",
    "RotationStatus",
    "PlayType",

    # Timeslots
    "Timeslot",
    "TimeslotResponse",
    "TimeslotList",

    # Example
    "example_usage",
]
