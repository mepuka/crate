FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy cron configuration and startup script
COPY crontab /app/crontab
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Data directory (mounted as volume)
VOLUME ["/app/data"]

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Run application with cron
CMD ["/app/start.sh"]
