#!/usr/bin/env python3
"""
Query MusicBrainz Canonical Tables

Command-line tool for querying the MB canonical tables and viewing statistics.
"""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from services.mb_canonical_service import MBCanonicalService


def print_table(rows: list, headers: list):
    """Print a formatted table."""
    if not rows:
        print("No results found.")
        return

    # Calculate column widths
    widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            widths[i] = max(widths[i], len(str(val)))

    # Print header
    header_line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(header_line)
    print("-" * len(header_line))

    # Print rows
    for row in rows:
        print(" | ".join(str(val).ljust(widths[i]) for i, val in enumerate(row)))


def cmd_stats(service: MBCanonicalService, args):
    """Show overall statistics."""
    print(service.format_stats_report())


def cmd_top_artists(service: MBCanonicalService, args):
    """Show top artists."""
    limit = args.limit if hasattr(args, 'limit') else 20
    artists = service.get_top_artists(limit=limit)

    rows = [
        (
            a['artist_name'] or 'Unknown',
            a['artist_mbid'][:8] + '...',
            a['play_count'],
            a['last_seen'][:10]
        )
        for a in artists
    ]
    headers = ['Artist Name', 'MB ID', 'Plays', 'Last Seen']
    print_table(rows, headers)


def cmd_top_labels(service: MBCanonicalService, args):
    """Show top labels."""
    limit = args.limit if hasattr(args, 'limit') else 20
    labels = service.get_top_labels(limit=limit)

    rows = [
        (
            l['label_name'] or 'Unknown',
            l['label_mbid'][:8] + '...',
            l['play_count'],
            l['last_seen'][:10]
        )
        for l in labels
    ]
    headers = ['Label Name', 'MB ID', 'Plays', 'Last Seen']
    print_table(rows, headers)


def cmd_top_recordings(service: MBCanonicalService, args):
    """Show top recordings."""
    limit = args.limit if hasattr(args, 'limit') else 20
    recordings = service.get_top_recordings(limit=limit)

    rows = [
        (
            r['song_title'] or 'Unknown',
            r['recording_mbid'][:8] + '...',
            r['play_count'],
            r['last_seen'][:10]
        )
        for r in recordings
    ]
    headers = ['Song Title', 'MB ID', 'Plays', 'Last Seen']
    print_table(rows, headers)


def cmd_top_releases(service: MBCanonicalService, args):
    """Show top releases."""
    limit = args.limit if hasattr(args, 'limit') else 20
    releases = service.get_top_releases(limit=limit)

    rows = [
        (
            r['album_title'] or 'Unknown',
            r['release_mbid'][:8] + '...',
            r['release_date'] or 'N/A',
            r['play_count'],
            r['last_seen'][:10]
        )
        for r in releases
    ]
    headers = ['Album Title', 'MB ID', 'Release Date', 'Plays', 'Last Seen']
    print_table(rows, headers)


def cmd_search_artists(service: MBCanonicalService, args):
    """Search for artists by name."""
    query = args.query
    limit = args.limit if hasattr(args, 'limit') else 20
    artists = service.search_artists(query, limit=limit)

    if not artists:
        print(f"No artists found matching '{query}'")
        return

    rows = [
        (
            a['artist_name'] or 'Unknown',
            a['artist_mbid'],
            a['play_count'],
            a['first_seen'][:10],
            a['last_seen'][:10]
        )
        for a in artists
    ]
    headers = ['Artist Name', 'MB ID', 'Plays', 'First Seen', 'Last Seen']
    print_table(rows, headers)


def cmd_search_labels(service: MBCanonicalService, args):
    """Search for labels by name."""
    query = args.query
    limit = args.limit if hasattr(args, 'limit') else 20
    labels = service.search_labels(query, limit=limit)

    if not labels:
        print(f"No labels found matching '{query}'")
        return

    rows = [
        (
            l['label_name'] or 'Unknown',
            l['label_mbid'],
            l['play_count'],
            l['first_seen'][:10],
            l['last_seen'][:10]
        )
        for l in labels
    ]
    headers = ['Label Name', 'MB ID', 'Plays', 'First Seen', 'Last Seen']
    print_table(rows, headers)


def cmd_artist(service: MBCanonicalService, args):
    """Show details for a specific artist."""
    artist = service.get_artist(args.mbid)
    if not artist:
        print(f"Artist not found: {args.mbid}")
        return

    print(f"\nArtist Details")
    print("=" * 50)
    print(f"Name:       {artist['artist_name'] or 'Unknown'}")
    print(f"MB ID:      {artist['artist_mbid']}")
    print(f"Play Count: {artist['play_count']:,}")
    print(f"First Seen: {artist['first_seen']}")
    print(f"Last Seen:  {artist['last_seen']}")
    print(f"Created:    {artist['created_at']}")
    print(f"Updated:    {artist['updated_at']}")


def cmd_label(service: MBCanonicalService, args):
    """Show details for a specific label."""
    label = service.get_label(args.mbid)
    if not label:
        print(f"Label not found: {args.mbid}")
        return

    print(f"\nLabel Details")
    print("=" * 50)
    print(f"Name:       {label['label_name'] or 'Unknown'}")
    print(f"MB ID:      {label['label_mbid']}")
    print(f"Play Count: {label['play_count']:,}")
    print(f"First Seen: {label['first_seen']}")
    print(f"Last Seen:  {label['last_seen']}")
    print(f"Created:    {label['created_at']}")
    print(f"Updated:    {label['updated_at']}")


def cmd_recent_artists(service: MBCanonicalService, args):
    """Show recently played artists."""
    days = args.days if hasattr(args, 'days') else 7
    limit = args.limit if hasattr(args, 'limit') else 20
    artists = service.get_recent_artists(days=days, limit=limit)

    print(f"\nArtists played in the last {days} days:")
    rows = [
        (
            a['artist_name'] or 'Unknown',
            a['artist_mbid'][:8] + '...',
            a['play_count'],
            a['last_seen'][:16]
        )
        for a in artists
    ]
    headers = ['Artist Name', 'MB ID', 'Total Plays', 'Last Seen']
    print_table(rows, headers)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Query MusicBrainz canonical tables"
    )
    parser.add_argument(
        '--db',
        type=str,
        default='data/kexp_plays.db',
        help='Path to SQLite database (default: data/kexp_plays.db)'
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')

    # Stats command
    subparsers.add_parser('stats', help='Show overall statistics')

    # Top artists command
    top_artists_parser = subparsers.add_parser('top-artists', help='Show top artists')
    top_artists_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Top labels command
    top_labels_parser = subparsers.add_parser('top-labels', help='Show top labels')
    top_labels_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Top recordings command
    top_recordings_parser = subparsers.add_parser('top-recordings', help='Show top recordings')
    top_recordings_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Top releases command
    top_releases_parser = subparsers.add_parser('top-releases', help='Show top releases')
    top_releases_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Search artists command
    search_artists_parser = subparsers.add_parser('search-artists', help='Search for artists')
    search_artists_parser.add_argument('query', type=str, help='Search query')
    search_artists_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Search labels command
    search_labels_parser = subparsers.add_parser('search-labels', help='Search for labels')
    search_labels_parser.add_argument('query', type=str, help='Search query')
    search_labels_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    # Artist details command
    artist_parser = subparsers.add_parser('artist', help='Show artist details')
    artist_parser.add_argument('mbid', type=str, help='Artist MusicBrainz ID')

    # Label details command
    label_parser = subparsers.add_parser('label', help='Show label details')
    label_parser.add_argument('mbid', type=str, help='Label MusicBrainz ID')

    # Recent artists command
    recent_parser = subparsers.add_parser('recent-artists', help='Show recently played artists')
    recent_parser.add_argument('--days', type=int, default=7, help='Number of days to look back')
    recent_parser.add_argument('--limit', type=int, default=20, help='Number of results')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Check if database exists
    db_path = Path(args.db)
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    # Create service
    service = MBCanonicalService(str(db_path))

    # Execute command
    commands = {
        'stats': cmd_stats,
        'top-artists': cmd_top_artists,
        'top-labels': cmd_top_labels,
        'top-recordings': cmd_top_recordings,
        'top-releases': cmd_top_releases,
        'search-artists': cmd_search_artists,
        'search-labels': cmd_search_labels,
        'artist': cmd_artist,
        'label': cmd_label,
        'recent-artists': cmd_recent_artists,
    }

    if args.command in commands:
        commands[args.command](service, args)
    else:
        print(f"Unknown command: {args.command}")
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
