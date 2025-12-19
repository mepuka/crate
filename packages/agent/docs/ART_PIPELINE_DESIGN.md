# Art Generation Pipeline Design

Effect-based abstractions for image generation and processing in Crate.

## Overview

This design introduces reusable Effect services for generating and managing visual assets (album art, promotional images, show graphics) using Gemini's native image generation ("Nano Banana Pro") and future providers.

**Key Principles:**
- **Requirements never leak** - Service interfaces have `never` in the R channel
- **Provider agnostic** - Abstract over Gemini, DALL-E, Stable Diffusion
- **Composable layers** - Mix and match generation, caching, enhancement
- **Schema-driven prompts** - Type-safe visual prompt construction
- **Stream-friendly** - Batch processing via Effect streams

## Dependency Graph

```text
                      ┌─────────────────┐
                      │   ArtConfig     │ (no dependencies)
                      └────────┬────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  AssetCache   │    │  ImageService   │    │ PromptBuilder   │
│ (Cache layer) │    │ (Generation)    │    │ (Type-safe)     │
└───────┬───────┘    └────────┬────────┘    └────────┬────────┘
        │                     │                      │
        └──────────────┬──────┴──────────────────────┘
                       │
                       ▼
               ┌───────────────┐
               │  ArtPipeline  │ (orchestration)
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │  MusicAgent   │ (integration)
               └───────────────┘
```

---

## 1. Configuration Service

```typescript
// /packages/agent/src/services/ArtConfig.ts

import { Config, Duration, Effect, Option, Redacted } from "effect"

/**
 * Configuration for art generation services
 */
export interface ArtConfigShape {
  readonly provider: "gemini" | "dalle" | "stable-diffusion"
  readonly model: string
  readonly googleApiKey: Redacted.Redacted<string> | null
  readonly openaiApiKey: Redacted.Redacted<string> | null
  readonly cacheEnabled: boolean
  readonly cacheTtl: Duration.Duration
  readonly maxConcurrent: number
  readonly timeout: Duration.Duration
  readonly outputDir: string
}

/**
 * Default models per provider
 */
const DEFAULT_ART_MODELS = {
  gemini: "gemini-3-pro-image-preview",  // Nano Banana Pro
  dalle: "dall-e-3",
  "stable-diffusion": "sdxl-turbo",
} as const

/**
 * Art generation configuration service
 *
 * Environment variables:
 * - ART_PROVIDER: gemini | dalle | stable-diffusion (default: gemini)
 * - ART_MODEL: Model override
 * - ART_CACHE_ENABLED: Enable asset caching (default: true)
 * - ART_CACHE_TTL_HOURS: Cache TTL in hours (default: 168 = 1 week)
 * - ART_MAX_CONCURRENT: Max parallel generations (default: 3)
 * - ART_TIMEOUT_MS: Generation timeout (default: 120000)
 * - ART_OUTPUT_DIR: Local output directory (default: /tmp/crate-art)
 */
export class ArtConfig extends Effect.Service<ArtConfig>()("ArtConfig", {
  effect: Effect.gen(function* () {
    const config = yield* Config.all({
      provider: Config.literal("gemini", "dalle", "stable-diffusion")("ART_PROVIDER").pipe(
        Config.withDefault("gemini" as const)
      ),
      model: Config.option(Config.string("ART_MODEL")),
      googleApiKey: Config.option(Config.redacted("GOOGLE_AI_API_KEY").pipe(
        Config.orElse(() => Config.redacted("GOOGLE_API_KEY"))
      )),
      openaiApiKey: Config.option(Config.redacted("OPENAI_API_KEY")),
      cacheEnabled: Config.boolean("ART_CACHE_ENABLED").pipe(Config.withDefault(true)),
      cacheTtlHours: Config.number("ART_CACHE_TTL_HOURS").pipe(Config.withDefault(168)),
      maxConcurrent: Config.number("ART_MAX_CONCURRENT").pipe(Config.withDefault(3)),
      timeoutMs: Config.number("ART_TIMEOUT_MS").pipe(Config.withDefault(120000)),
      outputDir: Config.string("ART_OUTPUT_DIR").pipe(Config.withDefault("/tmp/crate-art")),
    })

    const resolvedModel = Option.getOrElse(
      config.model,
      () => DEFAULT_ART_MODELS[config.provider]
    )

    return {
      provider: config.provider,
      model: resolvedModel,
      googleApiKey: Option.getOrNull(config.googleApiKey),
      openaiApiKey: Option.getOrNull(config.openaiApiKey),
      cacheEnabled: config.cacheEnabled,
      cacheTtl: Duration.hours(config.cacheTtlHours),
      maxConcurrent: config.maxConcurrent,
      timeout: Duration.millis(config.timeoutMs),
      outputDir: config.outputDir,
    } satisfies ArtConfigShape
  })
}) {}
```

---

## 2. Error Types

```typescript
// /packages/agent/src/services/art-errors.ts

import { Data } from "effect"

/**
 * Image generation failed
 */
export class ImageGenerationError extends Data.TaggedError("ImageGenerationError")<{
  readonly message: string
  readonly provider: string
  readonly prompt?: string
  readonly cause?: unknown
}> {}

/**
 * Image processing failed (resize, format conversion)
 */
export class ImageProcessingError extends Data.TaggedError("ImageProcessingError")<{
  readonly message: string
  readonly operation: "resize" | "convert" | "optimize" | "composite"
  readonly cause?: unknown
}> {}

/**
 * Asset cache operation failed
 */
export class AssetCacheError extends Data.TaggedError("AssetCacheError")<{
  readonly message: string
  readonly operation: "get" | "set" | "invalidate"
  readonly key?: string
  readonly cause?: unknown
}> {}

/**
 * Visual prompt validation failed
 */
export class PromptValidationError extends Data.TaggedError("PromptValidationError")<{
  readonly message: string
  readonly field: string
  readonly value?: unknown
}> {}

/**
 * Union of all art pipeline errors
 */
export type ArtPipelineError =
  | ImageGenerationError
  | ImageProcessingError
  | AssetCacheError
  | PromptValidationError
```

---

## 3. Visual Prompt Schemas

```typescript
// /packages/agent/src/prompts/visual-prompts.ts

import { Schema } from "effect"

// =============================================================================
// Style Definitions
// =============================================================================

/**
 * Visual art styles for generation
 */
export const ArtStyle = Schema.Literal(
  "lo-fi-indie",      // Muted colors, nostalgic, warm
  "vintage-vinyl",    // Record player aesthetic
  "concert-poster",   // Bold, graphic, high contrast
  "album-cover",      // Professional, polished
  "abstract-wave",    // Audio waveform inspired
  "neon-retro",       // 80s synth vibes
  "minimal-modern",   // Clean, typography-focused
  "collage",          // Mixed media, layered
  "photorealistic",   // Natural photography style
  "illustration"      // Hand-drawn, artistic
)
export type ArtStyle = typeof ArtStyle.Type

/**
 * Mood/atmosphere for the image
 */
export const ArtMood = Schema.Literal(
  "warm",
  "cool",
  "energetic",
  "melancholic",
  "dreamy",
  "gritty",
  "ethereal",
  "nostalgic",
  "vibrant",
  "subdued"
)
export type ArtMood = typeof ArtMood.Type

/**
 * Color palette preferences
 */
export const ColorPalette = Schema.Literal(
  "warm-earth",       // Browns, oranges, yellows
  "cool-ocean",       // Blues, teals, grays
  "sunset",           // Oranges, pinks, purples
  "monochrome",       // Black, white, grays
  "neon",             // Bright saturated colors
  "muted-pastel",     // Soft, desaturated
  "seattle-gray",     // PNW inspired grays and greens
  "custom"            // User-specified
)
export type ColorPalette = typeof ColorPalette.Type

// =============================================================================
// Visual Prompt Schema
// =============================================================================

/**
 * Subject matter for the image
 */
export class VisualSubject extends Schema.Class<VisualSubject>("VisualSubject")({
  /** Primary subject (e.g., "vintage record player", "concert crowd") */
  primary: Schema.String,
  /** Secondary elements to include */
  secondary: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** Elements to explicitly exclude */
  avoid: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
}) {}

/**
 * Complete visual prompt for image generation
 */
export class VisualPrompt extends Schema.Class<VisualPrompt>("VisualPrompt")({
  /** What to generate */
  subject: VisualSubject,
  /** Visual style */
  style: ArtStyle,
  /** Mood/atmosphere */
  mood: ArtMood,
  /** Color preferences */
  palette: ColorPalette,
  /** Custom colors if palette is "custom" */
  customColors: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** Aspect ratio (e.g., "1:1", "16:9", "4:3") */
  aspectRatio: Schema.optionalWith(Schema.String, { default: () => "1:1" }),
  /** Additional style modifiers */
  modifiers: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] }),
  /** Negative prompt (things to avoid) */
  negativePrompt: Schema.optionalWith(Schema.String, { default: () => "" }),
}) {}

// =============================================================================
// Context-Aware Prompts
// =============================================================================

/**
 * Album art prompt with music context
 */
export class AlbumArtPrompt extends Schema.Class<AlbumArtPrompt>("AlbumArtPrompt")({
  /** Base visual prompt */
  visual: VisualPrompt,
  /** Artist name for context */
  artistName: Schema.String,
  /** Album/track title for context */
  title: Schema.String,
  /** Genre for style hints */
  genre: Schema.optionalWith(Schema.String, { default: () => "" }),
  /** Year for era-appropriate styling */
  year: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  /** Is this a local/PNW artist? */
  isLocal: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}

/**
 * Show graphic prompt (for DJ shows, events)
 */
export class ShowGraphicPrompt extends Schema.Class<ShowGraphicPrompt>("ShowGraphicPrompt")({
  visual: VisualPrompt,
  showName: Schema.String,
  djName: Schema.optionalWith(Schema.String, { default: () => "" }),
  /** Time slot for mood (morning vs late night) */
  timeSlot: Schema.optionalWith(
    Schema.Literal("early-morning", "morning", "midday", "afternoon", "evening", "late-night"),
    { default: () => "midday" as const }
  ),
}) {}

/**
 * Concert poster prompt
 */
export class ConcertPosterPrompt extends Schema.Class<ConcertPosterPrompt>("ConcertPosterPrompt")({
  visual: VisualPrompt,
  artistName: Schema.String,
  venue: Schema.String,
  date: Schema.String,
  city: Schema.optionalWith(Schema.String, { default: () => "Seattle" }),
}) {}
```

---

## 4. PromptBuilder Service

```typescript
// /packages/agent/src/services/VisualPromptBuilder.ts

import { Context, Effect, Layer } from "effect"
import {
  VisualPrompt,
  AlbumArtPrompt,
  ShowGraphicPrompt,
  ConcertPosterPrompt,
  VisualSubject,
  type ArtStyle,
  type ArtMood,
  type ColorPalette,
} from "../prompts/visual-prompts.js"
import { PromptValidationError } from "./art-errors.js"

// =============================================================================
// Service Interface
// =============================================================================

export interface VisualPromptBuilderInterface {
  /**
   * Build a raw prompt string from a VisualPrompt schema
   * Provider-agnostic format that can be adapted per-provider
   */
  readonly buildPromptString: (prompt: VisualPrompt) => Effect.Effect<string>

  /**
   * Build album art prompt with music context
   */
  readonly buildAlbumArtPrompt: (
    input: AlbumArtPromptInput
  ) => Effect.Effect<AlbumArtPrompt, PromptValidationError>

  /**
   * Build show graphic prompt
   */
  readonly buildShowGraphicPrompt: (
    input: ShowGraphicPromptInput
  ) => Effect.Effect<ShowGraphicPrompt, PromptValidationError>

  /**
   * Build concert poster prompt
   */
  readonly buildConcertPosterPrompt: (
    input: ConcertPosterPromptInput
  ) => Effect.Effect<ConcertPosterPrompt, PromptValidationError>

  /**
   * Infer visual style from genre/mood
   */
  readonly inferStyleFromGenre: (
    genre: string
  ) => Effect.Effect<{ style: ArtStyle; mood: ArtMood; palette: ColorPalette }>

  /**
   * Get KEXP-appropriate defaults for local artists
   */
  readonly getLocalArtistDefaults: () => {
    style: ArtStyle
    mood: ArtMood
    palette: ColorPalette
    modifiers: string[]
  }
}

// =============================================================================
// Input Types (for convenience)
// =============================================================================

export interface AlbumArtPromptInput {
  readonly artistName: string
  readonly title: string
  readonly genre?: string
  readonly year?: number
  readonly isLocal?: boolean
  readonly styleOverride?: ArtStyle
  readonly moodOverride?: ArtMood
}

export interface ShowGraphicPromptInput {
  readonly showName: string
  readonly djName?: string
  readonly timeSlot?: "early-morning" | "morning" | "midday" | "afternoon" | "evening" | "late-night"
  readonly style?: ArtStyle
}

export interface ConcertPosterPromptInput {
  readonly artistName: string
  readonly venue: string
  readonly date: string
  readonly city?: string
  readonly style?: ArtStyle
}

// =============================================================================
// Service Tag
// =============================================================================

export class VisualPromptBuilder extends Context.Tag("VisualPromptBuilder")<
  VisualPromptBuilder,
  VisualPromptBuilderInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

const GENRE_STYLE_MAP: Record<string, { style: ArtStyle; mood: ArtMood; palette: ColorPalette }> = {
  "indie": { style: "lo-fi-indie", mood: "nostalgic", palette: "muted-pastel" },
  "rock": { style: "concert-poster", mood: "energetic", palette: "warm-earth" },
  "electronic": { style: "neon-retro", mood: "vibrant", palette: "neon" },
  "jazz": { style: "vintage-vinyl", mood: "warm", palette: "warm-earth" },
  "hip-hop": { style: "collage", mood: "gritty", palette: "neon" },
  "folk": { style: "illustration", mood: "warm", palette: "warm-earth" },
  "ambient": { style: "abstract-wave", mood: "ethereal", palette: "cool-ocean" },
  "punk": { style: "concert-poster", mood: "energetic", palette: "monochrome" },
  "soul": { style: "vintage-vinyl", mood: "warm", palette: "sunset" },
  "metal": { style: "concert-poster", mood: "gritty", palette: "monochrome" },
}

const TIME_SLOT_MOODS: Record<string, ArtMood> = {
  "early-morning": "ethereal",
  "morning": "warm",
  "midday": "vibrant",
  "afternoon": "dreamy",
  "evening": "nostalgic",
  "late-night": "melancholic",
}

const makeVisualPromptBuilder = Effect.succeed({
  buildPromptString: (prompt: VisualPrompt) =>
    Effect.succeed(
      [
        // Primary subject
        prompt.subject.primary,
        // Secondary elements
        ...prompt.subject.secondary.map(s => `with ${s}`),
        // Style
        `in ${prompt.style.replace(/-/g, " ")} style`,
        // Mood
        `${prompt.mood} atmosphere`,
        // Colors
        prompt.palette === "custom" && prompt.customColors.length > 0
          ? `color palette: ${prompt.customColors.join(", ")}`
          : `${prompt.palette.replace(/-/g, " ")} colors`,
        // Modifiers
        ...prompt.modifiers,
        // Aspect ratio hint
        `aspect ratio ${prompt.aspectRatio}`,
        // Negative prompt
        prompt.negativePrompt ? `Avoid: ${prompt.negativePrompt}` : "",
      ]
        .filter(Boolean)
        .join(". ")
    ),

  buildAlbumArtPrompt: (input: AlbumArtPromptInput) =>
    Effect.gen(function* () {
      // Infer style from genre if not overridden
      const inferred = GENRE_STYLE_MAP[input.genre?.toLowerCase() ?? ""] ?? {
        style: "album-cover" as ArtStyle,
        mood: "vibrant" as ArtMood,
        palette: "custom" as ColorPalette,
      }

      const style = input.styleOverride ?? (input.isLocal ? "lo-fi-indie" : inferred.style)
      const mood = input.moodOverride ?? (input.isLocal ? "nostalgic" : inferred.mood)
      const palette = input.isLocal ? "seattle-gray" : inferred.palette

      const subject = new VisualSubject({
        primary: `album cover art for "${input.title}" by ${input.artistName}`,
        secondary: input.isLocal ? ["Pacific Northwest aesthetic", "indie music vibes"] : [],
        avoid: ["text", "words", "letters", "watermarks"],
      })

      const visual = new VisualPrompt({
        subject,
        style,
        mood,
        palette,
        aspectRatio: "1:1",
        modifiers: input.year && input.year < 2000 ? ["vintage", "retro"] : [],
        negativePrompt: "text, words, letters, watermarks, logos, low quality",
      })

      return new AlbumArtPrompt({
        visual,
        artistName: input.artistName,
        title: input.title,
        genre: input.genre ?? "",
        year: input.year ?? 0,
        isLocal: input.isLocal ?? false,
      })
    }),

  buildShowGraphicPrompt: (input: ShowGraphicPromptInput) =>
    Effect.gen(function* () {
      const mood = TIME_SLOT_MOODS[input.timeSlot ?? "midday"] ?? "vibrant"
      const style = input.style ?? "minimal-modern"

      const subject = new VisualSubject({
        primary: `radio show graphic for "${input.showName}"`,
        secondary: input.djName ? [`hosted by ${input.djName}`] : [],
        avoid: ["text", "words"],
      })

      const visual = new VisualPrompt({
        subject,
        style,
        mood,
        palette: "seattle-gray",
        aspectRatio: "16:9",
        modifiers: ["broadcast quality", "professional"],
        negativePrompt: "amateur, low quality",
      })

      return new ShowGraphicPrompt({
        visual,
        showName: input.showName,
        djName: input.djName ?? "",
        timeSlot: input.timeSlot ?? "midday",
      })
    }),

  buildConcertPosterPrompt: (input: ConcertPosterPromptInput) =>
    Effect.gen(function* () {
      const subject = new VisualSubject({
        primary: `concert poster for ${input.artistName} live at ${input.venue}`,
        secondary: [`${input.city ?? "Seattle"} show`, input.date],
        avoid: [],  // Posters can have text
      })

      const visual = new VisualPrompt({
        subject,
        style: input.style ?? "concert-poster",
        mood: "energetic",
        palette: "warm-earth",
        aspectRatio: "2:3",
        modifiers: ["gig poster", "screen print style", "bold typography"],
        negativePrompt: "photorealistic, 3D render",
      })

      return new ConcertPosterPrompt({
        visual,
        artistName: input.artistName,
        venue: input.venue,
        date: input.date,
        city: input.city ?? "Seattle",
      })
    }),

  inferStyleFromGenre: (genre: string) =>
    Effect.succeed(
      GENRE_STYLE_MAP[genre.toLowerCase()] ?? {
        style: "album-cover" as ArtStyle,
        mood: "vibrant" as ArtMood,
        palette: "custom" as ColorPalette,
      }
    ),

  getLocalArtistDefaults: () => ({
    style: "lo-fi-indie" as ArtStyle,
    mood: "nostalgic" as ArtMood,
    palette: "seattle-gray" as ColorPalette,
    modifiers: ["Pacific Northwest", "indie", "authentic", "warm lighting"],
  }),
} satisfies VisualPromptBuilderInterface)

// =============================================================================
// Layers
// =============================================================================

export const VisualPromptBuilderLive: Layer.Layer<VisualPromptBuilder> =
  Layer.effect(VisualPromptBuilder, makeVisualPromptBuilder)
```

---

## 5. ImageService

```typescript
// /packages/agent/src/services/ImageService.ts

import { Context, Effect, Layer, Stream, Chunk, Data } from "effect"
import { FetchHttpClient, HttpClient } from "@effect/platform"
import * as GoogleClientModule from "@effect/ai-google/GoogleClient"
import { ArtConfig } from "./ArtConfig.js"
import { ImageGenerationError, ImageProcessingError } from "./art-errors.js"
import type { VisualPrompt } from "../prompts/visual-prompts.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Generated image result
 */
export class GeneratedImage extends Data.Class<{
  /** Raw image data as Uint8Array */
  readonly data: Uint8Array
  /** MIME type (e.g., "image/png") */
  readonly mimeType: string
  /** Width in pixels */
  readonly width: number
  /** Height in pixels */
  readonly height: number
  /** Generation metadata */
  readonly metadata: {
    readonly provider: string
    readonly model: string
    readonly prompt: string
    readonly generatedAt: string
    readonly durationMs: number
  }
}> {}

/**
 * Image resize options
 */
export interface ResizeOptions {
  readonly width?: number
  readonly height?: number
  readonly fit?: "cover" | "contain" | "fill" | "inside" | "outside"
  readonly format?: "png" | "jpeg" | "webp"
  readonly quality?: number
}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * ImageService interface
 *
 * Note: All methods have Requirements = never (clean interface)
 * Provider dependencies are injected at layer construction time.
 */
export interface ImageServiceInterface {
  /**
   * Generate an image from a visual prompt
   */
  readonly generate: (
    prompt: VisualPrompt
  ) => Effect.Effect<GeneratedImage, ImageGenerationError>

  /**
   * Generate an image from a raw prompt string
   */
  readonly generateFromText: (
    prompt: string
  ) => Effect.Effect<GeneratedImage, ImageGenerationError>

  /**
   * Generate multiple images (batch)
   */
  readonly generateBatch: (
    prompts: readonly VisualPrompt[],
    options?: { concurrency?: number }
  ) => Stream.Stream<GeneratedImage, ImageGenerationError>

  /**
   * Resize/transform an image
   */
  readonly resize: (
    image: GeneratedImage,
    options: ResizeOptions
  ) => Effect.Effect<GeneratedImage, ImageProcessingError>

  /**
   * Save image to local filesystem
   */
  readonly saveToFile: (
    image: GeneratedImage,
    path: string
  ) => Effect.Effect<string, ImageProcessingError>

  /**
   * Get provider info
   */
  readonly getProviderInfo: () => { provider: string; model: string }
}

// =============================================================================
// Service Tag
// =============================================================================

export class ImageService extends Context.Tag("ImageService")<
  ImageService,
  ImageServiceInterface
>() {}

// =============================================================================
// Gemini Implementation
// =============================================================================

const makeGeminiImageService = (
  config: import("./ArtConfig.js").ArtConfigShape,
  googleClient: GoogleClientModule.GoogleClient.Service
): ImageServiceInterface => ({
  generate: (prompt) =>
    Effect.gen(function* () {
      const startTime = Date.now()

      // Build prompt string from structured prompt
      const promptString = [
        prompt.subject.primary,
        ...prompt.subject.secondary.map(s => `with ${s}`),
        `in ${prompt.style.replace(/-/g, " ")} style`,
        `${prompt.mood} atmosphere`,
        prompt.palette !== "custom"
          ? `${prompt.palette.replace(/-/g, " ")} colors`
          : prompt.customColors.join(", "),
        ...prompt.modifiers,
      ].filter(Boolean).join(". ")

      return yield* makeGeminiImageService(config, googleClient).generateFromText(promptString)
    }),

  generateFromText: (promptText) =>
    Effect.gen(function* () {
      const startTime = Date.now()

      yield* Effect.logDebug(`Generating image with ${config.provider}/${config.model}`)

      const request = {
        model: config.model,
        contents: [
          {
            role: "user",
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }

      const response = yield* googleClient.generateContent(request as any).pipe(
        Effect.timeout(config.timeout),
        Effect.mapError((error) =>
          new ImageGenerationError({
            message: `Gemini image generation failed: ${error}`,
            provider: "gemini",
            prompt: promptText,
            cause: error,
          })
        )
      )

      // Extract image from response
      const imagePart = response.candidates?.[0]?.content?.parts?.find(
        (part: any) => "inlineData" in part && part.inlineData
      ) as { inlineData: { mimeType: string; data: string } } | undefined

      if (!imagePart?.inlineData?.data) {
        return yield* Effect.fail(
          new ImageGenerationError({
            message: "No image in Gemini response",
            provider: "gemini",
            prompt: promptText,
          })
        )
      }

      const imageData = Uint8Array.from(
        atob(imagePart.inlineData.data),
        (c) => c.charCodeAt(0)
      )

      // Note: Gemini doesn't return dimensions, would need image parsing
      return new GeneratedImage({
        data: imageData,
        mimeType: imagePart.inlineData.mimeType,
        width: 1024,  // Default assumption
        height: 1024,
        metadata: {
          provider: "gemini",
          model: config.model,
          prompt: promptText,
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        },
      })
    }),

  generateBatch: (prompts, options) =>
    Stream.fromIterable(prompts).pipe(
      Stream.mapEffect(
        (prompt) => makeGeminiImageService(config, googleClient).generate(prompt),
        { concurrency: options?.concurrency ?? config.maxConcurrent }
      )
    ),

  resize: (image, options) =>
    Effect.gen(function* () {
      // Placeholder - would use sharp or similar
      yield* Effect.logWarning("Image resize not implemented - returning original")
      return image
    }),

  saveToFile: (image, path) =>
    Effect.gen(function* () {
      const fs = yield* Effect.promise(() => import("node:fs/promises"))
      yield* Effect.tryPromise({
        try: () => fs.writeFile(path, image.data),
        catch: (error) =>
          new ImageProcessingError({
            message: `Failed to save image: ${error}`,
            operation: "convert",
            cause: error,
          }),
      })
      return path
    }),

  getProviderInfo: () => ({
    provider: config.provider,
    model: config.model,
  }),
})

// =============================================================================
// Layers
// =============================================================================

/**
 * ImageService layer for Gemini (Nano Banana Pro)
 *
 * Requires:
 * - ArtConfig
 * - GoogleClient (from @effect/ai-google)
 */
export const ImageServiceGeminiLayer: Layer.Layer<
  ImageService,
  never,
  ArtConfig | GoogleClientModule.GoogleClient
> = Layer.effect(
  ImageService,
  Effect.gen(function* () {
    const config = yield* ArtConfig
    const googleClient = yield* GoogleClientModule.GoogleClient

    return makeGeminiImageService(config, googleClient)
  })
)

/**
 * Complete ImageService with all dependencies resolved
 */
export const ImageServiceLive: Layer.Layer<ImageService> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* ArtConfig

    // Build provider-specific client layer
    const clientLayer = GoogleClientModule.layer({
      apiKey: config.googleApiKey!,
      transformClient: HttpClient.retryTransient({ times: 3 }),
    }).pipe(Layer.provide(FetchHttpClient.layer))

    return ImageServiceGeminiLayer.pipe(
      Layer.provide(clientLayer),
      Layer.provide(ArtConfig.Default)
    )
  })
).pipe(Layer.provide(ArtConfig.Default))
```

---

## 6. AssetCache Service

```typescript
// /packages/agent/src/services/AssetCache.ts

import { Context, Effect, Layer, Cache, Duration, Option, Hash, Equal } from "effect"
import { ArtConfig } from "./ArtConfig.js"
import { AssetCacheError } from "./art-errors.js"
import type { GeneratedImage } from "./ImageService.js"

// =============================================================================
// Cache Key
// =============================================================================

/**
 * Cache key for generated assets
 */
export class AssetCacheKey implements Equal.Equal {
  constructor(
    readonly promptHash: string,
    readonly provider: string,
    readonly aspectRatio: string
  ) {}

  [Equal.symbol](that: Equal.Equal): boolean {
    return (
      that instanceof AssetCacheKey &&
      this.promptHash === that.promptHash &&
      this.provider === that.provider &&
      this.aspectRatio === that.aspectRatio
    )
  }

  [Hash.symbol](): number {
    return Hash.string(`${this.promptHash}-${this.provider}-${this.aspectRatio}`)
  }

  static fromPrompt(prompt: string, provider: string, aspectRatio: string): AssetCacheKey {
    // Simple hash for demonstration - use crypto in production
    const hash = prompt.split("").reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0
    }, 0).toString(36)
    return new AssetCacheKey(hash, provider, aspectRatio)
  }
}

// =============================================================================
// Service Interface
// =============================================================================

export interface AssetCacheInterface {
  /**
   * Get a cached asset if it exists
   */
  readonly get: (
    key: AssetCacheKey
  ) => Effect.Effect<Option.Option<GeneratedImage>>

  /**
   * Store an asset in the cache
   */
  readonly set: (
    key: AssetCacheKey,
    image: GeneratedImage
  ) => Effect.Effect<void>

  /**
   * Get or compute - cache-through pattern
   */
  readonly getOrCompute: <E>(
    key: AssetCacheKey,
    compute: Effect.Effect<GeneratedImage, E>
  ) => Effect.Effect<GeneratedImage, E>

  /**
   * Invalidate a cache entry
   */
  readonly invalidate: (key: AssetCacheKey) => Effect.Effect<void>

  /**
   * Clear all cached assets
   */
  readonly clear: () => Effect.Effect<void>

  /**
   * Get cache statistics
   */
  readonly stats: () => Effect.Effect<{
    readonly hits: number
    readonly misses: number
    readonly size: number
  }>
}

// =============================================================================
// Service Tag
// =============================================================================

export class AssetCache extends Context.Tag("AssetCache")<
  AssetCache,
  AssetCacheInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

const makeAssetCache = (config: import("./ArtConfig.js").ArtConfigShape) =>
  Effect.gen(function* () {
    // Use Effect's built-in Cache for TTL and LRU semantics
    const cache = yield* Cache.make({
      capacity: 100,
      timeToLive: config.cacheTtl,
      lookup: (_key: AssetCacheKey) =>
        // This is a placeholder - actual lookup returns Option.none
        Effect.succeed(Option.none<GeneratedImage>()),
    })

    // Track stats manually
    let hits = 0
    let misses = 0

    // In-memory store for actual values (Cache doesn't store values directly)
    const store = new Map<string, GeneratedImage>()
    const keyToString = (k: AssetCacheKey) =>
      `${k.promptHash}-${k.provider}-${k.aspectRatio}`

    return {
      get: (key) =>
        Effect.gen(function* () {
          const strKey = keyToString(key)
          const value = store.get(strKey)
          if (value) {
            hits++
            return Option.some(value)
          }
          misses++
          return Option.none()
        }),

      set: (key, image) =>
        Effect.sync(() => {
          store.set(keyToString(key), image)
        }),

      getOrCompute: (key, compute) =>
        Effect.gen(function* () {
          const existing = yield* Effect.sync(() => store.get(keyToString(key)))
          if (existing) {
            hits++
            return existing
          }
          misses++
          const result = yield* compute
          store.set(keyToString(key), result)
          return result
        }),

      invalidate: (key) =>
        Effect.sync(() => {
          store.delete(keyToString(key))
        }),

      clear: () =>
        Effect.sync(() => {
          store.clear()
          hits = 0
          misses = 0
        }),

      stats: () =>
        Effect.succeed({
          hits,
          misses,
          size: store.size,
        }),
    } satisfies AssetCacheInterface
  })

// =============================================================================
// Layers
// =============================================================================

export const AssetCacheLive: Layer.Layer<AssetCache, never, ArtConfig> = Layer.effect(
  AssetCache,
  Effect.gen(function* () {
    const config = yield* ArtConfig
    return yield* makeAssetCache(config)
  })
)

export const AssetCacheFull: Layer.Layer<AssetCache> = AssetCacheLive.pipe(
  Layer.provide(ArtConfig.Default)
)

/**
 * No-op cache for testing or when caching is disabled
 */
export const AssetCacheNoop: Layer.Layer<AssetCache> = Layer.succeed(
  AssetCache,
  {
    get: () => Effect.succeed(Option.none()),
    set: () => Effect.void,
    getOrCompute: (_, compute) => compute,
    invalidate: () => Effect.void,
    clear: () => Effect.void,
    stats: () => Effect.succeed({ hits: 0, misses: 0, size: 0 }),
  }
)
```

---

## 7. ArtPipeline (Orchestration)

```typescript
// /packages/agent/src/orchestration/ArtPipeline.ts

import { Context, Effect, Layer, Stream, pipe, Option } from "effect"
import { ImageService, type GeneratedImage } from "../services/ImageService.js"
import { AssetCache, AssetCacheKey } from "../services/AssetCache.js"
import { VisualPromptBuilder } from "../services/VisualPromptBuilder.js"
import type {
  VisualPrompt,
  AlbumArtPrompt,
  ShowGraphicPrompt,
} from "../prompts/visual-prompts.js"
import type { ImageGenerationError } from "../services/art-errors.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Art generation request with metadata
 */
export interface ArtRequest {
  readonly id: string
  readonly prompt: VisualPrompt
  readonly priority?: "high" | "normal" | "low"
  readonly skipCache?: boolean
}

/**
 * Art generation result with request context
 */
export interface ArtResult {
  readonly requestId: string
  readonly image: GeneratedImage
  readonly cached: boolean
  readonly durationMs: number
}

// =============================================================================
// Service Interface
// =============================================================================

export interface ArtPipelineInterface {
  /**
   * Generate art for a single request (with caching)
   */
  readonly generate: (
    request: ArtRequest
  ) => Effect.Effect<ArtResult, ImageGenerationError>

  /**
   * Generate art for multiple requests with streaming results
   */
  readonly generateBatch: (
    requests: readonly ArtRequest[]
  ) => Stream.Stream<ArtResult, ImageGenerationError>

  /**
   * Generate album art from play context
   */
  readonly generateAlbumArt: (opts: {
    readonly artistName: string
    readonly title: string
    readonly genre?: string
    readonly isLocal?: boolean
  }) => Effect.Effect<GeneratedImage, ImageGenerationError>

  /**
   * Generate show graphic
   */
  readonly generateShowGraphic: (opts: {
    readonly showName: string
    readonly djName?: string
    readonly timeSlot?: "morning" | "afternoon" | "evening" | "late-night"
  }) => Effect.Effect<GeneratedImage, ImageGenerationError>

  /**
   * Warm up cache for a list of prompts (background generation)
   */
  readonly warmCache: (
    prompts: readonly VisualPrompt[]
  ) => Effect.Effect<{ generated: number; cached: number }>
}

// =============================================================================
// Service Tag
// =============================================================================

export class ArtPipeline extends Context.Tag("ArtPipeline")<
  ArtPipeline,
  ArtPipelineInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

const makeArtPipeline = Effect.gen(function* () {
  const imageService = yield* ImageService
  const cache = yield* AssetCache
  const promptBuilder = yield* VisualPromptBuilder

  const { provider, model } = imageService.getProviderInfo()

  const generateWithCache = (
    request: ArtRequest
  ): Effect.Effect<ArtResult, ImageGenerationError> =>
    Effect.gen(function* () {
      const startTime = Date.now()
      const cacheKey = AssetCacheKey.fromPrompt(
        request.prompt.subject.primary,
        provider,
        request.prompt.aspectRatio
      )

      // Check cache first (unless skipped)
      if (!request.skipCache) {
        const cached = yield* cache.get(cacheKey)
        if (Option.isSome(cached)) {
          return {
            requestId: request.id,
            image: cached.value,
            cached: true,
            durationMs: Date.now() - startTime,
          }
        }
      }

      // Generate new image
      const image = yield* imageService.generate(request.prompt)

      // Cache result
      yield* cache.set(cacheKey, image)

      return {
        requestId: request.id,
        image,
        cached: false,
        durationMs: Date.now() - startTime,
      }
    })

  return {
    generate: generateWithCache,

    generateBatch: (requests) =>
      pipe(
        Stream.fromIterable(requests),
        // Sort by priority
        Stream.map((req) => ({
          ...req,
          _priority: req.priority === "high" ? 0 : req.priority === "low" ? 2 : 1,
        })),
        // Generate with controlled concurrency
        Stream.mapEffect(
          (req) => generateWithCache(req),
          { concurrency: 3 }
        )
      ),

    generateAlbumArt: (opts) =>
      Effect.gen(function* () {
        const prompt = yield* promptBuilder.buildAlbumArtPrompt({
          artistName: opts.artistName,
          title: opts.title,
          genre: opts.genre,
          isLocal: opts.isLocal,
        })
        return yield* imageService.generate(prompt.visual)
      }),

    generateShowGraphic: (opts) =>
      Effect.gen(function* () {
        const prompt = yield* promptBuilder.buildShowGraphicPrompt({
          showName: opts.showName,
          djName: opts.djName,
          timeSlot: opts.timeSlot as any,
        })
        return yield* imageService.generate(prompt.visual)
      }),

    warmCache: (prompts) =>
      Effect.gen(function* () {
        let generated = 0
        let cached = 0

        yield* Effect.forEach(
          prompts,
          (prompt) =>
            Effect.gen(function* () {
              const cacheKey = AssetCacheKey.fromPrompt(
                prompt.subject.primary,
                provider,
                prompt.aspectRatio
              )
              const existing = yield* cache.get(cacheKey)
              if (Option.isSome(existing)) {
                cached++
              } else {
                const image = yield* imageService.generate(prompt)
                yield* cache.set(cacheKey, image)
                generated++
              }
            }).pipe(
              Effect.catchAll((error) =>
                Effect.logWarning(`Cache warm failed: ${error}`).pipe(
                  Effect.as(undefined)
                )
              )
            ),
          { concurrency: 3 }
        )

        return { generated, cached }
      }),
  } satisfies ArtPipelineInterface
})

// =============================================================================
// Layers
// =============================================================================

export const ArtPipelineLive: Layer.Layer<
  ArtPipeline,
  never,
  ImageService | AssetCache | VisualPromptBuilder
> = Layer.effect(ArtPipeline, makeArtPipeline)

/**
 * Complete ArtPipeline with all dependencies
 */
export const ArtPipelineFull: Layer.Layer<ArtPipeline> = ArtPipelineLive.pipe(
  Layer.provide(Layer.mergeAll(
    // These would be the actual layers from their modules
    // ImageServiceLive,
    // AssetCacheFull,
    // VisualPromptBuilderLive,
  ))
)
```

---

## 8. Integration with Insights Pipeline

The art generation pipeline integrates at the **Writer** stage of the multi-agent insights pipeline:

```text
Curator → Discovery → Research → Writer (+ Art) → Critic
                                    │
                                    └── ArtPipeline.generateAlbumArt()
```

### Integration Points

```typescript
// In WriterAgent or MusicAgent

import { ArtPipeline } from "./orchestration/ArtPipeline.js"

const enrichPlayWithArt = (play: KexpTrackPlay) =>
  Effect.gen(function* () {
    const pipeline = yield* ArtPipeline

    // Generate art based on play context
    const image = yield* pipeline.generateAlbumArt({
      artistName: play.artist ?? "Unknown",
      title: play.song ?? "Unknown",
      genre: play.genre,
      isLocal: play.is_local,
    }).pipe(
      Effect.catchAll((error) => {
        // Art generation is optional - log and continue
        return Effect.logWarning(`Art generation failed: ${error}`).pipe(
          Effect.as(undefined)
        )
      })
    )

    if (image) {
      // Save to local path or upload to storage
      yield* pipeline.saveToStorage(image, `plays/${play.id}/art.png`)
    }

    return { play, art: image }
  })
```

### Future: Art as Insight Type

```typescript
// New insight type for generated art
export class ArtInsight extends Schema.TaggedClass<ArtInsight>()("Art", {
  ...BaseInsightFields,
  imageUrl: Schema.String,
  style: ArtStyle,
  mood: ArtMood,
  prompt: Schema.String,
  generatedAt: Schema.String,
}) {}
```

---

## Layer Composition Summary

```typescript
// /packages/agent/src/layers.ts (additions)

import { ArtConfig } from "./services/ArtConfig.js"
import { ImageServiceLive } from "./services/ImageService.js"
import { AssetCacheFull, AssetCacheNoop } from "./services/AssetCache.js"
import { VisualPromptBuilderLive } from "./services/VisualPromptBuilder.js"
import { ArtPipelineLive } from "./orchestration/ArtPipeline.js"

// =============================================================================
// Art Pipeline Layers
// =============================================================================

/**
 * Art infrastructure (config + cache + prompts)
 */
export const ArtInfraLive = Layer.mergeAll(
  ArtConfig.Default,
  AssetCacheFull,
  VisualPromptBuilderLive
)

/**
 * Complete art pipeline with caching
 */
export const ArtPipelineWithCache = ArtPipelineLive.pipe(
  Layer.provide(ImageServiceLive),
  Layer.provide(ArtInfraLive)
)

/**
 * Art pipeline without caching (for testing)
 */
export const ArtPipelineNoCache = ArtPipelineLive.pipe(
  Layer.provide(ImageServiceLive),
  Layer.provide(Layer.mergeAll(
    ArtConfig.Default,
    AssetCacheNoop,
    VisualPromptBuilderLive
  ))
)

/**
 * Full agent with art capabilities
 */
export const MusicAgentWithArtLive = Layer.mergeAll(
  MusicAgentWithAnthropicLive,
  ArtPipelineWithCache
)
```

---

## Test Layers

```typescript
// Test layers for mocking

export const ImageServiceTest: Layer.Layer<ImageService> = Layer.succeed(
  ImageService,
  {
    generate: () =>
      Effect.succeed(
        new GeneratedImage({
          data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic bytes
          mimeType: "image/png",
          width: 512,
          height: 512,
          metadata: {
            provider: "test",
            model: "test",
            prompt: "test",
            generatedAt: new Date().toISOString(),
            durationMs: 100,
          },
        })
      ),
    generateFromText: () => /* same as above */,
    generateBatch: () => Stream.empty,
    resize: (image) => Effect.succeed(image),
    saveToFile: () => Effect.succeed("/tmp/test.png"),
    getProviderInfo: () => ({ provider: "test", model: "test" }),
  }
)
```

---

## Architecture Decisions

### Why this service boundary?

1. **ImageService** - Abstracts provider (Gemini today, DALL-E tomorrow)
2. **AssetCache** - Reusable caching layer, can be no-op for testing
3. **VisualPromptBuilder** - Type-safe prompt construction with domain knowledge
4. **ArtPipeline** - Orchestrates the above, provides domain-specific methods

### Why not one big service?

- Testability: Each service can be mocked independently
- Flexibility: Swap cache implementations, add new providers
- Separation of concerns: Prompt building vs generation vs caching

### Why Schema for prompts?

- Type safety at compile time
- Validation at runtime
- Self-documenting API
- Easy to extend with new prompt types

### Why Stream for batch?

- Backpressure handling
- Memory efficient for large batches
- Can be consumed incrementally
- Composable with other streams

---

## Next Steps for Implementation

1. **Phase 1**: Implement `ArtConfig` and `VisualPromptBuilder` (no external deps)
2. **Phase 2**: Implement `ImageService` with Gemini provider
3. **Phase 3**: Add `AssetCache` with TTL support
4. **Phase 4**: Build `ArtPipeline` orchestration
5. **Phase 5**: Integrate into `MusicAgent` as optional enhancement
6. **Phase 6**: Add `ArtInsight` type to insights schema
