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
    EMBEDDINGS_PATH: Path = Path("data/embeddings_256d.npy")
    PLAY_IDS_PATH: Path = Path("data/play_ids.npy")
    PCA_PATH: Path = Path("data/pca_transformer_256d.joblib")
    INDEX_PATH: Path = Path("data/embeddings_256d.index")
    METADATA_PATH: Path = Path("data/metadata.json")

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
