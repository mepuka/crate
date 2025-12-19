/**
 * CharacterGenerationService
 *
 * Dedicated service for generating character variants (like Crate Cat)
 * styled to match album art aesthetics.
 *
 * KEY DIFFERENCE from AlbumArtEnhancementService:
 * - This is CREATION-first, not preservation-first
 * - Canonical character is PRIMARY (identity source)
 * - Album art is STYLE TARGET (not base to transform)
 *
 * Architecture:
 * - Effect Context.Tag pattern
 * - Loads character constraints from config.yaml
 * - Uses GoogleClient for Nano Banana Pro image generation
 * - Supports multi-turn refinement for coherence corrections
 *
 * @module
 */

import { Effect, Schema, Data, Layer, Context } from "effect";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as yaml from "yaml";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { CurationResult } from "./ArtCurationService.js";

// Helper to cast Effect types when working with @effect/ai-google
const asEffect = <A, E, R>(eff: unknown): Effect.Effect<A, E, R> =>
  eff as Effect.Effect<A, E, R>;

/**
 * Response type from Gemini image generation
 */
interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<
        | { text?: string }
        | { inlineData?: { mimeType?: string; data: string } }
      >;
    };
  }>;
}

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Character configuration loaded from config.yaml
 */
export const CharacterConfig = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  category: Schema.String,
  canonical: Schema.String,
  styleGuide: Schema.Struct({
    mustPreserve: Schema.Array(Schema.String),
    canAdapt: Schema.Array(Schema.String),
    neverChange: Schema.Array(Schema.String),
  }),
  visualConstraints: Schema.optional(
    Schema.Struct({
      critical: Schema.Array(Schema.String),
      flexible: Schema.Array(Schema.String),
      forbidden: Schema.Array(Schema.String),
    })
  ),
  measurements: Schema.optional(
    Schema.Struct({
      earTiltDegrees: Schema.optional(Schema.Array(Schema.Number)),
      bodyAspectRatio: Schema.optional(Schema.Array(Schema.Number)),
      eyePositionY: Schema.optional(Schema.Number),
      minRecognitionSize: Schema.optional(Schema.Number),
    })
  ),
  promptTemplate: Schema.optional(Schema.String),
});
export type CharacterConfig = typeof CharacterConfig.Type;

/**
 * Output resolution options
 */
export const Resolution = Schema.Literal("1K", "2K", "4K");
export type Resolution = typeof Resolution.Type;

/**
 * Character generation request
 */
export const CharacterGenerationRequest = Schema.Struct({
  /** Base64-encoded canonical character image (identity source) */
  canonicalRef: Schema.String,
  /** Base64-encoded inspiration images */
  inspirationRefs: Schema.optional(Schema.Array(Schema.String)),
  /** Base64-encoded target album art (style source) */
  targetAlbumArt: Schema.String,
  /** Curation result from ArtCurationService */
  curation: CurationResult,
  /** Character configuration from config.yaml */
  characterConfig: CharacterConfig,
  /** Output resolution */
  resolution: Schema.optional(Resolution),
  /** Optional pose/context hint */
  poseHint: Schema.optional(Schema.String),
  /** Optional additional style notes */
  styleNotes: Schema.optional(Schema.String),
});
export type CharacterGenerationRequest = typeof CharacterGenerationRequest.Type;

/**
 * Character generation response
 */
export const CharacterGenerationResponse = Schema.Struct({
  /** Base64-encoded generated character image */
  characterImageBase64: Schema.String,
  /** MIME type of output image */
  mimeType: Schema.String,
  /** Model-generated notes about the generation */
  notes: Schema.optional(Schema.String),
  /** Full API response for refinement */
  rawResponse: Schema.Unknown,
  /** Original request for refinement context */
  originalRequest: Schema.optional(Schema.Unknown),
});
export type CharacterGenerationResponse =
  typeof CharacterGenerationResponse.Type;

// =============================================================================
// Errors
// =============================================================================

export class CharacterGenerationError extends Data.TaggedError(
  "CharacterGenerationError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Service Interface
// =============================================================================

export interface CharacterGenerationServiceInterface {
  /**
   * Generate a character variant styled to match album art
   */
  readonly generate: (
    request: CharacterGenerationRequest
  ) => Effect.Effect<CharacterGenerationResponse, CharacterGenerationError>;

  /**
   * Refine a previously generated character (multi-turn correction)
   */
  readonly refine: (
    previousResponse: CharacterGenerationResponse,
    refinementPrompt: string
  ) => Effect.Effect<CharacterGenerationResponse, CharacterGenerationError>;

  /**
   * Load character configuration from a reference folder
   */
  readonly loadConfig: (
    referencePath: string
  ) => Effect.Effect<CharacterConfig, CharacterGenerationError>;
}

// =============================================================================
// Service Tag
// =============================================================================

export class CharacterGenerationService extends Context.Tag(
  "CharacterGenerationService"
)<CharacterGenerationService, CharacterGenerationServiceInterface>() {}

// =============================================================================
// Prompt Builders
// =============================================================================

/**
 * KEXP-aligned guardrails for character generation
 * Modified from AlbumArtEnhancementService to be creation-focused
 */
const CHARACTER_GUARDRAILS = `
CHARACTER GENERATION PRINCIPLES:
- You are CREATING a new illustration, not transforming an existing image
- The canonical reference defines character IDENTITY (what to preserve)
- The album art defines STYLE (how to render)
- The output is a standalone character illustration

KEXP CULTURAL ALIGNMENT:
- Warm, approachable, community-focused aesthetic
- Documentary feel over marketing polish
- Pacific Northwest vinyl den atmosphere
- Indie music culture (record stores, basement venues, college radio)
- Earnest and inclusive - music nerd, not gatekeeper

OUTPUT REQUIREMENTS:
- Square format, character as sole subject
- No album art integration (that's a separate compositing step)
- Character fully styled to match album's visual language
- Suitable for use as badge, sticker, or companion graphic
`;

/**
 * Build the character generation prompt
 */
const buildCharacterPrompt = (
  request: CharacterGenerationRequest
): string => {
  const { curation, characterConfig, poseHint, styleNotes } = request;
  const constraints = characterConfig.visualConstraints;
  const styleGuide = characterConfig.styleGuide;

  // Build critical constraints section
  const criticalConstraints = [
    ...(constraints?.critical || []),
    ...styleGuide.mustPreserve,
  ];

  // Build flexible adaptations section
  const flexibleAdaptations = [
    ...(constraints?.flexible || []),
    ...styleGuide.canAdapt,
  ];

  // Build forbidden section
  const forbiddenChanges = [
    ...(constraints?.forbidden || []),
    ...styleGuide.neverChange.map((x) => `Changing: ${x}`),
  ];

  return `
Generate a NEW illustration of ${characterConfig.name} in this album's visual style.

${CHARACTER_GUARDRAILS}

IMAGES PROVIDED:
- Image 1: CANONICAL ${characterConfig.name.toUpperCase()} (character identity - MUST preserve)
${request.inspirationRefs?.length ? `- Images 2-${1 + request.inspirationRefs.length}: Style inspirations (mood/context references)` : ""}
- Final Image: TARGET ALBUM ART (style source - render character in THIS style)

CHARACTER IDENTITY (from Image 1 - CRITICAL):
${criticalConstraints.map((c) => `• ${c}`).join("\n")}

STYLE TRANSFER FROM ALBUM ART:
• Description: ${curation.analysis.creativeDescription}
• Mood: ${curation.analysis.moodAtmosphere}
• Era/Aesthetic: ${curation.analysis.eraAesthetic}
• Visual Elements: ${curation.analysis.interestingElements.join(", ")}
• Color Palette: ${curation.palette.colors.join(", ")}
• Dominant Color: ${curation.palette.dominant}
• Temperature: ${curation.palette.temperature}

ADAPTATIONS ALLOWED:
${flexibleAdaptations.map((a) => `• ${a}`).join("\n")}

FORBIDDEN (never do these):
${forbiddenChanges.map((f) => `• ${f}`).join("\n")}

${poseHint ? `POSE/CONTEXT: ${poseHint}` : ""}
${styleNotes ? `ADDITIONAL STYLE NOTES: ${styleNotes}` : ""}

GENERATION TASK:
Create a standalone illustration of ${characterConfig.name} that looks like it was drawn
BY THE SAME ARTIST who created the album art. The character should feel native to
that album's visual universe while remaining instantly recognizable.

Think: "What if this album's artist was commissioned to draw the ${characterConfig.name} mascot?"

OUTPUT: Square illustration at ${request.resolution || "2K"} resolution.
`;
};

/**
 * Build refinement prompt for coherence corrections
 */
const buildRefinementPrompt = (
  originalRequest: CharacterGenerationRequest,
  refinementInstructions: string
): string => {
  return `
REFINEMENT REQUEST for ${originalRequest.characterConfig.name}

The previous generation needs corrections. Apply these specific fixes:

${refinementInstructions}

MAINTAIN:
- All aspects not mentioned in corrections
- Character identity from canonical reference
- Album art style alignment

Only fix the listed issues. Do not alter anything else.
`;
};

// =============================================================================
// Implementation
// =============================================================================

/**
 * Detect MIME type from base64 data
 */
const detectMimeType = (base64Data: string): string => {
  if (base64Data.startsWith("/9j/")) return "image/jpeg";
  if (base64Data.startsWith("iVBORw")) return "image/png";
  if (base64Data.startsWith("UklGR")) return "image/webp";
  if (base64Data.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
};

/**
 * Create the character generation service implementation
 */
const makeCharacterGenerationService = Effect.gen(function* () {
  const googleClient = yield* GoogleClientModule.GoogleClient;

  return {
    generate: (
      request: CharacterGenerationRequest
    ): Effect.Effect<CharacterGenerationResponse, CharacterGenerationError> =>
      Effect.gen(function* () {
        yield* Effect.logDebug(
          `Generating ${request.characterConfig.name} variant`
        );

        // Build the prompt
        const prompt = buildCharacterPrompt(request);

        // Build image parts array - canonical FIRST, album art LAST
        const imageParts: Array<{
          inlineData: { mimeType: string; data: string };
        }> = [];

        // Image 1: Canonical character (primary - identity source)
        imageParts.push({
          inlineData: {
            mimeType: detectMimeType(request.canonicalRef),
            data: request.canonicalRef,
          },
        });

        // Images 2-N: Inspirations (if provided)
        if (request.inspirationRefs) {
          for (const ref of request.inspirationRefs) {
            imageParts.push({
              inlineData: {
                mimeType: detectMimeType(ref),
                data: ref,
              },
            });
          }
        }

        // Final Image: Target album art (style source)
        imageParts.push({
          inlineData: {
            mimeType: detectMimeType(request.targetAlbumArt),
            data: request.targetAlbumArt,
          },
        });

        // Build request contents
        const contents = [
          {
            role: "user" as const,
            parts: [...imageParts, { text: prompt }],
          },
        ];

        // Call Gemini with image generation config
        const response = yield* asEffect<
          GeminiImageResponse,
          CharacterGenerationError,
          never
        >(
          googleClient.generateContent({
            model: "gemini-2.0-flash-exp", // Image generation model
            contents,
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          } as any)
        );

        // Extract generated image from response
        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          return yield* Effect.fail(
            new CharacterGenerationError({
              message: "No content in Gemini response",
            })
          );
        }

        // Find image part in response
        let characterImageBase64: string | null = null;
        let mimeType = "image/png";
        let notes: string | undefined;

        for (const part of candidate.content.parts) {
          if ("inlineData" in part && part.inlineData) {
            characterImageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || "image/png";
          }
          if ("text" in part && part.text) {
            notes = part.text;
          }
        }

        if (!characterImageBase64) {
          return yield* Effect.fail(
            new CharacterGenerationError({
              message: "No image generated in response",
            })
          );
        }

        yield* Effect.logDebug(
          `Generated ${request.characterConfig.name} variant successfully`
        );

        return {
          characterImageBase64,
          mimeType,
          notes,
          rawResponse: response,
          originalRequest: request,
        };
      }).pipe(
        Effect.withSpan("CharacterGenerationService.generate", {
          attributes: {
            characterId: request.characterConfig.id,
            resolution: request.resolution || "2K",
          },
        })
      ),

    refine: (
      previousResponse: CharacterGenerationResponse,
      refinementPrompt: string
    ): Effect.Effect<CharacterGenerationResponse, CharacterGenerationError> =>
      Effect.gen(function* () {
        const originalRequest =
          previousResponse.originalRequest as CharacterGenerationRequest;
        if (!originalRequest) {
          return yield* Effect.fail(
            new CharacterGenerationError({
              message: "Cannot refine: original request not preserved",
            })
          );
        }

        yield* Effect.logDebug(
          `Refining ${originalRequest.characterConfig.name} variant`
        );

        // Build refinement prompt
        const prompt = buildRefinementPrompt(originalRequest, refinementPrompt);

        // Build original image parts - same order as generate()
        const originalImageParts: Array<{
          inlineData: { mimeType: string; data: string };
        }> = [];

        // Image 1: Canonical character (primary - identity source)
        originalImageParts.push({
          inlineData: {
            mimeType: detectMimeType(originalRequest.canonicalRef),
            data: originalRequest.canonicalRef,
          },
        });

        // Images 2-N: Inspirations (if provided) - PRESERVE THESE FOR STYLE CONTEXT
        if (originalRequest.inspirationRefs) {
          for (const ref of originalRequest.inspirationRefs) {
            originalImageParts.push({
              inlineData: {
                mimeType: detectMimeType(ref),
                data: ref,
              },
            });
          }
        }

        // Final Image: Target album art (style source)
        originalImageParts.push({
          inlineData: {
            mimeType: detectMimeType(originalRequest.targetAlbumArt),
            data: originalRequest.targetAlbumArt,
          },
        });

        // Include the previous generation in context
        const contents = [
          // Original generation context with all images
          {
            role: "user" as const,
            parts: [
              ...originalImageParts,
              { text: buildCharacterPrompt(originalRequest) },
            ],
          },
          // Previous response
          {
            role: "model" as const,
            parts: [
              {
                inlineData: {
                  mimeType: previousResponse.mimeType,
                  data: previousResponse.characterImageBase64,
                },
              },
              ...(previousResponse.notes
                ? [{ text: previousResponse.notes }]
                : []),
            ],
          },
          // Refinement request
          {
            role: "user" as const,
            parts: [{ text: prompt }],
          },
        ];

        const response = yield* asEffect<
          GeminiImageResponse,
          CharacterGenerationError,
          never
        >(
          googleClient.generateContent({
            model: "gemini-2.0-flash-exp",
            contents,
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          } as any)
        );

        // Extract refined image
        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          return yield* Effect.fail(
            new CharacterGenerationError({
              message: "No content in refinement response",
            })
          );
        }

        let characterImageBase64: string | null = null;
        let mimeType = "image/png";
        let notes: string | undefined;

        for (const part of candidate.content.parts) {
          if ("inlineData" in part && part.inlineData) {
            characterImageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || "image/png";
          }
          if ("text" in part && part.text) {
            notes = part.text;
          }
        }

        if (!characterImageBase64) {
          return yield* Effect.fail(
            new CharacterGenerationError({
              message: "No refined image generated",
            })
          );
        }

        return {
          characterImageBase64,
          mimeType,
          notes,
          rawResponse: response,
          originalRequest,
        };
      }).pipe(
        Effect.withSpan("CharacterGenerationService.refine")
      ),

    loadConfig: (
      referencePath: string
    ): Effect.Effect<CharacterConfig, CharacterGenerationError> =>
      Effect.gen(function* () {
        const configPath = path.join(referencePath, "config.yaml");

        const configContent = yield* Effect.tryPromise({
          try: () => fs.readFile(configPath, "utf-8"),
          catch: (error) =>
            new CharacterGenerationError({
              message: `Failed to read config: ${configPath}`,
              cause: error,
            }),
        });

        const parsed = yaml.parse(configContent);

        const config = yield* Schema.decodeUnknown(CharacterConfig)(
          parsed
        ).pipe(
          Effect.mapError(
            (error) =>
              new CharacterGenerationError({
                message: `Invalid config schema: ${error}`,
                cause: error,
              })
          )
        );

        return config;
      }).pipe(
        Effect.withSpan("CharacterGenerationService.loadConfig", {
          attributes: { referencePath },
        })
      ),
  };
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for CharacterGenerationService
 *
 * Requires GoogleClient to be provided.
 */
export const CharacterGenerationServiceLive = Layer.effect(
  CharacterGenerationService,
  makeCharacterGenerationService
);

/**
 * Test layer with mock implementation
 */
export const CharacterGenerationServiceTest: Layer.Layer<CharacterGenerationService> =
  Layer.succeed(CharacterGenerationService, {
    generate: (_request) =>
      Effect.succeed({
        characterImageBase64: "bW9jay1jaGFyYWN0ZXI=", // "mock-character"
        mimeType: "image/png",
        notes: "Mock character generation",
        rawResponse: {},
        originalRequest: _request,
      }),
    refine: (prev, _prompt) =>
      Effect.succeed({
        ...prev,
        notes: "Mock refinement",
      }),
    loadConfig: (_path) =>
      Effect.succeed({
        id: "test-cat",
        name: "Test Cat",
        description: "A test character",
        category: "mascot",
        canonical: "canonical.jpg",
        styleGuide: {
          mustPreserve: ["ears", "tail"],
          canAdapt: ["color"],
          neverChange: ["face"],
        },
      }),
  });

// =============================================================================
// Convenience Accessors
// =============================================================================

/**
 * Generate a character variant (requires CharacterGenerationService in context)
 */
export const generate = (request: CharacterGenerationRequest) =>
  Effect.flatMap(CharacterGenerationService, (service) =>
    service.generate(request)
  );

/**
 * Refine a previous generation (requires CharacterGenerationService in context)
 */
export const refine = (
  previousResponse: CharacterGenerationResponse,
  refinementPrompt: string
) =>
  Effect.flatMap(CharacterGenerationService, (service) =>
    service.refine(previousResponse, refinementPrompt)
  );

/**
 * Load character config (requires CharacterGenerationService in context)
 */
export const loadConfig = (referencePath: string) =>
  Effect.flatMap(CharacterGenerationService, (service) =>
    service.loadConfig(referencePath)
  );
