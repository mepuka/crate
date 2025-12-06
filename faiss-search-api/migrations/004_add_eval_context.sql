-- Migration: Add eval_context column to insights table
-- Date: 2025-12-05
--
-- This column stores evaluation context metadata for insights,
-- enabling analysis of agent research patterns and quality improvement.
--
-- The eval_context JSON contains:
-- - session_id: Unique ID for the enrichment session
-- - iteration_count: Number of research iterations
-- - tools_called: List of tool names used
-- - total_tool_calls: Total number of tool invocations
-- - research_duration_ms: Time spent researching
-- - model: LLM model used (e.g., "claude-sonnet-4-20250514")
-- - had_existing_insights: Whether play already had insights
-- - existing_insight_count: Number of pre-existing insights
-- - tool_calls: Detailed tool call records (optional)

-- Add eval_context column
ALTER TABLE insights ADD COLUMN eval_context JSON;

-- Track migration
INSERT INTO schema_migrations (migration_name) VALUES ('004_add_eval_context');
