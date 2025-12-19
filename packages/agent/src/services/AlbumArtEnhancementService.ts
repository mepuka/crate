/**
 * Album Art Enhancement Service
 *
 * Service for enhancing album art using Nano Banana Pro (gemini-3-pro-image-preview)
 * with KEXP-aligned cultural values and aesthetic constraints.
 *
 * Architecture:
 * - Uses Context.Tag pattern for proper service definition
 * - Requires GoogleClient to be provided via Layer
 * - Provides composable builder API for declarative style configuration
 *
 * @module
 */

import { Effect, Schema, Data, Layer, Context } from "effect";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";

// Type alias for GoogleClient service
type GoogleClientService = GoogleClientModule.Service;

// Helper to cast Effect types when working with @effect/ai-google
// This is needed due to exactOptionalPropertyTypes conflicts
const asEffect = <A, E, R>(eff: unknown): Effect.Effect<A, E, R> =>
  eff as Effect.Effect<A, E, R>;

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Enhancement style presets aligned with KEXP cultural values
 */
export const EnhancementStyle = Schema.Literal(
  "lo-fi-indie",
  "concert-poster",
  "vinyl-sleeve",
  "synth-pop-retro",
  "pnw-local",
  "minimal",
  "custom"
);
export type EnhancementStyle = typeof EnhancementStyle.Type;

/**
 * Output resolution options
 */
export const Resolution = Schema.Literal("1K", "2K", "4K");
export type Resolution = typeof Resolution.Type;

/**
 * Aspect ratio options
 */
export const AspectRatio = Schema.Literal("square", "portrait", "landscape");
export type AspectRatio = typeof AspectRatio.Type;

/**
 * Style configuration for composable API
 */
export interface StyleConfig {
  readonly grain?: number; // 0.0 - 1.0
  readonly warmth?: number; // 0.5 - 2.0, 1.0 = neutral
  readonly saturation?: number; // 0.5 - 2.0, 1.0 = neutral
  readonly contrast?: number; // 0.5 - 2.0, 1.0 = neutral
  readonly vintage?: boolean;
  readonly filmStock?: "kodak" | "fuji" | "ilford" | "polaroid";
}

/**
 * Text overlay configuration
 */
export interface TextOverlayConfig {
  readonly text: string;
  readonly typography: string;
  readonly placement: string;
}

/**
 * Enhancement request configuration
 */
export const EnhancementRequest = Schema.Struct({
  /** Base64-encoded album art to enhance */
  albumArtBase64: Schema.String,
  /** Enhancement style preset */
  style: EnhancementStyle,
  /** Optional custom prompt (used with style: "custom") */
  customPrompt: Schema.optional(Schema.String),
  /** Optional style reference images (base64) */
  styleReferences: Schema.optional(Schema.Array(Schema.String)),
  /** Output resolution */
  resolution: Schema.optional(Resolution),
  /** Output aspect ratio */
  aspectRatio: Schema.optional(AspectRatio),
  /** Optional text overlay (e.g., concert info) */
  textOverlay: Schema.optional(
    Schema.Struct({
      text: Schema.String,
      typography: Schema.String,
      placement: Schema.String,
    })
  ),
  /** Optional style configuration for fine-tuning */
  styleConfig: Schema.optional(
    Schema.Struct({
      grain: Schema.optional(Schema.Number),
      warmth: Schema.optional(Schema.Number),
      saturation: Schema.optional(Schema.Number),
      contrast: Schema.optional(Schema.Number),
      vintage: Schema.optional(Schema.Boolean),
      filmStock: Schema.optional(
        Schema.Literal("kodak", "fuji", "ilford", "polaroid")
      ),
    })
  ),
  /** Enable multi-turn refinement */
  enableRefinement: Schema.optional(Schema.Boolean),
});
export type EnhancementRequest = typeof EnhancementRequest.Type;

/**
 * Enhancement response
 */
export const EnhancementResponse = Schema.Struct({
  /** Base64-encoded enhanced image */
  enhancedImageBase64: Schema.String,
  /** MIME type of output image */
  mimeType: Schema.String,
  /** Model-generated description/explanation */
  description: Schema.optional(Schema.String),
  /** Full API response for conversational refinement */
  rawResponse: Schema.Unknown,
  /** Original request contents for full conversation history in refinement */
  originalContents: Schema.optional(Schema.Unknown),
});
export type EnhancementResponse = typeof EnhancementResponse.Type;

// =============================================================================
// Errors
// =============================================================================

export class AlbumArtEnhancementError extends Data.TaggedError(
  "AlbumArtEnhancementError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Album Art Enhancement Service interface
 *
 * All operations return Effects with Requirements = never.
 * Dependencies are resolved at construction time via Layer.
 */
export interface AlbumArtEnhancementServiceInterface {
  /**
   * Enhance album art with specified style and constraints
   */
  readonly enhance: (
    request: EnhancementRequest
  ) => Effect.Effect<EnhancementResponse, AlbumArtEnhancementError>;

  /**
   * Refine previously enhanced album art (conversational editing)
   */
  readonly refine: (
    previousResponse: EnhancementResponse,
    refinementPrompt: string
  ) => Effect.Effect<EnhancementResponse, AlbumArtEnhancementError>;
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * Album Art Enhancement Service - enhance album art with KEXP-aligned aesthetics
 */
export class AlbumArtEnhancementService extends Context.Tag(
  "AlbumArtEnhancementService"
)<AlbumArtEnhancementService, AlbumArtEnhancementServiceInterface>() {}

// =============================================================================
// Prompt Builders
// =============================================================================

/**
 * KEXP cultural guardrails (injected into all prompts)
 */
const KEXP_GUARDRAILS = `
PRESERVE:
- Artist identity and composition entirely
- Original creative intent and visual narrative

CONSTRAINTS:
- Avoid glossy, corporate, or major-label design language
- No marketing/advertising aesthetics
- Should feel like independent music culture (record stores, basement venues, college radio)
- Inclusive and earnest tone - music nerd, not gatekeeper

CULTURAL ALIGNMENT:
- KEXP values: discovery, community, Pacific Northwest roots, human curation
- Think SubPop 90s, KCRW tastemaker prose, BBC 6 Music artist-as-curator
`;

/**
 * Build style modifier prompt from StyleConfig
 */
const buildStyleModifiers = (config: StyleConfig | undefined): string => {
  if (!config) return "";

  const modifiers: string[] = [];

  if (config.grain !== undefined) {
    const grainLevel =
      config.grain < 0.3 ? "subtle" : config.grain < 0.7 ? "moderate" : "heavy";
    modifiers.push(`${grainLevel} film grain (${Math.round(config.grain * 100)}%)`);
  }

  if (config.warmth !== undefined) {
    if (config.warmth > 1.2) modifiers.push("warm color temperature");
    else if (config.warmth < 0.8) modifiers.push("cool color temperature");
  }

  if (config.saturation !== undefined) {
    if (config.saturation < 0.7) modifiers.push("desaturated/muted colors");
    else if (config.saturation > 1.3) modifiers.push("vibrant colors");
  }

  if (config.contrast !== undefined) {
    if (config.contrast > 1.3) modifiers.push("high contrast");
    else if (config.contrast < 0.7) modifiers.push("low contrast, soft");
  }

  if (config.vintage) modifiers.push("vintage/aged appearance");

  if (config.filmStock) {
    const stockDescriptions: Record<string, string> = {
      kodak: "Kodak Portra warm tones",
      fuji: "Fuji film subtle greens",
      ilford: "Ilford black and white aesthetic",
      polaroid: "Polaroid instant film look",
    };
    modifiers.push(stockDescriptions[config.filmStock]);
  }

  return modifiers.length > 0
    ? `\n\nSTYLE ADJUSTMENTS:\n- ${modifiers.join("\n- ")}`
    : "";
};

/**
 * Build prompt for lo-fi indie aesthetic
 */
const buildLoFiIndiePrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, apply a warm lo-fi indie aesthetic with subtle film grain
and muted warm colors. Preserve the artist's identity and composition entirely.

STYLE:
- Vintage analog photography, as if shot on 35mm film
- Dimly lit Seattle basement venue aesthetic
- SubPop 90s aesthetic - authentic, not polished
- Warm sepia/earth tones with gentle color grading
- Subtle film grain texture overlay
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${resolution} ${aspectRatio}.
`;

/**
 * Build prompt for concert poster transformation
 */
const buildConcertPosterPrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "portrait",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, transform it into a concert poster for a small Seattle venue.
Preserve the original artwork as the central element.

STYLE:
- Screen-printed punk/indie poster aesthetic
- Muted earth tones with one bright accent color
- Subtle texture overlays (paper, screen-print)
- DIY show poster aesthetic, not commercial advertising
- Hand-stamped, community venue vibe
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt for vinyl record sleeve enhancement
 */
const buildVinylSleevePrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, enhance it to evoke the tactile quality of a vinyl record sleeve.
Preserve all original elements and composition.

STYLE:
- Subtle paper texture overlay
- Gentle wear marks (authentic analog aging)
- Warm analog color grading (mid-century album design)
- Intimate and analog, as if held in your hands at a record store listening station
- Tactile, physical music culture aesthetic
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt for synth-pop / retro-futuristic enhancement
 */
const buildSynthPopRetroPrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, apply a retro-futuristic synth-pop aesthetic with soft neon
accents (cyan and magenta palette). Preserve artist identity and core composition.

STYLE:
- Subtle geometric patterns or grid overlays (80s computer graphics inspiration)
- Cyan/magenta neon accents, not oversaturated
- Kraftwerk meets Boards of Canada - nostalgic, not flashy
- Retro-futuristic, analog warmth despite electronic aesthetic
- Independent record store reissue vibe, not major label
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt for Pacific Northwest local artist enhancement
 */
const buildPNWLocalPrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, enhance with Pacific Northwest visual identity.
Preserve all original artwork.

STYLE:
- Muted greens, misty grays, forest textures
- Subtle natural elements (rain, trees, fog) as background texture only
- Organic, place-based, intimate
- Celebrating Seattle's indie music scene
- Geographic anchoring - sense of place (PNW)
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt for minimal enhancement (color/texture only)
 */
const buildMinimalPrompt = (
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art, apply minimal enhancement only.
Preserve all original elements entirely.

ENHANCEMENT:
- Warm analog color grading (subtle sepia tones)
- Gentle texture overlay (film grain or paper texture)
- Subtle enhancement only, maintaining artist's creative vision completely
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt for style transfer from reference images
 */
const buildStyleTransferPrompt = (
  styleReferenceCount: number,
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square",
  styleConfig?: StyleConfig
): string => `
Using the provided album art (Image 1) and ${styleReferenceCount} style reference image(s),
apply the texture, color palette, and artistic treatment from the reference image(s) to Image 1.

CRITICAL:
- Preserve the identity, composition, and subject matter of Image 1 (album art) entirely
- Only transfer the aesthetic treatment (color palette, texture, artistic medium)
- Style transfer should feel like re-photographing the album art in a different medium

STYLE TRANSFER GUIDANCE:
- Analyze reference image(s) for: color palette, texture treatment, artistic medium
- Apply these elements to album art while maintaining all original composition
- Result should honor both the album art's identity AND the reference aesthetic
${buildStyleModifiers(styleConfig)}
${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Build prompt with text overlay (concert info, etc.)
 */
const buildTextOverlayPrompt = (
  text: string,
  typography: string,
  placement: string,
  resolution: Resolution = "2K",
  aspectRatio: AspectRatio = "square"
): string => `
Using the provided album art, add text overlay with the following information:
"${text}"

TEXT SPECIFICATIONS:
- Typography: ${typography}
- Placement: ${placement}
- Color: Choose for readability against album art background
- Style: DIY show poster aesthetic, not professional/commercial graphic design
- Text should feel like hand-stamped addition, authentic indie culture

PRESERVE:
- All original album art composition
- Artist identity and visual narrative

${KEXP_GUARDRAILS}

Output: ${aspectRatio} ${resolution}.
`;

/**
 * Style-specific aspect ratio defaults
 *
 * Each style has an optimal aspect ratio per design docs:
 * - concert-poster: portrait (tall posters)
 * - vinyl-sleeve, lo-fi-indie, synth-pop-retro, pnw-local, minimal: square (album art)
 */
const STYLE_ASPECT_RATIO_DEFAULTS: Record<EnhancementStyle, AspectRatio> = {
  "concert-poster": "portrait",
  "vinyl-sleeve": "square",
  "lo-fi-indie": "square",
  "synth-pop-retro": "square",
  "pnw-local": "square",
  "minimal": "square",
  "custom": "square",
};

/**
 * Select prompt builder based on enhancement style
 *
 * Returns Effect to properly handle validation errors instead of sync throwing.
 */
const selectPromptBuilder = (
  request: EnhancementRequest
): Effect.Effect<string, AlbumArtEnhancementError> => {
  const resolution = request.resolution ?? "2K";
  // Use style-specific default when aspectRatio not explicitly provided
  const aspectRatio = request.aspectRatio ?? STYLE_ASPECT_RATIO_DEFAULTS[request.style] ?? "square";
  const styleConfig = request.styleConfig as StyleConfig | undefined;

  // Handle text overlay first if present
  if (request.textOverlay) {
    return Effect.succeed(
      buildTextOverlayPrompt(
        request.textOverlay.text,
        request.textOverlay.typography,
        request.textOverlay.placement,
        resolution,
        aspectRatio
      )
    );
  }

  // Handle style references (style transfer)
  if (request.styleReferences && request.styleReferences.length > 0) {
    return Effect.succeed(
      buildStyleTransferPrompt(
        request.styleReferences.length,
        resolution,
        aspectRatio,
        styleConfig
      )
    );
  }

  switch (request.style) {
    case "lo-fi-indie":
      return Effect.succeed(buildLoFiIndiePrompt(resolution, aspectRatio, styleConfig));

    case "concert-poster":
      return Effect.succeed(buildConcertPosterPrompt(resolution, aspectRatio, styleConfig));

    case "vinyl-sleeve":
      return Effect.succeed(buildVinylSleevePrompt(resolution, aspectRatio, styleConfig));

    case "synth-pop-retro":
      return Effect.succeed(buildSynthPopRetroPrompt(resolution, aspectRatio, styleConfig));

    case "pnw-local":
      return Effect.succeed(buildPNWLocalPrompt(resolution, aspectRatio, styleConfig));

    case "minimal":
      return Effect.succeed(buildMinimalPrompt(resolution, aspectRatio, styleConfig));

    case "custom":
      if (!request.customPrompt) {
        return Effect.fail(
          new AlbumArtEnhancementError({
            message: "Custom style requires customPrompt field to be provided",
          })
        );
      }
      // Inject guardrails into custom prompt
      return Effect.succeed(
        `${request.customPrompt}${buildStyleModifiers(styleConfig)}\n\n${KEXP_GUARDRAILS}\n\nOutput: ${aspectRatio} ${resolution}.`
      );

    default:
      return Effect.fail(
        new AlbumArtEnhancementError({
          message: `Unknown enhancement style: ${request.style}`,
        })
      );
  }
};

// =============================================================================
// Service Implementation
// =============================================================================

const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

/**
 * Response structure from Gemini API for image generation
 */
interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { data: string; mimeType: string };
      }>;
    };
  }>;
}

/**
 * Extracted image result type
 */
interface ExtractedImage {
  readonly enhancedImageBase64: string;
  readonly mimeType: string;
  readonly description: string | undefined;
}

/**
 * Extract image and description from Gemini response
 */
const extractImageFromResponse = (
  response: GeminiImageResponse
): ExtractedImage | null => {
  let enhancedImageBase64: string | undefined;
  let mimeType: string | undefined;
  let description: string | undefined;

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        description = part.text;
      }
      if (part.inlineData) {
        enhancedImageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
      }
    }
  }

  if (!enhancedImageBase64 || !mimeType) {
    return null;
  }

  return { enhancedImageBase64, mimeType, description };
};

/**
 * Detect MIME type from base64-encoded image data using magic bytes
 *
 * Supports: JPEG, PNG, WebP, GIF
 * Falls back to image/jpeg for unknown formats (most common for album art)
 */
const detectMimeType = (base64Data: string): string => {
  // Check the first few characters of base64 which correspond to magic bytes
  // JPEG: starts with /9j/ (base64 of 0xFF 0xD8 0xFF)
  if (base64Data.startsWith("/9j/")) {
    return "image/jpeg";
  }
  // PNG: starts with iVBORw (base64 of 0x89 0x50 0x4E 0x47 0x0D 0x0A)
  if (base64Data.startsWith("iVBORw")) {
    return "image/png";
  }
  // WebP: starts with UklGR (base64 of RIFF header)
  if (base64Data.startsWith("UklGR")) {
    return "image/webp";
  }
  // GIF: starts with R0lGOD (base64 of GIF87a or GIF89a)
  if (base64Data.startsWith("R0lGOD")) {
    return "image/gif";
  }
  // Default to JPEG (most common for album art)
  return "image/jpeg";
};

/**
 * Content message type for Gemini API
 */
interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }>;
}

/**
 * Build Gemini request result type
 */
interface EnhanceRequestResult {
  geminiRequest: {
    model: string;
    contents: GeminiContent[];
    generationConfig: { responseModalities: string[] };
  };
  originalContents: GeminiContent[];
}

/**
 * Build Gemini request for image enhancement
 *
 * Returns both the full request and the contents array separately
 * so contents can be stored for multi-turn refinement.
 */
const buildEnhanceRequest = (
  request: EnhancementRequest
): Effect.Effect<EnhanceRequestResult, AlbumArtEnhancementError> =>
  Effect.gen(function* () {
    const prompt = yield* selectPromptBuilder(request);

    // Build parts array (album art + optional style references + text prompt)
    // Auto-detect MIME type from base64 magic bytes for each image
    const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
      {
        inlineData: {
          mimeType: detectMimeType(request.albumArtBase64),
          data: request.albumArtBase64,
        },
      },
    ];

    // Add style reference images if provided
    if (request.styleReferences && request.styleReferences.length > 0) {
      for (const styleRefBase64 of request.styleReferences) {
        parts.push({
          inlineData: {
            mimeType: detectMimeType(styleRefBase64),
            data: styleRefBase64,
          },
        });
      }
    }

    // Add text prompt
    parts.push({ text: prompt });

    const contents: GeminiContent[] = [
      {
        role: "user" as const,
        parts,
      },
    ];

    return {
      geminiRequest: {
        model: NANO_BANANA_PRO_MODEL,
        contents,
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      },
      originalContents: contents,
    };
  });

/**
 * Build Gemini request for image refinement
 *
 * Per NANO_BANANA_PRO_PROMPTING_GUIDE.md, conversational editing must include
 * the FULL conversation history to maintain context, guardrails, and style direction.
 *
 * Conversation structure:
 * 1. Original user request (image + prompt with guardrails)
 * 2. Model's response (generated image + description)
 * 3. New refinement request
 */
const buildRefineRequest = (
  previousResponse: EnhancementResponse,
  refinementPrompt: string
): {
  geminiRequest: {
    model: string;
    contents: unknown[];
    generationConfig: { responseModalities: string[] };
  };
  conversationHistory: unknown[];
} => {
  const rawResponse = previousResponse.rawResponse as {
    candidates?: Array<{ content?: unknown }>;
  };
  const originalContents = previousResponse.originalContents as GeminiContent[] | undefined;

  // Build full conversation history
  const conversationHistory: unknown[] = [];

  // 1. Original user request (contains image, prompt with guardrails, style direction)
  if (originalContents && originalContents.length > 0) {
    conversationHistory.push(...originalContents);
  }

  // 2. Model's previous response
  if (rawResponse.candidates?.[0]?.content) {
    conversationHistory.push(rawResponse.candidates[0].content);
  }

  // 3. New refinement request (with reminder of preservation constraints)
  conversationHistory.push({
    role: "user" as const,
    parts: [{
      text: `${refinementPrompt}

REMINDER: Preserve the artist's identity and original composition. Apply this refinement while maintaining all previously established constraints and KEXP cultural alignment.`
    }],
  });

  return {
    geminiRequest: {
      model: NANO_BANANA_PRO_MODEL,
      contents: conversationHistory,
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
    conversationHistory,
  };
};

/**
 * Create enhance function with given GoogleClient
 */
const createEnhanceFunction = (googleClient: GoogleClientService) =>
  (request: EnhancementRequest): Effect.Effect<EnhancementResponse, AlbumArtEnhancementError> =>
    Effect.gen(function* () {
      const { geminiRequest, originalContents } = yield* buildEnhanceRequest(request);

      // Call Gemini API - use asEffect helper to work around type inference issues
      const response = yield* asEffect<GeminiImageResponse, AlbumArtEnhancementError, never>(
        googleClient.generateContent(geminiRequest as any)
      );

      const extracted = extractImageFromResponse(response);
      if (!extracted) {
        return yield* Effect.fail(
          new AlbumArtEnhancementError({
            message: "No enhanced image returned from Gemini API",
          })
        );
      }

      return {
        enhancedImageBase64: extracted.enhancedImageBase64,
        mimeType: extracted.mimeType,
        description: extracted.description,
        rawResponse: response as unknown,
        // Store original contents for multi-turn refinement
        originalContents: originalContents as unknown,
      };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          error instanceof AlbumArtEnhancementError
            ? error
            : new AlbumArtEnhancementError({
                message: "Failed to generate enhanced album art",
                cause: error,
              })
        )
      )
    );

/**
 * Create refine function with given GoogleClient
 *
 * Maintains full conversation history across refinement turns to preserve
 * original guardrails, style direction, and KEXP cultural alignment.
 */
const createRefineFunction = (googleClient: GoogleClientService) =>
  (
    previousResponse: EnhancementResponse,
    refinementPrompt: string
  ): Effect.Effect<EnhancementResponse, AlbumArtEnhancementError> =>
    Effect.gen(function* () {
      const { geminiRequest } = buildRefineRequest(previousResponse, refinementPrompt);

      // Call Gemini API - use asEffect helper to work around type inference issues
      const response = yield* asEffect<GeminiImageResponse, AlbumArtEnhancementError, never>(
        googleClient.generateContent(geminiRequest as any)
      );

      const extracted = extractImageFromResponse(response);
      if (!extracted) {
        return yield* Effect.fail(
          new AlbumArtEnhancementError({
            message: "No refined image returned from Gemini API",
          })
        );
      }

      // Return with preserved originalContents for further refinements
      // The originalContents stays the same (original user request with guardrails)
      // but conversationHistory grows with each turn
      return {
        enhancedImageBase64: extracted.enhancedImageBase64,
        mimeType: extracted.mimeType,
        description: extracted.description,
        rawResponse: response as unknown,
        // Preserve original contents from the first request
        originalContents: previousResponse.originalContents,
      };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          error instanceof AlbumArtEnhancementError
            ? error
            : new AlbumArtEnhancementError({
                message: "Failed to refine album art",
                cause: error,
              })
        )
      )
    );

/**
 * Create the service implementation given a GoogleClient
 */
const makeServiceImpl = (
  googleClient: GoogleClientService
): AlbumArtEnhancementServiceInterface => ({
  enhance: createEnhanceFunction(googleClient),
  refine: createRefineFunction(googleClient),
});

/**
 * Create the AlbumArtEnhancementService implementation
 *
 * Uses Effect.andThen to access GoogleClient from context.
 * Type assertion used to work around TypeScript/Effect type inference
 * issues with exactOptionalPropertyTypes.
 */
const makeAlbumArtEnhancementService: Effect.Effect<
  AlbumArtEnhancementServiceInterface,
  never,
  GoogleClientModule.GoogleClient
> = asEffect(
  Effect.andThen(
    asEffect<GoogleClientService, never, GoogleClientModule.GoogleClient>(
      GoogleClientModule.GoogleClient
    ),
    (googleClient) => makeServiceImpl(googleClient)
  )
);

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for AlbumArtEnhancementService
 *
 * Requires GoogleClient to be provided.
 *
 * Usage with explicit GoogleClient layer:
 * ```ts
 * import { GoogleClient, layer as googleClientLayer } from "@effect/ai-google/GoogleClient";
 * import { FetchHttpClient } from "@effect/platform";
 *
 * const GoogleClientLive = Layer.provide(
 *   googleClientLayer({ apiKey: Redacted.make(apiKey) }),
 *   FetchHttpClient.layer
 * );
 *
 * const ServiceLive = Layer.provide(
 *   AlbumArtEnhancementServiceLive,
 *   GoogleClientLive
 * );
 * ```
 */
export const AlbumArtEnhancementServiceLive = Layer.effect(
  AlbumArtEnhancementService,
  makeAlbumArtEnhancementService
);

/**
 * Test layer with mock implementation
 *
 * Returns mock responses without calling the real API.
 * Useful for unit tests and development without API credentials.
 */
export const AlbumArtEnhancementServiceTest: Layer.Layer<AlbumArtEnhancementService> =
  Layer.succeed(AlbumArtEnhancementService, {
    enhance: (_request) =>
      Effect.succeed({
        enhancedImageBase64: "bW9jay1lbmhhbmNlZC1pbWFnZQ==", // "mock-enhanced-image" in base64
        mimeType: "image/png",
        description: "Mock enhanced image for testing",
        rawResponse: { candidates: [] },
        originalContents: [{ role: "user", parts: [{ text: "mock prompt" }] }],
      }),
    refine: (previousResponse, _refinementPrompt) =>
      Effect.succeed({
        enhancedImageBase64: "bW9jay1yZWZpbmVkLWltYWdl", // "mock-refined-image" in base64
        mimeType: "image/png",
        description: "Mock refined image for testing",
        rawResponse: { candidates: [] },
        // Preserve original contents from previous response
        originalContents: previousResponse.originalContents,
      }),
  } satisfies AlbumArtEnhancementServiceInterface);

/**
 * Create a test layer with custom mock behavior
 */
export const makeAlbumArtEnhancementServiceTest = (
  mockEnhance: (
    request: EnhancementRequest
  ) => Effect.Effect<EnhancementResponse, AlbumArtEnhancementError>,
  mockRefine: (
    previousResponse: EnhancementResponse,
    refinementPrompt: string
  ) => Effect.Effect<EnhancementResponse, AlbumArtEnhancementError>
): Layer.Layer<AlbumArtEnhancementService> =>
  Layer.succeed(AlbumArtEnhancementService, {
    enhance: mockEnhance,
    refine: mockRefine,
  } satisfies AlbumArtEnhancementServiceInterface);

// =============================================================================
// Composable Builder API
// =============================================================================

/**
 * Art Enhancement Builder for declarative, composable style configuration
 *
 * Provides a fluent API for building enhancement requests:
 *
 * @example
 * ```ts
 * const result = yield* ArtEnhancement
 *   .from(albumArtBase64)
 *   .style("lo-fi-indie")
 *   .withGrain(0.08)
 *   .warmth(1.2)
 *   .build();
 * ```
 */
export class ArtEnhancement {
  private readonly albumArtBase64: string;
  private readonly config: Partial<EnhancementRequest>;

  private constructor(
    albumArtBase64: string,
    config: Partial<EnhancementRequest> = {}
  ) {
    this.albumArtBase64 = albumArtBase64;
    this.config = config;
  }

  /**
   * Create a new enhancement from album art base64 data
   */
  static from(albumArtBase64: string): ArtEnhancement {
    return new ArtEnhancement(albumArtBase64, {});
  }

  /**
   * Set the enhancement style preset
   */
  style(style: EnhancementStyle): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      style,
    });
  }

  /**
   * Set custom prompt (for style: "custom")
   */
  customPrompt(prompt: string): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      style: "custom",
      customPrompt: prompt,
    });
  }

  /**
   * Add style reference images for style transfer
   */
  styleReferences(references: string[]): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleReferences: references,
    });
  }

  /**
   * Set output resolution
   */
  resolution(resolution: Resolution): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      resolution,
    });
  }

  /**
   * Set aspect ratio
   */
  aspectRatio(aspectRatio: AspectRatio): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      aspectRatio,
    });
  }

  /**
   * Add text overlay
   */
  overlay(text: string, typography: string, placement: string): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      textOverlay: { text, typography, placement },
    });
  }

  /**
   * Set film grain amount (0.0 - 1.0)
   */
  withGrain(amount: number): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        grain: Math.max(0, Math.min(1, amount)),
      },
    });
  }

  /**
   * Set color warmth (0.5 - 2.0, 1.0 = neutral)
   */
  warmth(level: number): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        warmth: Math.max(0.5, Math.min(2, level)),
      },
    });
  }

  /**
   * Set saturation level (0.5 - 2.0, 1.0 = neutral)
   */
  saturation(level: number): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        saturation: Math.max(0.5, Math.min(2, level)),
      },
    });
  }

  /**
   * Set contrast level (0.5 - 2.0, 1.0 = neutral)
   */
  contrast(level: number): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        contrast: Math.max(0.5, Math.min(2, level)),
      },
    });
  }

  /**
   * Enable vintage/aged appearance
   */
  vintage(enabled: boolean = true): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        vintage: enabled,
      },
    });
  }

  /**
   * Set film stock emulation
   */
  filmStock(stock: "kodak" | "fuji" | "ilford" | "polaroid"): ArtEnhancement {
    return new ArtEnhancement(this.albumArtBase64, {
      ...this.config,
      styleConfig: {
        ...this.config.styleConfig,
        filmStock: stock,
      },
    });
  }

  /**
   * Build the enhancement request and execute it
   *
   * Returns an Effect that requires AlbumArtEnhancementService.
   */
  build(): Effect.Effect<
    EnhancementResponse,
    AlbumArtEnhancementError,
    AlbumArtEnhancementService
  > {
    const request: EnhancementRequest = {
      albumArtBase64: this.albumArtBase64,
      style: this.config.style ?? "minimal",
      customPrompt: this.config.customPrompt,
      styleReferences: this.config.styleReferences,
      resolution: this.config.resolution,
      aspectRatio: this.config.aspectRatio,
      textOverlay: this.config.textOverlay,
      styleConfig: this.config.styleConfig,
    };

    return Effect.flatMap(AlbumArtEnhancementService, (service) =>
      service.enhance(request)
    );
  }

  /**
   * Get the request configuration without executing
   *
   * Useful for inspection or serialization.
   */
  toRequest(): EnhancementRequest {
    return {
      albumArtBase64: this.albumArtBase64,
      style: this.config.style ?? "minimal",
      customPrompt: this.config.customPrompt,
      styleReferences: this.config.styleReferences,
      resolution: this.config.resolution,
      aspectRatio: this.config.aspectRatio,
      textOverlay: this.config.textOverlay,
      styleConfig: this.config.styleConfig,
    };
  }
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Enhance album art with specified style
 *
 * Convenience function that accesses AlbumArtEnhancementService from context.
 *
 * @example
 * ```ts
 * const result = yield* enhance({
 *   albumArtBase64: imageData,
 *   style: "lo-fi-indie",
 *   resolution: "2K",
 * });
 * ```
 */
export const enhance = (
  request: EnhancementRequest
): Effect.Effect<
  EnhancementResponse,
  AlbumArtEnhancementError,
  AlbumArtEnhancementService
> =>
  Effect.flatMap(AlbumArtEnhancementService, (service) =>
    service.enhance(request)
  );

/**
 * Refine previously enhanced album art (conversational editing)
 *
 * Convenience function that accesses AlbumArtEnhancementService from context.
 *
 * @example
 * ```ts
 * const refined = yield* refine(
 *   previousResult,
 *   "Make the colors warmer and add more grain"
 * );
 * ```
 */
export const refine = (
  previousResponse: EnhancementResponse,
  refinementPrompt: string
): Effect.Effect<
  EnhancementResponse,
  AlbumArtEnhancementError,
  AlbumArtEnhancementService
> =>
  Effect.flatMap(AlbumArtEnhancementService, (service) =>
    service.refine(previousResponse, refinementPrompt)
  );
