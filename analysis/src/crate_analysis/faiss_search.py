"""
FAISS-based semantic search service for music embeddings.

This module provides a clean interface for building and querying FAISS indices
with PCA-reduced embeddings following the dimensionality reduction guide.
"""

import faiss
import pickle
import numpy as np
from pathlib import Path
from typing import Optional, Dict, List, Tuple
import json

try:
    import joblib
    HAS_JOBLIB = True
except ImportError:
    HAS_JOBLIB = False

from sentence_transformers import SentenceTransformer


class FAISSSearchService:
    """
    FAISS-based semantic search service for music plays.
    
    Handles:
    - Building FAISS index from reduced embeddings
    - Loading PCA transformer and embedding model
    - Encoding queries with PCA transformation
    - Fast similarity search
    """
    
    def __init__(
        self,
        embeddings_path: Path,
        metadata_path: Optional[Path] = None,
        pca_path: Optional[Path] = None,
        index_path: Optional[Path] = None,
        nlist: int = 1024,
        nprobe: int = 10
    ):
        """
        Initialize the FAISS search service.
        
        Args:
            embeddings_path: Path to reduced embeddings .npy file (256d)
            metadata_path: Path to metadata.json (for model info)
            pca_path: Path to PCA transformer .pkl file
            index_path: Path to save/load FAISS index
            nlist: Number of clusters for IVF index (default: 1024)
            nprobe: Number of clusters to probe during search (default: 10)
        """
        self.embeddings_path = Path(embeddings_path)
        self.metadata_path = metadata_path or self.embeddings_path.parent / "metadata.json"
        # Try to find PCA transformer (supports both .pkl and .joblib)
        if pca_path:
            pca_path_obj = Path(pca_path)
            # If provided path exists, use it; otherwise fall back to auto-detection
            if pca_path_obj.exists():
                self.pca_path = pca_path_obj
            else:
                # Fall back to auto-detection
                pca_path = None
        
        if not pca_path:
            # Auto-detect: try common names
            data_dir = self.embeddings_path.parent
            pca_pkl = data_dir / "pca_256.pkl"
            pca_joblib = data_dir / "pca_transformer_256d.joblib"
            if pca_joblib.exists():
                self.pca_path = pca_joblib
            elif pca_pkl.exists():
                self.pca_path = pca_pkl
            else:
                self.pca_path = pca_pkl  # Default to .pkl for error messages
        self.index_path = index_path or self.embeddings_path.parent / "embeddings_256d.index"
        self.nlist = nlist
        self.nprobe = nprobe
        
        # Will be loaded/initialized
        self.embeddings: Optional[np.ndarray] = None
        self.index: Optional[faiss.Index] = None
        self.pca: Optional[object] = None
        self.model: Optional[SentenceTransformer] = None
        self.model_name: Optional[str] = None
        
    def load_metadata(self) -> Dict:
        """Load metadata.json to get model information."""
        if not self.metadata_path.exists():
            raise FileNotFoundError(
                f"Metadata file not found: {self.metadata_path}\n"
                "This file should contain the original model name and embedding dimension."
            )
        
        with open(self.metadata_path, 'r') as f:
            metadata = json.load(f)
        
        self.model_name = metadata.get('model_name', 'sentence-transformers/multi-qa-mpnet-base-dot-v1')
        return metadata
    
    def load_embeddings(self) -> np.ndarray:
        """Load reduced embeddings from .npy file."""
        if not self.embeddings_path.exists():
            raise FileNotFoundError(f"Embeddings file not found: {self.embeddings_path}")
        
        print(f"Loading embeddings from {self.embeddings_path}...")
        embeddings = np.load(self.embeddings_path).astype('float32')
        print(f"✓ Loaded embeddings: {embeddings.shape}")
        self.embeddings = embeddings
        return embeddings
    
    def load_pca(self) -> object:
        """Load PCA transformer from .pkl or .joblib file."""
        if not self.pca_path.exists():
            raise FileNotFoundError(
                f"PCA transformer not found: {self.pca_path}\n"
                "You need the PCA model that was used to reduce the embeddings."
            )
        
        print(f"Loading PCA transformer from {self.pca_path}...")
        
        # Try to load based on file extension
        if self.pca_path.suffix == '.joblib':
            if not HAS_JOBLIB:
                raise ImportError(
                    "joblib is required to load .joblib files. Install with: pip install joblib"
                )
            pca = joblib.load(self.pca_path)
        else:
            # Default to pickle
            with open(self.pca_path, 'rb') as f:
                pca = pickle.load(f)
        
        print(f"✓ PCA loaded: {pca.n_components_} components")
        self.pca = pca
        return pca
    
    def load_model(self) -> SentenceTransformer:
        """Load the original embedding model."""
        if self.model_name is None:
            self.load_metadata()
        
        print(f"Loading embedding model: {self.model_name}...")
        model = SentenceTransformer(self.model_name)
        print(f"✓ Model loaded: {model.get_sentence_embedding_dimension()} dimensions")
        self.model = model
        return model
    
    def build_index(self, force_rebuild: bool = False) -> faiss.Index:
        """
        Build or load FAISS index.
        
        Args:
            force_rebuild: If True, rebuild index even if it exists
            
        Returns:
            FAISS index
        """
        # Load embeddings if not already loaded
        if self.embeddings is None:
            self.load_embeddings()
        
        # Check if index exists
        if self.index_path.exists() and not force_rebuild:
            print(f"Loading existing FAISS index from {self.index_path}...")
            try:
                index = faiss.read_index(str(self.index_path))
                print(f"✓ Index loaded: {index.ntotal:,} vectors")
                self.index = index
                return index
            except Exception as e:
                print(f"⚠️  Error loading index: {e}")
                print("   The index file may be corrupted or incomplete.")
                print("   Rebuilding index...")
                # Fall through to rebuild
        
        # Build new index
        print("Building FAISS index...")
        d = self.embeddings.shape[1]  # dimension (256)
        
        # Remove corrupted index file if it exists
        if self.index_path.exists():
            print(f"Removing existing index file (may be corrupted)...")
            try:
                self.index_path.unlink()
            except Exception as e:
                print(f"⚠️  Could not remove old index: {e}")
        
        # Create IVF index for faster search on large datasets
        quantizer = faiss.IndexFlatIP(d)  # Inner product for cosine similarity
        index = faiss.IndexIVFFlat(quantizer, d, self.nlist, faiss.METRIC_INNER_PRODUCT)
        
        # Normalize embeddings for cosine similarity
        # Note: embeddings_256d.npy contains PCA-reduced but NOT normalized vectors
        # We normalize them here for FAISS (same as we normalize queries after PCA)
        print("Normalizing embeddings...")
        embeddings_normalized = self.embeddings.copy()
        faiss.normalize_L2(embeddings_normalized)
        
        # Train index
        print(f"Training index with {self.nlist} clusters...")
        index.train(embeddings_normalized)
        
        # Add vectors
        print(f"Adding {len(embeddings_normalized):,} vectors to index...")
        index.add(embeddings_normalized)
        
        # Set nprobe for search
        index.nprobe = self.nprobe
        
        # Save index
        print(f"Saving index to {self.index_path}...")
        try:
            faiss.write_index(index, str(self.index_path))
            print(f"✓ Index built and saved: {index.ntotal:,} vectors")
        except Exception as e:
            print(f"⚠️  Error saving index: {e}")
            print("   Index is built in memory but not saved to disk.")
            print("   You may need to rebuild it next time.")
        
        self.index = index
        return index
    
    def encode_query(self, query_text: str) -> np.ndarray:
        """
        Encode a text query to embedding vector with PCA transformation.
        
        Args:
            query_text: Search query text
            
        Returns:
            Reduced embedding vector (256d) ready for FAISS search
        """
        if self.model is None:
            self.load_model()
        
        if self.pca is None:
            self.load_pca()
        
        # Step 1: Generate original embedding (768d) - NORMALIZE FIRST
        # CRITICAL: PCA was trained on normalized embeddings, so we must normalize before PCA
        query_768d = self.model.encode([query_text], normalize_embeddings=True)[0]
        
        # Step 2: Apply PCA reduction (768d -> 256d)
        # PCA was fit on normalized 768d embeddings, so query must also be normalized
        query_256d = self.pca.transform([query_768d])[0]
        
        # Step 3: Normalize again for FAISS (embeddings in index are also normalized)
        query_256d = query_256d / np.linalg.norm(query_256d)
        
        return query_256d.astype('float32')
    
    def search(
        self,
        query: str,
        k: int = 10,
        return_distances: bool = True
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Search for similar embeddings.
        
        Args:
            query: Search query text
            k: Number of results to return
            return_distances: If True, return similarity distances
            
        Returns:
            Tuple of (indices, distances) where:
            - indices: Array of result indices
            - distances: Array of similarity scores (if return_distances=True)
        """
        if self.index is None:
            self.build_index()
        
        # Encode query
        query_vector = self.encode_query(query)
        
        # Reshape for FAISS (needs 2D array)
        query_vector = query_vector.reshape(1, -1)
        
        # Search
        distances, indices = self.index.search(query_vector, k)
        
        if return_distances:
            return indices[0], distances[0]
        else:
            return indices[0], None
    
    def initialize(self, build_index: bool = True):
        """
        Initialize all components (convenience method).
        
        Args:
            build_index: If True, build/load FAISS index
        """
        print("=" * 80)
        print("Initializing FAISS Search Service")
        print("=" * 80)
        
        # Load metadata
        metadata = self.load_metadata()
        print(f"\nMetadata:")
        print(f"  Model: {self.model_name}")
        print(f"  Original dimension: {metadata.get('embedding_dimension', 'unknown')}")
        
        # Load PCA
        try:
            self.load_pca()
        except FileNotFoundError as e:
            print(f"\n⚠️  {e}")
            print("   Text search queries will not work without the PCA transformer.")
        
        # Load model
        try:
            self.load_model()
        except Exception as e:
            print(f"\n⚠️  Could not load model: {e}")
        
        # Build index
        if build_index:
            try:
                self.build_index()
            except Exception as e:
                print(f"\n⚠️  Could not build index: {e}")
        
        print("\n" + "=" * 80)
        print("✓ Initialization complete")
        print("=" * 80)

