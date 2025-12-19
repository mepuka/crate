-- Migration: Add agent_runs table for session persistence
-- Date: 2025-12-17
-- Description: Stores agent session exports for recovery, handoff, and observability
--              Enables crash recovery, multi-agent coordination, and audit trails
--
-- Run with: python3 -c "import sqlite3; conn = sqlite3.connect('data/music_kb.sqlite'); conn.executescript(open('migrations/010_add_agent_runs.sql').read())"

-- =====================================================
-- AGENT_RUNS TABLE - Primary session storage
-- =====================================================
--
-- Design decisions:
-- 1. session_id as natural PRIMARY KEY (from agent)
-- 2. JSON columns for flexible nested data (tool_calls, research_steps, entities)
-- 3. Denormalized counts for fast dashboard queries
-- 4. Status tracking enables recovery of interrupted sessions
-- 5. Junction table for efficient play->run queries

CREATE TABLE IF NOT EXISTS agent_runs (
    -- Primary key (use session_id as natural key from agent)
    session_id TEXT PRIMARY KEY NOT NULL,

    -- Session metadata
    mode TEXT NOT NULL CHECK (mode IN ('enrich', 'discover')),
    started_at INTEGER NOT NULL,           -- Unix timestamp (ms)
    completed_at INTEGER,                  -- Unix timestamp (ms), NULL if in progress
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
        'running',      -- Session in progress
        'completed',    -- Finished successfully
        'failed',       -- Terminated with error
        'paused'        -- Manually paused for handoff
    )),

    -- Play context (JSON array of play IDs)
    play_ids TEXT NOT NULL DEFAULT '[]',   -- JSON array: [123, 456, 789]

    -- Session data (JSON arrays - stored as TEXT for SQLite)
    insights TEXT NOT NULL DEFAULT '[]',           -- JSON array of InsightSummary
    tool_calls TEXT NOT NULL DEFAULT '[]',         -- JSON array of ToolCallLogEntry
    research_steps TEXT NOT NULL DEFAULT '[]',     -- JSON array of ResearchStep
    entities TEXT NOT NULL DEFAULT '[]',           -- JSON array of EntityFacts

    -- Error tracking (if status = 'failed')
    error_message TEXT,
    error_stack TEXT,

    -- Metrics (computed on save for quick queries)
    insight_count INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    research_step_count INTEGER NOT NULL DEFAULT 0,
    entity_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,                   -- completed_at - started_at

    -- Schema version for future migrations
    schema_version TEXT NOT NULL DEFAULT 'v1',

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- =====================================================
-- INDEXES for efficient queries
-- =====================================================

-- Status queries (find running/failed sessions)
CREATE INDEX IF NOT EXISTS idx_agent_runs_status
    ON agent_runs(status);

-- Time-based queries (recent runs)
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at
    ON agent_runs(started_at DESC);

-- Mode filtering
CREATE INDEX IF NOT EXISTS idx_agent_runs_mode
    ON agent_runs(mode);

-- Composite for dashboard queries
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started
    ON agent_runs(status, started_at DESC);

-- Find incomplete sessions for recovery
CREATE INDEX IF NOT EXISTS idx_agent_runs_incomplete
    ON agent_runs(status, started_at)
    WHERE status = 'running';

-- =====================================================
-- AGENT_RUN_PLAYS JUNCTION TABLE
-- =====================================================
-- Enables efficient queries: "find all runs that processed play X"

CREATE TABLE IF NOT EXISTS agent_run_plays (
    session_id TEXT NOT NULL,
    play_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, play_id),
    FOREIGN KEY (session_id) REFERENCES agent_runs(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_run_plays_play_id
    ON agent_run_plays(play_id);

-- =====================================================
-- VIEW for recent runs (dashboard)
-- =====================================================

CREATE VIEW IF NOT EXISTS v_recent_agent_runs AS
SELECT
    session_id,
    mode,
    status,
    started_at,
    completed_at,
    duration_ms,
    insight_count,
    tool_call_count,
    research_step_count,
    entity_count,
    error_message,
    created_at
FROM agent_runs
ORDER BY started_at DESC
LIMIT 100;

-- =====================================================
-- MIGRATION TRACKING
-- =====================================================

INSERT OR IGNORE INTO schema_migrations (migration_name)
VALUES ('010_add_agent_runs');
