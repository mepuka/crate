import { Schema } from "effect"

/**
 * Extraction confidence levels for agent-extracted data
 */
export const ExtractionConfidence = Schema.Literal(
  "high",    // Clear, unambiguous mention with date/venue
  "medium",  // Likely correct but some inference required
  "low"      // Requires human verification
)
export type ExtractionConfidence = typeof ExtractionConfidence.Type

/**
 * Source of extraction - where the data came from
 */
export const ExtractionSource = Schema.Literal(
  "dj-comment",     // Extracted from fact_plays.comment
  "link-content",   // Extracted from fetched link content
  "manual",         // Human-entered
  "api"             // From external API (Songkick, Bandsintown, etc.)
)
export type ExtractionSource = typeof ExtractionSource.Type

/**
 * ExtractionMeta - Tracks provenance of extracted data
 *
 * Attached to any agent-extracted entity to track:
 * - Where the data came from
 * - How confident the extraction is
 * - When it was extracted
 * - Original text for debugging/verification
 */
export class ExtractionMeta extends Schema.Class<ExtractionMeta>("ExtractionMeta")({
  source: ExtractionSource,
  source_id: Schema.NullOr(Schema.String), // play_id, link_content_id, etc.
  confidence: ExtractionConfidence,
  extracted_at: Schema.DateFromString,
  extracted_by: Schema.String,              // Agent version or "manual"
  raw_text: Schema.NullOr(Schema.String),   // Original text snippet
}) {}

export type ExtractionMetaData = typeof ExtractionMeta.Type

/**
 * TemporalReference - Handles relative date references
 *
 * DJ comments often use relative dates like:
 * - "TONIGHT at The Showbox"
 * - "tomorrow night at Neumos"
 * - "this Saturday at The Crocodile"
 *
 * This schema captures the raw text, the reference date (play airdate),
 * and the resolved absolute date.
 */
export class TemporalReference extends Schema.Class<TemporalReference>("TemporalReference")({
  raw_text: Schema.String,            // "tonight", "tomorrow night", "this Saturday"
  reference_date: Schema.DateFromString, // The play's airdate
  resolved_date: Schema.DateFromString,  // Computed actual date
  confidence: ExtractionConfidence,
}) {}

export type TemporalReferenceData = typeof TemporalReference.Type
