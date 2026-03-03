"""
Index synchronization service for coordinating /add and /integrate operations.

Implements two-level locking:
- Level 1: IndexSynchronizer (threading.Lock) - coordinates endpoints
- Level 2: FAISSSearchService._mutex (RLock) - protects index access

Uses threading.Lock (not asyncio.Lock) for reliable try-acquire semantics.
asyncio.wait_for with timeout is unreliable for non-blocking acquire.
"""

import logging
import threading
import time
from contextlib import asynccontextmanager

import anyio

logger = logging.getLogger(__name__)


class IntegrationInProgressError(Exception):
    """Raised when /add is attempted during integration."""

    def __init__(self, duration_seconds: float | None = None):
        self.duration_seconds = duration_seconds
        msg = "Integration in progress"
        if duration_seconds:
            msg += f" (running for {duration_seconds:.1f}s)"
        super().__init__(msg)


class IndexSynchronizer:
    """
    Coordinates exclusive access between /add and /integrate operations.

    Uses threading.Lock (not asyncio.Lock) for reliable try-acquire semantics.
    All lock operations run in thread pool to avoid blocking the event loop.

    Pattern:
    - /integrate acquires lock (blocking) for entire operation
    - /add uses true non-blocking acquire; returns 409 if locked
    - Both hold lock for their entire duration

    This ensures:
    1. No /add can start while integration is running
    2. No integration can start while /add is running
    3. /add fails fast with 409 instead of blocking
    """

    def __init__(self):
        self._lock = threading.Lock()  # NOT asyncio.Lock - for reliable try-acquire
        self._integration_started_at: float | None = None

    @asynccontextmanager
    async def integration_context(self):
        """
        Exclusive lock for integration (blocking acquire in thread pool).
        Holds lock for entire integration + hot reload.

        Usage:
            async with index_synchronizer.integration_context():
                # Run integration
                result = await anyio.to_thread.run_sync(integration_svc.integrate_embeddings, ...)
                # Hot reload under same lock
                await anyio.to_thread.run_sync(search_service.hot_reload)
        """
        logger.info("Integration: acquiring lock...")
        # Blocking acquire in thread pool - waits for any /add to finish
        await anyio.to_thread.run_sync(self._lock.acquire)
        self._integration_started_at = time.time()
        logger.info("Integration: lock acquired")
        try:
            yield
        finally:
            duration = time.time() - self._integration_started_at
            self._integration_started_at = None
            self._lock.release()
            logger.info(f"Integration: lock released (held for {duration:.1f}s)")

    @asynccontextmanager
    async def add_context(self):
        """
        True non-blocking acquire for /add operations.
        Raises IntegrationInProgressError immediately if locked.
        Holds lock during entire add to prevent integration from starting.

        Usage:
            try:
                async with index_synchronizer.add_context():
                    result = await anyio.to_thread.run_sync(search_service.add_embeddings, ...)
            except IntegrationInProgressError as e:
                raise HTTPException(status_code=409, detail=str(e))
        """
        # True non-blocking acquire: acquire(blocking=False) returns immediately
        # Use lambda to wrap the call for anyio.to_thread.run_sync
        acquired = await anyio.to_thread.run_sync(lambda: self._lock.acquire(blocking=False))
        if not acquired:
            duration = None
            if self._integration_started_at:
                duration = time.time() - self._integration_started_at
            logger.warning(f"/add blocked by integration (duration: {duration}s)")
            raise IntegrationInProgressError(duration)

        logger.debug("/add: lock acquired")
        try:
            yield
        finally:
            self._lock.release()
            logger.debug("/add: lock released")

    @property
    def is_locked(self) -> bool:
        """Check if lock is currently held (for health checks)."""
        return self._lock.locked()

    @property
    def integration_duration(self) -> float | None:
        """Get duration of current integration (None if not running)."""
        if self._integration_started_at:
            return time.time() - self._integration_started_at
        return None
