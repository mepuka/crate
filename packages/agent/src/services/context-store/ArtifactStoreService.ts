/**
 * ArtifactStoreService
 *
 * In-memory artifact storage for dynamic context discovery.
 * Stores large content as artifacts with compact references,
 * enabling agents to retrieve content on demand.
 *
 * Phase 1 implementation uses in-memory Ref<HashMap> storage.
 * Phase 2 will add file system persistence.
 *
 * @module
 */

import { Effect, Layer, Ref, HashMap, Option } from "effect"
import type {
  ArtifactRef,
  ArtifactMetadata,
  StoredArtifact,
  StoreParams,
  ListParams,
  SearchParams,
  SearchResult,
  RetrieveOptions
} from "./types.js"
import { ArtifactStoreError, ArtifactNotFoundError } from "./types.js"

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Generate artifact ID from content using SHA256 prefix
 */
const generateId = (content: string): string => {
  // Use simple hash for in-memory (crypto in Node, simpler for browser)
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  // Use absolute value and pad to 16 chars
  const absHash = Math.abs(hash).toString(16).padStart(8, "0")
  const timestamp = Date.now().toString(16).slice(-8)
  return `${absHash}${timestamp}`
}

/**
 * Count lines in content
 */
const countLines = (content: string): number => {
  if (content.length === 0) return 0
  return content.split("\n").length
}

/**
 * Generate preview from content
 */
const generatePreview = (content: string, maxLength = 200): string => {
  const clean = content.replace(/\s+/g, " ").trim()
  if (clean.length <= maxLength) return clean
  return clean.substring(0, maxLength - 3) + "..."
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * ArtifactStoreService interface
 */
export interface ArtifactStoreServiceInterface {
  /**
   * Store content as an artifact
   */
  readonly store: (params: StoreParams) => Effect.Effect<ArtifactRef, ArtifactStoreError>

  /**
   * Retrieve artifact content with optional pagination
   */
  readonly retrieve: (
    id: string,
    options?: RetrieveOptions
  ) => Effect.Effect<string, ArtifactStoreError | ArtifactNotFoundError>

  /**
   * Get artifact metadata without content
   */
  readonly getMetadata: (
    id: string
  ) => Effect.Effect<ArtifactMetadata, ArtifactNotFoundError>

  /**
   * Search within artifacts
   */
  readonly search: (
    params: SearchParams
  ) => Effect.Effect<readonly SearchResult[], ArtifactStoreError>

  /**
   * List artifacts with optional filtering
   */
  readonly list: (
    params?: ListParams
  ) => Effect.Effect<readonly ArtifactMetadata[]>

  /**
   * Clear artifacts, optionally by session
   */
  readonly clear: (sessionId?: string) => Effect.Effect<number>

  /**
   * Get total artifact count
   */
  readonly count: () => Effect.Effect<number>
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * ArtifactStoreService - in-memory artifact storage
 */
export class ArtifactStoreService extends Effect.Service<ArtifactStoreService>()(
  "ArtifactStoreService",
  {
    effect: Effect.gen(function* () {
      // In-memory storage using Ref<HashMap>
      const storeRef = yield* Ref.make<HashMap.HashMap<string, StoredArtifact>>(
        HashMap.empty()
      )

      // =========================================================================
      // Store
      // =========================================================================

      const store = (params: StoreParams): Effect.Effect<ArtifactRef, ArtifactStoreError> =>
        Effect.gen(function* () {
          const id = generateId(params.content)
          const now = new Date().toISOString()
          const lineCount = countLines(params.content)
          const preview = generatePreview(params.content)

          const ref: ArtifactRef = {
            id,
            format: params.format,
            bytes: Buffer.byteLength(params.content, "utf8"),
            summary: params.summary,
            tags: params.tags ?? [],
            createdAt: now,
            sessionId: params.sessionId
          }

          const artifact: StoredArtifact = {
            ref,
            content: params.content,
            lineCount,
            preview
          }

          yield* Ref.update(storeRef, HashMap.set(id, artifact))

          yield* Effect.log(`Artifact stored: ${id} (${ref.bytes} bytes, ${lineCount} lines)`)

          return ref
        })

      // =========================================================================
      // Retrieve
      // =========================================================================

      const retrieve = (
        id: string,
        options?: RetrieveOptions
      ): Effect.Effect<string, ArtifactStoreError | ArtifactNotFoundError> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(storeRef)
          const artifact = HashMap.get(store, id)

          if (Option.isNone(artifact)) {
            return yield* new ArtifactNotFoundError({ artifactId: id })
          }

          let content = artifact.value.content

          // Apply line-based pagination if specified
          if (options?.fromLine !== undefined || options?.lineLimit !== undefined) {
            const lines = content.split("\n")
            const start = options.fromLine ?? 0
            const limit = options.lineLimit ?? lines.length
            content = lines.slice(start, start + limit).join("\n")
          }

          // Apply byte-based pagination if specified
          if (options?.offset !== undefined || options?.byteLimit !== undefined) {
            const start = options.offset ?? 0
            const limit = options.byteLimit ?? content.length
            content = content.substring(start, start + limit)
          }

          return content
        })

      // =========================================================================
      // Get Metadata
      // =========================================================================

      const getMetadata = (
        id: string
      ): Effect.Effect<ArtifactMetadata, ArtifactNotFoundError> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(storeRef)
          const artifact = HashMap.get(store, id)

          if (Option.isNone(artifact)) {
            return yield* new ArtifactNotFoundError({ artifactId: id })
          }

          const { ref, lineCount, preview } = artifact.value
          return { ...ref, lineCount, preview }
        })

      // =========================================================================
      // Search
      // =========================================================================

      const search = (
        params: SearchParams
      ): Effect.Effect<readonly SearchResult[], ArtifactStoreError> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(storeRef)
          const results: SearchResult[] = []
          const limit = params.limit ?? 100
          const contextLines = params.contextLines ?? 2

          // Build regex from pattern
          const regex = new RegExp(params.pattern, "gi")

          // Get artifacts to search
          const artifacts = params.artifactId
            ? Option.match(HashMap.get(store, params.artifactId), {
                onNone: () => [],
                onSome: (a) => [a]
              })
            : Array.from(HashMap.values(store))

          for (const artifact of artifacts) {
            if (results.length >= limit) break

            const lines = artifact.content.split("\n")

            for (let i = 0; i < lines.length && results.length < limit; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  artifactId: artifact.ref.id,
                  lineNumber: i + 1,
                  line: lines[i],
                  before: lines.slice(Math.max(0, i - contextLines), i),
                  after: lines.slice(i + 1, i + 1 + contextLines)
                })
              }
              // Reset regex lastIndex for global flag
              regex.lastIndex = 0
            }
          }

          return results
        })

      // =========================================================================
      // List
      // =========================================================================

      const list = (
        params?: ListParams
      ): Effect.Effect<readonly ArtifactMetadata[]> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(storeRef)
          let artifacts = Array.from(HashMap.values(store))

          // Filter by tags (AND logic)
          if (params?.tags && params.tags.length > 0) {
            const requiredTags = new Set(params.tags)
            artifacts = artifacts.filter(a =>
              Array.from(requiredTags).every(tag => a.ref.tags.includes(tag))
            )
          }

          // Filter by session
          if (params?.sessionId) {
            artifacts = artifacts.filter(a => a.ref.sessionId === params.sessionId)
          }

          // Apply limit
          const limit = params?.limit ?? 100
          artifacts = artifacts.slice(0, limit)

          // Map to metadata
          return artifacts.map(a => ({
            ...a.ref,
            lineCount: a.lineCount,
            preview: a.preview
          }))
        })

      // =========================================================================
      // Clear
      // =========================================================================

      const clear = (sessionId?: string): Effect.Effect<number> =>
        Effect.gen(function* () {
          const store = yield* Ref.get(storeRef)
          const before = HashMap.size(store)

          if (sessionId) {
            // Clear only session artifacts
            yield* Ref.update(storeRef, current =>
              HashMap.filter(current, a => a.ref.sessionId !== sessionId)
            )
          } else {
            // Clear all
            yield* Ref.set(storeRef, HashMap.empty())
          }

          const after = yield* Ref.get(storeRef).pipe(Effect.map(HashMap.size))
          const cleared = before - after

          yield* Effect.log(`Cleared ${cleared} artifacts${sessionId ? ` for session ${sessionId}` : ""}`)

          return cleared
        })

      // =========================================================================
      // Count
      // =========================================================================

      const count = (): Effect.Effect<number> =>
        Ref.get(storeRef).pipe(Effect.map(HashMap.size))

      return {
        store,
        retrieve,
        getMetadata,
        search,
        list,
        clear,
        count
      } satisfies ArtifactStoreServiceInterface
    })
  }
) {}

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for ArtifactStoreService
 * Creates a fresh in-memory store
 */
export const ArtifactStoreServiceLive: Layer.Layer<ArtifactStoreService> =
  ArtifactStoreService.Default

/**
 * Scoped layer that creates a fresh store per scope
 * Use this when you want store isolation per request/operation
 *
 * Note: For scoped behavior, prefer using Layer.fresh() with the Default layer
 * to get a fresh instance per scope while maintaining proper typing.
 */
export const ArtifactStoreServiceScoped: Layer.Layer<ArtifactStoreService> =
  Layer.fresh(ArtifactStoreService.Default)

/**
 * Test layer with mock implementation
 */
export const ArtifactStoreServiceTest: Layer.Layer<ArtifactStoreService> =
  Layer.succeed(
    ArtifactStoreService,
    {
      _tag: "ArtifactStoreService",
      store: (_params) =>
        Effect.succeed({
          id: "test_artifact",
          format: "text",
          bytes: 0,
          summary: "test",
          tags: [],
          createdAt: new Date().toISOString()
        } as ArtifactRef),
      retrieve: (_id, _options) => Effect.succeed("test content"),
      getMetadata: (_id) =>
        Effect.succeed({
          id: "test_artifact",
          format: "text",
          bytes: 0,
          summary: "test",
          tags: [],
          createdAt: new Date().toISOString(),
          lineCount: 1,
          preview: "test content"
        } as ArtifactMetadata),
      search: (_params) => Effect.succeed([]),
      list: (_params) => Effect.succeed([]),
      clear: (_sessionId) => Effect.succeed(0),
      count: () => Effect.succeed(0)
    } as ArtifactStoreService
  )
