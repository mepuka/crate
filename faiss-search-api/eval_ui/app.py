"""
Insight Evaluation UI - Streamlit App

Human-in-the-loop evaluation interface for Crate insights.
Enables quality assessment, error tagging, and confidence calibration.
"""

import streamlit as st
import sqlite3
import json
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# Configuration
DB_PATH = Path("/app/data/music_kb.sqlite")
if not DB_PATH.exists():
    # Local development fallback
    DB_PATH = Path(__file__).parent.parent / "data" / "music_kb.sqlite"

ERROR_TAGS = [
    "hallucination",
    "factually_incorrect",
    "duplicate",
    "irrelevant",
    "low_quality",
    "missing_context",
    "wrong_entity",
    "broken_link",
]

INSIGHT_TYPES = ["Concert", "Cover", "Sample", "PlayHistory", "Connection", "Link"]
CONFIDENCE_LEVELS = ["high", "medium", "low"]


def get_db_connection():
    """Get SQLite connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_insights(
    insight_type: str | None = None,
    confidence: str | None = None,
    unevaluated_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Fetch insights with optional filters."""
    conn = get_db_connection()
    cursor = conn.cursor()

    if unevaluated_only:
        query = """
        SELECT
            i.id, i.insight_type, i.confidence, i.summary, i.play_id,
            i.data, i.source_type, i.created_at,
            p.artist, p.song, p.airdate, p.comment
        FROM insights i
        LEFT JOIN insight_evaluations e ON i.id = e.insight_id
        LEFT JOIN fact_plays p ON i.play_id = p.id
        WHERE i.deleted_at IS NULL AND e.id IS NULL
        """
    else:
        query = """
        SELECT
            i.id, i.insight_type, i.confidence, i.summary, i.play_id,
            i.data, i.source_type, i.created_at,
            p.artist, p.song, p.airdate, p.comment
        FROM insights i
        LEFT JOIN fact_plays p ON i.play_id = p.id
        WHERE i.deleted_at IS NULL
        """

    params = []

    if insight_type:
        query += " AND i.insight_type = ?"
        params.append(insight_type)

    if confidence:
        query += " AND i.confidence = ?"
        params.append(confidence)

    query += " ORDER BY i.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_insight_count(
    insight_type: str | None = None,
    confidence: str | None = None,
    unevaluated_only: bool = False,
) -> int:
    """Get total count matching filters."""
    conn = get_db_connection()
    cursor = conn.cursor()

    if unevaluated_only:
        query = """
        SELECT COUNT(*) FROM insights i
        LEFT JOIN insight_evaluations e ON i.id = e.insight_id
        WHERE i.deleted_at IS NULL AND e.id IS NULL
        """
    else:
        query = "SELECT COUNT(*) FROM insights WHERE deleted_at IS NULL"

    params = []

    if insight_type:
        query += " AND insight_type = ?"
        params.append(insight_type)

    if confidence:
        query += " AND confidence = ?"
        params.append(confidence)

    cursor.execute(query, params)
    count = cursor.fetchone()[0]
    conn.close()
    return count


def save_evaluation(
    insight_id: int,
    evaluator: str,
    relevance: int | None,
    novelty: int | None,
    accuracy: int | None,
    error_tags: list[str],
    notes: str,
) -> bool:
    """Save an evaluation to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO insight_evaluations
            (insight_id, evaluator, relevance, novelty, accuracy, error_tags, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                insight_id,
                evaluator,
                relevance if relevance else None,
                novelty if novelty else None,
                accuracy if accuracy else None,
                json.dumps(error_tags) if error_tags else None,
                notes if notes else None,
            ),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        st.error(f"Error saving evaluation: {e}")
        conn.close()
        return False


def get_stats() -> dict:
    """Get evaluation statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()

    stats = {}

    # Total insights
    cursor.execute("SELECT COUNT(*) FROM insights WHERE deleted_at IS NULL")
    stats["total_insights"] = cursor.fetchone()[0]

    # Evaluated count
    cursor.execute("SELECT COUNT(DISTINCT insight_id) FROM insight_evaluations")
    stats["evaluated_count"] = cursor.fetchone()[0]

    # By type
    cursor.execute(
        """
        SELECT insight_type, COUNT(*) as count
        FROM insights WHERE deleted_at IS NULL
        GROUP BY insight_type ORDER BY count DESC
    """
    )
    stats["by_type"] = {row[0]: row[1] for row in cursor.fetchall()}

    # Recent insights (last 7 days)
    cursor.execute(
        """
        SELECT COUNT(*) FROM insights
        WHERE deleted_at IS NULL
        AND created_at >= datetime('now', '-7 days')
    """
    )
    stats["recent_7d"] = cursor.fetchone()[0]

    conn.close()
    return stats


def render_insight_card(insight: dict, idx: int):
    """Render a single insight card with evaluation form."""
    data = json.loads(insight["data"]) if isinstance(insight["data"], str) else insight["data"]

    # Header
    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.markdown(f"### {insight['insight_type']} #{insight['id']}")
    with col2:
        confidence_color = {"high": "green", "medium": "orange", "low": "red"}.get(
            insight["confidence"], "gray"
        )
        st.markdown(f":{confidence_color}[{insight['confidence']}]")
    with col3:
        st.caption(insight["created_at"][:10] if insight["created_at"] else "")

    # Play context
    if insight.get("artist") and insight.get("song"):
        st.markdown(f"**Play:** {insight['artist']} - {insight['song']}")
        if insight.get("airdate"):
            st.caption(f"Aired: {insight['airdate']}")

    # Insight summary
    if insight.get("summary"):
        st.info(insight["summary"])

    # Source quote (for extraction insights)
    if data.get("sourceQuote"):
        st.markdown("**Source Quote:**")
        st.markdown(f"> {data['sourceQuote']}")

    # Explanation (for connection insights)
    if data.get("explanation"):
        st.markdown("**Explanation:**")
        st.markdown(f"> {data['explanation']}")

    # DJ Comment context
    if insight.get("comment"):
        with st.expander("DJ Comment"):
            st.markdown(insight["comment"])

    # Full data expander
    with st.expander("Full Insight Data"):
        st.json(data)

    # Evaluation form
    st.markdown("---")
    st.markdown("**Evaluate this insight:**")

    form_key = f"eval_form_{insight['id']}_{idx}"

    with st.form(form_key):
        col1, col2, col3 = st.columns(3)

        with col1:
            relevance = st.slider(
                "Relevance",
                min_value=0,
                max_value=5,
                value=0,
                help="How relevant is this insight? (0 = skip, 1-5 rating)",
                key=f"rel_{insight['id']}_{idx}",
            )

        with col2:
            novelty = st.slider(
                "Novelty",
                min_value=0,
                max_value=5,
                value=0,
                help="How novel is this information? (0 = skip)",
                key=f"nov_{insight['id']}_{idx}",
            )

        with col3:
            accuracy = st.slider(
                "Accuracy",
                min_value=0,
                max_value=5,
                value=0,
                help="How accurate is this insight? (0 = skip)",
                key=f"acc_{insight['id']}_{idx}",
            )

        error_tags = st.multiselect(
            "Error Tags",
            ERROR_TAGS,
            default=[],
            help="Select any issues with this insight",
            key=f"tags_{insight['id']}_{idx}",
        )

        notes = st.text_area(
            "Notes",
            placeholder="Optional notes about this insight...",
            key=f"notes_{insight['id']}_{idx}",
        )

        submitted = st.form_submit_button("Submit Evaluation", type="primary")

        if submitted:
            evaluator = st.session_state.get("evaluator", "anonymous")
            success = save_evaluation(
                insight_id=insight["id"],
                evaluator=evaluator,
                relevance=relevance if relevance > 0 else None,
                novelty=novelty if novelty > 0 else None,
                accuracy=accuracy if accuracy > 0 else None,
                error_tags=error_tags,
                notes=notes,
            )
            if success:
                st.success("Evaluation saved!")
                st.rerun()


def main():
    st.set_page_config(
        page_title="Insight Evaluation",
        page_icon="🎵",
        layout="wide",
    )

    st.title("🎵 Crate Insight Evaluation")

    # Sidebar filters
    with st.sidebar:
        st.header("Filters")

        evaluator = st.text_input("Your Name", value="pooks", key="evaluator")

        insight_type = st.selectbox(
            "Insight Type",
            ["All"] + INSIGHT_TYPES,
            index=0,
        )

        confidence = st.selectbox(
            "Confidence",
            ["All"] + CONFIDENCE_LEVELS,
            index=0,
        )

        unevaluated_only = st.checkbox("Unevaluated only", value=True)

        page_size = st.selectbox("Per page", [5, 10, 20, 50], index=1)

        st.markdown("---")

        # Stats
        st.header("Statistics")
        stats = get_stats()

        st.metric("Total Insights", stats["total_insights"])
        st.metric("Evaluated", stats["evaluated_count"])
        st.metric("Last 7 Days", stats["recent_7d"])

        st.markdown("**By Type:**")
        for itype, count in stats["by_type"].items():
            st.caption(f"{itype}: {count}")

    # Main content
    type_filter = insight_type if insight_type != "All" else None
    conf_filter = confidence if confidence != "All" else None

    total_count = get_insight_count(type_filter, conf_filter, unevaluated_only)

    # Pagination
    if "page" not in st.session_state:
        st.session_state.page = 0

    total_pages = max(1, (total_count + page_size - 1) // page_size)

    col1, col2, col3 = st.columns([1, 2, 1])
    with col1:
        if st.button("← Previous", disabled=st.session_state.page == 0):
            st.session_state.page -= 1
            st.rerun()
    with col2:
        st.markdown(
            f"<center>Page {st.session_state.page + 1} of {total_pages} ({total_count} insights)</center>",
            unsafe_allow_html=True,
        )
    with col3:
        if st.button("Next →", disabled=st.session_state.page >= total_pages - 1):
            st.session_state.page += 1
            st.rerun()

    # Fetch and display insights
    offset = st.session_state.page * page_size
    insights = get_insights(
        insight_type=type_filter,
        confidence=conf_filter,
        unevaluated_only=unevaluated_only,
        limit=page_size,
        offset=offset,
    )

    if not insights:
        st.info("No insights found matching your filters.")
    else:
        for idx, insight in enumerate(insights):
            with st.container():
                render_insight_card(insight, idx)
                st.markdown("---")


if __name__ == "__main__":
    main()
