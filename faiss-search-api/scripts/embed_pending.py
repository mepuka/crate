#!/usr/bin/env python3
"""
KEXP Incremental Embedding Generation Script

Generates embeddings for new plays and adds them to the FAISS index.
Designed to run hourly via cron.

Architecture:
- Queries pending plays from database (plays without embeddings)
- Uses the API's embedding model to generate embeddings
- Calls /api/embeddings/add to update the in-memory FAISS index
- File-based locking to prevent concurrent executions
- Structured JSON logging to stdout

Usage:
    python scripts/embed_pending.py [--limit N] [--dry-run]

Options:
    --limit         Maximum number of plays to process (default: 100)
    --dry-run       Show what would be done without making changes
    --db-path       Path to SQLite database (default: data/music_kb.sqlite)
    --play-ids-path Path to play_ids.npy file (default: data/play_ids.npy)
    --api-url       API URL (default: http://localhost:8000)

Example:
    docker exec kexp-search-api python /app/scripts/embed_pending.py
"""

import argparse
import fcntl
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Set

import httpx
import numpy as np

# Add app directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sentence_transformers import SentenceTransformer


class EmbedPendingService:
    """
    Service for generating and adding embeddings for pending plays.

    Handles:
    - Detecting plays without embeddings
    - Generating embeddings in small batches
    - Calling API to add to in-memory FAISS index
    """

    LOCK_FILE = "/tmp/kexp_embed.lock"
    MODEL_NAME = "BAAI/bge-small-en-v1.5"

    def __init__(
        self,
        db_path: str,
        play_ids_path: str,
        api_url: str = "http://localhost:8000"
    ):
        """
        Initialize embed pending service.

        Args:
            db_path: Path to SQLite database file
            play_ids_path: Path to play_ids.npy alignment file
            api_url: Base URL for the API
        """
        self.db_path = db_path
        self.play_ids_path = play_ids_path
        self.api_url = api_url
        self.lock_fd = None
        self.model: Optional[SentenceTransformer] = None
        self._embedded_ids: Optional[Set[int]] = None

    def acquire_lock(self) -> bool:
        """
        Acquire exclusive lock to prevent concurrent executions.

        Returns:
            True if lock acquired, False if lock already held
        """
        try:
            self.lock_fd = open(self.LOCK_FILE, 'w')
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_fd.write(str(os.getpid()))
            self.lock_fd.flush()
            return True
        except BlockingIOError:
            if self.lock_fd:
                self.lock_fd.close()
                self.lock_fd = None
            return False
        except Exception as e:
            if self.lock_fd:
                self.lock_fd.close()
                self.lock_fd = None
            self._log_error(f"Failed to acquire lock: {e}")
            return False

    def release_lock(self):
        """Release the exclusive lock."""
        if self.lock_fd:
            try:
                fcntl.flock(self.lock_fd, fcntl.LOCK_UN)
                self.lock_fd.close()
            except Exception as e:
                self._log_error(f"Failed to release lock: {e}")
            finally:
                self.lock_fd = None

    def load_embedded_ids(self) -> Set[int]:
        """Load set of play IDs that already have embeddings."""
        if self._embedded_ids is None:
            if os.path.exists(self.play_ids_path):
                play_ids = np.load(self.play_ids_path)
                self._embedded_ids = set(play_ids.tolist())
                self._log_info(f"Loaded {len(self._embedded_ids)} embedded IDs")
            else:
                self._log_info("No play_ids.npy found, starting fresh")
                self._embedded_ids = set()
        return self._embedded_ids

    def get_pending_plays(self, limit: int = 100) -> list[dict]:
        """
        Find plays that don't have embeddings yet.

        Args:
            limit: Maximum number of pending plays to return

        Returns:
            List of play dictionaries
        """
        embedded_ids = self.load_embedded_ids()

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get all plays, filter for pending
        cursor.execute("""
            SELECT id, artist, song, album, comment, labels,
                   rotation_status, is_local, airdate
            FROM fact_plays
            ORDER BY id DESC
        """)

        pending_plays = []
        for row in cursor:
            if row['id'] not in embedded_ids:
                pending_plays.append(dict(row))
                if len(pending_plays) >= limit:
                    break

        conn.close()
        return pending_plays

    def enrich_play_text(self, play: dict) -> str:
        """
        Generate enriched text from play metadata.

        Matches the format used in original embedding generation.

        Args:
            play: Play dictionary with metadata

        Returns:
            Enriched text string for embedding generation
        """
        core_parts = []
        metadata_parts = []

        # Core: Artist - Song - Album
        if play.get('artist'):
            core_parts.append(play['artist'])
        if play.get('song'):
            core_parts.append(f"- {play['song']}")
        if play.get('album'):
            core_parts.append(f"- {play['album']}")

        # DJ Comment (most important for semantic search)
        if play.get('comment'):
            metadata_parts.append(f"Comment: {play['comment']}")

        # Labels
        labels = play.get('labels')
        if labels:
            if isinstance(labels, str):
                try:
                    labels = json.loads(labels)
                except json.JSONDecodeError:
                    labels = [labels]
            if isinstance(labels, list) and labels:
                labels_str = ', '.join(str(l) for l in labels[:3])
                metadata_parts.append(f"Label: {labels_str}")

        # Rotation status
        if play.get('rotation_status'):
            metadata_parts.append(f"Rotation: {play['rotation_status']}")

        # Local artist flag
        if play.get('is_local') == 1:
            metadata_parts.append("Local artist")

        # Year from airdate
        airdate = play.get('airdate')
        if airdate:
            try:
                year = str(airdate)[:4]
                if year.isdigit():
                    metadata_parts.append(f"Year: {year}")
            except Exception:
                pass

        # Combine
        text = ' '.join(core_parts)
        if metadata_parts:
            text += ' | ' + ' | '.join(metadata_parts)

        return text

    def load_model(self):
        """Load the sentence transformer model."""
        if self.model is None:
            self._log_info(f"Loading embedding model: {self.MODEL_NAME}")
            self.model = SentenceTransformer(self.MODEL_NAME)
            self._log_info(f"Model loaded: {self.model.get_sentence_embedding_dimension()}d")

    def generate_embeddings(self, texts: list[str]) -> np.ndarray:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            Numpy array of shape (n, 384), normalized
        """
        self.load_model()
        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False
        )
        return embeddings.astype(np.float32)

    def add_embeddings_via_api(
        self,
        play_ids: list[int],
        embeddings: np.ndarray
    ) -> dict:
        """
        Call the API to add embeddings to the index.

        Args:
            play_ids: List of play IDs
            embeddings: Numpy array of embeddings

        Returns:
            API response dict
        """
        url = f"{self.api_url}/api/embeddings/add"

        # Convert embeddings to list for JSON serialization
        embeddings_list = embeddings.tolist()

        response = httpx.post(
            url,
            json={
                "play_ids": play_ids,
                "embeddings": embeddings_list
            },
            timeout=60.0
        )
        response.raise_for_status()
        return response.json()

    def process_pending(self, limit: int = 100, dry_run: bool = False) -> dict[str, Any]:
        """
        Main processing logic.

        Args:
            limit: Maximum number of plays to process
            dry_run: If True, show what would be done without making changes

        Returns:
            Statistics dict with processing results
        """
        start_time = time.time()

        try:
            # Get pending plays
            pending_plays = self.get_pending_plays(limit=limit)
            self._log_info(f"Found {len(pending_plays)} pending plays")

            if not pending_plays:
                duration_ms = int((time.time() - start_time) * 1000)
                return {
                    "processed": 0,
                    "duration_ms": duration_ms,
                    "status": "no_pending"
                }

            # Extract IDs and generate enriched text
            play_ids = [p['id'] for p in pending_plays]
            texts = [self.enrich_play_text(p) for p in pending_plays]

            if dry_run:
                self._log_info("DRY RUN - would process:")
                for play_id, text in zip(play_ids[:5], texts[:5]):
                    self._log_info(f"  {play_id}: {text[:80]}...")
                if len(play_ids) > 5:
                    self._log_info(f"  ... and {len(play_ids) - 5} more")

                duration_ms = int((time.time() - start_time) * 1000)
                return {
                    "processed": 0,
                    "would_process": len(pending_plays),
                    "duration_ms": duration_ms,
                    "status": "dry_run"
                }

            # Generate embeddings
            self._log_info(f"Generating embeddings for {len(texts)} plays...")
            embeddings = self.generate_embeddings(texts)
            self._log_info(f"Generated embeddings: {embeddings.shape}")

            # Add via API
            self._log_info("Adding embeddings to index via API...")
            result = self.add_embeddings_via_api(play_ids, embeddings)
            self._log_info(f"API response: {result}")

            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "processed": result.get("added", 0),
                "total_vectors": result.get("total_vectors", 0),
                "persisted": result.get("persisted", False),
                "duration_ms": duration_ms,
                "status": "success"
            }

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            self._log_error(f"Processing failed: {e}")
            return {
                "processed": 0,
                "duration_ms": duration_ms,
                "status": "error",
                "error": str(e)
            }

    def _log_info(self, message: str):
        """Log info message as JSON to stdout."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "message": message
        }
        print(json.dumps(log_entry), flush=True)

    def _log_error(self, message: str):
        """Log error message as JSON to stdout."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "ERROR",
            "message": message
        }
        print(json.dumps(log_entry), flush=True)


def main():
    """Main entry point for embed_pending script."""
    parser = argparse.ArgumentParser(
        description="Generate embeddings for pending plays and add to FAISS index"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of plays to process (default: 100)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--db-path",
        default="data/music_kb.sqlite",
        help="Path to SQLite database (default: data/music_kb.sqlite)"
    )
    parser.add_argument(
        "--play-ids-path",
        default="data/play_ids.npy",
        help="Path to play_ids.npy file (default: data/play_ids.npy)"
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="API URL (default: http://localhost:8000)"
    )

    args = parser.parse_args()

    # Initialize service
    service = EmbedPendingService(
        db_path=args.db_path,
        play_ids_path=args.play_ids_path,
        api_url=args.api_url
    )

    # Acquire lock
    if not service.acquire_lock():
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "message": "Previous embed job still running, exiting"
        }
        print(json.dumps(log_entry), flush=True)
        sys.exit(0)

    try:
        # Process pending plays
        stats = service.process_pending(limit=args.limit, dry_run=args.dry_run)

        # Log results
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": "INFO",
            "event": f"embed_{stats['status']}",
            **stats
        }
        print(json.dumps(log_entry), flush=True)

        # Exit with appropriate code
        sys.exit(0 if stats["status"] in ("success", "no_pending", "dry_run") else 1)

    finally:
        # Always release lock
        service.release_lock()


if __name__ == "__main__":
    main()
