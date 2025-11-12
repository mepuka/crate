"""Crate Analysis - Data exploration utilities for the Crate music database."""

from .db import Database, get_connection
from .enrichment import enrich_play_text

__all__ = ["Database", "get_connection", "enrich_play_text"]
