/**
 * Context Store Module
 *
 * Artifact-based context storage for dynamic context discovery.
 * Provides services and utilities for storing large content
 * as artifacts with compact references.
 *
 * @module
 */

// Types
export type {
  ArtifactFormat,
  ArtifactRef,
  ArtifactMetadata,
  StoredArtifact,
  StoreParams,
  ListParams,
  SearchParams,
  SearchResult,
  RetrieveOptions,
  CaptureResult
} from "./types.js"

export {
  ArtifactStoreError,
  ArtifactNotFoundError
} from "./types.js"

// Service
export {
  ArtifactStoreService,
  ArtifactStoreServiceLive,
  ArtifactStoreServiceScoped,
  ArtifactStoreServiceTest,
  type ArtifactStoreServiceInterface
} from "./ArtifactStoreService.js"

// Helpers
export {
  DEFAULT_CAPTURE_THRESHOLD,
  MAX_SUMMARY_LENGTH,
  PREVIEW_LENGTH,
  generateArtifactId,
  formatRef,
  formatRefs,
  truncate,
  generatePreview,
  countLines,
  captureLarge,
  formatContextToolInstructions,
  type CaptureLargeOptions
} from "./helpers.js"
