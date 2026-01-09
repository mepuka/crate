/**
 * LinerNoteOrchestrator
 *
 * Orchestrates liner note generation and persistence:
 * 1. Generates era-appropriate texture with Crate Cat easter egg
 * 2. Uploads to GCS for frontend consumption
 * 3. Returns metadata for storage/display
 *
 * @module
 */

import { Context, Data, Effect, Layer, Schema, pipe } from "effect";
import {
  LinerNoteGenerationService,
  generateLinerNote,
  type LinerNoteRequest,
} from "./LinerNoteGenerationService.js";
import {
  GcsStorageService,
  GcsStorageServiceFull,
} from "./GcsStorageService.js";
import * as crypto from "node:crypto";

// =============================================================================
// Types
// =============================================================================

/**
 * Input for liner note orchestration
 */
export interface OrchestrateLinerNoteInput {
  readonly playId: number;
  /** Base64-encoded album art */
  readonly albumArtBase64: string;
  /** MIME type of album art */
  readonly mimeType?: string | undefined;
  /** Release year for era detection */
  readonly releaseYear: number | null;
  /** Artist name */
  readonly artistName: string;
  /** Album name */
  readonly albumName?: string | undefined;
  /** Track title */
  readonly trackTitle?: string | undefined;
  /** Narrative/comment for context */
  readonly narrative?: string | undefined;
  /** Visual style preference */
  readonly style?: "art-forward" | "editorial" | "archival" | "collage" | undefined;
  /** Graph context (collaborators, labels, etc.) */
  readonly graphContext?: {
    readonly collaborators?: readonly string[] | undefined;
    readonly labels?: readonly string[] | undefined;
    readonly relatedArtists?: readonly string[] | undefined;
    readonly memberOf?: readonly string[] | undefined;
  } | undefined;
  /** Research context from agent discoveries */
  readonly researchContext?: {
    readonly findings?: readonly string[] | undefined;
    readonly storyHook?: string | undefined;
    readonly sceneAssociations?: readonly string[] | undefined;
    readonly mood?: string | undefined;
    readonly djCommentExcerpt?: string | undefined;
  } | undefined;
}

/**
 * Result from liner note orchestration
 */
export interface OrchestrateLinerNoteResult {
  readonly playId: number;
  /** GCS public URL for the generated image */
  readonly imageUrl: string;
  /** Base64-encoded image (for DB persistence) */
  readonly imageBase64: string;
  /** MIME type */
  readonly mimeType: string;
  /** Detected era */
  readonly era: string;
  /** Style used */
  readonly style: string;
  /** Model's notes about the generation */
  readonly modelNotes?: string | undefined;
  /** Hash of generation params (for deduplication) */
  readonly paramsHash: string;
  /** Generation timestamp */
  readonly generatedAt: string;
  /** GCS path */
  readonly gcsPath: string;
}

// =============================================================================
// Errors
// =============================================================================

export class LinerNoteOrchestrationError extends Data.TaggedError(
  "LinerNoteOrchestrationError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Service Interface
// =============================================================================

export interface LinerNoteOrchestratorInterface {
  /**
   * Generate and persist a liner note
   */
  readonly orchestrate: (
    input: OrchestrateLinerNoteInput
  ) => Effect.Effect<OrchestrateLinerNoteResult, LinerNoteOrchestrationError>;
}

/**
 * LinerNoteOrchestrator tag
 */
export class LinerNoteOrchestrator extends Context.Tag("LinerNoteOrchestrator")<
  LinerNoteOrchestrator,
  LinerNoteOrchestratorInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Generate a deterministic hash for deduplication
 */
function hashParams(input: OrchestrateLinerNoteInput): string {
  const key = JSON.stringify({
    playId: input.playId,
    artistName: input.artistName,
    albumName: input.albumName,
    releaseYear: input.releaseYear,
    style: input.style ?? "art-forward",
  });
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

const makeLinerNoteOrchestrator = Effect.gen(function* () {
  const gcsStorage = yield* GcsStorageService;

  const orchestrate = (
    input: OrchestrateLinerNoteInput
  ): Effect.Effect<
    OrchestrateLinerNoteResult,
    LinerNoteOrchestrationError,
    LinerNoteGenerationService
  > =>
    Effect.gen(function* () {
      const style = input.style ?? "art-forward";
      const paramsHash = hashParams(input);

      yield* Effect.log(
        `LinerNoteOrchestrator: Generating for play ${input.playId} (${input.artistName})`
      );

      // Build generation request
      const request: LinerNoteRequest = {
        playId: input.playId,
        albumArtBase64: input.albumArtBase64,
        mimeType: input.mimeType,
        releaseYear: input.releaseYear,
        title: input.trackTitle
          ? `${input.artistName} - ${input.trackTitle}`
          : input.artistName,
        narrative:
          input.narrative ||
          `${input.trackTitle || "Track"} by ${input.artistName}${
            input.albumName ? ` from ${input.albumName}` : ""
          }`,
        artistName: input.artistName,
        albumName: input.albumName,
        style,
        graphContext: input.graphContext,
        researchContext: input.researchContext,
      };

      // Generate the liner note
      const generationResult = yield* generateLinerNote(request).pipe(
        Effect.mapError(
          (e) =>
            new LinerNoteOrchestrationError({
              message: `Generation failed: ${e.message}`,
              cause: e,
            })
        )
      );

      yield* Effect.log(
        `LinerNoteOrchestrator: Generated ${generationResult.era} era liner note`
      );

      // Build GCS path
      const safeArtist = input.artistName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 30);
      const gcsPath = `liner-notes/${input.playId}/${safeArtist}-${style}-${paramsHash}.png`;

      // Upload to GCS
      const uploadResult = yield* gcsStorage
        .upload({
          base64Data: generationResult.imageBase64,
          mimeType: generationResult.mimeType,
          path: gcsPath,
          cacheControl: "public, max-age=31536000", // 1 year cache
        })
        .pipe(
          Effect.mapError(
            (e) =>
              new LinerNoteOrchestrationError({
                message: `GCS upload failed: ${e.message}`,
                cause: e,
              })
          )
        );

      yield* Effect.log(
        `LinerNoteOrchestrator: Uploaded to ${uploadResult.publicUrl}`
      );

      return {
        playId: input.playId,
        imageUrl: uploadResult.publicUrl,
        imageBase64: generationResult.imageBase64,
        mimeType: generationResult.mimeType,
        era: generationResult.era,
        style,
        modelNotes: generationResult.modelNotes,
        paramsHash,
        generatedAt: generationResult.generatedAt,
        gcsPath,
      };
    });

  return { orchestrate } satisfies LinerNoteOrchestratorInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer - requires LinerNoteGenerationService and GcsStorageService
 */
export const LinerNoteOrchestratorLive: Layer.Layer<
  LinerNoteOrchestrator,
  never,
  GcsStorageService
> = Layer.effect(LinerNoteOrchestrator, makeLinerNoteOrchestrator);

/**
 * Full live layer with all dependencies
 * Requires GoogleClient for image generation
 */
export const LinerNoteOrchestratorFull = pipe(
  LinerNoteOrchestratorLive,
  Layer.provide(GcsStorageServiceFull)
);

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Orchestrate liner note generation and persistence
 */
export const orchestrateLinerNote = (
  input: OrchestrateLinerNoteInput
): Effect.Effect<
  OrchestrateLinerNoteResult,
  LinerNoteOrchestrationError,
  LinerNoteOrchestrator | LinerNoteGenerationService
> =>
  Effect.flatMap(LinerNoteOrchestrator, (orchestrator) =>
    orchestrator.orchestrate(input)
  );
