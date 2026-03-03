/**
 * ArtGenerationOrchestrator
 *
 * Orchestrates art generation after MusicAgent produces insights.
 * Flows agent research context into visual generation for authentic,
 * story-driven liner note art.
 *
 * Architecture:
 * - Consumes research findings from pre-research phase
 * - Uses insight summaries to build narrative
 * - Fetches album art and calls LinerNoteGenerationService
 * - Stores generated assets via HTTP to Crate server
 *
 * @module
 */

import { Effect, Context, Layer, Data, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpBody } from "@effect/platform";
import {
  LinerNoteGenerationService,
  type LinerNoteRequest,
  type ResearchContext,
} from "./LinerNoteGenerationService.js";
import { CrateServerConfig } from "../config.js";
import type { ParallelResearchResult } from "../orchestration/ParallelResearch.js";
import type { Insight } from "../prompts/insights.js";
import * as crypto from "node:crypto";

// =============================================================================
// Types
// =============================================================================

/**
 * Play context for art generation
 */
export interface PlayContext {
  readonly playId: number;
  readonly artist: string;
  readonly song: string;
  readonly album?: string | undefined;
  readonly imageUri?: string | null | undefined;
  readonly releaseYear?: number | null | undefined;
  readonly artistMbids?: readonly string[] | undefined;
  readonly comment?: string | null | undefined;
}

/**
 * Input for art generation orchestration
 */
export interface ArtGenerationInput {
  readonly play: PlayContext;
  readonly preResearch: ParallelResearchResult;
  readonly insights: readonly Insight[];
}

/**
 * Result from art generation
 */
export interface ArtGenerationResult {
  readonly assetId: number;
  readonly assetType: string;
  readonly era: string;
  readonly wasExisting: boolean;
}

/**
 * Generation parameters for hashing/deduplication
 */
export interface GenerationParams {
  readonly style?: string | undefined;
  readonly releaseYear?: number | null | undefined;
  readonly narrative?: string | undefined;
  readonly artistMbid?: string | undefined;
  readonly placement?: string | undefined;
  readonly mood?: string | undefined;
  readonly description?: string | undefined;
}

/**
 * Store asset response schema (matches server-side StoreAssetResponse)
 */
const StoreAssetResponse = Schema.Struct({
  id: Schema.Number,
  params_hash: Schema.String,
  was_existing: Schema.Boolean,
});

// =============================================================================
// Errors
// =============================================================================

export class ArtGenerationError extends Data.TaggedError("ArtGenerationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a deterministic hash for generation params
 */
function hashParams(params: GenerationParams): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// =============================================================================
// Research Context Extraction
// =============================================================================

/**
 * Build ResearchContext from pre-research findings
 */
function buildResearchContext(
  preResearch: ParallelResearchResult,
  insights: readonly Insight[],
  play: PlayContext
): ResearchContext {
  // Extract findings from pre-research
  const allFindings = [
    ...preResearch.covers.findings,
    ...preResearch.history.findings,
    ...preResearch.graph.findings,
    ...preResearch.context.findings,
  ];

  // Extract scene associations from graph connections
  const sceneAssociations: string[] = [];
  for (const finding of preResearch.graph.findings) {
    const lower = finding.toLowerCase();
    if (lower.includes("seattle") || lower.includes("pnw") || lower.includes("pacific northwest")) {
      sceneAssociations.push("Pacific Northwest indie");
    }
    if (lower.includes("chicago")) sceneAssociations.push("Chicago scene");
    if (lower.includes("brooklyn") || lower.includes("new york")) sceneAssociations.push("NYC scene");
    if (lower.includes("uk") || lower.includes("british") || lower.includes("london")) {
      sceneAssociations.push("UK scene");
    }
  }

  // Infer mood from insights
  let mood: string | undefined;
  const insightTypes = insights.map((i) => i._tag);
  if (insightTypes.includes("DiscoveryArc")) {
    mood = "discovery, journey, revelation";
  } else if (insightTypes.includes("Connection")) {
    mood = "interconnected, web of influence";
  } else if (insightTypes.includes("LocalScene")) {
    mood = "community, local pride, grassroots";
  } else if (insightTypes.includes("Concert")) {
    mood = "live energy, anticipation, memory";
  }

  // Extract story hook from DiscoveryArc if present
  let storyHook: string | undefined;
  const discoveryArc = insights.find((i) => i._tag === "DiscoveryArc");
  if (discoveryArc && "narrative" in discoveryArc) {
    storyHook = String(discoveryArc.narrative).slice(0, 200);
  }

  // DJ comment as curation signal
  const djCommentExcerpt = play.comment?.slice(0, 150);

  // Time context from history findings
  let timeContext: string | undefined;
  for (const finding of preResearch.history.findings) {
    const lower = finding.toLowerCase();
    if (lower.includes("first play") || lower.includes("debut")) {
      timeContext = "debut on KEXP";
      break;
    }
    if (lower.includes("return") || lower.includes("after") || lower.includes("years")) {
      timeContext = "returning after hiatus";
      break;
    }
  }

  return {
    findings: allFindings.slice(0, 10), // Limit to top 10
    storyHook,
    connectionTypes: [], // Could extract from graph
    sceneAssociations: [...new Set(sceneAssociations)],
    mood,
    djCommentExcerpt,
    externalFacts: preResearch.context.findings.slice(0, 5),
    timeContext,
  };
}

/**
 * Build narrative from insights for liner note
 */
function buildNarrative(insights: readonly Insight[], play: PlayContext): string {
  if (insights.length === 0) {
    return `${play.artist} brings their unique sound to KEXP.`;
  }

  // Collect insight summaries
  const summaries: string[] = [];
  for (const insight of insights.slice(0, 3)) {
    if ("summary" in insight && typeof insight.summary === "string") {
      summaries.push(insight.summary);
    } else if ("narrative" in insight && typeof insight.narrative === "string") {
      summaries.push(insight.narrative);
    }
  }

  return summaries.join(" ") || `Exploring the music of ${play.artist}.`;
}

/**
 * Determine semantic asset type based on research context
 */
function inferAssetType(research: ResearchContext, insights: readonly Insight[]): string {
  // Let the context inform the asset type
  if (insights.some((i) => i._tag === "DiscoveryArc")) {
    return "discovery_journey"; // Story-driven art
  }
  if (insights.some((i) => i._tag === "Connection")) {
    return "connection_web"; // Relationship-focused
  }
  if (insights.some((i) => i._tag === "Concert")) {
    return "live_moment"; // Concert energy
  }
  if (insights.some((i) => i._tag === "LocalScene")) {
    return "scene_portrait"; // Community/scene focused
  }
  if (research.sceneAssociations && research.sceneAssociations.length > 0) {
    return "scene_context"; // Scene-associated
  }
  // Default
  return "liner_note";
}

/**
 * Infer placement based on asset type
 */
function inferPlacement(assetType: string): string {
  switch (assetType) {
    case "discovery_journey":
      return "inner"; // Inner sleeve for stories
    case "connection_web":
      return "gatefold"; // Spread for relationships
    case "live_moment":
      return "front"; // Primary visual
    case "scene_portrait":
      return "back"; // Credits/context side
    default:
      return "back"; // Default to liner notes side
  }
}

// =============================================================================
// Service Interface
// =============================================================================

export interface ArtGenerationOrchestratorInterface {
  /**
   * Generate art based on agent research and insights
   */
  readonly generateFromResearch: (
    input: ArtGenerationInput
  ) => Effect.Effect<Option.Option<ArtGenerationResult>, ArtGenerationError>;
}

/**
 * ArtGenerationOrchestrator tag
 */
export class ArtGenerationOrchestrator extends Context.Tag(
  "ArtGenerationOrchestrator"
)<ArtGenerationOrchestrator, ArtGenerationOrchestratorInterface>() {}

// =============================================================================
// Live Implementation
// =============================================================================

const makeArtGenerationOrchestrator = Effect.gen(function* () {
  const linerNoteService = yield* LinerNoteGenerationService;
  const httpClient = yield* HttpClient.HttpClient;
  const serverConfig = yield* CrateServerConfig;

  /**
   * Fetch album art and convert to base64
   */
  const fetchAlbumArt = (
    url: string
  ): Effect.Effect<{ base64: string; mimeType: string }, ArtGenerationError> =>
    Effect.gen(function* () {
      const request = HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeaders({
          "User-Agent": "CrateAgent/1.0",
          Accept: "image/*",
        })
      );
      const response = yield* httpClient.execute(request);
      const buffer = yield* response.arrayBuffer;
      const base64 = Buffer.from(buffer).toString("base64");
      const contentType = response.headers["content-type"] || "image/jpeg";
      const mimeType = contentType.split(";")[0].trim();
      return { base64, mimeType };
    }).pipe(
      Effect.mapError(
        (e) =>
          new ArtGenerationError({
            message: `Failed to fetch album art: ${e}`,
            cause: e,
          })
      )
    );

  /**
   * Store generated asset via HTTP POST to Crate server
   */
  const storeAsset = (input: {
    playId: number;
    assetType: string;
    params: GenerationParams;
    imageBase64: string;
    mimeType: string;
    era: string;
    style: string;
    modelNotes?: string | undefined;
    promptUsed?: string | undefined;
  }): Effect.Effect<{ id: number; paramsHash: string; wasExisting: boolean }, ArtGenerationError> =>
    Effect.gen(function* () {
      const paramsHash = hashParams(input.params);
      const paramsJson = JSON.stringify(input.params);

      const requestBody = {
        play_id: input.playId,
        asset_type: input.assetType,
        params_hash: paramsHash,
        generation_params: paramsJson,
        image_base64: input.imageBase64,
        mime_type: input.mimeType,
        era: input.era,
        style: input.style,
        model_notes: input.modelNotes,
        prompt_used: input.promptUsed,
      };

      const response = yield* httpClient
        .post(`${serverConfig.baseUrl}/api/plays/generated-assets`, {
          body: HttpBody.unsafeJson(requestBody),
        })
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(StoreAssetResponse)),
          Effect.timeoutFail({
            duration: serverConfig.timeout,
            onTimeout: () =>
              new ArtGenerationError({
                message: "Store asset request timed out",
              }),
          }),
          Effect.mapError(
            (e) =>
              new ArtGenerationError({
                message: `Failed to store asset via HTTP: ${e}`,
                cause: e,
              })
          )
        );

      return {
        id: response.id,
        paramsHash: response.params_hash,
        wasExisting: response.was_existing,
      };
    });

  const generateFromResearch = (
    input: ArtGenerationInput
  ): Effect.Effect<Option.Option<ArtGenerationResult>, ArtGenerationError> =>
    Effect.gen(function* () {
      const { play, preResearch, insights } = input;

      // Skip if no album art URL
      if (!play.imageUri) {
        yield* Effect.logDebug(
          `Skipping art generation for play ${play.playId}: no album art`
        );
        return Option.none();
      }

      // Skip if no meaningful research to inform art
      const totalFindings =
        preResearch.covers.findings.length +
        preResearch.history.findings.length +
        preResearch.graph.findings.length +
        preResearch.context.findings.length;

      if (totalFindings === 0 && insights.length === 0) {
        yield* Effect.logDebug(
          `Skipping art generation for play ${play.playId}: no research context`
        );
        return Option.none();
      }

      // Build research context from pre-research findings
      const researchContext = buildResearchContext(preResearch, insights, play);

      // Determine semantic asset type based on context
      const assetType = inferAssetType(researchContext, insights);
      const placement = inferPlacement(assetType);

      // Build narrative from insights
      const narrative = buildNarrative(insights, play);

      // Build generation params for deduplication
      const params: GenerationParams = {
        style: "art-forward",
        releaseYear: play.releaseYear,
        narrative: narrative.slice(0, 100), // Hash on truncated narrative
        artistMbid: play.artistMbids?.[0],
        placement,
        mood: researchContext.mood,
        description: `${assetType} for ${play.artist}`,
      };

      // Fetch album art
      yield* Effect.logInfo(
        `Generating ${assetType} art for play ${play.playId}: ${play.artist}`
      );
      const { base64: albumArtBase64, mimeType } = yield* fetchAlbumArt(
        play.imageUri
      );

      // Build liner note request
      const request: LinerNoteRequest = {
        playId: play.playId,
        albumArtBase64,
        mimeType,
        releaseYear: play.releaseYear ?? null,
        title: `${play.artist}'s KEXP Story`,
        narrative,
        artistName: play.artist,
        albumName: play.album,
        style: "art-forward",
        graphContext: undefined, // TODO: extract from graph findings
        researchContext,
      };

      // Generate art
      const result = yield* linerNoteService.generate(request).pipe(
        Effect.mapError(
          (e) =>
            new ArtGenerationError({
              message: `Liner note generation failed: ${e.message}`,
              cause: e,
            })
        )
      );

      // Store asset via HTTP (server handles deduplication)
      const storeResult = yield* storeAsset({
        playId: play.playId,
        assetType,
        params,
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
        era: result.era,
        style: "art-forward",
        modelNotes: result.modelNotes,
        promptUsed: result.promptUsed,
      });

      yield* Effect.logInfo(
        `Generated ${assetType} asset (id=${storeResult.id}) for play ${play.playId}${storeResult.wasExisting ? " (was existing)" : ""}`
      );

      return Option.some({
        assetId: storeResult.id,
        assetType,
        era: result.era,
        wasExisting: storeResult.wasExisting,
      });
    });

  return { generateFromResearch } satisfies ArtGenerationOrchestratorInterface;
});

/**
 * Live layer - requires LinerNoteGenerationService, CrateServerConfig, HttpClient
 */
export const ArtGenerationOrchestratorLive: Layer.Layer<
  ArtGenerationOrchestrator,
  never,
  LinerNoteGenerationService | CrateServerConfig | HttpClient.HttpClient
> = Layer.effect(ArtGenerationOrchestrator, makeArtGenerationOrchestrator);
