"""FAISS-based semantic search service."""

import json
import logging
import pickle
import threading
from pathlib import Path

import faiss
import numpy as np

try:
    import joblib

    HAS_JOBLIB = True
except ImportError:
    HAS_JOBLIB = False

import contextlib

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class FAISSSearchService:
    """
    FAISS-based semantic search service for music plays.

    Handles:
    - Loading embeddings and FAISS index
    - Encoding queries (with optional PCA transformation for legacy indexes)
    - Fast similarity search
    - Mapping indices to play IDs

    Supports two modes:
    - BGE-small (384d native): No PCA needed, pca_applied=False in metadata
    - Legacy mpnet (768d→256d): PCA reduction required, pca_applied=True in metadata
    """

    def __init__(
        self,
        embeddings_path: Path,
        play_ids_path: Path,
        pca_path: Path | None = None,
        index_path: Path | None = None,
        metadata_path: Path | None = None,
        nlist: int = 1024,
        nprobe: int = 10,
        skip_embeddings_load: bool = True,  # FAISS index contains vectors, .npy not needed
    ):
        """
        Initialize the FAISS search service.

        Args:
            embeddings_path: Path to embeddings .npy file - OPTIONAL for search
            play_ids_path: Path to play_ids.npy (index-to-ID mapping)
            pca_path: Path to PCA transformer file (only for legacy 768d→256d)
            index_path: Path to FAISS index (contains the vectors internally)
            metadata_path: Path to metadata.json
            nlist: Number of clusters for IVF index
            nprobe: Number of clusters to probe during search
            skip_embeddings_load: Skip loading .npy file (index contains vectors)
        """
        self.embeddings_path = Path(embeddings_path)
        self.play_ids_path = Path(play_ids_path)
        self.metadata_path = metadata_path or self.embeddings_path.parent / "metadata.json"
        self.skip_embeddings_load = skip_embeddings_load

        # PCA path (only used for legacy indexes with pca_applied=True)
        if pca_path:
            self.pca_path = Path(pca_path)
        else:
            data_dir = self.embeddings_path.parent
            pca_joblib = data_dir / "pca_transformer_256d.joblib"
            pca_pkl = data_dir / "pca_256.pkl"
            self.pca_path = pca_joblib if pca_joblib.exists() else pca_pkl

        # Auto-detect index path if not specified
        if index_path:
            self.index_path = Path(index_path)
        else:
            # Derive from embeddings path (e.g., embeddings_384d.npy -> embeddings_384d.index)
            self.index_path = self.embeddings_path.with_suffix(".index")

        self.nlist = nlist
        self.nprobe = nprobe

        # Will be loaded during initialization
        self.embeddings: np.ndarray | None = None
        self.play_ids: np.ndarray | None = None
        self.index: faiss.Index | None = None
        self.pca: object | None = None  # None for BGE-small (native 384d)
        self.model: SentenceTransformer | None = None
        self.model_name: str | None = None
        self.embedding_dim: int = 384  # Default to BGE-small
        self.pca_applied: bool = False  # True only for legacy indexes
        self.dirty: bool = False  # Track if index has unsaved changes

        # Thread safety: RLock protects all index/play_ids access
        # RLock allows nested calls (e.g., search_and_map calling _search_internal)
        self._mutex = threading.RLock()

        # Mmap safety: Track if index was loaded with mmap
        # FAISS mmap indexes must be cloned to RAM before mutation
        self._index_is_mmap: bool = False

        # Index version: Incremented on hot_reload for debugging/observability
        self._index_version: int = 0

    def load_metadata(self) -> dict:
        """Load metadata.json to get model information."""
        if not self.metadata_path.exists():
            raise FileNotFoundError(f"Metadata not found: {self.metadata_path}")

        with open(self.metadata_path) as f:
            metadata = json.load(f)

        # Load model configuration
        self.model_name = metadata.get("model_name", "BAAI/bge-small-en-v1.5")
        self.embedding_dim = metadata.get("embedding_dim", 384)
        self.pca_applied = metadata.get("pca_applied", False)

        logger.info(
            f"Metadata: model={self.model_name}, dim={self.embedding_dim}, pca={self.pca_applied}"
        )
        return metadata

    def load_embeddings(self):
        """Load reduced embeddings from .npy file (optional - index contains vectors)."""
        if self.skip_embeddings_load:
            logger.info("Skipping embeddings.npy load (FAISS index contains vectors)")
            return

        if not self.embeddings_path.exists():
            logger.warning(f"Embeddings file not found: {self.embeddings_path} (not required)")
            return

        logger.info(f"Loading embeddings from {self.embeddings_path}")
        self.embeddings = np.load(self.embeddings_path).astype("float32")
        logger.info(f"✓ Loaded embeddings: {self.embeddings.shape}")

    def load_play_ids(self):
        """Load play IDs mapping from .npy file."""
        if not self.play_ids_path.exists():
            raise FileNotFoundError(f"Play IDs mapping not found: {self.play_ids_path}")

        logger.info(f"Loading play IDs from {self.play_ids_path} (mmap)")
        # Use mmap_mode='r' to map file into memory without loading fully
        self.play_ids = np.load(self.play_ids_path, mmap_mode="r")
        logger.info(f"✓ Loaded play IDs: {self.play_ids.shape}")

        # Verify alignment (only if embeddings were loaded)
        if self.embeddings is not None and len(self.play_ids) != len(self.embeddings):
            raise ValueError(
                f"Mismatch: {len(self.play_ids)} play IDs vs {len(self.embeddings)} embeddings"
            )

    def load_pca(self):
        """Load PCA transformer (only for legacy indexes with pca_applied=True)."""
        if not self.pca_applied:
            logger.info("PCA not required (native embedding dimensions)")
            return

        if not self.pca_path.exists():
            raise FileNotFoundError(f"PCA transformer not found: {self.pca_path}")

        logger.info(f"Loading PCA transformer from {self.pca_path}")

        if self.pca_path.suffix == ".joblib":
            if not HAS_JOBLIB:
                raise ImportError("joblib required for .joblib files")
            self.pca = joblib.load(self.pca_path)
        else:
            with open(self.pca_path, "rb") as f:
                self.pca = pickle.load(f)

        logger.info(f"✓ PCA loaded: {self.pca.n_components_} components")

    def load_model(self):
        """Load the sentence transformer model."""
        if self.model_name is None:
            self.load_metadata()

        logger.info(f"Loading embedding model: {self.model_name}")
        self.model = SentenceTransformer(self.model_name)
        logger.info(f"✓ Model loaded: {self.model.get_sentence_embedding_dimension()}d")

    def load_index(self):
        """Load FAISS index (thread-safe initial load with mmap)."""
        if not self.index_path.exists():
            raise FileNotFoundError(f"FAISS index not found: {self.index_path}")

        with self._mutex:
            logger.info(f"Loading FAISS index from {self.index_path} (mmap)")
            # Use IO_FLAG_MMAP to map index into memory
            self.index = faiss.read_index(str(self.index_path), faiss.IO_FLAG_MMAP)
            self._index_is_mmap = True  # Track mmap state for mutation safety
            # Only set nprobe for IVF indexes (not IndexFlatIP)
            if hasattr(self.index, "nprobe"):
                self.index.nprobe = self.nprobe
            logger.info(
                f"✓ Index loaded: {self.index.ntotal:,} vectors (mmap, v{self._index_version})"
            )

    def encode_query(self, query_text: str) -> np.ndarray:
        """
        Encode a text query to embedding vector.

        For BGE-small (native 384d): Direct encoding, no PCA
        For legacy mpnet (768d→256d): Apply PCA reduction

        Args:
            query_text: Search query text

        Returns:
            Normalized embedding vector (384d for BGE, 256d for legacy)
        """
        # Step 1: Generate embedding (normalized)
        query_embedding = self.model.encode([query_text], normalize_embeddings=True)[0]

        # Step 2: Apply PCA reduction only if needed (legacy mode)
        if self.pca_applied and self.pca is not None:
            query_embedding = self.pca.transform([query_embedding])[0]
            # Re-normalize after PCA
            query_embedding = query_embedding / np.linalg.norm(query_embedding)

        return query_embedding.astype("float32")

    def _search_internal(
        self, query_vector: np.ndarray, k: int = 10
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Internal search - caller must hold mutex.

        Args:
            query_vector: Encoded query vector
            k: Number of results to return

        Returns:
            Tuple of (indices, distances) where indices are FAISS indices.
            Filters out -1 indices (FAISS returns -1 when probe can't supply k hits).
        """
        # Reshape for FAISS
        query_vector = query_vector.reshape(1, -1)

        # Search
        distances, indices = self.index.search(query_vector, k)

        # Filter out -1 indices (invalid results)
        indices_1d = indices[0]
        distances_1d = distances[0]
        valid_mask = indices_1d >= 0

        return indices_1d[valid_mask], distances_1d[valid_mask]

    def search(self, query: str, k: int = 10) -> tuple[np.ndarray, np.ndarray]:
        """
        Thread-safe search for similar embeddings.

        For atomic search + ID mapping, prefer search_and_map() instead.

        Args:
            query: Search query text
            k: Number of results to return

        Returns:
            Tuple of (indices, distances) where indices are FAISS indices.
            Filters out -1 indices (FAISS returns -1 when probe can't supply k hits).
        """
        # Encode outside mutex to maximize concurrent request throughput.
        query_vector = self.encode_query(query)
        with self._mutex:
            return self._search_internal(query_vector, k)

    def search_and_map(self, query: str, k: int = 10) -> tuple[np.ndarray, np.ndarray]:
        """
        ATOMIC search + ID mapping - holds mutex for entire operation.

        Prevents hot_reload() from interleaving between search and ID mapping.
        This is the method HybridSearchService should call.

        Args:
            query: Search query text
            k: Number of results to return

        Returns:
            Tuple of (play_ids, distances) - NOT raw FAISS indices
        """
        # Encode outside mutex to avoid serializing model inference.
        query_vector = self.encode_query(query)
        with self._mutex:
            indices, distances = self._search_internal(query_vector, k)
            play_ids = self.play_ids[indices]
            return play_ids, distances

    def get_play_ids(self, faiss_indices: np.ndarray) -> np.ndarray:
        """
        Thread-safe ID mapping (for backwards compat, prefer search_and_map).

        Args:
            faiss_indices: Array of FAISS indices

        Returns:
            Array of play IDs
        """
        with self._mutex:
            return self.play_ids[faiss_indices]

    def initialize(self):
        """Initialize all components."""
        logger.info("=" * 80)
        logger.info("Initializing FAISS Search Service")
        logger.info("=" * 80)

        self.load_metadata()
        self.load_embeddings()
        self.load_play_ids()
        self.load_pca()
        self.load_model()
        self.load_index()

        logger.info("=" * 80)
        logger.info("✓ Initialization complete")
        logger.info("=" * 80)

    def add_embeddings(self, play_ids: list[int], embeddings: np.ndarray) -> dict:
        """
        Thread-safe add of new embeddings to the in-memory FAISS index.

        This is designed for incremental updates - adding small batches
        of new embeddings without rebuilding the entire index.

        IMPORTANT: Clones mmap index to RAM before first mutation.
        FAISS mmap indexes are designed for read-only access.

        Args:
            play_ids: List of play IDs for the new embeddings
            embeddings: Numpy array of shape (n, embedding_dim), already normalized

        Returns:
            Dict with stats: added count, total vectors, persisted status
        """
        with self._mutex:
            if self.index is None:
                raise RuntimeError("FAISS index not initialized")

            n_new = len(play_ids)
            if n_new == 0:
                return {"added": 0, "total_vectors": self.index.ntotal}

            # Validate embeddings shape
            if embeddings.shape[0] != n_new:
                raise ValueError(f"Mismatch: {n_new} play_ids but {embeddings.shape[0]} embeddings")
            if embeddings.shape[1] != self.embedding_dim:
                raise ValueError(
                    f"Wrong dimension: expected {self.embedding_dim}, got {embeddings.shape[1]}"
                )

            # Clone mmap index to RAM before first mutation
            # FAISS mmap indexes are read-only; mutations have undefined behavior
            if self._index_is_mmap:
                logger.info("Cloning mmap index to RAM for safe mutation")
                self.index = faiss.read_index(str(self.index_path))
                self._index_is_mmap = False
                logger.info(f"✓ Index cloned to RAM ({self.index.ntotal:,} vectors)")

            # Ensure float32 and normalized
            embeddings = embeddings.astype("float32")
            faiss.normalize_L2(embeddings)

            # Add to FAISS index (IVFFlat supports this without retraining)
            total_before = self.index.ntotal
            self.index.add(embeddings)

            # Update play_ids mapping - must convert to non-mmap array to append
            # This will trigger a copy, but play_ids is much smaller than the index
            if isinstance(self.play_ids, np.memmap):
                self.play_ids = np.array(self.play_ids)

            new_ids_array = np.array(play_ids, dtype=np.int64)
            self.play_ids = np.append(self.play_ids, new_ids_array)

            logger.info(
                f"Added {n_new} embeddings to index "
                f"({total_before:,} → {self.index.ntotal:,} vectors, v{self._index_version})"
            )

            # Mark as dirty instead of persisting immediately
            self.dirty = True

            return {
                "added": n_new,
                "total_vectors": self.index.ntotal,
                "persisted": False,  # Defer persistence
            }

    def _persist_index(self) -> bool:
        """
        Persist the FAISS index and play_ids to disk atomically.

        Uses temp file + move pattern to ensure safe updates.
        Uses shutil.move instead of os.rename for cross-device support (Docker).

        Returns:
            True if persisted successfully, False otherwise
        """
        import os

        tmp_index_path = None
        tmp_ids_path = None

        try:
            # Write to temp files in same directory as target (for atomic rename)
            data_dir = self.index_path.parent

            # Write index to temp file
            tmp_index_path = str(data_dir / f".tmp_index_{os.getpid()}.index")
            faiss.write_index(self.index, tmp_index_path)

            # Write play_ids to temp file
            tmp_ids_path = str(data_dir / f".tmp_ids_{os.getpid()}.npy")
            np.save(tmp_ids_path, self.play_ids)

            # Atomic rename (now on same filesystem)
            os.rename(tmp_index_path, str(self.index_path))
            os.rename(tmp_ids_path, str(self.play_ids_path))

            tmp_index_path = None  # Mark as moved
            tmp_ids_path = None

            logger.info(f"✓ Persisted index ({self.index.ntotal:,} vectors) and play_ids to disk")
            return True

        except Exception as e:
            logger.error(f"Failed to persist index: {e}")
            # Clean up temp files if they exist
            for path in [tmp_index_path, tmp_ids_path]:
                if path and os.path.exists(path):
                    with contextlib.suppress(Exception):
                        os.unlink(path)
            return False

    def persist_if_needed(self) -> bool:
        """
        Thread-safe persist index if it has unsaved changes.

        Uses exclusive mutex - FAISS serialize thread safety is undocumented.

        Returns:
            True if persisted, False if no changes or failed
        """
        with self._mutex:
            if not self.dirty:
                return False

            logger.info("Persisting dirty index...")
            if self._persist_index():
                self.dirty = False
                return True

            return False

    def generate_embeddings(self, texts: list[str]) -> np.ndarray:
        """
        Generate embeddings for a list of texts using the loaded model.

        Args:
            texts: List of text strings to embed

        Returns:
            Numpy array of shape (n, embedding_dim), normalized
        """
        if self.model is None:
            raise RuntimeError("Embedding model not initialized")

        # BGE-small expects normalized embeddings
        embeddings = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)

        return embeddings.astype("float32")

    def hot_reload(self):
        """
        Thread-safe hot reload - acquires _mutex for atomic swap.

        Called after integration completes to reload the updated index
        without restarting the service.

        Uses mmap for memory efficiency - reload is fast and doesn't
        require loading entire index into RAM.
        """
        with self._mutex:  # EXPLICIT: mutex protects index + play_ids swap
            logger.info("Hot reloading FAISS index...")

            # Load updated index with mmap
            self.index = faiss.read_index(str(self.index_path), faiss.IO_FLAG_MMAP)
            self._index_is_mmap = True

            # Set nprobe for IVF indexes
            if hasattr(self.index, "nprobe"):
                self.index.nprobe = self.nprobe

            # Load updated play_ids with mmap
            self.play_ids = np.load(self.play_ids_path, mmap_mode="r")

            # Increment version and clear dirty flag
            self._index_version += 1
            self.dirty = False

            logger.info(
                f"✓ Hot reloaded: {self.index.ntotal:,} vectors, v{self._index_version} (mmap)"
            )

    @property
    def index_version(self) -> int:
        """Current index version (incremented on hot_reload)."""
        return self._index_version

    @property
    def is_mmap(self) -> bool:
        """Whether index is currently memory-mapped (read-only)."""
        return self._index_is_mmap
