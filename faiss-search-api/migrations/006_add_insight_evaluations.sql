-- Migration: Add insight_evaluations table for human review
-- Date: 2025-12-06
--
-- Stores human evaluations of insight quality for:
-- - Confidence calibration (is stated confidence accurate?)
-- - Quality assessment (relevance, novelty, accuracy)
-- - Error categorization (hallucination, duplicate, etc.)

-- =============================================================================
-- INSIGHT EVALUATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS insight_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insight_id INTEGER NOT NULL REFERENCES insights(id),
  evaluator TEXT NOT NULL DEFAULT 'anonymous',

  -- Quality ratings (1-5 scale, NULL if not rated)
  relevance INTEGER CHECK(relevance IS NULL OR relevance BETWEEN 1 AND 5),
  novelty INTEGER CHECK(novelty IS NULL OR novelty BETWEEN 1 AND 5),
  accuracy INTEGER CHECK(accuracy IS NULL OR accuracy BETWEEN 1 AND 5),

  -- Error tags as JSON array: ["hallucination", "duplicate", "irrelevant", etc.]
  error_tags JSON,

  -- Free-form notes
  notes TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for quick lookup by insight
CREATE INDEX IF NOT EXISTS idx_evaluations_insight_id ON insight_evaluations(insight_id);

-- Index for filtering by evaluator
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator ON insight_evaluations(evaluator);

-- =============================================================================
-- EVALUATION SUMMARY VIEW
-- =============================================================================

CREATE VIEW IF NOT EXISTS v_evaluation_summary AS
SELECT
  i.id as insight_id,
  i.insight_type,
  i.confidence,
  i.summary,
  i.play_id,
  COUNT(e.id) as evaluation_count,
  ROUND(AVG(e.relevance), 1) as avg_relevance,
  ROUND(AVG(e.novelty), 1) as avg_novelty,
  ROUND(AVG(e.accuracy), 1) as avg_accuracy,
  GROUP_CONCAT(DISTINCT json_each.value) as all_error_tags,
  i.created_at as insight_created_at,
  MAX(e.created_at) as last_evaluated_at
FROM insights i
LEFT JOIN insight_evaluations e ON i.id = e.insight_id
LEFT JOIN json_each(e.error_tags) ON e.error_tags IS NOT NULL
WHERE i.deleted_at IS NULL
GROUP BY i.id
ORDER BY i.created_at DESC;

-- =============================================================================
-- UNEVALUATED INSIGHTS VIEW
-- =============================================================================
-- For finding insights that haven't been reviewed yet

CREATE VIEW IF NOT EXISTS v_unevaluated_insights AS
SELECT
  i.id,
  i.insight_type,
  i.confidence,
  i.summary,
  i.play_id,
  p.artist,
  p.song,
  p.airdate,
  i.created_at
FROM insights i
LEFT JOIN insight_evaluations e ON i.id = e.insight_id
LEFT JOIN fact_plays p ON i.play_id = p.id
WHERE i.deleted_at IS NULL
  AND e.id IS NULL
ORDER BY i.created_at DESC;

-- Track migration
INSERT INTO schema_migrations (migration_name) VALUES ('006_add_insight_evaluations');
