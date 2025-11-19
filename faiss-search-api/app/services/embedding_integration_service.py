"""
Memory-efficient embedding integration service.

Handles:
- Detecting plays without embeddings
- Generating enriched text (lightweight, no ML)
- Integrating new embeddings using mmap
- Rebuilding FAISS index in batches

All operations are designed to stay within 4GB RAM constraint.
"""
import numpy as np
import faiss
import tempfile
import os
import hashlib
import base64
import sqlite3
import logging
from pathlib import Path
from typing import List, Dict, Any, Set, Optional

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
        db_path: Path
    ):
        """
        Initialize embedding integration service.

        Args:
            embeddings_path: Path to embeddings_256d.npy
            play_ids_path: Path to play_ids.npy
            index_path: Path to FAISS index file
            db_path: Path to SQLite database
        """
        self.embeddings_path = Path(embeddings_path)
        self.play_ids_path = Path(play_ids_path)
        self.index_path = Path(index_path)
        self.db_path = Path(db_path)

        # Cached embedded IDs (loaded lazily)
        self._embedded_ids: Optional[Set[int]] = None

    def _load_embedded_ids(self) -> Set[int]:
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

    def detect_pending_plays(self, limit: int = 1000, offset: int = 0) -> List[int]:
        """
        Find plays that don't have embeddings yet.

        Memory-efficient: Uses HashSet lookup instead of loading all plays.

        Args:
            limit: Maximum number of pending IDs to return
            offset: Pagination offset

        Returns:
            List of play IDs without embeddings
        """
        embedded_ids = self._load_embedded_ids()

        # Query database for all play IDs (streaming)
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Get pending plays by excluding embedded IDs
        # SQLite query with NOT IN for efficiency
        logger.info("Querying database for pending plays")

        cursor.execute("""
            SELECT id FROM fact_plays
            ORDER BY id DESC
        """)

        # Filter in Python (more memory efficient than large NOT IN clause)
        pending_ids = []
        skipped = 0

        for row in cursor:
            play_id = row[0]
            if play_id not in embedded_ids:
                # Apply offset/limit
                if skipped < offset:
                    skipped += 1
                    continue

                pending_ids.append(play_id)

                if len(pending_ids) >= limit:
                    break

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
        logger.info(f"Total pending: {pending_count} ({total_plays} total - {len(embedded_ids)} embedded)")

        return max(0, pending_count)

    def enrich_play_text(self, play: Dict[str, Any]) -> str:
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
        if play.get('artist'):
            core_parts.append(play['artist'])
        if play.get('song'):
            core_parts.append(f"- {play['song']}")
        if play.get('album'):
            core_parts.append(f"- {play['album']}")

        # DJ Comment (FIRST in metadata - most important for semantic search!)
        if play.get('comment'):
            metadata_parts.append(f"Comment: {play['comment']}")

        # Labels
        labels = play.get('labels')
        if labels:
            # Handle both list and string formats
            if isinstance(labels, list):
                labels_str = ', '.join(labels[:3])  # Limit to first 3
            else:
                labels_str = str(labels)
            metadata_parts.append(f"Label: {labels_str}")

        # Rotation status
        if play.get('rotation_status'):
            metadata_parts.append(f"Rotation: {play['rotation_status']}")

        # Local artist flag
        if play.get('is_local') == 1:
            metadata_parts.append("Local artist")

        # Year (from airdate)
        if play.get('airdate'):
            try:
                # Extract year from ISO datetime string
                year = play['airdate'][:4] if isinstance(play['airdate'], str) else None
                if year:
                    metadata_parts.append(f"Year: {year}")
            except:
                pass

        # Combine core and metadata
        text = ' '.join(core_parts)
        if metadata_parts:
            text += ' | ' + ' | '.join(metadata_parts)

        return text

    def integrate_embeddings(
        self,
        new_embeddings_b64: str,
        new_ids: List[int],
        expected_checksum: str
    ) -> Dict[str, Any]:
        """
        Integrate new embeddings into existing index.

        Memory-efficient implementation:
        - Streams base64 decode to temp file
        - Uses mmap to read arrays (no memory copy)
        - Rebuilds FAISS index in batches
        - Atomic file swaps

        Args:
            new_embeddings_b64: Base64-encoded numpy array (256d embeddings)
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
        with tempfile.NamedTemporaryFile(delete=False, suffix='.npy') as tmp:
            tmp_path = tmp.name
            logger.info(f"Streaming base64 decode to {tmp_path}")

            # Decode in chunks to avoid loading entire base64 string into memory
            chunk_size = 1024 * 1024  # 1MB chunks
            for i in range(0, len(new_embeddings_b64), chunk_size):
                chunk = new_embeddings_b64[i:i + chunk_size]
                decoded = base64.b64decode(chunk)
                tmp.write(decoded)

        try:
            # Step 2: Load decoded array and verify checksum
            logger.info("Loading decoded embeddings")
            with open(tmp_path, 'rb') as f:
                embeddings_bytes = f.read()

            # Verify checksum
            actual_checksum = hashlib.sha256(embeddings_bytes).hexdigest()
            checksum_verified = False

            if expected_checksum.startswith('sha256:'):
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
            expected_size = len(new_ids) * 256
            if len(new_embeddings) != expected_size:
                raise ValueError(
                    f"Size mismatch: expected {expected_size} values "
                    f"({len(new_ids)} plays × 256d), got {len(new_embeddings)}"
                )

            new_embeddings = new_embeddings.reshape(len(new_ids), 256)
            logger.info(f"✓ Loaded new embeddings: {new_embeddings.shape}")

            # Step 3: Load existing embeddings using mmap (no memory copy)
            if self.embeddings_path.exists():
                logger.info(f"Loading existing embeddings with mmap from {self.embeddings_path}")
                existing_embeddings = np.load(self.embeddings_path, mmap_mode='r')
                existing_ids = np.load(self.play_ids_path, mmap_mode='r')
                total_before = len(existing_embeddings)
                logger.info(f"✓ Existing embeddings: {existing_embeddings.shape}")
            else:
                logger.warning("No existing embeddings found, creating new index")
                existing_embeddings = np.array([], dtype=np.float32).reshape(0, 256)
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
                    'plays_integrated': 0,
                    'total_before': total_before,
                    'total_after': total_before,
                    'index_rebuilt': False,
                    'checksum_verified': checksum_verified
                }

            total_after = total_before + len(new_ids_array)
            plays_integrated = len(new_ids_array)

            logger.info(f"Before: {total_before}, After: {total_after}, Adding: {plays_integrated}")

            # Step 5: Create memory-mapped output files (write directly to disk, no RAM copy)
            logger.info("Creating memory-mapped output files")

            # Create temp file paths
            with tempfile.NamedTemporaryFile(delete=False, suffix='_embeddings.npy') as tmp_emb:
                tmp_embeddings_path = tmp_emb.name
            with tempfile.NamedTemporaryFile(delete=False, suffix='_ids.npy') as tmp_ids:
                tmp_ids_path = tmp_ids.name

            # Create memory-mapped arrays for output (writes directly to disk)
            combined_embeddings = np.lib.format.open_memmap(
                tmp_embeddings_path,
                mode='w+',
                dtype=np.float32,
                shape=(total_after, 256)
            )
            combined_ids = np.lib.format.open_memmap(
                tmp_ids_path,
                mode='w+',
                dtype=np.int64,
                shape=(total_after,)
            )

            logger.info("✓ Created mmap output files")

            # Copy existing data to output files (disk-to-disk, minimal RAM)
            logger.info("Copying existing data...")
            combined_embeddings[:total_before] = existing_embeddings
            combined_ids[:total_before] = existing_ids
            logger.info("✓ Copied existing data")

            # Free memory from existing mmap arrays
            del existing_embeddings, existing_ids
            import gc
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
                backup_emb = self.embeddings_path.with_suffix('.npy.backup')
                backup_ids = self.play_ids_path.with_suffix('.npy.backup')
                backup_idx = self.index_path.with_suffix('.index.backup')

                if backup_emb.exists():
                    backup_emb.unlink()
                if backup_ids.exists():
                    backup_ids.unlink()
                if backup_idx.exists():
                    backup_idx.unlink()

                os.rename(self.embeddings_path, backup_emb)
                os.rename(self.play_ids_path, backup_ids)
                if self.index_path.exists():
                    os.rename(self.index_path, backup_idx)

                logger.info("✓ Created backups")

            # Write new index
            with tempfile.NamedTemporaryFile(delete=False, suffix='.index') as tmp_idx:
                tmp_index_path = tmp_idx.name
                faiss.write_index(index, tmp_index_path)

            # Atomic renames (files already have .npy extension from open_memmap)
            os.rename(tmp_embeddings_path, self.embeddings_path)
            os.rename(tmp_ids_path, self.play_ids_path)
            os.rename(tmp_index_path, self.index_path)

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
                'plays_integrated': plays_integrated,
                'total_before': total_before,
                'total_after': total_after,
                'index_rebuilt': True,
                'checksum_verified': checksum_verified
            }

        except Exception as e:
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
        embeddings = np.load(embeddings_path, mmap_mode='r')
        n_vectors, d = embeddings.shape

        logger.info(f"Index dimensions: {n_vectors:,} vectors × {d}d")

        # FAISS index configuration
        nlist = 1024  # Number of clusters (same as original)

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
            logger.info(f"  Batch {i//batch_size + 1}: adding vectors {i:,} to {batch_end:,}")

            # Copy batch to memory (only this batch, not full array)
            batch = np.array(embeddings[i:batch_end], dtype=np.float32)
            faiss.normalize_L2(batch)
            index.add(batch)

            # Explicit cleanup to free batch memory immediately
            del batch
            import gc
            gc.collect()

        logger.info(f"✓ Added all {index.ntotal:,} vectors to index")

        # Set nprobe for search
        index.nprobe = 10

        return index
