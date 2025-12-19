/**
 * ArtCurationService
 *
 * Agent tool for creative analysis of album art.
 * The agent acts as a visual curator - finding interesting elements,
 * describing them creatively, but NEVER departing from the source's aesthetic.
 *
 * Key principle: The original art is SACRED. We enhance, never replace.
 *
 * Architecture:
 * - Uses generateObject with Effect Schema for structured output (no manual JSON parsing)
 * - Uses Prompt.FilePart for multimodal image input
 * - Consistent with other agents (MusicAgent, CriticAgent) in using proper structured output
 */

import { Effect, Context, Schema, Layer, Data, pipe } from "effect";
import { LanguageModel, Prompt } from "@effect/ai";
import { GoogleClient, GoogleLanguageModel } from "@effect/ai-google";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { GoogleAIConfig } from "../config.js";

// ============================================================================
// Schema Definitions
// ============================================================================

/** Input context for art analysis */
export const ArtContext = Schema.Struct({
  artistName: Schema.String,
  albumTitle: Schema.String,
  releaseYear: Schema.optional(Schema.Number),
  genres: Schema.optional(Schema.Array(Schema.String)),
  isLocal: Schema.optional(Schema.Boolean),
});
export type ArtContext = typeof ArtContext.Type;

/** Agent's creative analysis */
export const ArtAnalysis = Schema.Struct({
  creativeDescription: Schema.String.annotations({
    description: "Evocative description of the art's essence",
  }),
  interestingElements: Schema.Array(Schema.String).annotations({
    description: "Visual elements that caught your eye",
  }),
  moodAtmosphere: Schema.String.annotations({
    description: "Emotional feeling the art evokes",
  }),
  eraAesthetic: Schema.String.annotations({
    description: "Time period or style reference",
  }),
});
export type ArtAnalysis = typeof ArtAnalysis.Type;

/** Extracted color palette */
export const ColorPalette = Schema.Struct({
  dominant: Schema.String.annotations({
    description: "Dominant hex color (e.g., #8b4513)",
  }),
  colors: Schema.Array(Schema.String).annotations({
    description: "Array of hex colors from the palette",
  }),
  temperature: Schema.Literal("warm", "cool", "neutral").annotations({
    description: "Overall color temperature",
  }),
});
export type ColorPalette = typeof ColorPalette.Type;

/** Derived UI assets */
export const DerivedAssets = Schema.Struct({
  glowColor: Schema.String.annotations({
    description: "Hex color for ambient glow effect",
  }),
  gradientCss: Schema.String.annotations({
    description: "CSS gradient string (linear-gradient or radial-gradient)",
  }),
  textureRecommendation: Schema.Literal("grain", "noise", "paper", "none").annotations({
    description: "Recommended texture overlay type",
  }),
  reasoning: Schema.String.annotations({
    description: "Explanation of why these assets complement the art",
  }),
});
export type DerivedAssets = typeof DerivedAssets.Type;

/** Complete curation result */
export const CurationResult = Schema.Struct({
  analysis: ArtAnalysis,
  palette: ColorPalette,
  derivedAssets: DerivedAssets,
}).annotations({
  identifier: "CurationResult",
  description: "Complete visual curation result for album art",
});
export type CurationResult = typeof CurationResult.Type;

// ============================================================================
// Errors
// ============================================================================

export class ArtCurationError extends Data.TaggedError("ArtCurationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Service Interface
// ============================================================================

export interface ArtCurationServiceInterface {
  /**
   * Analyze album art and generate derived assets.
   * The agent creatively describes what's interesting while staying
   * strictly grounded in the source art's aesthetic.
   */
  readonly curate: (
    imageUrl: string,
    context?: ArtContext
  ) => Effect.Effect<CurationResult, ArtCurationError>;
}

export class ArtCurationService extends Context.Tag("ArtCurationService")<
  ArtCurationService,
  ArtCurationServiceInterface
>() {}

// ============================================================================
// System Prompt (no JSON formatting - handled by generateObject)
// ============================================================================

const CURATION_SYSTEM_PROMPT = `You are a visual curator analyzing album art for a music discovery app.

You work with what you can SEE in the image and any provided context (artist name, album title, year, genres). Your analysis is grounded in the actual visual elements - no speculation about things not visible.

Your role:
1. OBSERVE - What's visually interesting about this art?
2. DESCRIBE - Use creative language to capture its essence
3. EXTRACT - Identify colors, textures, mood that define it
4. CONTEXTUALIZE - Use provided metadata to inform interpretation
5. DERIVE - Suggest UI assets that complement (not compete)

CRITICAL CONSTRAINTS:
- You are GROUNDED in this specific artwork AND its cultural context
- Never suggest elements that contradict its aesthetic
- If it's warm and vintage, derived assets must be warm and vintage
- If it's cold and modern, derived assets must be cold and modern
- The original art is SACRED - you enhance, never replace

Think of yourself as a record store curator creating a display:
The album is the star. You're creating the mood lighting and backdrop
that makes it feel at home.

KEXP CULTURE:
- Embrace imperfection (grain, warmth, authenticity over polish)
- Even playing field - local artists get same visual respect as major acts
- Documentary aesthetic over marketing aesthetic
- Pacific Northwest vinyl den feeling
- Olympia DIY, K Records, SubPop 90s are touchstones`;

// ============================================================================
// Tool Definition (for use with @effect/ai)
// ============================================================================

export const analyzeAlbumArtTool = {
  name: "analyze_album_art" as const,
  description:
    "Analyze album art to extract visual style and generate derived UI assets. " +
    "Be creative in what you find interesting, but stay strictly within the art's existing aesthetic.",
  parameters: Schema.Struct({
    imageUrl: Schema.String.annotations({
      description: "URL of the album art to analyze",
    }),
    context: Schema.optional(
      Schema.Struct({
        artistName: Schema.String,
        albumTitle: Schema.String,
        releaseYear: Schema.optional(Schema.Number),
        genres: Schema.optional(Schema.Array(Schema.String)),
        isLocal: Schema.optional(Schema.Boolean),
      })
    ).annotations({
      description: "Optional context about the artist/album",
    }),
  }),
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Build the user prompt with context
 */
const buildUserPrompt = (context?: ArtContext): string => {
  const contextPrompt = context
    ? `\n\nContext about this release:
Artist: ${context.artistName}
Album: ${context.albumTitle}
${context.releaseYear ? `Year: ${context.releaseYear}` : ""}
${context.genres?.length ? `Genres: ${context.genres.join(", ")}` : ""}
${context.isLocal ? "This is a Pacific Northwest local artist." : ""}`
    : "";

  return `Analyze this album art and provide your creative curation.${contextPrompt}`;
};

/**
 * Maximum image size in bytes (10MB)
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Minimum image size in bytes (100 bytes - anything smaller is invalid)
 */
const MIN_IMAGE_SIZE = 100;

/**
 * Fetch image URL and convert to base64 with media type detection.
 * Validates HTTP status, content-type, and size limits.
 */
const fetchImageAsBase64 = (
  imageUrl: string
): Effect.Effect<
  { base64: string; mediaType: string },
  ArtCurationError,
  HttpClient.HttpClient
> =>
  pipe(
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const response = yield* client.get(imageUrl).pipe(
        Effect.mapError(
          (e) =>
            new ArtCurationError({
              reason: `Failed to fetch image: ${e}`,
              cause: e,
            })
        )
      );

      // Validate HTTP status (2xx)
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(
          new ArtCurationError({
            reason: `Image fetch failed with HTTP ${response.status}`,
          })
        );
      }

      // Validate content-type is an image
      const contentTypeHeader = response.headers["content-type"] ?? "";
      const contentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith("image/")) {
        return yield* Effect.fail(
          new ArtCurationError({
            reason: `Invalid content-type: expected image/*, got ${contentType}`,
          })
        );
      }

      // Check content-length if available (before downloading)
      const contentLengthHeader = response.headers["content-length"];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > MAX_IMAGE_SIZE) {
          return yield* Effect.fail(
            new ArtCurationError({
              reason: `Image too large: ${Math.round(contentLength / 1024 / 1024)}MB exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`,
            })
          );
        }
      }

      const arrayBuffer = yield* response.arrayBuffer.pipe(
        Effect.mapError(
          (e) =>
            new ArtCurationError({
              reason: `Failed to read image data: ${e}`,
              cause: e,
            })
        )
      );

      const buffer = Buffer.from(arrayBuffer);

      // Validate actual size
      if (buffer.length < MIN_IMAGE_SIZE) {
        return yield* Effect.fail(
          new ArtCurationError({
            reason: `Image too small: ${buffer.length} bytes (minimum ${MIN_IMAGE_SIZE})`,
          })
        );
      }

      if (buffer.length > MAX_IMAGE_SIZE) {
        return yield* Effect.fail(
          new ArtCurationError({
            reason: `Image too large: ${Math.round(buffer.length / 1024 / 1024)}MB exceeds ${MAX_IMAGE_SIZE / 1024 / 1024}MB limit`,
          })
        );
      }

      const base64 = buffer.toString("base64");

      // Detect media type from magic bytes (more reliable than header)
      const detectedType = detectMediaType(buffer);
      const mediaType = detectedType || contentType || "image/jpeg";

      // Final validation: ensure magic bytes indicate an image
      if (!isValidImageMagicBytes(buffer)) {
        return yield* Effect.fail(
          new ArtCurationError({
            reason: `Invalid image: magic bytes do not match known image formats`,
          })
        );
      }

      return { base64, mediaType };
    }),
    Effect.withSpan("ArtCurationService.fetchImage", {
      attributes: { imageUrl },
    })
  );

/**
 * Validate that buffer starts with known image magic bytes
 */
const isValidImageMagicBytes = (buffer: Buffer): boolean => {
  if (buffer.length < 4) return false;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // WebP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return true;
  }

  return false;
};

/**
 * Detect media type from buffer magic bytes
 */
const detectMediaType = (buffer: Buffer): string => {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    return "image/webp";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  return "image/jpeg"; // Default fallback
};

/**
 * Create Gemini-based art curation implementation using generateObject
 * for proper structured output (no manual JSON parsing).
 */
const makeGeminiCurator = Effect.gen(function* () {
  const model = yield* LanguageModel.LanguageModel;

  return {
    curate: (
      imageUrl: string,
      context?: ArtContext
    ): Effect.Effect<CurationResult, ArtCurationError, HttpClient.HttpClient> =>
      pipe(
        Effect.gen(function* () {
          yield* Effect.logDebug(`Curating album art: ${imageUrl}`);

          // Fetch image and convert to base64
          const { base64, mediaType } = yield* fetchImageAsBase64(imageUrl);
          yield* Effect.logDebug(
            `Fetched image: ${mediaType}, ${base64.length} bytes`
          );

          // Build prompt with inline image data using proper Prompt API
          const prompt = Prompt.make([
            {
              role: "system",
              content: CURATION_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "file",
                  mediaType: mediaType,
                  data: base64,
                },
                {
                  type: "text",
                  text: buildUserPrompt(context),
                },
              ],
            },
          ]);

          // Use generateObject for structured output - no manual JSON parsing!
          const response = yield* model.generateObject({
            prompt,
            schema: CurationResult,
            objectName: "curation_result",
          });

          yield* Effect.logDebug("Art curation complete");

          return response.value;
        }),
        Effect.mapError((error) =>
          error instanceof ArtCurationError
            ? error
            : new ArtCurationError({
                reason: `Gemini vision analysis failed: ${error}`,
                cause: error,
              })
        ),
        Effect.withSpan("ArtCurationService.curate", {
          attributes: { imageUrl },
        })
      ),
  };
});

// ============================================================================
// Layers
// ============================================================================

/**
 * ArtCurationService layer using Gemini vision with generateObject.
 *
 * Requires:
 * - LanguageModel.LanguageModel (from GoogleLanguageModel.layer)
 * - HttpClient.HttpClient (for fetching images)
 *
 * Usage:
 * ```ts
 * const program = curate(imageUrl, context).pipe(
 *   Effect.provide(ArtCurationServiceGemini),
 *   Effect.provide(GoogleLanguageModel.layer({ model: "gemini-2.0-flash" })),
 *   Effect.provide(GoogleClient.layer({ apiKey: ... })),
 *   Effect.provide(FetchHttpClient.layer)
 * )
 * ```
 */
export const ArtCurationServiceGemini: Layer.Layer<
  ArtCurationService,
  never,
  LanguageModel.LanguageModel | HttpClient.HttpClient
> = Layer.effect(
  ArtCurationService,
  Effect.map(makeGeminiCurator, (impl) => ({
    curate: (imageUrl: string, context?: ArtContext) =>
      impl.curate(imageUrl, context).pipe(
        // Provide HttpClient requirement internally
        Effect.provide(FetchHttpClient.layer)
      ),
  }))
);

/**
 * Fully-provided Gemini art curation layer.
 *
 * Requires GoogleAIConfig to be provided.
 *
 * Usage:
 * ```ts
 * const program = curate(imageUrl, context).pipe(
 *   Effect.provide(ArtCurationServiceGeminiWithConfig),
 *   Effect.provide(GoogleAIConfig.Default)
 * )
 * ```
 */
export const ArtCurationServiceGeminiWithConfig: Layer.Layer<
  ArtCurationService,
  never,
  GoogleAIConfig
> = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* GoogleAIConfig;

    // Build the layer stack: GoogleClient -> GoogleLanguageModel -> ArtCurationService
    const googleClientLayer = GoogleClient.layer({
      apiKey: config.apiKey,
    }).pipe(Layer.provide(FetchHttpClient.layer));

    const languageModelLayer = GoogleLanguageModel.layer({
      model: "gemini-2.0-flash",
    }).pipe(Layer.provide(googleClientLayer));

    return Layer.provide(ArtCurationServiceGemini, Layer.merge(languageModelLayer, FetchHttpClient.layer));
  })
);

// ============================================================================
// Convenience accessors
// ============================================================================

/**
 * Curate album art (requires ArtCurationService in context).
 */
export const curate = (imageUrl: string, context?: ArtContext) =>
  Effect.flatMap(ArtCurationService, (service) =>
    service.curate(imageUrl, context)
  );

// ============================================================================
// Test Layer
// ============================================================================

/**
 * Test layer that returns mock curation results.
 */
export const ArtCurationServiceTest: Layer.Layer<ArtCurationService> =
  Layer.succeed(ArtCurationService, {
    curate: (_imageUrl, _context) =>
      Effect.succeed({
        analysis: {
          creativeDescription:
            "A warm, nostalgic album cover with vintage photography vibes",
          interestingElements: [
            "Sepia tones",
            "Film grain texture",
            "Intimate framing",
          ],
          moodAtmosphere: "Cozy and reflective, like a Sunday morning",
          eraAesthetic: "1970s analog photography",
        },
        palette: {
          dominant: "#8b4513",
          colors: ["#d2691e", "#f5deb3", "#2f1810"],
          temperature: "warm" as const,
        },
        derivedAssets: {
          glowColor: "#8b4513",
          gradientCss:
            "radial-gradient(circle at center, #8b451340 0%, transparent 70%)",
          textureRecommendation: "grain" as const,
          reasoning:
            "Film grain and warm sepia glow complement the vintage aesthetic without competing with the original art",
        },
      }),
  });

// ============================================================================
// Legacy support (deprecated - use ArtCurationServiceGemini)
// ============================================================================

/**
 * @deprecated Use ArtCurationServiceGemini instead
 * Legacy factory for custom image analyzers
 */
export const makeArtCurationService = (
  analyzeImage: (
    imageUrl: string,
    prompt: string,
    systemPrompt: string
  ) => Effect.Effect<string, ArtCurationError>
): ArtCurationServiceInterface => ({
  curate: (imageUrl, context) =>
    Effect.gen(function* () {
      const prompt = buildUserPrompt(context);
      const responseText = yield* analyzeImage(
        imageUrl,
        prompt,
        CURATION_SYSTEM_PROMPT
      );

      // Parse JSON response (legacy path still needs this)
      const parsed = yield* Effect.try({
        try: () => JSON.parse(responseText),
        catch: (e) =>
          new ArtCurationError({
            reason: "Failed to parse AI response as JSON",
            cause: e,
          }),
      });

      const result = yield* Schema.decodeUnknown(CurationResult)(parsed).pipe(
        Effect.mapError(
          (e) =>
            new ArtCurationError({
              reason: "AI response did not match expected schema",
              cause: e,
            })
        )
      );

      return result;
    }),
});

/**
 * @deprecated Use ArtCurationServiceGemini instead
 */
export const ArtCurationServiceLive = (
  analyzeImage: (
    imageUrl: string,
    prompt: string,
    systemPrompt: string
  ) => Effect.Effect<string, ArtCurationError>
): Layer.Layer<ArtCurationService> =>
  Layer.succeed(ArtCurationService, makeArtCurationService(analyzeImage));
