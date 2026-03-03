"""Shared API security utilities."""

from __future__ import annotations

import os
import secrets

from fastapi import HTTPException, status

from .config import settings


def require_api_key(
    x_api_key: str | None,
    *,
    endpoint_name: str,
) -> None:
    """
    Require a valid API key for mutating endpoints.

    By default this is enabled in settings; can be disabled explicitly for local
    development by setting REQUIRE_API_KEY=false.
    """
    if not settings.REQUIRE_API_KEY:
        return

    expected_key = os.getenv("FAISS_API_KEY")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(f"{endpoint_name} requires API key auth, but FAISS_API_KEY is not configured"),
        )

    if not x_api_key or not secrets.compare_digest(x_api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
