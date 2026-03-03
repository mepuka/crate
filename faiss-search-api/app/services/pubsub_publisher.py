"""
Pub/Sub Publisher Service for Enrichment Triggers.

Publishes enrichment triggers to Cloud Pub/Sub when new plays are synced.
The crate-agent service subscribes to these messages and enriches plays with insights.
"""

import json
import logging
from datetime import UTC, datetime

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy initialization of Pub/Sub client
_publisher = None
_topic_path = None


def _get_publisher():
    """Lazy initialization of Pub/Sub publisher client."""
    global _publisher, _topic_path

    if not settings.PUBSUB_ENABLED:
        return None, None

    if _publisher is None:
        try:
            from google.cloud import pubsub_v1

            _publisher = pubsub_v1.PublisherClient()
            _topic_path = settings.pubsub_topic_path
            logger.info(f"Pub/Sub publisher initialized for topic: {_topic_path}")
        except Exception as e:
            logger.error(f"Failed to initialize Pub/Sub publisher: {e}")
            return None, None

    return _publisher, _topic_path


def publish_enrichment_trigger(play_ids: list[int], batch_id: str | None = None) -> bool:
    """
    Publish an enrichment trigger to Pub/Sub.

    Args:
        play_ids: List of play IDs to enrich
        batch_id: Optional batch identifier for tracing

    Returns:
        True if published successfully, False otherwise
    """
    if not settings.PUBSUB_ENABLED:
        logger.debug("Pub/Sub publishing disabled, skipping enrichment trigger")
        return False

    if not play_ids:
        logger.debug("No play IDs to publish")
        return False

    publisher, topic_path = _get_publisher()
    if publisher is None:
        logger.warning("Pub/Sub publisher not available")
        return False

    # Build the message payload matching EnrichmentTrigger schema
    timestamp = datetime.now(UTC).isoformat()
    if batch_id is None:
        batch_id = f"sync_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"

    message = {"play_ids": play_ids, "timestamp": timestamp, "batch_id": batch_id}

    try:
        # Encode message as JSON bytes
        data = json.dumps(message).encode("utf-8")

        # Publish with timeout
        future = publisher.publish(
            topic_path, data, batch_id=batch_id, play_count=str(len(play_ids))
        )

        # Wait for publish to complete
        message_id = future.result(timeout=settings.PUBSUB_TIMEOUT_SECONDS)

        logger.info(
            f"Published enrichment trigger: {len(play_ids)} plays, "
            f"batch={batch_id}, message_id={message_id}"
        )
        return True

    except Exception as e:
        logger.error(f"Failed to publish enrichment trigger: {e}")
        return False


def publish_enrichment_triggers_batched(
    play_ids: list[int], batch_size: int = 50, batch_id_prefix: str | None = None
) -> int:
    """
    Publish enrichment triggers in batches.

    Large syncs may have many play IDs. This breaks them into smaller
    batches to avoid overwhelming the agent.

    Args:
        play_ids: List of play IDs to enrich
        batch_size: Maximum plays per message (default 50)
        batch_id_prefix: Optional prefix for batch IDs

    Returns:
        Number of successfully published batches
    """
    if not play_ids:
        return 0

    if batch_id_prefix is None:
        batch_id_prefix = f"sync_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"

    successful = 0
    for i in range(0, len(play_ids), batch_size):
        batch = play_ids[i : i + batch_size]
        batch_id = f"{batch_id_prefix}_batch{i // batch_size}"

        if publish_enrichment_trigger(batch, batch_id=batch_id):
            successful += 1

    logger.info(
        f"Published {successful} batches for {len(play_ids)} plays (batch_size={batch_size})"
    )
    return successful
