/**
 * LinerNoteGenerationService
 *
 * Generates era-aware visual liner notes from album art using Nano Banana Pro.
 * Incorporates graph data (collaborators, labels) for rich contextual details.
 *
 * Architecture:
 * - Effect service with Context.Tag pattern
 * - Integrates with MusicGraphService for relationship data
 * - Uses era visual system for period-appropriate weathering
 * - Persists to GeneratedAsset store
 *
 * @module
 */

import { Effect, Schema, Data, Layer, Context, Option, pipe } from "effect";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";

// Type alias for GoogleClient service
type GoogleClientService = GoogleClientModule.Service;

// Helper to cast Effect types when working with @effect/ai-google
const asEffect = <A, E, R>(eff: unknown): Effect.Effect<A, E, R> =>
  eff as Effect.Effect<A, E, R>;

// Nano Banana Pro model
const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

// =============================================================================
// Era Visual System (copied from web package for now)
// =============================================================================

type Era = "pre-vinyl" | "golden-age" | "classic-rock" | "new-wave" | "grunge" | "digital" | "streaming" | "contemporary";

interface EraProfile {
  era: Era;
  displayName: string;
  weathering: {
    wear: number;
    fade: number;
    grain: number;
    yellowing: number;
  };
  typography: string;
  texture: string;
  guidance: string[];
}

const ERA_PROFILES: Record<Era, EraProfile> = {
  "pre-vinyl": {
    era: "pre-vinyl",
    displayName: "Pre-Vinyl Era",
    weathering: { wear: 0.9, fade: 0.85, grain: 0.8, yellowing: 0.9 },
    typography: "Art deco serif, hand-lettered",
    texture: "Heavy foxing, water stains, sepia tone",
    guidance: ["Sepia-toned", "Art deco typography", "Paper degradation"]
  },
  "golden-age": {
    era: "golden-age",
    displayName: "Golden Age (50s-60s)",
    weathering: { wear: 0.7, fade: 0.6, grain: 0.6, yellowing: 0.7 },
    typography: "Mid-century sans, Blue Note/Verve influence",
    texture: "Ring wear, split seams, shop stamps",
    guidance: ["Mid-century modern", "Reid Miles style", "Vinyl ring wear"]
  },
  "classic-rock": {
    era: "classic-rock",
    displayName: "Classic Rock (70s)",
    weathering: { wear: 0.5, fade: 0.4, grain: 0.5, yellowing: 0.5 },
    typography: "Psychedelic display, cosmic imagery",
    texture: "Gatefold creases, textured cardboard",
    guidance: ["Gatefold aesthetic", "Hipgnosis influence", "Analog warmth"]
  },
  "new-wave": {
    era: "new-wave",
    displayName: "New Wave (80s)",
    weathering: { wear: 0.35, fade: 0.3, grain: 0.3, yellowing: 0.3 },
    typography: "Geometric sans, Peter Saville influence",
    texture: "Glossy paper showing age",
    guidance: ["Factory Records", "Bold color blocks", "Clean typography"]
  },
  "grunge": {
    era: "grunge",
    displayName: "Grunge Era (90s)",
    weathering: { wear: 0.25, fade: 0.2, grain: 0.6, yellowing: 0.2 },
    typography: "Distressed sans, typewriter, DIY",
    texture: "Photocopied grain, zine aesthetic",
    guidance: ["DIY zine", "High contrast", "Sub Pop visual language"]
  },
  "digital": {
    era: "digital",
    displayName: "Early Digital (00s)",
    weathering: { wear: 0.15, fade: 0.1, grain: 0.15, yellowing: 0.1 },
    typography: "Clean sans, Helvetica Neue",
    texture: "Clean print with light aging",
    guidance: ["Digital precision", "Transitional era", "Light wear"]
  },
  "streaming": {
    era: "streaming",
    displayName: "Streaming Era (10s)",
    weathering: { wear: 0.05, fade: 0.05, grain: 0.05, yellowing: 0.02 },
    typography: "Geometric sans, minimal",
    texture: "Nearly pristine, digital-first",
    guidance: ["Minimal", "Square format", "Instagram aesthetic"]
  },
  "contemporary": {
    era: "contemporary",
    displayName: "Contemporary (20s)",
    weathering: { wear: 0, fade: 0, grain: 0, yellowing: 0 },
    typography: "Variable sans, experimental",
    texture: "Brand new, pristine",
    guidance: ["Pristine", "Contemporary trends", "Fresh"]
  }
};

function detectEra(year: number | null | undefined): Era {
  if (!year) return "contemporary";
  if (year < 1950) return "pre-vinyl";
  if (year < 1970) return "golden-age";
  if (year < 1980) return "classic-rock";
  if (year < 1990) return "new-wave";
  if (year < 2000) return "grunge";
  if (year < 2010) return "digital";
  if (year < 2020) return "streaming";
  return "contemporary";
}

// =============================================================================
// Types & Schemas
// =============================================================================

/**
 * Liner note style options
 */
export const LinerNoteStyle = Schema.Literal(
  "art-forward",
  "editorial",
  "archival",
  "collage"
);
export type LinerNoteStyle = typeof LinerNoteStyle.Type;

/**
 * Graph context for enriching prompts
 */
export interface GraphContext {
  readonly collaborators?: readonly string[];
  readonly labels?: readonly string[];
  readonly relatedArtists?: readonly string[];
  readonly memberOf?: readonly string[];
  readonly genres?: readonly string[];
}

/**
 * Liner note generation request
 */
export const LinerNoteRequest = Schema.Struct({
  /** Play ID for tracking */
  playId: Schema.Number,
  /** Base64-encoded album art */
  albumArtBase64: Schema.String,
  /** MIME type of album art */
  mimeType: Schema.optional(Schema.String),
  /** Release year for era detection */
  releaseYear: Schema.NullOr(Schema.Number),
  /** Title for the liner note */
  title: Schema.String,
  /** Narrative text content */
  narrative: Schema.String,
  /** Artist name */
  artistName: Schema.String,
  /** Album name */
  albumName: Schema.optional(Schema.String),
  /** Visual style */
  style: Schema.optional(LinerNoteStyle),
  /** Graph context (collaborators, labels, etc.) */
  graphContext: Schema.optional(Schema.Unknown),
});
export type LinerNoteRequest = typeof LinerNoteRequest.Type;

/**
 * Liner note generation response
 */
export const LinerNoteResponse = Schema.Struct({
  /** Base64-encoded generated image */
  imageBase64: Schema.String,
  /** MIME type */
  mimeType: Schema.String,
  /** Era detected */
  era: Schema.String,
  /** Model notes/description */
  modelNotes: Schema.optional(Schema.String),
  /** Generation timestamp */
  generatedAt: Schema.String,
  /** Prompt used (for debugging) */
  promptUsed: Schema.optional(Schema.String),
});
export type LinerNoteResponse = typeof LinerNoteResponse.Type;

// =============================================================================
// Errors
// =============================================================================

export class LinerNoteGenerationError extends Data.TaggedError(
  "LinerNoteGenerationError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Prompt Builder
// =============================================================================

function buildLinerNotePrompt(
  request: LinerNoteRequest,
  graphContext?: GraphContext
): string {
  const era = detectEra(request.releaseYear);
  const profile = ERA_PROFILES[era];
  const style = request.style ?? "art-forward";

  const styleDescriptions: Record<LinerNoteStyle, string> = {
    "art-forward": "Text overlaid on abstracted album art atmosphere, warm inner sleeve feel",
    "editorial": "Magazine pull-quote card, Pitchfork/FADER aesthetic, bold typography",
    "archival": "Catalog card / found document, library index card, vintage press clipping",
    "collage": "Zine collage, mixed media cut-out, punk DIY aesthetic"
  };

  // Build graph context section if available
  let graphSection = "";
  if (graphContext) {
    const parts: string[] = [];
    if (graphContext.collaborators?.length) {
      parts.push(`Collaborators: ${graphContext.collaborators.slice(0, 5).join(", ")}`);
    }
    if (graphContext.labels?.length) {
      parts.push(`Labels: ${graphContext.labels.slice(0, 3).join(", ")}`);
    }
    if (graphContext.memberOf?.length) {
      parts.push(`Member of: ${graphContext.memberOf.slice(0, 3).join(", ")}`);
    }
    if (graphContext.relatedArtists?.length) {
      parts.push(`Related artists: ${graphContext.relatedArtists.slice(0, 3).join(", ")}`);
    }
    if (parts.length > 0) {
      graphSection = `\n=== CONTEXTUAL DETAILS (subtle visual hints) ===\n${parts.join("\n")}\n`;
    }
  }

  return `You are looking at the album artwork for "${request.albumName ?? "this album"}" by ${request.artistName} (${request.releaseYear ?? "recent"}).

Create a VISUAL LINER NOTE image that:
1. Incorporates visual elements from this album artwork (colors, textures, mood)
2. Overlays the following text in a readable, designed way
3. Feels like an authentic inner sleeve from a ${profile.displayName.toLowerCase()} vinyl record

=== TEXT CONTENT ===
Title: "${request.title}"
Body: "${request.narrative.slice(0, 400)}${request.narrative.length > 400 ? "..." : ""}"
${graphSection}
=== STYLE: ${style.toUpperCase()} ===
${styleDescriptions[style]}

=== ERA STYLING: ${profile.displayName} (${request.releaseYear ?? "recent"}) ===
WEATHERING:
- Physical wear: ${Math.round(profile.weathering.wear * 100)}%
- Color fade: ${Math.round(profile.weathering.fade * 100)}%
- Film grain: ${Math.round(profile.weathering.grain * 100)}%
- Paper yellowing: ${Math.round(profile.weathering.yellowing * 100)}%

TYPOGRAPHY: ${profile.typography}
TEXTURE: ${profile.texture}

ERA GUIDANCE:
${profile.guidance.map(g => `- ${g}`).join("\n")}

=== REQUIREMENTS ===
- Use the album art's color palette and visual mood
- Text must be fully legible (4.5:1 contrast minimum)
- Apply appropriate weathering/aging for ${request.releaseYear ?? "contemporary"}
- Feel like a real vinyl inner sleeve, not generic AI art
- NO purple gradients, NO generic stock imagery
- The album artwork should inform the atmosphere and texture

=== OUTPUT ===
A single cohesive image combining album art atmosphere with styled, readable text.`;
}

// =============================================================================
// Service Interface
// =============================================================================

export interface LinerNoteGenerationServiceInterface {
  /**
   * Generate a liner note image from album art
   */
  readonly generate: (
    request: LinerNoteRequest
  ) => Effect.Effect<LinerNoteResponse, LinerNoteGenerationError>;
}

/**
 * LinerNoteGenerationService tag
 */
export class LinerNoteGenerationService extends Context.Tag(
  "LinerNoteGenerationService"
)<LinerNoteGenerationService, LinerNoteGenerationServiceInterface>() {}

// =============================================================================
// Live Implementation
// =============================================================================

const makeLinerNoteGenerationService = Effect.gen(function* () {
  const googleClient = yield* GoogleClientModule.GoogleClient;

  const generate = (
    request: LinerNoteRequest
  ): Effect.Effect<LinerNoteResponse, LinerNoteGenerationError> =>
    Effect.gen(function* () {
      const era = detectEra(request.releaseYear);
      const graphContext = request.graphContext as GraphContext | undefined;
      const prompt = buildLinerNotePrompt(request, graphContext);

      const mimeType = request.mimeType ?? "image/jpeg";

      // Build Gemini request with image input
      const geminiRequest = {
        model: NANO_BANANA_PRO_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: request.albumArtBase64
                }
              },
              { text: prompt }
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      };

      // Call Gemini
      const response = yield* asEffect<any, any, never>(
        googleClient.generateContent(geminiRequest as any)
      ).pipe(
        Effect.mapError((e) => new LinerNoteGenerationError({
          message: `Gemini API error: ${e}`,
          cause: e
        }))
      );

      // Extract image from response
      let imageBase64: string | undefined;
      let responseMimeType: string | undefined;
      let modelNotes: string | undefined;

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if ("text" in part && part.text) {
            modelNotes = part.text;
          }
          if ("inlineData" in part && part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            // Extract mimeType from Gemini response if available
            responseMimeType = part.inlineData.mimeType;
          }
        }
      }

      if (!imageBase64) {
        return yield* Effect.fail(new LinerNoteGenerationError({
          message: "No image generated in response"
        }));
      }

      // Use mimeType from response, fallback to png (Gemini typically returns png)
      const outputMimeType = responseMimeType || "image/png";

      return {
        imageBase64,
        mimeType: outputMimeType,
        era,
        modelNotes,
        generatedAt: new Date().toISOString(),
        promptUsed: prompt
      } satisfies LinerNoteResponse;
    });

  return { generate } satisfies LinerNoteGenerationServiceInterface;
});

/**
 * Live layer - requires GoogleClient
 */
export const LinerNoteGenerationServiceLive: Layer.Layer<
  LinerNoteGenerationService,
  never,
  GoogleClientService
> = Layer.effect(LinerNoteGenerationService, makeLinerNoteGenerationService);

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Generate a liner note (convenience function)
 */
export const generateLinerNote = (
  request: LinerNoteRequest
): Effect.Effect<LinerNoteResponse, LinerNoteGenerationError, LinerNoteGenerationService> =>
  Effect.flatMap(LinerNoteGenerationService, (service) => service.generate(request));

// =============================================================================
// Graph Context Extraction (for use with MusicGraphService)
// =============================================================================

import type { MusicGraphServiceInterface, NeighborWithEdge } from "./MusicGraphService.js";

/**
 * Extract GraphContext from MusicGraphService edges
 * Call this with outgoingEdges result to build context for prompts
 */
export function extractGraphContext(
  edges: readonly NeighborWithEdge[]
): GraphContext {
  const collaborators: string[] = [];
  const labels: string[] = [];
  const memberOf: string[] = [];
  const relatedArtists: string[] = [];

  for (const { node, edge } of edges) {
    const relType = edge.relationshipType.toLowerCase();

    // Collaborator relationships
    if (
      relType.includes("collaborated") ||
      relType.includes("producer") ||
      relType.includes("engineer") ||
      relType.includes("mixed") ||
      relType.includes("mastered") ||
      relType.includes("vocal") ||
      relType.includes("instrument") ||
      relType.includes("composed") ||
      relType.includes("written")
    ) {
      if (!collaborators.includes(node.name)) {
        collaborators.push(node.name);
      }
    }

    // Label relationships
    if (node.nodeType === "label" || relType.includes("label") || relType.includes("signed")) {
      if (!labels.includes(node.name)) {
        labels.push(node.name);
      }
    }

    // Member relationships
    if (relType.includes("member") || relType.includes("part of")) {
      if (!memberOf.includes(node.name)) {
        memberOf.push(node.name);
      }
    }

    // Related artist relationships
    if (
      node.nodeType === "artist" &&
      (relType.includes("collaboration") ||
        relType.includes("tribute") ||
        relType.includes("supporting"))
    ) {
      if (!relatedArtists.includes(node.name)) {
        relatedArtists.push(node.name);
      }
    }
  }

  return {
    collaborators: collaborators.length > 0 ? collaborators : undefined,
    labels: labels.length > 0 ? labels : undefined,
    memberOf: memberOf.length > 0 ? memberOf : undefined,
    relatedArtists: relatedArtists.length > 0 ? relatedArtists : undefined,
  };
}

/**
 * Build GraphContext from MusicGraphService for an artist MBID
 * Returns empty context if graph service not available or no data
 */
export const buildGraphContextForArtist = (
  artistMbid: string,
  graphService: MusicGraphServiceInterface
): Effect.Effect<GraphContext, never, never> =>
  pipe(
    graphService.outgoingEdges(artistMbid),
    Effect.map(extractGraphContext),
    Effect.catchAll(() => Effect.succeed({} as GraphContext))
  );
