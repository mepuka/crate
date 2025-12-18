"""Application configuration using Pydantic settings."""
import logging
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )

    # Paths
    DATA_DIR: Path = Path("data")
    DATABASE_PATH: Path = Path("data/music_kb.sqlite")

    # Embeddings - BGE-small uses native 384d (no PCA reduction needed)
    EMBEDDINGS_PATH: Path = Path("data/embeddings_384d.npy")
    PLAY_IDS_PATH: Path = Path("data/play_ids.npy")
    INDEX_PATH: Path = Path("data/embeddings_384d.index")
    METADATA_PATH: Path = Path("data/metadata.json")

    # Legacy PCA path (only used if metadata.json specifies pca_applied: true)
    PCA_PATH: Path = Path("data/pca_transformer_256d.joblib")

    # Model config - BGE-small is 3x smaller than mpnet, better retrieval scores
    MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIM: int = 384

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # CORS - comma-separated list of allowed origins
    # Production: set CORS_ORIGINS env var to include your frontend domain
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,https://crate-music-web.web.app,https://crate-music-web.firebaseapp.com"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        if not self.CORS_ORIGINS.strip():
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # FAISS
    FAISS_NLIST: int = 1024  # Number of clusters for IVF
    FAISS_NPROBE: int = 10   # Number of clusters to probe

    # Pub/Sub configuration for enrichment triggers
    PUBSUB_ENABLED: bool = False  # Opt-in: set to True to enable publishing
    # GCP_PROJECT_ID: Required when PUBSUB_ENABLED=True. No default to prevent
    # accidental cross-environment publishing.
    GCP_PROJECT_ID: Optional[str] = None
    PUBSUB_TOPIC: str = "new-plays"  # Topic name (not full path)
    PUBSUB_TIMEOUT_SECONDS: int = 30

    @model_validator(mode='after')
    def validate_pubsub_config(self) -> 'Settings':
        """Validate Pub/Sub config when enabled."""
        if self.PUBSUB_ENABLED:
            if not self.GCP_PROJECT_ID:
                raise ValueError(
                    "GCP_PROJECT_ID is required when PUBSUB_ENABLED=True. "
                    "Set GCP_PROJECT_ID environment variable to your GCP project."
                )
            logger.info(f"Pub/Sub enabled for project: {self.GCP_PROJECT_ID}")
        return self

    @property
    def pubsub_topic_path(self) -> str:
        """Full Pub/Sub topic path."""
        if not self.GCP_PROJECT_ID:
            raise ValueError("GCP_PROJECT_ID not set - cannot construct topic path")
        return f"projects/{self.GCP_PROJECT_ID}/topics/{self.PUBSUB_TOPIC}"


settings = Settings()
