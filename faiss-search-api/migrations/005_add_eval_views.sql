-- Migration: Add evaluation views for Datasette analysis
-- Date: 2025-12-05
--
-- These views enable SQL-based analysis of insights and evaluation context
-- for use with Datasette dashboards.

-- =============================================================================
-- INSIGHT DISTRIBUTION VIEW
-- =============================================================================
-- Shows insight counts grouped by type, confidence, and date
-- Useful for: Daily insight production monitoring, type distribution analysis

CREATE VIEW IF NOT EXISTS v_insight_distribution AS
SELECT
  insight_type,
  confidence,
  COUNT(*) as count,
  DATE(created_at) as date
FROM insights
WHERE deleted_at IS NULL
GROUP BY insight_type, confidence, DATE(created_at)
ORDER BY date DESC, insight_type, confidence;

-- =============================================================================
-- TOOL USAGE VIEW
-- =============================================================================
-- Shows tool usage patterns from eval_context JSON
-- Useful for: Understanding research patterns, iteration efficiency

CREATE VIEW IF NOT EXISTS v_tool_usage AS
SELECT
  json_extract(eval_context, '$.session_id') as session_id,
  json_extract(eval_context, '$.iteration_count') as iterations,
  json_extract(eval_context, '$.total_tool_calls') as total_tool_calls,
  json_extract(eval_context, '$.research_duration_ms') as research_duration_ms,
  json_extract(eval_context, '$.model') as model,
  json_extract(eval_context, '$.had_existing_insights') as had_existing_insights,
  json_extract(eval_context, '$.existing_insight_count') as existing_insight_count,
  json_extract(eval_context, '$.tools_called') as tools_called,
  COUNT(*) as insight_count,
  MIN(created_at) as first_insight_at
FROM insights
WHERE eval_context IS NOT NULL
GROUP BY session_id
ORDER BY first_insight_at DESC;

-- =============================================================================
-- CONFIDENCE REVIEW VIEW
-- =============================================================================
-- Shows insights with source quotes for confidence calibration review
-- Useful for: Human review of confidence accuracy, quality assessment

CREATE VIEW IF NOT EXISTS v_confidence_review AS
SELECT
  id,
  play_id,
  insight_type,
  confidence,
  summary,
  CASE insight_type
    WHEN 'Concert' THEN json_extract(data, '$.sourceQuote')
    WHEN 'Cover' THEN json_extract(data, '$.sourceQuote')
    WHEN 'Sample' THEN json_extract(data, '$.sourceQuote')
    WHEN 'Connection' THEN json_extract(data, '$.explanation')
    WHEN 'Link' THEN json_extract(data, '$.summary')
    WHEN 'PlayHistory' THEN 'Play count: ' || json_extract(data, '$.totalPlays')
  END as source_text,
  source_type,
  created_at
FROM insights
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- =============================================================================
-- DAILY SUMMARY VIEW
-- =============================================================================
-- Aggregated daily metrics for dashboard overview
-- Useful for: Daily monitoring, trend analysis

CREATE VIEW IF NOT EXISTS v_daily_summary AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_insights,
  COUNT(DISTINCT play_id) as unique_plays,
  SUM(CASE WHEN confidence = 'high' THEN 1 ELSE 0 END) as high_confidence,
  SUM(CASE WHEN confidence = 'medium' THEN 1 ELSE 0 END) as medium_confidence,
  SUM(CASE WHEN confidence = 'low' THEN 1 ELSE 0 END) as low_confidence,
  SUM(CASE WHEN insight_type = 'Concert' THEN 1 ELSE 0 END) as concerts,
  SUM(CASE WHEN insight_type = 'Cover' THEN 1 ELSE 0 END) as covers,
  SUM(CASE WHEN insight_type = 'Sample' THEN 1 ELSE 0 END) as samples,
  SUM(CASE WHEN insight_type = 'PlayHistory' THEN 1 ELSE 0 END) as play_history,
  SUM(CASE WHEN insight_type = 'Connection' THEN 1 ELSE 0 END) as connections,
  SUM(CASE WHEN insight_type = 'Link' THEN 1 ELSE 0 END) as links
FROM insights
WHERE deleted_at IS NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- =============================================================================
-- TOOL CALL DETAIL VIEW
-- =============================================================================
-- Extracts individual tool calls from eval_context for detailed analysis
-- Note: This uses json_each to unnest the tool_calls array

CREATE VIEW IF NOT EXISTS v_tool_calls AS
SELECT
  i.id as insight_id,
  i.play_id,
  json_extract(eval_context, '$.session_id') as session_id,
  json_extract(tc.value, '$.iteration') as iteration,
  json_extract(tc.value, '$.tool_name') as tool_name,
  json_extract(tc.value, '$.duration_ms') as duration_ms,
  json_extract(tc.value, '$.timestamp') as call_timestamp,
  json_extract(tc.value, '$.result_count') as result_count,
  i.created_at
FROM insights i,
     json_each(json_extract(i.eval_context, '$.tool_calls')) as tc
WHERE i.eval_context IS NOT NULL
  AND json_extract(i.eval_context, '$.tool_calls') IS NOT NULL
ORDER BY i.created_at DESC, json_extract(tc.value, '$.iteration');

-- =============================================================================
-- RESEARCH EFFICIENCY VIEW
-- =============================================================================
-- Calculates efficiency metrics per session
-- Useful for: Optimizing research patterns, identifying inefficient sessions

CREATE VIEW IF NOT EXISTS v_research_efficiency AS
SELECT
  json_extract(eval_context, '$.session_id') as session_id,
  play_id,
  json_extract(eval_context, '$.iteration_count') as iterations,
  json_extract(eval_context, '$.total_tool_calls') as tool_calls,
  json_extract(eval_context, '$.research_duration_ms') as duration_ms,
  COUNT(*) as insights_produced,
  ROUND(
    CAST(COUNT(*) AS REAL) /
    NULLIF(CAST(json_extract(eval_context, '$.total_tool_calls') AS REAL), 0),
    3
  ) as insights_per_tool_call,
  ROUND(
    CAST(json_extract(eval_context, '$.research_duration_ms') AS REAL) /
    NULLIF(COUNT(*), 0),
    0
  ) as ms_per_insight,
  MIN(created_at) as session_time
FROM insights
WHERE eval_context IS NOT NULL
GROUP BY session_id
ORDER BY session_time DESC;

-- Track migration
INSERT INTO schema_migrations (migration_name) VALUES ('005_add_eval_views');
