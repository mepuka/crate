"""
Memory-efficient embedding integration service.

Handles:
- Detecting plays without embeddings
- Generating enriched text (lightweight, no ML)
- Integrating new embeddings using mmap
- Rebuilding FAISS index in batches

All operations are designed to stay within 4GB RAM constraint.
"""

import base64
import gc
import hashlib
import logging
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

import faiss
import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingIntegrationService:
    """
    Service for embedding integration operations.

    Memory-efficient design:
    - Never loads full embedding arrays into memory
    - Uses mmap for reading large arrays
    - Streams base64 decode to temp files
    - Rebuilds FAISS index in batches
    """

    def __init__(
        self,
        embeddings_path: Path,
        play_ids_path: Path,
        index_path: Path,
        db_path: Path,
        embedding_dim: int = 384,
    ):
        """
        Initialize embedding integration service.

        Args:
            embeddings_path: Path to embeddings .npy file
            play_ids_path: Path to play_ids.npy
            index_path: Path to FAISS index file
            db_path: Path to SQLite database
            embedding_dim: Embedding dimension (384 for BGE-small, 256 for legacy)
        """
        self.embeddings_path = Path(embeddings_path)
        self.play_ids_path = Path(play_ids_path)
        self.index_path = Path(index_path)
        self.db_path = Path(db_path)
        self.embedding_dim = embedding_dim

        # Cached embedded IDs (loaded lazily)
        self._embedded_ids: set[int] | None = None

    def _load_embedded_ids(self) -> set[int]:
        """
        Load set of play IDs that have embeddings.

        Cached after first load. Memory usage: ~17MB for 2.2M IDs.

        Returns:
            Set of play IDs with embeddings
        """
        if self._embedded_ids is None:
            if self.play_ids_path.exists():
                logger.info(f"Loading embedded IDs from {self.play_ids_path}")
                play_ids = np.load(self.play_ids_path)
                self._embedded_ids = set(play_ids.tolist())
                logger.info(f"Loaded {len(self._embedded_ids)} embedded IDs")
            else:
                logger.warning(f"Play IDs file not found: {self.play_ids_path}")
                self._embedded_ids = set()

        return self._embedded_ids

    def detect_pending_plays(self, limit: int = 1000, offset: int = 0) -> list[int]:
        """
        Find plays that don't have embeddings yet.

        Optimized approach: Uses temporary table for SQL-level filtering.

        Args:
            limit: Maximum number of pending IDs to return
            offset: Pagination offset

        Returns:
            List of play IDs without embeddings
        """
        embedded_ids = self._load_embedded_ids()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        logger.info("Querying database for pending plays using temp table approach")

        # Create temporary table with embedded IDs for efficient SQL filtering
        # This is faster than Python-side filtering for large datasets
        cursor.execute("CREATE TEMP TABLE IF NOT EXISTS temp_embedded_ids (id INTEGER PRIMARY KEY)")
        cursor.execute("DELETE FROM temp_embedded_ids")  # Clear previous data

        # Insert embedded IDs in batches (SQLite has a limit on INSERT values)
        batch_size = 500
        embedded_list = list(embedded_ids)
        for i in range(0, len(embedded_list), batch_size):
            batch = embedded_list[i : i + batch_size]
            placeholders = ",".join(["(?)"] * len(batch))
            cursor.execute(f"INSERT INTO temp_embedded_ids (id) VALUES {placeholders}", batch)

        logger.info(f"Loaded {len(embedded_ids)} embedded IDs into temp table")

        # Query for pending plays using LEFT JOIN (much faster than NOT IN for large sets)
        cursor.execute(
            """
            SELECT fp.id
            FROM fact_plays fp
            LEFT JOIN temp_embedded_ids te ON fp.id = te.id
            WHERE te.id IS NULL
            ORDER BY fp.id DESC
            LIMIT ? OFFSET ?
        """,
            (limit, offset),
        )

        pending_ids = [row[0] for row in cursor.fetchall()]
        conn.close()

        logger.info(f"Found {len(pending_ids)} pending plays (offset={offset}, limit={limit})")
        return pending_ids

    def count_pending_plays(self) -> int:
        """
        Count total number of plays without embeddings.

        Returns:
            Total number of pending plays
        """
        embedded_ids = self._load_embedded_ids()

        # Get total play count from database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM fact_plays")
        total_plays = cursor.fetchone()[0]
        conn.close()

        pending_count = total_plays - len(embedded_ids)
        logger.info(
            f"Total pending: {pending_count} ({total_plays} total - {len(embedded_ids)} embedded)"
        )

        return max(0, pending_count)

    def detect_pending_plays_optimized(self, limit: int = 1000, offset: int = 0) -> list[int]:
        """
        Find plays without embeddings using indexed LEFT JOIN.

        Optimized O(log n) query using embedded_play_ids table.
        Falls back to detect_pending_plays() if table doesn't exist.

        Args:
            limit: Maximum number of pending IDs to return
            offset: Pagination offset

        Returns:
            List of play IDs without embeddings
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Check if embedded_play_ids table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='embedded_play_ids'"
            )
            if cursor.fetchone() is None:
                logger.warning(
                    "embedded_play_ids table not found, falling back to temp table approach"
                )
                conn.close()
                return self.detect_pending_plays(limit, offset)

            # Optimized query using indexed LEFT JOIN
            cursor.execute(
                """
                SELECT fp.id FROM fact_plays fp
                LEFT JOIN embedded_play_ids ep ON fp.id = ep.play_id
                WHERE ep.play_id IS NULL
                ORDER BY fp.id DESC
                LIMIT ? OFFSET ?
            """,
                (limit, offset),
            )

            pending_ids = [row[0] for row in cursor.fetchall()]
            logger.info(
                "Found %s pending plays (optimized, offset=%s, limit=%s)",
                len(pending_ids),
                offset,
                limit,
            )
            return pending_ids

        finally:
            conn.close()

    def count_pending_plays_optimized(self) -> int:
        """
        Count pending plays using embedded_play_ids table.

        Consistent with detect_pending_plays_optimized().
        Falls back to count_pending_plays() if table doesn't exist.

        Returns:
            Total number of plays without embeddings
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Check if embedded_play_ids table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='embedded_play_ids'"
            )
            if cursor.fetchone() is None:
                logger.warning("embedded_play_ids table not found, using fallback count")
                conn.close()
                return self.count_pending_plays()

            # Count using same LEFT JOIN logic as detection (consistent source of truth)
            cursor.execute("""
                SELECT COUNT(*) FROM fact_plays fp
                LEFT JOIN embedded_play_ids ep ON fp.id = ep.play_id
                WHERE ep.play_id IS NULL
            """)
            count = cursor.fetchone()[0]
            logger.info(f"Pending plays count (optimized): {count}")
            return count

        finally:
            conn.close()

    def mark_plays_embedded(self, play_ids: list[int]) -> int:
        """
        Mark plays as embedded in the tracking table.

        Called from three places:
        1. /add endpoint - after add succeeds
        2. /integrate endpoint - after hot reload succeeds
        3. embed_pending.py script - after API call succeeds

        Args:
            play_ids: List of play IDs that have been embedded

        Returns:
            Number of plays marked (may be less if some already existed)
        """
        if not play_ids:
            return 0

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Ensure table exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS embedded_play_ids (
                    play_id INTEGER PRIMARY KEY,
                    embedded_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)

            # Insert with INSERT OR IGNORE to handle duplicates
            cursor.executemany(
                "INSERT OR IGNORE INTO embedded_play_ids (play_id) VALUES (?)",
                [(pid,) for pid in play_ids],
            )
            marked_count = cursor.rowcount
            conn.commit()

            logger.info(f"Marked {marked_count} plays as embedded (of {len(play_ids)} requested)")
            return marked_count

        finally:
            conn.close()

    def enrich_play_text(self, play: dict[str, Any]) -> str:
        """
        Generate enriched text from play metadata.

        Matches the EXACT format used in original embedding generation:
        "Artist - Song - Album | Comment: X | Label: Y | Rotation: Z | ..."

        Lightweight implementation - NO ML models, just string formatting.

        Args:
            play: Play dictionary with metadata

        Returns:
            Enriched text string for embedding generation (matches original format)
        """
        core_parts = []
        metadata_parts = []

        # Core: Artist - Song - Album (using dashes like original)
        if play.get("artist"):
            core_parts.append(play["artist"])
        if play.get("song"):
            core_parts.append(f"- {play['song']}")
        if play.get("album"):
            core_parts.append(f"- {play['album']}")

        # DJ Comment (FIRST in metadata - most important for semantic search!)
        if play.get("comment"):
            metadata_parts.append(f"Comment: {play['comment']}")

        # Labels
        labels = play.get("labels")
        if labels:
            # Handle both list and string formats
            labels_str = ", ".join(labels[:3]) if isinstance(labels, list) else str(labels)
            metadata_parts.append(f"Label: {labels_str}")

        # Rotation status
        if play.get("rotation_status"):
            metadata_parts.append(f"Rotation: {play['rotation_status']}")

        # Local artist flag
        if play.get("is_local") == 1:
            metadata_parts.append("Local artist")

        # Year (from airdate)
        if play.get("airdate"):
            try:
                # Extract year from ISO datetime string
                year = play["airdate"][:4] if isinstance(play["airdate"], str) else None
                if year:
                    metadata_parts.append(f"Year: {year}")
            except (TypeError, ValueError):
                pass

        # Combine core and metadata
        text = " ".join(core_parts)
        if metadata_parts:
            text += " | " + " | ".join(metadata_parts)

        return text

    def integrate_embeddings(
        self, new_embeddings_b64: str, new_ids: list[int], expected_checksum: str
    ) -> dict[str, Any]:
        """
        Integrate new embeddings into existing index.

        Memory-efficient implementation:
        - Streams base64 decode to temp file
        - Uses mmap to read arrays (no memory copy)
        - Rebuilds FAISS index in batches
        - Atomic file swaps

        Args:
            new_embeddings_b64: Base64-encoded numpy array (384d embeddings, BGE-small)
            new_ids: List of play IDs for new embeddings
            expected_checksum: SHA256 checksum for verification (format: 'sha256:hex')

        Returns:
            Dictionary with integration results:
                - plays_integrated: Number of plays integrated
                - total_before: Total embeddings before integration
                - total_after: Total embeddings after integration
                - index_rebuilt: Whether index was rebuilt
                - checksum_verified: Whether checksum matched

        Raises:
            ValueError: If checksum doesn't match or data is invalid
        """
        logger.info("Starting embedding integration")

        # Step 1: Decode base64 to temp file (streaming, avoid memory spike)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".npy") as tmp:
            tmp_path = tmp.name
            logger.info(f"Streaming base64 decode to {tmp_path}")

            # Decode in chunks to avoid loading entire base64 string into memory
            chunk_size = 1024 * 1024  # 1MB chunks
            for i in range(0, len(new_embeddings_b64), chunk_size):
                chunk = new_embeddings_b64[i : i + chunk_size]
                decoded = base64.b64decode(chunk)
                tmp.write(decoded)

        try:
            # Step 2: Load decoded array and verify checksum
            logger.info("Loading decoded embeddings")
            with open(tmp_path, "rb") as f:
                embeddings_bytes = f.read()

            # Verify checksum
            actual_checksum = hashlib.sha256(embeddings_bytes).hexdigest()
            checksum_verified = False

            if expected_checksum.startswith("sha256:"):
                expected_hash = expected_checksum[7:]  # Remove 'sha256:' prefix
                if actual_checksum != expected_hash:
                    raise ValueError(
                        f"Checksum mismatch: expected {expected_hash}, got {actual_checksum}"
                    )
                checksum_verified = True
                logger.info("✓ Checksum verified")
            else:
                logger.warning("Checksum format invalid, skipping verification")

            # Load as numpy array
            new_embeddings = np.frombuffer(embeddings_bytes, dtype=np.float32)

            # Validate shape
            expected_size = len(new_ids) * self.embedding_dim
            if len(new_embeddings) != expected_size:
                raise ValueError(
                    f"Size mismatch: expected {expected_size} values "
                    f"({len(new_ids)} plays × {self.embedding_dim}d), got {len(new_embeddings)}"
                )

            new_embeddings = new_embeddings.reshape(len(new_ids), self.embedding_dim)
            logger.info(f"✓ Loaded new embeddings: {new_embeddings.shape}")

            # Step 3: Load existing embeddings using mmap (no memory copy)
            if self.embeddings_path.exists():
                logger.info(f"Loading existing embeddings with mmap from {self.embeddings_path}")
                existing_embeddings = np.load(self.embeddings_path, mmap_mode="r")
                existing_ids = np.load(self.play_ids_path, mmap_mode="r")
                total_before = len(existing_embeddings)
                logger.info(f"✓ Existing embeddings: {existing_embeddings.shape}")
            else:
                logger.warning("No existing embeddings found, creating new index")
                existing_embeddings = np.array([], dtype=np.float32).reshape(0, self.embedding_dim)
                existing_ids = np.array([], dtype=np.int64)
                total_before = 0

            # Step 4: Merge arrays using memory-mapped files (ZERO memory overhead)
            logger.info("Merging embeddings (memory-efficient file-based merge)")
            new_ids_array = np.array(new_ids, dtype=np.int64)

            # Check for duplicates
            existing_ids_set = set(existing_ids.tolist())
            duplicates = [id for id in new_ids if id in existing_ids_set]
            if duplicates:
                logger.warning(f"Found {len(duplicates)} duplicate IDs, will be skipped")
                # Filter out duplicates
                mask = [id not in existing_ids_set for id in new_ids]
                new_ids_array = new_ids_array[mask]
                new_embeddings = new_embeddings[mask]

            if len(new_ids_array) == 0:
                logger.warning("No new embeddings to integrate after deduplication")
                return {
                    "plays_integrated": 0,
                    "total_before": total_before,
                    "total_after": total_before,
                    "index_rebuilt": False,
                    "checksum_verified": checksum_verified,
                }

            total_after = total_before + len(new_ids_array)
            plays_integrated = len(new_ids_array)

            logger.info(f"Before: {total_before}, After: {total_after}, Adding: {plays_integrated}")

            # Step 5: Create memory-mapped output files (write directly to disk, no RAM copy)
            logger.info("Creating memory-mapped output files")

            # Create temp files in same directory as target for atomic rename
            # Cross-filesystem moves require copy+delete which is slow
            target_dir = self.embeddings_path.parent
            with tempfile.NamedTemporaryFile(
                dir=target_dir, delete=False, suffix="_embeddings.npy"
            ) as tmp_emb:
                tmp_embeddings_path = tmp_emb.name
            with tempfile.NamedTemporaryFile(
                dir=target_dir, delete=False, suffix="_ids.npy"
            ) as tmp_ids:
                tmp_ids_path = tmp_ids.name

            # Create memory-mapped arrays for output (writes directly to disk)
            combined_embeddings = np.lib.format.open_memmap(
                tmp_embeddings_path,
                mode="w+",
                dtype=np.float32,
                shape=(total_after, self.embedding_dim),
            )
            combined_ids = np.lib.format.open_memmap(
                tmp_ids_path, mode="w+", dtype=np.int64, shape=(total_after,)
            )

            logger.info("✓ Created mmap output files")

            # Copy existing data to output files in batches (memory-efficient)
            # Full array copy would spike memory; batch by 25k vectors (~38MB per batch)
            batch_size = 25000
            logger.info(f"Copying existing data in batches of {batch_size:,}...")
            for i in range(0, total_before, batch_size):
                batch_end = min(i + batch_size, total_before)
                # Materialize batch from mmap, copy to output mmap
                batch = np.array(existing_embeddings[i:batch_end])
                combined_embeddings[i:batch_end] = batch
                combined_ids[i:batch_end] = np.array(existing_ids[i:batch_end])
                del batch
                gc.collect()
            logger.info("✓ Copied existing data (batch-wise)")

            # Free memory from existing mmap arrays
            del existing_embeddings, existing_ids
            gc.collect()
            logger.info("✓ Freed existing array references")

            # Append new data
            logger.info("Appending new data...")
            combined_embeddings[total_before:] = new_embeddings
            combined_ids[total_before:] = new_ids_array
            logger.info("✓ Appended new data")

            # Flush and free memory-mapped arrays (forces write to disk)
            del combined_embeddings, combined_ids, new_embeddings, new_ids_array
            gc.collect()
            logger.info("✓ Flushed mmap arrays to disk")

            logger.info("✓ Saved temporary files")

            # Step 6: Rebuild FAISS index from temp file (batched, memory-efficient)
            logger.info("Rebuilding FAISS index")
            index = self._rebuild_index_from_file(tmp_embeddings_path)
            logger.info(f"✓ Index rebuilt: {index.ntotal:,} vectors")

            # Step 7: Atomic file swaps
            logger.info("Performing atomic file swaps")

            # Backup old files (optional, for safety)
            if self.embeddings_path.exists():
                backup_emb = self.embeddings_path.with_suffix(".npy.backup")
                backup_ids = self.play_ids_path.with_suffix(".npy.backup")
                backup_idx = self.index_path.with_suffix(".index.backup")

                if backup_emb.exists():
                    backup_emb.unlink()
                if backup_ids.exists():
                    backup_ids.unlink()
                if backup_idx.exists():
                    backup_idx.unlink()

                shutil.move(self.embeddings_path, backup_emb)
                shutil.move(self.play_ids_path, backup_ids)
                if self.index_path.exists():
                    shutil.move(self.index_path, backup_idx)

                logger.info("✓ Created backups")

            # Write new index (in same directory as target for atomic rename)
            with tempfile.NamedTemporaryFile(
                dir=self.index_path.parent, delete=False, suffix=".index"
            ) as tmp_idx:
                tmp_index_path = tmp_idx.name
                faiss.write_index(index, tmp_index_path)

            # Move temp files to final locations (shutil.move handles cross-filesystem)
            shutil.move(tmp_embeddings_path, self.embeddings_path)
            shutil.move(tmp_ids_path, self.play_ids_path)
            shutil.move(tmp_index_path, self.index_path)

            logger.info("✓ Atomic swaps complete")

            # Cleanup temp files
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

            # Clear cached embedded IDs (force reload on next query)
            self._embedded_ids = None

            logger.info("=" * 80)
            logger.info("INTEGRATION COMPLETE")
            logger.info("=" * 80)

            return {
                "plays_integrated": plays_integrated,
                "total_before": total_before,
                "total_after": total_after,
                "index_rebuilt": True,
                "checksum_verified": checksum_verified,
            }

        except Exception:
            # Cleanup temp file on error
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

    def _rebuild_index_from_file(self, embeddings_path: str) -> faiss.Index:
        """
        Rebuild FAISS index from embeddings file using batched processing.

        Memory-efficient: Only loads batches into memory, uses mmap for reading.

        Args:
            embeddings_path: Path to embeddings .npy file

        Returns:
            FAISS index trained and populated with embeddings
        """
        logger.info(f"Rebuilding FAISS index from {embeddings_path}")

        # Load with mmap to avoid full memory copy
        embeddings = np.load(embeddings_path, mmap_mode="r")
        n_vectors, d = embeddings.shape

        logger.info(f"Index dimensions: {n_vectors:,} vectors × {d}d")

        # FAISS index configuration - adaptive nlist based on vector count
        # nlist must be <= n_vectors; use ~4*sqrt(n) as rule of thumb, capped at 1024
        nlist = min(1024, max(1, int(4 * (n_vectors**0.5))))
        logger.info(f"Using nlist={nlist} for {n_vectors:,} vectors")

        # Create index
        quantizer = faiss.IndexFlatIP(d)
        index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)

        # Train on sample (don't need all vectors for training)
        sample_size = min(100000, n_vectors)
        logger.info(f"Training on {sample_size:,} sample vectors")

        sample = np.array(embeddings[:sample_size], dtype=np.float32)
        faiss.normalize_L2(sample)
        index.train(sample)

        logger.info("✓ Index trained")

        # Add vectors in batches (memory-efficient, smaller batches to reduce peak memory)
        batch_size = 25000  # Reduced from 100K to minimize memory spikes
        logger.info(f"Adding vectors in batches of {batch_size:,}")

        for i in range(0, n_vectors, batch_size):
            batch_end = min(i + batch_size, n_vectors)
            logger.info(f"  Batch {i // batch_size + 1}: adding vectors {i:,} to {batch_end:,}")

            # Copy batch to memory (only this batch, not full array)
            batch = np.array(embeddings[i:batch_end], dtype=np.float32)
            faiss.normalize_L2(batch)
            index.add(batch)

            # Explicit cleanup to free batch memory immediately
            del batch
            gc.collect()

        logger.info(f"✓ Added all {index.ntotal:,} vectors to index")

        # Set nprobe for search
        index.nprobe = 10

        return index
