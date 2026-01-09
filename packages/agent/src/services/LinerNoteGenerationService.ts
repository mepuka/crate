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

import { Effect, Schema, Data, Layer, Context, pipe } from "effect";
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
  readonly collaborators?: readonly string[] | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly relatedArtists?: readonly string[] | undefined;
  readonly memberOf?: readonly string[] | undefined;
  readonly genres?: readonly string[] | undefined;
}

/**
 * Research context from agent's discoveries
 *
 * Flows the agent's reasoning and findings into art generation,
 * enabling contextually rich, story-driven visual prompts.
 */
export interface ResearchContext {
  /** Key findings from agent research (e.g., "First KEXP play in 3 years") */
  readonly findings?: readonly string[] | undefined;
  /** Story hook from DiscoveryArc insight (emotional/narrative core) */
  readonly storyHook?: string | undefined;
  /** Connection types discovered (e.g., "member-of", "collaborator-with") */
  readonly connectionTypes?: readonly string[] | undefined;
  /** Scene/movement associations (e.g., "Chicago post-punk", "PNW indie") */
  readonly sceneAssociations?: readonly string[] | undefined;
  /** Mood/tone inferred from research (e.g., "reunion", "breakthrough", "retrospective") */
  readonly mood?: string | undefined;
  /** DJ comment excerpt (the human curation signal) */
  readonly djCommentExcerpt?: string | undefined;
  /** Notable facts from external sources (Bandcamp, Wikipedia) */
  readonly externalFacts?: readonly string[] | undefined;
  /** Time context (e.g., "returning after hiatus", "debut", "anniversary") */
  readonly timeContext?: string | undefined;
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
  /** Research context from agent discoveries (story hooks, findings, mood) */
  researchContext: Schema.optional(Schema.Unknown),
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

/**
 * Infer visual mood from research context
 *
 * Maps agent discoveries to visual/emotional direction for the art.
 */
function inferVisualMood(research?: ResearchContext): string {
  if (!research) return "";

  const moods: string[] = [];

  // Explicit mood from research
  if (research.mood) {
    moods.push(research.mood);
  }

  // Time context suggests mood
  if (research.timeContext) {
    const tc = research.timeContext.toLowerCase();
    if (tc.includes("return") || tc.includes("comeback") || tc.includes("hiatus")) {
      moods.push("reunion, anticipation, rediscovery");
    } else if (tc.includes("debut") || tc.includes("first")) {
      moods.push("emergence, fresh energy, arrival");
    } else if (tc.includes("anniversary") || tc.includes("retrospective")) {
      moods.push("nostalgia, celebration, legacy");
    } else if (tc.includes("final") || tc.includes("last")) {
      moods.push("bittersweet, culmination, reverence");
    }
  }

  // Scene associations suggest aesthetic
  if (research.sceneAssociations?.length) {
    const scenes = research.sceneAssociations.join(", ").toLowerCase();
    if (scenes.includes("pnw") || scenes.includes("seattle") || scenes.includes("pacific northwest")) {
      moods.push("misty, evergreen, introspective warmth");
    } else if (scenes.includes("chicago") || scenes.includes("midwest")) {
      moods.push("industrial warmth, DIY grit, earnest");
    } else if (scenes.includes("brooklyn") || scenes.includes("new york")) {
      moods.push("urban density, art-forward, sophisticated chaos");
    } else if (scenes.includes("southern") || scenes.includes("nashville") || scenes.includes("memphis")) {
      moods.push("roots warmth, storytelling, analog soul");
    }
  }

  return moods.length > 0 ? moods.join("; ") : "";
}

function buildLinerNotePrompt(
  request: LinerNoteRequest,
  graphContext?: GraphContext,
  researchContext?: ResearchContext
): string {
  const era = detectEra(request.releaseYear);
  const profile = ERA_PROFILES[era];
  const style = request.style ?? "art-forward";

  // Era-specific physical texture descriptions (NO TEXT - texture/background only)
  const physicalTextureDescriptions: Record<Era, string> = {
    "pre-vinyl": `A weathered paper texture from a ${request.releaseYear ?? 1940}s 78rpm record sleeve.
Heavy cream-colored cardstock with visible foxing, age spots, and water staining.
The surface shows letterpress ink absorption patterns. Sepia-toned with deep patina.
Torn edges, corner wear, and the organic decay of 80+ year old paper stock.`,

    "golden-age": `The inner sleeve paper from a ${request.releaseYear ?? 1960} vinyl LP.
Cream or light gray paper, yellowed with age. Ring wear impression from the vinyl.
Coffee stains, slight foxing, price sticker residue, shop stamps.
The texture of paper that's been handled by collectors for decades.
Blue Note / Verve era paper quality and aging characteristics.`,

    "classic-rock": `Gatefold insert paper from a ${request.releaseYear ?? 1973} LP.
Textured cardstock with a slight sheen, warm cream color with analog warmth.
Gentle fold creases, slight warping from years in the sleeve.
The tactile quality of 70s album packaging - substantial, designed to be held.`,

    "new-wave": `Glossy insert card stock from an ${request.releaseYear ?? 1985} 12" single.
High-gloss paper with spot varnish areas, showing 80s printing technology.
Clean edges with slight handling wear. That particular 80s CMYK color quality.
Factory Records / 4AD sleeve texture and finish.`,

    "grunge": `DIY photocopied paper from ${request.releaseYear ?? 1993}.
Cheap newsprint-quality paper run through a Kinko's copy machine.
High contrast, slightly skewed, visible toner patterns and copy artifacts.
Creased, folded, hand-stamped. Sub Pop 7" insert aesthetic.`,

    "digital": `CD booklet paper from ${request.releaseYear ?? 2004}.
Matte or semi-gloss 4.75" square format paper stock.
Clean digital printing with minor edge yellowing.
Early 2000s print quality - crisp but showing subtle age.`,

    "streaming": `Premium vinyl insert from ${request.releaseYear ?? 2015}.
High quality paper stock with attention to tactile luxury.
Clean and crisp with minimal weathering.
Vinyl Me Please / boutique pressing quality.`,

    "contemporary": `Fresh liner note paper from a ${request.releaseYear ?? 2024} pressing.
Pristine premium paper stock, sharp and unworn.
Modern vinyl revival packaging - luxurious and collectible.
Just unwrapped from the shrink wrap.`
  };

  // Style-specific composition guidance
  const styleCompositions: Record<LinerNoteStyle, string> = {
    "art-forward": `Create an abstract composition using album art colors and shapes.
Transform key visual elements from the album into textural patterns.
Bold color fields, geometric shapes, artistic interpretation of the cover imagery.
This is art paper - expressive, designed, intentional.`,

    "editorial": `Clean, minimal paper with subtle texture.
Muted, sophisticated coloring derived from album palette.
Space for typography - leave breathing room for text overlay.
Magazine-quality paper stock, refined and understated.`,

    "archival": `Documentary photograph of aged paper.
Show the full artifact: edges, corners, wear patterns, staining.
Neutral background, museum-quality documentation aesthetic.
The paper itself tells the story of its age and provenance.`,

    "collage": `Layered paper textures and fragments.
Multiple paper types overlapping: kraft, newsprint, glossy scraps.
Torn edges, tape residue, paste-up aesthetic.
Zine-style assembled-by-hand feeling.`
  };

  // Infer visual mood from research
  const visualMood = inferVisualMood(researchContext);

  // Build palette guidance from album art
  const paletteSection = `
COLOR PALETTE: Extract and emphasize the dominant colors from the album artwork.
The texture should feel like it BELONGS to this album - same color temperature,
same mood, same visual language. The paper's aging/patina should complement, not fight,
the album's natural palette.`;

  // Crate Cat easter egg - the playful mascot hidden in every piece
  const crateCatSection = `
=== CRATE CAT EASTER EGG (REQUIRED) ===
Hidden somewhere in this artwork must be CRATE CAT - a playful black cat silhouette with distinctive yellow/gold eyes.

THE CAT MUST BE:
- A BLACK CAT silhouette - sleek, elegant, subtly mischievous
- YELLOW or GOLD eyes that catch attention once you notice them
- INTEGRATED into the composition - not pasted on top, but PART of the art
- SUBTLE but DISCOVERABLE - a delightful "aha!" moment when spotted

INTEGRATION IDEAS (be creative, pick what fits the composition):
- Cat silhouette formed by negative space between shapes
- Cat ears peeking from behind an element or edge
- Cat shape emerging from shadows or darker areas
- Cat curled up in a corner, blending with the color palette
- Cat watching from within the scene, part of the visual story
- Cat formed by the intersection of design elements

The cat should feel like it BELONGS in this era's visual language:
- Golden age jazz: Cat as part of the modernist silhouette composition
- Classic rock: Cat hidden in psychedelic patterns or gatefold imagery
- Grunge: Cat in photocopied high-contrast aesthetic
- Contemporary: Cat as clean graphic element

This is our signature - every Crate liner note has a cat hiding somewhere.
The viewer should smile when they discover it.`;

  return `TASK: Generate a PHYSICAL PAPER TEXTURE with CRATE CAT (NO TEXT)

Create a PHOTOGRAPH of a real physical paper artifact.
This will be used as a BACKGROUND for typography overlay - DO NOT include any text, letters, numbers, or writing.

=== CRITICAL: NO TEXT ===
- NO text of any kind
- NO letters, numbers, or symbols
- NO typography or lettering
- Just pure TEXTURE, COLOR, and PHYSICAL MATERIAL

=== THE PHYSICAL ARTIFACT ===
${physicalTextureDescriptions[era]}

=== COMPOSITION STYLE ===
${styleCompositions[style]}

=== CONTEXT FOR COLOR/MOOD ===
Artist: ${request.artistName}
Album: ${request.albumName ?? "Unknown"}
Year: ${request.releaseYear ?? "Unknown"}
${visualMood ? `Mood: ${visualMood}` : ""}

${paletteSection}

=== MATERIAL AUTHENTICITY ===
PAPER TEXTURE: ${profile.texture}
WEATHERING LEVELS:
- Edge wear and handling: ${Math.round(profile.weathering.wear * 100)}%
- Color/ink fading: ${Math.round(profile.weathering.fade * 100)}%
- Paper yellowing/foxing: ${Math.round(profile.weathering.yellowing * 100)}%
- Surface grain visibility: ${Math.round(profile.weathering.grain * 100)}%

${crateCatSection}

=== REQUIREMENTS ===
1. PHOTOGRAPH of a REAL physical paper/cardstock
2. NO TEXT, LETTERS, OR WRITING of any kind
3. Rich texture: paper grain, fibers, imperfections, aging
4. Colors drawn from the album artwork provided
5. Era-appropriate material and wear characteristics
6. Suitable as a background for overlaid typography
7. High detail in material qualities: creases, stains, wear patterns
8. CRATE CAT hidden in the composition (black cat, yellow eyes)

=== DESCRIBE YOUR VISION ===
Before generating, describe:
- What type of paper stock and era-specific qualities?
- What colors from the album art will dominate?
- What specific wear patterns and aging marks?
- WHERE and HOW will Crate Cat be hidden? (Be creative!)

Then generate a text-free paper texture with the hidden cat.`;
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
      const researchContext = request.researchContext as ResearchContext | undefined;
      const prompt = buildLinerNotePrompt(request, graphContext, researchContext);

      const mimeType = request.mimeType ?? "image/jpeg";

      // Build Gemini request with image input
      // Temperature 1.0 for maximum creativity in visual generation
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
          temperature: 1.0,
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
        return yield* new LinerNoteGenerationError({
          message: "No image generated in response"
        });
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
