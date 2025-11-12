"""Text enrichment utilities for music search."""

import pandas as pd
from typing import Optional, Dict, Any, List
from .db import Database

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False


def get_artist_genres(db: Database, artist_name: str, limit: int = 10) -> List[str]:
    """Fetch genre tags for an artist from MusicBrainz relationships.

    Args:
        db: Database instance
        artist_name: Artist name to lookup
        limit: Maximum number of genres to return

    Returns:
        List of genre strings
    """
    try:
        genres_df = db.query("""
            SELECT DISTINCT object_name as genre
            FROM master_relations
            WHERE predicate = 'artist-genre'
            AND subject_name = ?
            LIMIT ?
        """, (artist_name, limit))

        return genres_df['genre'].tolist() if not genres_df.empty else []
    except Exception as e:
        print(f"Error fetching genres for {artist_name}: {e}")
        return []


def get_artist_location(db: Database, artist_name: str) -> Dict[str, Optional[str]]:
    """Fetch location data for an artist from MusicBrainz relationships.

    Args:
        db: Database instance
        artist_name: Artist name to lookup

    Returns:
        Dict with 'city' and 'country' keys (may be None)
    """
    try:
        location_df = db.query("""
            SELECT predicate, object_name as location
            FROM master_relations
            WHERE predicate IN ('area', 'begin-area')
            AND subject_name = ?
            LIMIT 2
        """, (artist_name,))

        result = {'city': None, 'country': None}

        if not location_df.empty:
            for _, row in location_df.iterrows():
                if row['predicate'] == 'begin-area':
                    result['city'] = row['location']
                elif row['predicate'] == 'area':
                    result['country'] = row['location']

        return result
    except Exception as e:
        print(f"Error fetching location for {artist_name}: {e}")
        return {'city': None, 'country': None}


def enrich_play_text(
    play_row: Dict[str, Any],
    db: Optional[Database] = None,
    include_genres: bool = True,
    include_location: bool = True,
    max_genres: int = 8
) -> str:
    """Create rich text representation for a play.

    Args:
        play_row: Dictionary with play data (artist, song, album, comment, etc.)
        db: Optional Database instance for fetching MusicBrainz data
        include_genres: Whether to fetch and include genre information
        include_location: Whether to fetch and include location information
        max_genres: Maximum number of genres to include

    Returns:
        Enriched text string ready for embedding
    """
    parts = []

    # Core: Artist - Song - Album
    if play_row.get('artist'):
        parts.append(f"{play_row['artist']}")
    if play_row.get('song'):
        parts.append(f"- {play_row['song']}")
    if play_row.get('album'):
        parts.append(f"- {play_row['album']}")

    metadata_parts = []

    # Add MusicBrainz genres FIRST (most important for semantic search)
    if include_genres and db is not None and play_row.get('artist'):
        genres = get_artist_genres(db, play_row['artist'], limit=max_genres)
        if genres:
            metadata_parts.append(f"Genres: {', '.join(genres)}")

    # Add location data (city/country)
    if include_location and db is not None and play_row.get('artist'):
        location = get_artist_location(db, play_row['artist'])
        location_parts = []
        if location['city']:
            location_parts.append(location['city'])
        if location['country']:
            location_parts.append(location['country'])
        if location_parts:
            metadata_parts.append(f"From: {', '.join(location_parts)}")

    # Add DJ comment (very valuable for semantic understanding!)
    if play_row.get('comment'):
        metadata_parts.append(f"Comment: {play_row['comment']}")

    # Add labels
    if play_row.get('labels'):
        metadata_parts.append(f"Label: {play_row['labels']}")

    # Add rotation status
    if play_row.get('rotation_status'):
        metadata_parts.append(f"Rotation: {play_row['rotation_status']}")

    # Add local flag
    if play_row.get('is_local') == 1:
        metadata_parts.append("Local artist")

    # Add year if available
    if play_row.get('airdate'):
        try:
            year = pd.to_datetime(play_row['airdate']).year
            metadata_parts.append(f"Year: {year}")
        except:
            pass

    # Combine
    text = ' '.join(parts)
    if metadata_parts:
        text += ' | ' + ' | '.join(metadata_parts)

    return text


def enrich_play_batch(
    plays_df: pd.DataFrame,
    db: Database,
    include_genres: bool = True,
    include_location: bool = True,
    max_genres: int = 8,
    show_progress: bool = False
) -> List[str]:
    """Enrich a batch of plays efficiently.

    This function pre-fetches all genre and location data with bulk queries.

    Args:
        plays_df: DataFrame with play data
        db: Database instance
        include_genres: Whether to include genre information
        include_location: Whether to include location information
        max_genres: Maximum number of genres per artist
        show_progress: Whether to show progress bar

    Returns:
        List of enriched text strings
    """
    # Pre-fetch all genres and locations for unique artists with batched bulk queries
    genre_cache = {}
    location_cache = {}
    unique_artists = plays_df['artist'].dropna().unique().tolist()

    if show_progress:
        print(
            f"Fetching metadata for {len(unique_artists):,} unique artists...")

    # Batch size to avoid SQL parameter limit (SQLite has a limit around 999-32766)
    BATCH_SIZE = 500

    # Bulk fetch genres in batches
    if include_genres:
        all_genres = []
        num_batches = (len(unique_artists) + BATCH_SIZE - 1) // BATCH_SIZE

        # Create progress bar if available
        batch_range = range(0, len(unique_artists), BATCH_SIZE)
        if show_progress and HAS_TQDM:
            batch_iter = tqdm(batch_range, desc="Fetching genres", unit="batch", ncols=80)
        else:
            batch_iter = batch_range
            if show_progress:
                print(f"Fetching genres ({num_batches} batches)...")

        for i in batch_iter:
            batch = unique_artists[i:i + BATCH_SIZE]
            placeholders = ','.join('?' * len(batch))
            genres_df = db.query(f"""
                SELECT subject_name as artist, object_name as genre
                FROM master_relations
                WHERE predicate = 'artist-genre'
                AND subject_name IN ({placeholders})
            """, batch)
            if not genres_df.empty:
                all_genres.append(genres_df)

        # Combine all batches
        if all_genres:
            combined_genres = pd.concat(all_genres, ignore_index=True)
            for artist in unique_artists:
                artist_genres = combined_genres[combined_genres['artist'] == artist]['genre'].tolist(
                )
                genre_cache[artist] = artist_genres[:max_genres]
        else:
            for artist in unique_artists:
                genre_cache[artist] = []

    # Bulk fetch locations in batches
    if include_location:
        all_locations = []
        num_batches = (len(unique_artists) + BATCH_SIZE - 1) // BATCH_SIZE

        # Create progress bar if available
        batch_range = range(0, len(unique_artists), BATCH_SIZE)
        if show_progress and HAS_TQDM:
            batch_iter = tqdm(batch_range, desc="Fetching locations", unit="batch", ncols=80)
        else:
            batch_iter = batch_range
            if show_progress:
                print(f"Fetching locations ({num_batches} batches)...")

        for i in batch_iter:
            batch = unique_artists[i:i + BATCH_SIZE]
            placeholders = ','.join('?' * len(batch))
            locations_df = db.query(f"""
                SELECT subject_name as artist, predicate, object_name as location
                FROM master_relations
                WHERE predicate IN ('area', 'begin-area')
                AND subject_name IN ({placeholders})
            """, batch)
            if not locations_df.empty:
                all_locations.append(locations_df)

        # Combine all batches and process
        if all_locations:
            combined_locations = pd.concat(all_locations, ignore_index=True)
            for artist in unique_artists:
                artist_locs = combined_locations[combined_locations['artist'] == artist]
                city = None
                country = None
                for _, row in artist_locs.iterrows():
                    if row['predicate'] == 'begin-area' and city is None:
                        city = row['location']
                    elif row['predicate'] == 'area' and country is None:
                        country = row['location']
                location_cache[artist] = {'city': city, 'country': country}
        else:
            for artist in unique_artists:
                location_cache[artist] = {'city': None, 'country': None}

    if show_progress:
        print(f"✓ Metadata fetched, building enriched texts...")

    # Enrich each play
    enriched_texts = []
    for idx, row in plays_df.iterrows():
        # Build enriched text with cached data
        parts = []

        # Core: Artist - Song - Album
        if row.get('artist'):
            parts.append(f"{row['artist']}")
        if row.get('song'):
            parts.append(f"- {row['song']}")
        if row.get('album'):
            parts.append(f"- {row['album']}")

        metadata_parts = []

        # Add cached genres
        if include_genres and row.get('artist') in genre_cache:
            genres = genre_cache[row['artist']]
            if genres:
                metadata_parts.append(f"Genres: {', '.join(genres)}")

        # Add cached location
        if include_location and row.get('artist') in location_cache:
            location = location_cache[row['artist']]
            location_parts = []
            if location['city']:
                location_parts.append(location['city'])
            if location['country']:
                location_parts.append(location['country'])
            if location_parts:
                metadata_parts.append(f"From: {', '.join(location_parts)}")

        # Add DJ comment
        if row.get('comment'):
            metadata_parts.append(f"Comment: {row['comment']}")

        # Add labels
        if row.get('labels'):
            metadata_parts.append(f"Label: {row['labels']}")

        # Add rotation status
        if row.get('rotation_status'):
            metadata_parts.append(f"Rotation: {row['rotation_status']}")

        # Add local flag
        if row.get('is_local') == 1:
            metadata_parts.append("Local artist")

        # Add year if available
        if row.get('airdate'):
            try:
                year = pd.to_datetime(row['airdate']).year
                metadata_parts.append(f"Year: {year}")
            except:
                pass

        # Combine
        text = ' '.join(parts)
        if metadata_parts:
            text += ' | ' + ' | '.join(metadata_parts)

        enriched_texts.append(text)

    return enriched_texts
