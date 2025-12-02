#!/usr/bin/env python3
"""
Extract links from DJ comments and fetch content via Jina AI Reader.

Flow:
1. Find plays with URLs in comments that aren't yet in link_content
2. Extract URLs and classify by domain/type
3. Fetch content via Jina AI Reader API (returns markdown)
4. Store in link_content table and create play_links associations

Usage:
    python scripts/extract_links.py --batch-size 100 --verbose
    python scripts/extract_links.py --dry-run  # Just show what would be fetched
"""

import argparse
import json
import os
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests

# Load .env file if present
def load_dotenv():
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

load_dotenv()

# Jina AI Reader API
JINA_READER_URL = "https://r.jina.ai/"
JINA_API_KEY = os.environ.get("JINA_API_KEY", "")

# Rate limiting
RATE_LIMIT_DELAY = 0.5  # 2 requests per second for Jina
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRY_DELAY = 5.0

# URL regex pattern
URL_PATTERN = re.compile(
    r'https?://[^\s<>"{}|\\^`\[\]]+',
    re.IGNORECASE
)

# Domains to skip (not worth fetching - no meaningful text content)
SKIP_DOMAINS = {
    # Video platforms - just embeds, no text (103K + 38K = 141K links)
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "dailymotion.com",

    # Music streaming - just players, no text
    "soundcloud.com",
    "spotify.com",
    "open.spotify.com",
    "music.apple.com",
    "tidal.com",
    "deezer.com",
    "audiomack.com",

    # Social media - mostly embeds/login walls (32K links)
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "threads.net",
    "bsky.app",
    "mastodon.social",

    # Image hosting
    "imgur.com",
    "i.imgur.com",
    "giphy.com",
    "flickr.com",

    # URL shorteners (55K links - would need resolution)
    "bit.ly",
    "t.co",
    "goo.gl",
    "ow.ly",
    "tinyurl.com",
    "is.gd",
    "buff.ly",
    "amzn.to",
    "linktr.ee",

    # Note: KEXP blog content IS valuable - 122K links with articles
    # We do NOT skip kexp.org - fetch their blog posts!

    # E-commerce / tickets (not article content)
    "ticketmaster.com",
    "axs.com",
    "eventbrite.com",
    "dice.fm",
    "seetickets.us",
    "amazon.com",
    "amzn.to",
}

# Domain classification for domains we DO fetch
DOMAIN_TYPES = {
    # KEXP - blog posts and articles (122K links!)
    "kexp.org": "article",
    "blog.kexp.org": "article",

    # Bandcamp - has artist bios and album descriptions (149K links!)
    "bandcamp.com": "artist",

    # News/Articles - rich text content
    "pitchfork.com": "article",
    "rollingstone.com": "article",
    "stereogum.com": "article",
    "brooklynvegan.com": "article",
    "consequence.net": "article",
    "nme.com": "article",
    "theguardian.com": "article",
    "nytimes.com": "article",
    "npr.org": "article",
    "paste.com": "article",
    "tinymixtapes.com": "article",
    "thequietus.com": "article",
    "aquariumdrunkard.com": "article",
    "residentadvisor.net": "article",
    "thelineofbestfit.com": "article",
    "clashmusic.com": "article",
    "undertheradarmag.com": "article",
    "exclaim.ca": "article",
    "thestranger.com": "article",
    "seattletimes.com": "article",

    # Reference - structured info
    "wikipedia.org": "reference",
    "discogs.com": "reference",
    "allmusic.com": "reference",
    "musicbrainz.org": "reference",
    "rateyourmusic.com": "reference",
    "last.fm": "reference",
    "genius.com": "reference",
    "songkick.com": "reference",

    # Venues/Events
    "bandsintown.com": "event",
}


def extract_urls(text: str) -> list[tuple[str, int, int]]:
    """Extract URLs from text with their positions."""
    if not text:
        return []

    results = []
    for match in URL_PATTERN.finditer(text):
        url = match.group(0)
        # Clean up trailing punctuation
        while url and url[-1] in '.,;:!?)]\'"':
            url = url[:-1]
        results.append((url, match.start(), match.end()))

    return results


def normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    parsed = urlparse(url)
    # Remove www prefix
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    # Remove tracking params (simplified)
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{host}{path}"


def should_skip_url(url: str) -> bool:
    """Check if URL should be skipped based on domain."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]

    # Check against skip list
    for skip_domain in SKIP_DOMAINS:
        if skip_domain in domain:
            return True
    return False


def classify_url(url: str) -> tuple[str, str]:
    """Return (domain, link_type) for a URL."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]

    # Check domain types
    for pattern, link_type in DOMAIN_TYPES.items():
        if pattern in domain:
            return domain, link_type

    return domain, "other"


def fetch_via_jina(url: str, verbose: bool = False) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Fetch URL content via Jina AI Reader.

    Returns (title, markdown, error_message)
    """
    headers = {
        "Accept": "application/json",
    }
    if JINA_API_KEY:
        headers["Authorization"] = f"Bearer {JINA_API_KEY}"

    jina_url = f"{JINA_READER_URL}{url}"

    for attempt in range(MAX_RETRIES):
        try:
            if verbose:
                print(f"    Fetching via Jina: {url[:60]}...")

            response = requests.get(
                jina_url,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )

            if response.status_code == 200:
                data = response.json()
                title = data.get("data", {}).get("title", "")
                content = data.get("data", {}).get("content", "")
                return title, content, None

            elif response.status_code == 429:
                # Rate limited
                if verbose:
                    print(f"    Rate limited, waiting...")
                time.sleep(RETRY_DELAY * 2)
                continue

            elif response.status_code >= 500:
                # Server error, retry
                if verbose:
                    print(f"    Server error {response.status_code}, retrying...")
                time.sleep(RETRY_DELAY)
                continue

            else:
                return None, None, f"HTTP {response.status_code}"

        except requests.exceptions.Timeout:
            if verbose:
                print(f"    Timeout, retrying...")
            time.sleep(RETRY_DELAY)
            continue

        except Exception as e:
            return None, None, str(e)

    return None, None, "Max retries exceeded"


class LinkExtractor:
    """Extract and fetch links from DJ comments."""

    def __init__(self, db_path: str, verbose: bool = False):
        self.db_path = db_path
        self.verbose = verbose
        self.conn = sqlite3.connect(db_path, timeout=30.0)
        self.conn.row_factory = sqlite3.Row
        # Enable WAL mode for concurrent access
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=30000")

    def log(self, msg: str):
        if self.verbose:
            print(f"[{datetime.now().isoformat()}] {msg}")

    def get_plays_with_new_urls(self, batch_size: int) -> list[dict]:
        """Find plays with URLs not yet in link_content."""
        cursor = self.conn.cursor()

        # Get plays with URLs in comments - oldest first to process backlog
        # Then switch to DESC for real-time processing once backlog is done
        cursor.execute("""
            SELECT id, comment
            FROM fact_plays
            WHERE comment LIKE '%http%'
            ORDER BY id ASC
            LIMIT ?
        """, (batch_size * 100,))  # Fetch more since many will be skipped/extracted

        plays_with_new_urls = []

        for row in cursor.fetchall():
            urls = extract_urls(row["comment"])
            new_urls = []

            for url, start, end in urls:
                normalized = normalize_url(url)
                # Check if URL already exists
                cursor.execute(
                    "SELECT id FROM link_content WHERE normalized_url = ?",
                    (normalized,)
                )
                if not cursor.fetchone():
                    new_urls.append((url, normalized, start, end))

            if new_urls:
                plays_with_new_urls.append({
                    "play_id": row["id"],
                    "comment": row["comment"],
                    "urls": new_urls
                })

            if len(plays_with_new_urls) >= batch_size:
                break

        return plays_with_new_urls

    def insert_link(self, url: str, normalized: str, domain: str,
                    link_type: str, title: Optional[str],
                    markdown: Optional[str], error: Optional[str]) -> int:
        """Insert link into link_content table, or return existing ID if URL exists."""
        cursor = self.conn.cursor()

        # Check if URL already exists
        cursor.execute("SELECT id FROM link_content WHERE url = ?", (url,))
        existing = cursor.fetchone()
        if existing:
            return existing[0]

        status = "success" if markdown else ("error" if error else "pending")

        cursor.execute("""
            INSERT INTO link_content
            (url, normalized_url, domain, link_type, title, markdown,
             fetched_at, fetch_status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            url, normalized, domain, link_type, title, markdown,
            datetime.now().isoformat() if markdown or error else None,
            status, error
        ))

        return cursor.lastrowid

    def link_play_to_content(self, play_id: int, link_id: int,
                              start: int, end: int):
        """Create play_links association."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO play_links (play_id, link_id, position_start, position_end)
            VALUES (?, ?, ?, ?)
        """, (play_id, link_id, start, end))

    def process_batch(self, batch_size: int, dry_run: bool = False) -> dict:
        """Process a batch of plays with URLs."""
        stats = {
            "plays_processed": 0,
            "urls_found": 0,
            "urls_fetched": 0,
            "urls_failed": 0,
            "urls_skipped": 0,
        }

        plays = self.get_plays_with_new_urls(batch_size)
        self.log(f"Found {len(plays)} plays with new URLs")

        for play in plays:
            stats["plays_processed"] += 1
            self.log(f"\nPlay {play['play_id']}: {len(play['urls'])} new URLs")

            for url, normalized, start, end in play["urls"]:
                stats["urls_found"] += 1
                domain, link_type = classify_url(url)

                # Skip domains that won't have useful text content
                if should_skip_url(url):
                    stats["urls_skipped"] += 1
                    if dry_run:
                        print(f"  [SKIP] {domain}: {url[:50]}...")
                    continue

                if dry_run:
                    print(f"  Would fetch: [{link_type}] {url[:70]}")
                    continue

                # Fetch via Jina
                title, markdown, error = fetch_via_jina(url, self.verbose)

                if markdown:
                    stats["urls_fetched"] += 1
                    self.log(f"  ✓ {domain}: {title[:50] if title else '(no title)'}...")
                elif error:
                    stats["urls_failed"] += 1
                    self.log(f"  ✗ {domain}: {error}")

                # Insert into database
                link_id = self.insert_link(
                    url, normalized, domain, link_type,
                    title, markdown, error
                )

                # Link to play
                self.link_play_to_content(play["play_id"], link_id, start, end)

                # Rate limit
                time.sleep(RATE_LIMIT_DELAY)

            self.conn.commit()

        return stats

    def get_stats(self) -> dict:
        """Get current link extraction stats."""
        cursor = self.conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM link_content")
        total_links = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM link_content WHERE fetch_status = 'success'")
        fetched = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM link_content WHERE fetch_status = 'error'")
        errors = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM link_content WHERE fetch_status = 'pending'")
        pending = cursor.fetchone()[0]

        cursor.execute("""
            SELECT domain, COUNT(*) as cnt
            FROM link_content
            GROUP BY domain
            ORDER BY cnt DESC
            LIMIT 10
        """)
        top_domains = cursor.fetchall()

        return {
            "total_links": total_links,
            "fetched": fetched,
            "errors": errors,
            "pending": pending,
            "top_domains": [(r[0], r[1]) for r in top_domains],
        }

    def close(self):
        self.conn.close()


def main():
    parser = argparse.ArgumentParser(description="Extract links from DJ comments")
    parser.add_argument("--db-path", default="data/music_kb.sqlite")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true", help="Just show what would be fetched")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--stats", action="store_true", help="Just show stats")

    args = parser.parse_args()

    if not JINA_API_KEY and not args.dry_run and not args.stats:
        print("Warning: JINA_API_KEY not set. API calls may be rate limited.")
        print("Set with: export JINA_API_KEY=your_key")

    extractor = LinkExtractor(args.db_path, args.verbose)

    if args.stats:
        stats = extractor.get_stats()
        print("\n📊 Link Extraction Stats\n")
        print(f"Total links: {stats['total_links']:,}")
        print(f"  Fetched: {stats['fetched']:,}")
        print(f"  Errors: {stats['errors']:,}")
        print(f"  Pending: {stats['pending']:,}")
        print("\nTop domains:")
        for domain, count in stats["top_domains"]:
            print(f"  {domain}: {count:,}")
        extractor.close()
        return

    print(f"\n🔗 Link Extraction {'(dry run)' if args.dry_run else ''}\n")

    stats = extractor.process_batch(args.batch_size, args.dry_run)

    print(f"\n=== Summary ===")
    print(f"Plays processed: {stats['plays_processed']}")
    print(f"URLs found: {stats['urls_found']}")
    print(f"URLs fetched: {stats['urls_fetched']}")
    print(f"URLs failed: {stats['urls_failed']}")

    extractor.close()


if __name__ == "__main__":
    main()
