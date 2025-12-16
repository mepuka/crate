-- Migration: 008_add_image_validation.sql
-- Purpose: Add image URL validation tracking to fact_plays
-- Date: 2025-12-16
--
-- This migration adds:
-- 1. image_validated_at column to track when image URLs were last validated
-- 2. Partial index for efficient queries on plays needing validation
--
-- The validate_image_urls.py script uses this to:
-- - Find plays with stale or unvalidated image URLs
-- - Clear broken image URLs and mark them as validated
-- - Track validation timestamp for re-validation scheduling

-- Add image validation timestamp column
ALTER TABLE fact_plays ADD COLUMN image_validated_at TEXT;

-- Partial index for efficient validation queries
-- Only indexes rows where image_uri is not null (the ones we need to validate)
CREATE INDEX idx_fact_plays_image_validation
    ON fact_plays(image_validated_at)
    WHERE image_uri IS NOT NULL;
