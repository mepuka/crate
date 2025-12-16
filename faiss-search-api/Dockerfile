# =============================================================================
# FAISS Search API - Optimized Docker Build with uv
# =============================================================================
#
# Key optimizations:
# - uv for 10-100x faster package installs
# - CPU-only PyTorch (saves ~2GB download)
# - Layer caching: dependencies separate from app code
# - Multi-stage build for minimal runtime image
#
# Build: docker build -t faiss-api .
# Run:   docker run -p 8000:8000 -v ./data:/app/data faiss-api
# =============================================================================

# =============================================================================
# Stage 1: Builder - Install dependencies with uv
# =============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install build dependencies for packages that need compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files first (for layer caching)
# This layer only rebuilds when pyproject.toml or uv.lock changes
COPY pyproject.toml uv.lock ./

# Create venv at /opt/venv so paths work after copying to runtime
# UV_PROJECT_ENVIRONMENT tells uv where to create the virtualenv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv

# Install dependencies into a virtual environment using the lockfile
# --frozen: use exact versions from lockfile (no network resolution)
# --no-install-project: don't install the project itself, just deps
# CPU-only PyTorch is already pinned in uv.lock via tool.uv.sources
RUN uv sync --frozen --no-install-project --no-editable

# =============================================================================
# Stage 2: Runtime - Minimal production image
# =============================================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install runtime dependencies (curl for healthcheck, sqlite3 for debugging, cron for scheduled jobs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sqlite3 \
    cron \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /root/.cache

# Copy virtual environment from builder (created at /opt/venv via UV_PROJECT_ENVIRONMENT)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code (this layer changes most frequently)
COPY app/ ./app/
COPY scripts/ ./scripts/
COPY crontab ./crontab
COPY start.sh ./start.sh

# Create logs directory and make start script executable
RUN mkdir -p /app/logs && chmod +x /app/start.sh

# Expose port
EXPOSE 8000

# Health check (5 min start period for FAISS + model loading)
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run application via start.sh (installs crontab, starts cron daemon, then uvicorn)
CMD ["/app/start.sh"]
