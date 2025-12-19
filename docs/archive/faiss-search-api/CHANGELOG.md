# Changelog

All notable changes to the KEXP FAISS Search API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Note: The changes below constitute a MAJOR version bump per Semantic Versioning
     due to the breaking change in TrackPlay.release_date type -->


### Changed

#### Breaking Changes in TrackPlay Model

**`TrackPlay.release_date` Type Change**

- **What changed**: The `release_date` field type and default value behavior has been modified across different branches:
  - **Main/original**: `str` with `default=""` (empty string for missing dates)
  - **Commit 45bb4ad (adjunct_new branch)**: Changed to `str | None` with `default=None` (null for missing dates)
  - **Current fix-mb-extraction-issues branch**: Has original `str` with `default=""` (branched before 45bb4ad)

- **Impact on API Consumers**:
  - **If nullable change is adopted** (45bb4ad): Consumers previously receiving `""` for missing release dates will now receive `null`. This affects:
    - Frontend applications that check for empty strings vs null
    - Database mappings that expect string columns
    - Analytics pipelines that aggregate on release date strings

  - **If reverting to non-nullable** (proposed in task): Consumers that adapted to nullable fields will receive `""` instead of `null`

- **Migration Guide**:

  **If you're consuming the API and the nullable change is deployed:**

  JavaScript/TypeScript:
  ```javascript
  // Before (expected empty string)
  if (trackPlay.release_date === "") {
    // Handle missing date
  }

  // After (must handle null)
  if (!trackPlay.release_date) {
    // Handle missing date (handles both null and empty string)
  }
  ```

  Python:
  ```python
  # Before (expected empty string)
  if track_play.release_date == "":
      # Handle missing date
      pass

  # After (must handle None)
  if not track_play.release_date:
      # Handle missing date (handles both None and empty string)
      pass
  ```

  **If you're consuming the API and a revert to non-nullable is deployed:**

  JavaScript/TypeScript:
  ```javascript
  // Before (handled null)
  if (trackPlay.release_date === null) {
    // Handle missing date
  }

  // After (must handle empty string)
  if (!trackPlay.release_date) {
    // Handle missing date (handles both null and empty string)
  }
  ```

  Python:
  ```python
  # Before (handled None)
  if track_play.release_date is None:
      # Handle missing date
      pass

  # After (must handle empty string)
  if not track_play.release_date:
      # Handle missing date (handles both None and empty string)
      pass
  ```

- **Recommendation**: Use a truthy/falsy check (`if (!trackPlay.release_date)`) to handle both scenarios robustly, as it works whether the field is `null` or `""`.

### Technical Rationale

**Why nullable (`str | None`) might be preferred:**
- Semantic clarity: `null` explicitly means "no data available" vs empty string which could mean "unknown" or "intentionally blank"
- Database compatibility: SQL databases distinguish between NULL and empty strings
- API standards: JSON APIs commonly use `null` for missing values
- Type safety: TypeScript/modern tooling can enforce null checks more reliably

**Why non-nullable with empty string (`str`) might be preferred:**
- Backward compatibility: Maintains existing API contract
- Simpler client code: No need to handle two different "missing" states
- Consistency: Other optional string fields in the model use empty strings (e.g., `album`, `image_uri`)
- Safer defaults: Prevents null pointer exceptions in languages without null safety

### Decision Required

The team should decide which approach to standardize:
1. **Keep nullable** (45bb4ad) - Better semantics, requires migration
2. **Revert to non-nullable** - Better compatibility, less semantic clarity
3. **Introduce a new API version** - Support both during transition period

## [Previous Releases]

<!-- Historical releases will be documented here -->
