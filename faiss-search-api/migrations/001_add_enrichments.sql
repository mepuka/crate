-- Migration: Add enrichments tables
-- Run with: sqlite3 data/faiss.db < migrations/001_add_enrichments.sql

-- Enrichment types registry
CREATE TABLE IF NOT EXISTS enrichment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    schema_version TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on name for lookups
CREATE INDEX IF NOT EXISTS idx_enrichment_types_name ON enrichment_types(name);

-- Enrichments data
CREATE TABLE IF NOT EXISTS enrichments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    play_id INTEGER NOT NULL,
    enrichment_type_id INTEGER NOT NULL,
    data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (play_id) REFERENCES plays(id) ON DELETE CASCADE,
    FOREIGN KEY (enrichment_type_id) REFERENCES enrichment_types(id),
    UNIQUE(play_id, enrichment_type_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrichments_play_id ON enrichments(play_id);
CREATE INDEX IF NOT EXISTS idx_enrichments_type_id ON enrichments(enrichment_type_id);

-- Seed hello_world enrichment type
INSERT OR IGNORE INTO enrichment_types (name, schema_version, description)
VALUES ('hello_world', 'v1', 'Basic test enrichment for pipeline validation');
