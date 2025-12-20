-- Migration: Add generated_assets table
-- Stores AI-generated visual assets (liner notes, enhanced art, etc.)

CREATE TABLE IF NOT EXISTS generated_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Reference to source play (nullable for artist-level assets)
    play_id INTEGER,

    -- Asset classification
    asset_type TEXT NOT NULL,  -- 'liner_note', 'enhanced_art', 'character_variant', etc.

    -- Generation parameters (for deduplication and debugging)
    params_hash TEXT NOT NULL,  -- SHA256 of generation params
    generation_params TEXT,     -- Full JSON params for reproducibility

    -- The generated content
    image_base64 TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',

    -- Metadata
    era TEXT,                   -- Detected era (golden-age, classic-rock, etc.)
    style TEXT,                 -- Style used (art-forward, editorial, etc.)
    model_notes TEXT,           -- Any notes from the generation model
    prompt_used TEXT,           -- Full prompt for debugging

    -- Production URL (when uploaded to GCS)
    gcs_url TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Unique constraint for deduplication
    UNIQUE(play_id, asset_type, params_hash)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_generated_assets_play_id
ON generated_assets(play_id);

CREATE INDEX IF NOT EXISTS idx_generated_assets_asset_type
ON generated_assets(asset_type);

CREATE INDEX IF NOT EXISTS idx_generated_assets_params_hash
ON generated_assets(params_hash);

CREATE INDEX IF NOT EXISTS idx_generated_assets_created_at
ON generated_assets(created_at DESC);
