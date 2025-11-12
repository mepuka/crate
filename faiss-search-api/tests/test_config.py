"""Tests for configuration."""
import os
from pathlib import Path
import pytest
from app.config import Settings


def test_settings_loads_defaults():
    """Test that settings can be instantiated with defaults."""
    settings = Settings()
    assert settings.DATABASE_PATH is not None
    assert settings.EMBEDDINGS_PATH is not None
    assert settings.LOG_LEVEL == "INFO"


def test_settings_from_env(monkeypatch):
    """Test that settings load from environment variables."""
    monkeypatch.setenv("DATABASE_PATH", "/custom/path/db.sqlite")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    settings = Settings()
    assert str(settings.DATABASE_PATH) == "/custom/path/db.sqlite"
    assert settings.LOG_LEVEL == "DEBUG"


def test_cors_origins_as_list():
    """Test that CORS origins can be parsed as list."""
    settings = Settings(CORS_ORIGINS="http://localhost:3000,https://example.com")
    assert len(settings.cors_origins_list) == 2
    assert "http://localhost:3000" in settings.cors_origins_list


def test_cors_origins_empty_string():
    """Test that empty CORS origins returns empty list."""
    settings = Settings(CORS_ORIGINS="")
    assert settings.cors_origins_list == []


def test_cors_origins_whitespace_handling():
    """Test that whitespace in CORS list is handled correctly."""
    settings = Settings(CORS_ORIGINS=" http://localhost:3000 , , https://example.com ")
    assert len(settings.cors_origins_list) == 2
    assert "http://localhost:3000" in settings.cors_origins_list
    assert "https://example.com" in settings.cors_origins_list


def test_cors_origins_whitespace_only():
    """Test that whitespace-only CORS origins returns empty list."""
    settings = Settings(CORS_ORIGINS="   ")
    assert settings.cors_origins_list == []
