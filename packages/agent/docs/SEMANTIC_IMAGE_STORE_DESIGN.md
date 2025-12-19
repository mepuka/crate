# Semantic Image Store Design Document

## Overview

The Semantic Image Store (SIS) is a service for persisting, caching, searching, and tracking the evolution of AI-generated album art enhancements. It integrates with the existing `AlbumArtEnhancementService` and leverages the project's FAISS vector infrastructure for semantic search capabilities.

## Design Goals

1. **Persistence**: Store enhanced art with full provenance (original source, style, prompt, model)
2. **Caching**: Content-addressed deduplication to avoid regenerating identical enhancements
3. **Semantic Search**: Find art by visual similarity, style characteristics, or metadata
4. **Evolution Tracking**: Model refinement chains as a DAG (directed acyclic graph)
5. **Grounding**: Use stored art as style references for new generations

## Architecture

```
                                    +-------------------+
                                    |   GCS Bucket      |
                                    |  (Image Blobs)    |
                                    +--------^----------+
                                             |
+------------------+    +-------------------+|+-------------------+
|  Album Art       |    |  Semantic Image   |||   FAISS Search    |
|  Enhancement     |--->|  Store Service    ||<-->   API          |
|  Service         |    |  (Orchestrator)   |||  (Embeddings)     |
+------------------+    +--------+----------+|+-------------------+
                                 |           |
                        +--------v----------+|
                        |  SQLite/Postgres  ||
                        |  (Metadata)       ||
                        +-------------------+
```

## Domain Model

### Core Entities

```
EnhancedImage
├── id: UUID (primary key)
├── contentHash: SHA256 (for deduplication)
├── originalArtRef: OriginalArtReference
├── enhancement: EnhancementMetadata
├── storage: StorageLocation
├── evolution: EvolutionInfo (optional)
├── embedding: Float32Array (CLIP/BLIP embedding)
├── createdAt: Date
└── metadata: Record<string, unknown>

OriginalArtReference
├── mbid: string (MusicBrainz release/release-group ID)
├── playId: number (optional, KEXP play ID)
├── sourceUrl: string (original image URL)
└── sourceHash: SHA256 (hash of original image)

EnhancementMetadata
├── style: EnhancementStyle
├── prompt: string (full prompt used)
├── styleConfig: StyleConfig (optional)
├── model: string (e.g., "gemini-3-pro-image-preview")
├── modelVersion: string
└── generationParams: Record<string, unknown>

StorageLocation
├── bucket: string
├── path: string
├── url: string (signed URL or public URL)
├── mimeType: string
└── sizeBytes: number

EvolutionInfo
├── parentId: UUID (optional, null for root enhancements)
├── refinementPrompt: string (optional)
├── generation: number (0 for root, increments for refinements)
└── chainId: UUID (groups all related refinements)
```

### Relationships

```
                    ┌─────────────────────────┐
                    │    Evolution Chain      │
                    │    (chainId: UUID)      │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
        ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
        │  Root     │     │ Refinement│     │ Refinement│
        │  gen: 0   │────►│  gen: 1   │────►│  gen: 2   │
        └───────────┘     └───────────┘     └───────────┘
              │                 │                 │
              └─────────────────┴─────────────────┘
                         All share:
                      - Original MBID
                      - Base style
                      - Chain ID
```

## Schema Definitions

```typescript
import { Schema } from "effect"

// =============================================================================
// Value Objects
// =============================================================================

/**
 * Content-addressed hash for deduplication
 */
export const ContentHash = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{64}$/),
  Schema.brand("ContentHash")
)
export type ContentHash = typeof ContentHash.Type

/**
 * UUID identifier
 */
export const ImageId = Schema.UUID.pipe(Schema.brand("ImageId"))
export type ImageId = typeof ImageId.Type

/**
 * Chain identifier for evolution tracking
 */
export const ChainId = Schema.UUID.pipe(Schema.brand("ChainId"))
export type ChainId = typeof ChainId.Type

// =============================================================================
// Embedded Schemas (reuse from AlbumArtEnhancementService)
// =============================================================================

export const EnhancementStyle = Schema.Literal(
  "lo-fi-indie",
  "concert-poster",
  "vinyl-sleeve",
  "synth-pop-retro",
  "pnw-local",
  "minimal",
  "custom"
)

export const StyleConfig = Schema.Struct({
  grain: Schema.optional(Schema.Number),
  warmth: Schema.optional(Schema.Number),
  saturation: Schema.optional(Schema.Number),
  contrast: Schema.optional(Schema.Number),
  vintage: Schema.optional(Schema.Boolean),
  filmStock: Schema.optional(
    Schema.Literal("kodak", "fuji", "ilford", "polaroid")
  )
})

// =============================================================================
// Core Domain Schemas
// =============================================================================

export const OriginalArtReference = Schema.Struct({
  /** MusicBrainz ID (release or release-group) */
  mbid: Schema.String,
  /** KEXP play ID if sourced from plays database */
  playId: Schema.optional(Schema.Number),
  /** Original image source URL */
  sourceUrl: Schema.String,
  /** SHA256 hash of original image bytes */
  sourceHash: ContentHash
})

export const EnhancementMetadata = Schema.Struct({
  /** Enhancement style preset used */
  style: EnhancementStyle,
  /** Full prompt sent to the model */
  prompt: Schema.String,
  /** Style configuration parameters */
  styleConfig: Schema.optional(StyleConfig),
  /** Model identifier */
  model: Schema.String,
  /** Model version/checkpoint */
  modelVersion: Schema.String,
  /** Additional generation parameters */
  generationParams: Schema.optional(Schema.Record({
    key: Schema.String,
    value: Schema.Unknown
  }))
})

export const StorageLocation = Schema.Struct({
  /** GCS bucket name */
  bucket: Schema.String,
  /** Object path within bucket */
  path: Schema.String,
  /** Accessible URL (signed or public) */
  url: Schema.String,
  /** MIME type of stored image */
  mimeType: Schema.String,
  /** File size in bytes */
  sizeBytes: Schema.Number
})

export const EvolutionInfo = Schema.Struct({
  /** Parent image ID (null for root) */
  parentId: Schema.NullOr(ImageId),
  /** Refinement prompt used (null for root) */
  refinementPrompt: Schema.NullOr(Schema.String),
  /** Generation number (0 for root) */
  generation: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  /** Chain ID grouping all refinements */
  chainId: ChainId
})

export const EnhancedImage = Schema.Struct({
  /** Unique image identifier */
  id: ImageId,
  /** Content hash for deduplication */
  contentHash: ContentHash,
  /** Reference to original album art */
  originalArtRef: OriginalArtReference,
  /** Enhancement configuration used */
  enhancement: EnhancementMetadata,
  /** Storage location details */
  storage: StorageLocation,
  /** Evolution/refinement tracking */
  evolution: Schema.optional(EvolutionInfo),
  /** CLIP/BLIP embedding for similarity search */
  embedding: Schema.optional(Schema.Array(Schema.Number)),
  /** Creation timestamp */
  createdAt: Schema.DateFromString,
  /** Extensible metadata */
  metadata: Schema.optional(Schema.Record({
    key: Schema.String,
    value: Schema.Unknown
  }))
})

export type EnhancedImage = typeof EnhancedImage.Type

// =============================================================================
// Query/Filter Schemas
// =============================================================================

export const ImageSearchParams = Schema.Struct({
  /** Semantic query (converted to embedding) */
  query: Schema.optional(Schema.String),
  /** Filter by enhancement style */
  style: Schema.optional(EnhancementStyle),
  /** Filter by MBID (artist, release, etc.) */
  mbid: Schema.optional(Schema.String),
  /** Filter by chain ID (evolution group) */
  chainId: Schema.optional(ChainId),
  /** Similarity threshold (0-1) */
  minSimilarity: Schema.optional(Schema.Number),
  /** Maximum results */
  limit: Schema.optional(Schema.Number),
  /** Pagination offset */
  offset: Schema.optional(Schema.Number)
})

export const EvolutionChain = Schema.Struct({
  /** Chain identifier */
  chainId: ChainId,
  /** Root image of the chain */
  root: EnhancedImage,
  /** All refinements in generation order */
  refinements: Schema.Array(EnhancedImage),
  /** Total generations in chain */
  totalGenerations: Schema.Number
})
```

## Service Interface

```typescript
import { Effect, Data, Context, Layer } from "effect"

// =============================================================================
// Errors
// =============================================================================

export class ImageStoreError extends Data.TaggedError("ImageStoreError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class ImageNotFoundError extends Data.TaggedError("ImageNotFoundError")<{
  readonly imageId: string
}> {}

export class DuplicateImageError extends Data.TaggedError("DuplicateImageError")<{
  readonly contentHash: string
  readonly existingId: string
}> {}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly message: string
  readonly operation: "upload" | "download" | "delete"
  readonly cause?: unknown
}> {}

export class EmbeddingError extends Data.TaggedError("EmbeddingError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Input for storing a new enhanced image
 */
export interface StoreImageInput {
  /** Base64-encoded enhanced image data */
  readonly imageBase64: string
  /** MIME type of the image */
  readonly mimeType: string
  /** Reference to original album art */
  readonly originalArtRef: typeof OriginalArtReference.Type
  /** Enhancement configuration used */
  readonly enhancement: typeof EnhancementMetadata.Type
  /** Parent image for refinements */
  readonly parentId?: string
  /** Refinement prompt (if this is a refinement) */
  readonly refinementPrompt?: string
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>
}

/**
 * Semantic Image Store Service Interface
 *
 * All operations return Effects with Requirements = never.
 * Dependencies are resolved at construction time via Layer.
 */
export interface SemanticImageStoreInterface {
  /**
   * Store a new enhanced image
   *
   * - Computes content hash for deduplication
   * - Uploads to GCS
   * - Generates embedding for similarity search
   * - Creates metadata record
   * - Returns existing image if duplicate detected
   */
  readonly store: (
    input: StoreImageInput
  ) => Effect.Effect<
    EnhancedImage,
    ImageStoreError | StorageError | EmbeddingError
  >

  /**
   * Retrieve an image by ID
   */
  readonly get: (
    imageId: string
  ) => Effect.Effect<EnhancedImage, ImageNotFoundError>

  /**
   * Retrieve an image by content hash (for cache lookup)
   */
  readonly getByHash: (
    contentHash: string
  ) => Effect.Effect<EnhancedImage | null>

  /**
   * Search images by semantic similarity and/or filters
   */
  readonly search: (
    params: typeof ImageSearchParams.Type
  ) => Effect.Effect<
    { results: EnhancedImage[]; total: number },
    ImageStoreError | EmbeddingError
  >

  /**
   * Find similar images to a given image
   */
  readonly findSimilar: (
    imageId: string,
    limit?: number
  ) => Effect.Effect<
    EnhancedImage[],
    ImageNotFoundError | ImageStoreError
  >

  /**
   * Get the complete evolution chain for an image
   */
  readonly getEvolutionChain: (
    imageId: string
  ) => Effect.Effect<
    typeof EvolutionChain.Type,
    ImageNotFoundError | ImageStoreError
  >

  /**
   * Get all images for a specific MBID
   */
  readonly getByMbid: (
    mbid: string,
    options?: { style?: typeof EnhancementStyle.Type; limit?: number }
  ) => Effect.Effect<EnhancedImage[]>

  /**
   * Delete an image and its storage
   * (Does not delete children in evolution chain)
   */
  readonly delete: (
    imageId: string
  ) => Effect.Effect<void, ImageNotFoundError | StorageError>

  /**
   * Check if enhancement exists (cache check)
   *
   * Uses composite key: originalHash + style + prompt
   * Returns existing image ID if found
   */
  readonly checkCache: (
    originalHash: string,
    style: typeof EnhancementStyle.Type,
    promptHash: string
  ) => Effect.Effect<string | null>
}

// =============================================================================
// Service Tag
// =============================================================================

export class SemanticImageStore extends Context.Tag("SemanticImageStore")<
  SemanticImageStore,
  SemanticImageStoreInterface
>() {}
```

## Layer Composition

```typescript
// =============================================================================
// Configuration
// =============================================================================

export interface ImageStoreConfigShape {
  /** GCS bucket for image storage */
  readonly bucket: string
  /** GCS path prefix */
  readonly pathPrefix: string
  /** Whether to generate embeddings (can be disabled for testing) */
  readonly enableEmbeddings: boolean
  /** Embedding model to use */
  readonly embeddingModel: "clip" | "blip"
}

export class ImageStoreConfig extends Effect.Service<ImageStoreConfig>()(
  "ImageStoreConfig",
  {
    effect: Effect.gen(function* () {
      const { bucket, pathPrefix, enableEmbeddings, embeddingModel } =
        yield* Config.all({
          bucket: Config.string("IMAGE_STORE_BUCKET").pipe(
            Config.withDefault("crate-enhanced-art")
          ),
          pathPrefix: Config.string("IMAGE_STORE_PREFIX").pipe(
            Config.withDefault("enhanced/")
          ),
          enableEmbeddings: Config.boolean("IMAGE_STORE_EMBEDDINGS").pipe(
            Config.withDefault(true)
          ),
          embeddingModel: Config.literal("clip", "blip")("IMAGE_STORE_EMBEDDING_MODEL").pipe(
            Config.withDefault("clip" as const)
          )
        })
      return { bucket, pathPrefix, enableEmbeddings, embeddingModel }
    })
  }
) {}

// =============================================================================
// Dependent Services (to be implemented)
// =============================================================================

/**
 * GCS Storage Service - handles blob upload/download
 */
export class GcsStorageService extends Context.Tag("GcsStorageService")<
  GcsStorageService,
  {
    readonly upload: (bucket: string, path: string, data: Buffer, mimeType: string)
      => Effect.Effect<{ url: string; sizeBytes: number }, StorageError>
    readonly download: (bucket: string, path: string)
      => Effect.Effect<Buffer, StorageError>
    readonly delete: (bucket: string, path: string)
      => Effect.Effect<void, StorageError>
    readonly getSignedUrl: (bucket: string, path: string, expiresIn: Duration)
      => Effect.Effect<string, StorageError>
  }
>() {}

/**
 * Image Embedding Service - generates CLIP/BLIP embeddings
 */
export class ImageEmbeddingService extends Context.Tag("ImageEmbeddingService")<
  ImageEmbeddingService,
  {
    readonly embed: (imageBase64: string)
      => Effect.Effect<number[], EmbeddingError>
    readonly embedBatch: (images: string[])
      => Effect.Effect<number[][], EmbeddingError>
  }
>() {}

/**
 * Image Metadata Repository - SQLite/Postgres storage
 */
export class ImageMetadataRepository extends Context.Tag("ImageMetadataRepository")<
  ImageMetadataRepository,
  {
    readonly insert: (image: EnhancedImage) => Effect.Effect<void, ImageStoreError>
    readonly findById: (id: string) => Effect.Effect<EnhancedImage | null>
    readonly findByHash: (hash: string) => Effect.Effect<EnhancedImage | null>
    readonly findByMbid: (mbid: string, options?: { style?: string; limit?: number })
      => Effect.Effect<EnhancedImage[]>
    readonly findByChainId: (chainId: string) => Effect.Effect<EnhancedImage[]>
    readonly findByCacheKey: (originalHash: string, style: string, promptHash: string)
      => Effect.Effect<string | null>
    readonly delete: (id: string) => Effect.Effect<void>
    readonly searchWithFilters: (params: SearchParams) => Effect.Effect<SearchResult>
  }
>() {}

// =============================================================================
// Layer Definitions
// =============================================================================

/**
 * Live layer for SemanticImageStore
 *
 * Requires:
 * - ImageStoreConfig
 * - GcsStorageService
 * - ImageEmbeddingService
 * - ImageMetadataRepository
 * - FaissClient (for embedding search)
 */
export const SemanticImageStoreLive: Layer.Layer<
  SemanticImageStore,
  never,
  | ImageStoreConfig
  | GcsStorageService
  | ImageEmbeddingService
  | ImageMetadataRepository
  | FaissClient
> = Layer.effect(
  SemanticImageStore,
  makeSemanticImageStore // Implementation effect
)

/**
 * Test layer with in-memory storage
 */
export const SemanticImageStoreTest: Layer.Layer<SemanticImageStore> =
  Layer.succeed(SemanticImageStore, {
    store: (_input) => Effect.succeed(mockEnhancedImage),
    get: (_id) => Effect.succeed(mockEnhancedImage),
    getByHash: (_hash) => Effect.succeed(null),
    search: (_params) => Effect.succeed({ results: [], total: 0 }),
    findSimilar: (_id, _limit) => Effect.succeed([]),
    getEvolutionChain: (_id) => Effect.succeed(mockEvolutionChain),
    getByMbid: (_mbid, _options) => Effect.succeed([]),
    delete: (_id) => Effect.succeed(undefined),
    checkCache: (_originalHash, _style, _promptHash) => Effect.succeed(null)
  })
```

## Dependency Graph

```
ImageStoreConfig (no dependencies)
    |
    +---> GcsStorageService (depends on ImageStoreConfig, HttpClient)
    |
    +---> ImageEmbeddingService (depends on HttpClient or local model)
    |
    +---> ImageMetadataRepository (depends on SqlClient)
    |
    +---> FaissClient (existing - for embedding search)
    |
    v
SemanticImageStore (depends on all above)
    |
    v
AlbumArtEnhancementService (existing - enhanced with caching)
```

## Storage Strategy

### GCS Bucket Structure

```
crate-enhanced-art/
├── enhanced/
│   ├── {year}/
│   │   ├── {month}/
│   │   │   ├── {day}/
│   │   │   │   ├── {image-id}.{ext}
│   │   │   │   └── ...
│   │   │   └── ...
│   │   └── ...
│   └── ...
└── embeddings/
    └── {image-id}.json  (cached embeddings)
```

### Path Generation

```typescript
const generateStoragePath = (imageId: string, mimeType: string): string => {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  return `enhanced/${year}/${month}/${day}/${imageId}.${ext}`
}
```

### Metadata Schema (SQLite/Postgres)

```sql
CREATE TABLE enhanced_images (
  id UUID PRIMARY KEY,
  content_hash VARCHAR(64) NOT NULL UNIQUE,

  -- Original art reference
  mbid VARCHAR(36) NOT NULL,
  play_id INTEGER,
  source_url TEXT NOT NULL,
  source_hash VARCHAR(64) NOT NULL,

  -- Enhancement metadata
  style VARCHAR(32) NOT NULL,
  prompt TEXT NOT NULL,
  prompt_hash VARCHAR(64) NOT NULL,  -- For cache lookups
  style_config JSONB,
  model VARCHAR(64) NOT NULL,
  model_version VARCHAR(32) NOT NULL,
  generation_params JSONB,

  -- Storage
  bucket VARCHAR(64) NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(32) NOT NULL,
  size_bytes INTEGER NOT NULL,

  -- Evolution tracking
  parent_id UUID REFERENCES enhanced_images(id),
  refinement_prompt TEXT,
  generation INTEGER NOT NULL DEFAULT 0,
  chain_id UUID NOT NULL,

  -- Timestamps and metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,

  -- Indexes for common queries
  INDEX idx_mbid (mbid),
  INDEX idx_chain_id (chain_id),
  INDEX idx_style (style),
  INDEX idx_cache_key (source_hash, style, prompt_hash),
  INDEX idx_content_hash (content_hash)
);

-- Embedding storage (could also use FAISS directly)
CREATE TABLE image_embeddings (
  image_id UUID PRIMARY KEY REFERENCES enhanced_images(id),
  embedding VECTOR(512),  -- or FLOAT[] depending on DB
  model VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Integration with AlbumArtEnhancementService

### Enhanced Builder Pattern

```typescript
/**
 * Extended ArtEnhancement builder with persistence
 */
export class ArtEnhancementWithStore {
  private readonly builder: ArtEnhancement
  private readonly mbid?: string
  private readonly playId?: number
  private readonly sourceUrl?: string

  /**
   * Create from MBID (fetches album art automatically)
   */
  static fromMbid(mbid: string): Effect.Effect<
    ArtEnhancementWithStore,
    MbidResolverError,
    MbidResolverService
  > {
    return Effect.gen(function* () {
      const resolver = yield* MbidResolverService
      const artUrl = yield* resolver.getAlbumArt(mbid)
      const imageBase64 = yield* fetchImageAsBase64(artUrl)
      return new ArtEnhancementWithStore(
        ArtEnhancement.from(imageBase64),
        { mbid, sourceUrl: artUrl }
      )
    })
  }

  /**
   * Build and store the enhancement
   *
   * - Checks cache first
   * - Generates if not cached
   * - Stores result
   * - Returns stored image reference
   */
  buildAndStore(): Effect.Effect<
    EnhancedImage,
    AlbumArtEnhancementError | ImageStoreError,
    AlbumArtEnhancementService | SemanticImageStore
  > {
    return Effect.gen(function* () {
      const store = yield* SemanticImageStore
      const request = this.builder.toRequest()

      // Check cache
      const sourceHash = yield* computeHash(request.albumArtBase64)
      const promptHash = yield* computeHash(request.customPrompt ?? '')
      const cached = yield* store.checkCache(sourceHash, request.style, promptHash)

      if (cached) {
        return yield* store.get(cached)
      }

      // Generate new enhancement
      const response = yield* this.builder.build()

      // Store result
      return yield* store.store({
        imageBase64: response.enhancedImageBase64,
        mimeType: response.mimeType,
        originalArtRef: {
          mbid: this.mbid!,
          playId: this.playId,
          sourceUrl: this.sourceUrl!,
          sourceHash
        },
        enhancement: {
          style: request.style,
          prompt: request.customPrompt ?? '',
          styleConfig: request.styleConfig,
          model: 'gemini-3-pro-image-preview',
          modelVersion: '1.0'
        }
      })
    })
  }

  /**
   * Refine and store as new generation
   */
  refineAndStore(
    previousImage: EnhancedImage,
    refinementPrompt: string
  ): Effect.Effect<
    EnhancedImage,
    AlbumArtEnhancementError | ImageStoreError,
    AlbumArtEnhancementService | SemanticImageStore
  > {
    return Effect.gen(function* () {
      const service = yield* AlbumArtEnhancementService
      const store = yield* SemanticImageStore

      // Fetch the previous image
      const previousResponse = {
        enhancedImageBase64: yield* fetchFromGcs(previousImage.storage.url),
        mimeType: previousImage.storage.mimeType,
        rawResponse: {} // Reconstruct or store raw response
      }

      // Generate refinement
      const response = yield* service.refine(previousResponse, refinementPrompt)

      // Store as new generation
      return yield* store.store({
        imageBase64: response.enhancedImageBase64,
        mimeType: response.mimeType,
        originalArtRef: previousImage.originalArtRef,
        enhancement: {
          ...previousImage.enhancement,
          prompt: `${previousImage.enhancement.prompt}\n\nRefinement: ${refinementPrompt}`
        },
        parentId: previousImage.id,
        refinementPrompt
      })
    })
  }
}
```

## Usage Examples

### Basic Enhancement with Storage

```typescript
const program = Effect.gen(function* () {
  // Enhance and store
  const enhanced = yield* ArtEnhancementWithStore
    .fromMbid("12345678-1234-1234-1234-123456789abc")
    .pipe(
      Effect.flatMap(builder =>
        builder
          .style("lo-fi-indie")
          .withGrain(0.15)
          .warmth(1.2)
          .buildAndStore()
      )
    )

  console.log(`Stored as: ${enhanced.id}`)
  console.log(`URL: ${enhanced.storage.url}`)
})
```

### Search by Style

```typescript
const searchVinylArt = Effect.gen(function* () {
  const store = yield* SemanticImageStore

  const { results } = yield* store.search({
    style: "vinyl-sleeve",
    limit: 20
  })

  return results
})
```

### Get Evolution Chain

```typescript
const viewEvolution = Effect.gen(function* () {
  const store = yield* SemanticImageStore

  const chain = yield* store.getEvolutionChain(imageId)

  console.log(`Chain has ${chain.totalGenerations} generations`)
  console.log(`Root: ${chain.root.id}`)

  for (const refinement of chain.refinements) {
    console.log(`  -> ${refinement.id}: ${refinement.evolution?.refinementPrompt}`)
  }
})
```

### Use Stored Art as Style Reference

```typescript
const styleTransfer = Effect.gen(function* () {
  const store = yield* SemanticImageStore

  // Find a vinyl-sleeve style image to use as reference
  const { results } = yield* store.search({
    style: "vinyl-sleeve",
    minSimilarity: 0.8,
    limit: 1
  })

  if (results.length === 0) {
    return yield* Effect.fail(new Error("No style reference found"))
  }

  const styleRef = results[0]
  const styleRefBase64 = yield* fetchFromGcs(styleRef.storage.url)

  // Use it to enhance new album art
  return yield* ArtEnhancement
    .from(newAlbumArtBase64)
    .styleReferences([styleRefBase64])
    .customPrompt("Apply the texture and color palette from the reference")
    .build()
})
```

## Implementation Notes

### Content Hashing

Use SHA-256 for content addressing:

```typescript
import { createHash } from "crypto"

const computeContentHash = (imageBase64: string): Effect.Effect<ContentHash> =>
  Effect.sync(() => {
    const buffer = Buffer.from(imageBase64, "base64")
    return createHash("sha256").update(buffer).digest("hex") as ContentHash
  })
```

### Embedding Generation

Options for generating image embeddings:

1. **FAISS API Extension**: Add an endpoint to the existing FAISS API that generates CLIP embeddings
2. **Vertex AI**: Use Google's multimodal embeddings API
3. **Local CLIP**: Run CLIP model locally (for development)

Recommended: Extend FAISS API with `/api/embed/image` endpoint.

### Cache Key Strategy

```typescript
const computeCacheKey = (
  sourceHash: ContentHash,
  style: EnhancementStyle,
  promptHash: string
): string => `${sourceHash}:${style}:${promptHash.slice(0, 16)}`
```

This allows cache hits when:
- Same original image
- Same style preset
- Same prompt (or similar enough)

## Handoff to effect-engineer

### Service Contracts

```typescript
// SemanticImageStore - main orchestrator
class SemanticImageStore extends Context.Tag("SemanticImageStore")<
  SemanticImageStore,
  SemanticImageStoreInterface
>() {}

// GcsStorageService - blob storage
class GcsStorageService extends Context.Tag("GcsStorageService")<
  GcsStorageService,
  GcsStorageServiceInterface
>() {}

// ImageEmbeddingService - CLIP/BLIP embeddings
class ImageEmbeddingService extends Context.Tag("ImageEmbeddingService")<
  ImageEmbeddingService,
  ImageEmbeddingServiceInterface
>() {}

// ImageMetadataRepository - database operations
class ImageMetadataRepository extends Context.Tag("ImageMetadataRepository")<
  ImageMetadataRepository,
  ImageMetadataRepositoryInterface
>() {}
```

### Layer Signatures

```typescript
// Expected layer types (engineer implements)
const GcsStorageServiceLive: Layer<GcsStorageService, never, ImageStoreConfig | HttpClient>
const ImageEmbeddingServiceLive: Layer<ImageEmbeddingService, never, FaissConfig | HttpClient>
const ImageMetadataRepositoryLive: Layer<ImageMetadataRepository, never, SqlClient>
const SemanticImageStoreLive: Layer<SemanticImageStore, never,
  GcsStorageService | ImageEmbeddingService | ImageMetadataRepository | FaissClient>
```

### Architecture Decisions

1. **Why separate storage services?**
   - GCS operations are independent of metadata
   - Allows easy mocking for tests
   - Can swap storage backends (S3, local filesystem)

2. **Why content-addressed deduplication?**
   - Avoids storing identical enhancements multiple times
   - Enables fast cache lookups
   - Preserves storage integrity

3. **Why evolution chains?**
   - Models the natural refinement workflow
   - Enables "undo" by returning to parent
   - Preserves full enhancement history

4. **Why FAISS for embeddings?**
   - Already deployed and operational
   - Proven scalability
   - Consistent with existing semantic search

5. **Why SQLite/Postgres for metadata?**
   - Complex queries (filters, joins)
   - ACID compliance for metadata operations
   - Existing infrastructure in FAISS API

## Future Considerations

1. **Batch Processing**: Add batch enhancement endpoints for processing multiple MBIDs
2. **CDN Integration**: Serve images through CloudFlare or similar CDN
3. **Thumbnail Generation**: Auto-generate thumbnails at store time
4. **Retention Policies**: Auto-cleanup of old/unused enhancements
5. **Analytics**: Track which styles are most popular, cache hit rates
6. **A/B Testing**: Support multiple enhancement variations per MBID
