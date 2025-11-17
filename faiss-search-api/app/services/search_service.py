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
    - Loading embeddings, PCA transformer, and FAISS index
    - Encoding queries with PCA transformation
    - Fast similarity search
    - Mapping indices to play IDs
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
            embeddings_path: Path to reduced embeddings .npy file (256d) - OPTIONAL for search
            play_ids_path: Path to play_ids.npy (index-to-ID mapping)
            pca_path: Path to PCA transformer file
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

        # Auto-detect PCA path
        if pca_path:
            self.pca_path = Path(pca_path)
        else:
            data_dir = self.embeddings_path.parent
            pca_joblib = data_dir / "pca_transformer_256d.joblib"
            pca_pkl = data_dir / "pca_256.pkl"
            self.pca_path = pca_joblib if pca_joblib.exists() else pca_pkl

        self.index_path = index_path or self.embeddings_path.parent / "embeddings_256d.index"
        self.nlist = nlist
        self.nprobe = nprobe

        # Will be loaded during initialization
        self.embeddings: Optional[np.ndarray] = None
        self.play_ids: Optional[np.ndarray] = None
        self.index: Optional[faiss.Index] = None
        self.pca: Optional[object] = None
        self.model: Optional[SentenceTransformer] = None
        self.model_name: Optional[str] = None

    def load_metadata(self) -> dict:
        """Load metadata.json to get model information."""
        if not self.metadata_path.exists():
            raise FileNotFoundError(f"Metadata not found: {self.metadata_path}")

        with open(self.metadata_path, 'r') as f:
            metadata = json.load(f)

        self.model_name = metadata.get('model_name', 'sentence-transformers/multi-qa-mpnet-base-dot-v1')
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
        """Load PCA transformer."""
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
        Encode a text query to embedding vector with PCA transformation.

        Args:
            query_text: Search query text

        Returns:
            Reduced, normalized embedding vector (256d)
        """
        # Step 1: Generate 768d embedding (normalized)
        query_768d = self.model.encode([query_text], normalize_embeddings=True)[0]

        # Step 2: Apply PCA reduction (768d -> 256d)
        query_256d = self.pca.transform([query_768d])[0]

        # Step 3: Normalize for FAISS cosine similarity
        query_256d = query_256d / np.linalg.norm(query_256d)

        return query_256d.astype('float32')

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
