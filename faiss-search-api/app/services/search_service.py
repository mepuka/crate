"""FAISS-based semantic search service."""
import faiss
import pickle
import numpy as np
from pathlib import Path
from typing import Optional, Tuple
import json
import logging

try:
    import joblib
    HAS_JOBLIB = True
except ImportError:
    HAS_JOBLIB = False

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
        pca_path: Optional[Path] = None,
        index_path: Optional[Path] = None,
        metadata_path: Optional[Path] = None,
        nlist: int = 1024,
        nprobe: int = 10,
        skip_embeddings_load: bool = True  # FAISS index contains vectors, .npy not needed
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
            self.index_path = self.embeddings_path.with_suffix('.index')

        self.nlist = nlist
        self.nprobe = nprobe

        # Will be loaded during initialization
        self.embeddings: Optional[np.ndarray] = None
        self.play_ids: Optional[np.ndarray] = None
        self.index: Optional[faiss.Index] = None
        self.pca: Optional[object] = None  # None for BGE-small (native 384d)
        self.model: Optional[SentenceTransformer] = None
        self.model_name: Optional[str] = None
        self.embedding_dim: int = 384  # Default to BGE-small
        self.pca_applied: bool = False  # True only for legacy indexes

    def load_metadata(self) -> dict:
        """Load metadata.json to get model information."""
        if not self.metadata_path.exists():
            raise FileNotFoundError(f"Metadata not found: {self.metadata_path}")

        with open(self.metadata_path, 'r') as f:
            metadata = json.load(f)

        # Load model configuration
        self.model_name = metadata.get('model_name', 'BAAI/bge-small-en-v1.5')
        self.embedding_dim = metadata.get('embedding_dim', 384)
        self.pca_applied = metadata.get('pca_applied', False)

        logger.info(f"Metadata: model={self.model_name}, dim={self.embedding_dim}, pca={self.pca_applied}")
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
        self.embeddings = np.load(self.embeddings_path).astype('float32')
        logger.info(f"✓ Loaded embeddings: {self.embeddings.shape}")

    def load_play_ids(self):
        """Load play IDs mapping from .npy file."""
        if not self.play_ids_path.exists():
            raise FileNotFoundError(f"Play IDs mapping not found: {self.play_ids_path}")

        logger.info(f"Loading play IDs from {self.play_ids_path}")
        self.play_ids = np.load(self.play_ids_path).astype('int64')
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

        if self.pca_path.suffix == '.joblib':
            if not HAS_JOBLIB:
                raise ImportError("joblib required for .joblib files")
            self.pca = joblib.load(self.pca_path)
        else:
            with open(self.pca_path, 'rb') as f:
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
        """Load FAISS index."""
        if not self.index_path.exists():
            raise FileNotFoundError(f"FAISS index not found: {self.index_path}")

        logger.info(f"Loading FAISS index from {self.index_path}")
        self.index = faiss.read_index(str(self.index_path))
        self.index.nprobe = self.nprobe
        logger.info(f"✓ Index loaded: {self.index.ntotal:,} vectors")

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

        return query_embedding.astype('float32')

    def search(
        self,
        query: str,
        k: int = 10
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Search for similar embeddings.

        Args:
            query: Search query text
            k: Number of results to return

        Returns:
            Tuple of (indices, distances) where indices are FAISS indices.
            Filters out -1 indices (FAISS returns -1 when probe can't supply k hits).
        """
        # Encode query
        query_vector = self.encode_query(query)

        # Reshape for FAISS
        query_vector = query_vector.reshape(1, -1)

        # Search
        distances, indices = self.index.search(query_vector, k)

        # Filter out -1 indices (invalid results)
        indices_1d = indices[0]
        distances_1d = distances[0]
        valid_mask = indices_1d >= 0

        return indices_1d[valid_mask], distances_1d[valid_mask]

    def get_play_ids(self, faiss_indices: np.ndarray) -> np.ndarray:
        """
        Map FAISS indices to play IDs.

        Args:
            faiss_indices: Array of FAISS indices

        Returns:
            Array of play IDs
        """
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

    def add_embeddings(
        self,
        play_ids: list[int],
        embeddings: np.ndarray
    ) -> dict:
        """
        Add new embeddings to the in-memory FAISS index.

        This is designed for incremental updates - adding small batches
        of new embeddings without rebuilding the entire index.

        Args:
            play_ids: List of play IDs for the new embeddings
            embeddings: Numpy array of shape (n, embedding_dim), already normalized

        Returns:
            Dict with stats: added count, total vectors, persisted status
        """
        if self.index is None:
            raise RuntimeError("FAISS index not initialized")

        n_new = len(play_ids)
        if n_new == 0:
            return {"added": 0, "total_vectors": self.index.ntotal}

        # Validate embeddings shape
        if embeddings.shape[0] != n_new:
            raise ValueError(
                f"Mismatch: {n_new} play_ids but {embeddings.shape[0]} embeddings"
            )
        if embeddings.shape[1] != self.embedding_dim:
            raise ValueError(
                f"Wrong dimension: expected {self.embedding_dim}, got {embeddings.shape[1]}"
            )

        # Ensure float32 and normalized
        embeddings = embeddings.astype('float32')
        faiss.normalize_L2(embeddings)

        # Add to FAISS index (IVFFlat supports this without retraining)
        total_before = self.index.ntotal
        self.index.add(embeddings)

        # Update play_ids mapping
        new_ids_array = np.array(play_ids, dtype=np.int64)
        self.play_ids = np.append(self.play_ids, new_ids_array)

        logger.info(
            f"Added {n_new} embeddings to index "
            f"({total_before:,} → {self.index.ntotal:,} vectors)"
        )

        # Persist to disk atomically
        persisted = self._persist_index()

        return {
            "added": n_new,
            "total_vectors": self.index.ntotal,
            "persisted": persisted
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
        import shutil
        import tempfile

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
                    try:
                        os.unlink(path)
                    except Exception:
                        pass
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
        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False
        )

        return embeddings.astype('float32')
