"""Application configuration using Pydantic settings."""
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        if not self.CORS_ORIGINS.strip():
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # FAISS
    FAISS_NLIST: int = 1024  # Number of clusters for IVF
    FAISS_NPROBE: int = 10   # Number of clusters to probe


settings = Settings()
