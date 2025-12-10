/**
 * Prompt Builder Service
 *
 * Builds complete prompts for the Crate Research Agent with dynamic context injection:
 * - Current show information from KEXP API
 * - DJ bios from pre-loaded data
 * - Show descriptions
 * - Time context for temporal reasoning
 *
 * Cloud-ready: No filesystem dependencies. All assets loaded at build time.
 *
 * Uses Effect.Service pattern with proper Schema definitions and @effect/ai Prompt integration.
 *
 * @example
 * ```ts
 * // Access via Effect.gen
 * Effect.gen(function* () {
 *   const prompt = yield* PromptBuilderService.buildForKexpPlay(play, { show })
 * })
 *
 * // Or use static accessors
 * PromptBuilderService.buildForKexpPlay(play, { show })
 * ```
 */

import { Effect, Data, pipe, Option, Layer, Context } from "effect";
import { Prompt } from "@effect/ai";
import {
  buildPlayMessage,
  type PlayContext,
  type ShowContext,
  type SimpleShowContext,
  type InsightSummary,
  type PromptContext,
} from "../prompts/system-prompt.js";
import * as CratePrompt from "../prompts/CratePrompt.js";
import * as Kexp from "@crate/domain/kexp/schemas";
import {
  Assets,
  AssetsLive,
  type DjBio,
  type ShowDescription,
} from "./Assets.js";

// =============================================================================
// Branded Types for IDs
// =============================================================================

/** Branded type for Play IDs */
export type PlayId = number & { readonly _brand: unique symbol };

/** Branded type for MusicBrainz IDs */
export type MbId = string & { readonly _brand: unique symbol };

// =============================================================================
// Schemas for BuiltPrompt
// =============================================================================

/**
 * Built prompt metadata
 */
export interface BuiltPromptMetadata {
  readonly showName?: string;
  readonly hostNames?: readonly string[];
  readonly playId: number;
  readonly artist: string;
  readonly track: string;
  readonly hasComment: boolean;
  readonly hasDjBio: boolean;
}

/**
 * Complete prompt ready for the LLM
 */
export interface BuiltPrompt {
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly metadata: BuiltPromptMetadata;
}

// =============================================================================
// Errors
// =============================================================================

export class PromptBuildError extends Data.TaggedError("PromptBuildError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert BuiltPrompt to @effect/ai Prompt format
 *
 * Uses Anthropic's prompt caching for the system message to reduce costs
 * (~90% savings on repeated prompts within 5 minute TTL).
 */
export const builtPromptToAiPrompt = (prompt: BuiltPrompt): Prompt.Prompt =>
  Prompt.make([
    {
      role: "system",
      content: prompt.systemPrompt,
      options: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
    { role: "user", content: prompt.userMessage },
  ]);

/**
 * Extract the system prompt text from a Prompt object
 */
const extractSystemText = (prompt: Prompt.Prompt): string => {
  const systemMsg = prompt.content.find((m) => m.role === "system");
  if (
    systemMsg &&
    "content" in systemMsg &&
    typeof systemMsg.content === "string"
  ) {
    return systemMsg.content;
  }
  return "";
};

/**
 * Convert KEXP API play to our PlayContext format
 */
const kexpPlayToPlayContext = (play: Kexp.KexpTrackPlay): PlayContext => ({
  id: play.id,
  airdate: play.airdate,
  artist: play.artist || "Unknown Artist",
  track: play.song || "Unknown Track",
  album: play.album,
  labels: play.labels ? [...play.labels] : [],
  releaseDate: play.release_date,
  artistMbids: play.artist_ids ? [...play.artist_ids] : [],
  recordingMbid: play.recording_id,
  releaseMbid: play.release_id,
  releaseGroupMbid: play.release_group_id,
  labelMbids: play.label_ids ? [...play.label_ids] : [],
  rotationStatus: play.rotation_status,
  isLocal: play.is_local,
  isRequest: play.is_request,
  isLive: play.is_live,
  comment: play.comment,
  imageUri: play.image_uri,
});

/**
 * Convert FAISS API PlayResult to KEXP KexpTrackPlay format
 *
 * The FAISS API uses different field names for MBIDs:
 * - FAISS: artist_mbid, recording_mbid, release_mbid, release_group_mbid
 * - KEXP: artist_ids, recording_id, release_id, release_group_id
 *
 * This converter bridges the gap so plays fetched from FAISS API
 * can be used with the existing prompt builder infrastructure.
 */
export const faissPlayToKexpPlay = (
  play: import("@crate/domain/faiss/schemas").Play
): Kexp.KexpTrackPlay => ({
  // Core fields
  id: play.id,
  uri: "", // Not in FAISS response
  play_type: "trackplay" as const,
  artist: play.artist,
  song: play.song,
  album: play.album,
  airdate: play.airdate.toISOString(),
  show: play.show,
  show_uri: "",
  image_uri: play.image_uri,
  thumbnail_uri: play.thumbnail_uri,
  track_id: null, // Not in FAISS response
  location: 0, // Default value
  location_name: "KEXP", // Default value

  // Labels
  labels: play.labels,
  label_ids: [], // FAISS doesn't return label MBIDs

  // MBID mapping: FAISS uses _mbid suffix, KEXP uses _id suffix
  artist_ids: play.artist_mbid, // FAISS: artist_mbid -> KEXP: artist_ids
  recording_id: play.recording_mbid, // FAISS: recording_mbid -> KEXP: recording_id
  release_id: play.release_mbid, // FAISS: release_mbid -> KEXP: release_id
  release_group_id: play.release_group_mbid, // FAISS: release_group_mbid -> KEXP: release_group_id

  // Metadata
  release_date: play.release_date?.toISOString() ?? null,
  // Map rotation status from FAISS string to KEXP literal union or null
  rotation_status: (play.rotation_status as Kexp.RotationStatus | null) ?? null,
  is_local: play.is_local,
  is_live: play.is_live,
  is_request: play.is_request,
  comment: play.comment,
});

/**
 * Convert KEXP API show to our ShowContext format
 */
const kexpShowToShowContext = (show: Kexp.KexpShow): ShowContext => ({
  id: show.id,
  programId: show.program,
  programName: show.program_name,
  hostIds: [...show.hosts],
  hostNames: [...show.host_names],
  hosts: [...show.host_names].map((name, idx) => ({
    id: show.hosts[idx] ?? 0,
    name,
    imageUri: null,
    isActive: true,
  })),
  tagline: show.tagline,
  programTags: show.program_tags,
  imageUri: show.image_uri,
  startTime: show.start_time,
});

/**
 * Enrich show context with DJ bio if available
 */
const enrichShowContext = (
  show: ShowContext | SimpleShowContext,
  findDjBio: (name: string) => Option.Option<DjBio>
): ShowContext | SimpleShowContext => {
  // For SimpleShowContext, try to add DJ bio info
  if ("name" in show && !("programName" in show)) {
    const simple = show as SimpleShowContext;
    if (simple.host) {
      const djBioOpt = findDjBio(simple.host);
      if (Option.isSome(djBioOpt)) {
        const djBio = djBioOpt.value;
        const bioSnippet =
          djBio.bio.slice(0, 500) + (djBio.bio.length > 500 ? "..." : "");
        return {
          ...simple,
          description: simple.description
            ? `${simple.description}\n\n**About the host:** ${bioSnippet}`
            : `**About the host:** ${bioSnippet}`,
        };
      }
    }
    return simple;
  }

  // For full ShowContext, no enrichment needed (DJ info handled separately)
  return show;
};

// =============================================================================
// Service Interface
// =============================================================================

/**
 * PromptBuilderService interface
 */
export interface PromptBuilderServiceInterface {
  /**
   * Build a complete prompt for a play
   */
  readonly buildForPlay: (
    play: PlayContext,
    options?: {
      showContext?: ShowContext | SimpleShowContext;
      recentInsights?: InsightSummary[];
    }
  ) => Effect.Effect<BuiltPrompt, PromptBuildError>;

  /**
   * Build a prompt for a KEXP API play
   */
  readonly buildForKexpPlay: (
    play: Kexp.KexpTrackPlay,
    options?: {
      show?: Kexp.KexpShow;
      recentInsights?: InsightSummary[];
    }
  ) => Effect.Effect<BuiltPrompt, PromptBuildError>;

  /**
   * Build an @effect/ai Prompt directly for a KEXP play
   */
  readonly buildPromptForKexpPlay: (
    play: Kexp.KexpTrackPlay,
    options?: {
      show?: Kexp.KexpShow;
      recentInsights?: InsightSummary[];
    }
  ) => Effect.Effect<Prompt.Prompt, PromptBuildError>;

  /**
   * Get DJ bio by name (fuzzy match)
   */
  readonly getDjBio: (name: string) => Effect.Effect<DjBio | undefined>;

  /**
   * Get show description by name
   */
  readonly getShowDescription: (
    name: string
  ) => Effect.Effect<ShowDescription | undefined>;

  /**
   * Get all loaded DJ bios
   */
  readonly getAllDjBios: () => Effect.Effect<readonly DjBio[]>;

  /**
   * Get all show descriptions
   */
  readonly getAllShowDescriptions: () => Effect.Effect<
    readonly ShowDescription[]
  >;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * PromptBuilderService - builds prompts with DJ/show context injection
 */
export class PromptBuilderService extends Context.Tag("PromptBuilderService")<
  PromptBuilderService,
  PromptBuilderServiceInterface
>() {}

/**
 * Create the prompt builder service implementation
 */
const makePromptBuilderService = Effect.gen(function* () {
  const assets = yield* Assets;

  const buildForPlay = (
    play: PlayContext,
    options: {
      showContext?: ShowContext | SimpleShowContext;
      recentInsights?: InsightSummary[];
    } = {}
  ): Effect.Effect<BuiltPrompt, PromptBuildError> =>
    Effect.try({
      try: () => {
        const enrichedShowContext = options.showContext
          ? enrichShowContext(options.showContext, assets.findDjBio)
          : undefined;

        // Build prompt context - use play's airdate for temporal reasoning
        // so "tonight" in DJ comments resolves relative to when the music aired
        const promptContext: PromptContext = {
          currentTime: new Date(play.airdate),
          playData: play,
          ...(enrichedShowContext ? { showContext: enrichedShowContext } : {}),
          ...(options.recentInsights
            ? { recentInsights: options.recentInsights }
            : {}),
        };

        // Use CratePrompt to build the system prompt
        const systemPromptObj = CratePrompt.buildSystemPrompt(promptContext);

        // Extract text content from the Prompt object
        const systemPrompt = extractSystemText(systemPromptObj);
        const userMessage = buildPlayMessage(play);

        // Get show name for metadata
        let showName: string | undefined;
        let hostNames: string[] | undefined;

        if (enrichedShowContext) {
          if ("programName" in enrichedShowContext) {
            showName = enrichedShowContext.programName;
            hostNames = [...enrichedShowContext.hostNames];
          } else {
            showName = enrichedShowContext.name;
            hostNames = enrichedShowContext.host
              ? [enrichedShowContext.host]
              : undefined;
          }
        }

        // Check if we have DJ bio for any hosts
        const hasDjBio =
          hostNames?.some((name) => Option.isSome(assets.findDjBio(name))) ??
          false;

        // Build metadata
        const metadata: BuiltPromptMetadata = {
          playId: play.id,
          artist: play.artist,
          track: play.track,
          hasComment: !!play.comment,
          hasDjBio,
          ...(showName ? { showName } : {}),
          ...(hostNames ? { hostNames } : {}),
        };

        return {
          systemPrompt,
          userMessage,
          metadata,
        } satisfies BuiltPrompt;
      },
      catch: (error) =>
        new PromptBuildError({
          message: "Failed to build prompt",
          cause: error,
        }),
    });

  const buildForKexpPlay = (
    play: Kexp.KexpTrackPlay,
    options: {
      show?: Kexp.KexpShow;
      recentInsights?: InsightSummary[];
    } = {}
  ): Effect.Effect<BuiltPrompt, PromptBuildError> =>
    Effect.try({
      try: () => {
        const playContext = kexpPlayToPlayContext(play);

        const showContext = options.show
          ? kexpShowToShowContext(options.show)
          : undefined;

        // Build prompt context - use play's airdate for temporal reasoning
        // so "tonight" in DJ comments resolves relative to when the music aired
        const promptContext: PromptContext = {
          currentTime: new Date(playContext.airdate),
          playData: playContext,
          ...(showContext ? { showContext } : {}),
          ...(options.recentInsights
            ? { recentInsights: options.recentInsights }
            : {}),
        };

        const systemPromptObj = CratePrompt.buildSystemPrompt(promptContext);
        const systemPrompt = extractSystemText(systemPromptObj);
        const userMessage = buildPlayMessage(playContext);

        const hasDjBio =
          showContext?.hostNames.some((name) =>
            Option.isSome(assets.findDjBio(name))
          ) ?? false;

        // Build metadata
        const metadata: BuiltPromptMetadata = {
          playId: play.id,
          artist: play.artist || "Unknown Artist",
          track: play.song || "Unknown Track",
          hasComment: !!play.comment,
          hasDjBio,
          ...(showContext?.programName
            ? { showName: showContext.programName }
            : {}),
          ...(showContext?.hostNames
            ? { hostNames: showContext.hostNames }
            : {}),
        };

        return {
          systemPrompt,
          userMessage,
          metadata,
        } satisfies BuiltPrompt;
      },
      catch: (error) =>
        new PromptBuildError({
          message: "Failed to build prompt for KEXP play",
          cause: error,
        }),
    });

  const buildPromptForKexpPlay = (
    play: Kexp.KexpTrackPlay,
    options: {
      show?: Kexp.KexpShow;
      recentInsights?: InsightSummary[];
    } = {}
  ): Effect.Effect<Prompt.Prompt, PromptBuildError> =>
    pipe(
      Effect.try({
        try: () => {
          const playContext = kexpPlayToPlayContext(play);

          const showContext = options.show
            ? kexpShowToShowContext(options.show)
            : undefined;

          // Use play's airdate for temporal reasoning so "tonight" in DJ
          // comments resolves relative to when the music aired
          const promptContext: PromptContext = {
            currentTime: new Date(playContext.airdate),
            playData: playContext,
            ...(showContext ? { showContext } : {}),
            ...(options.recentInsights
              ? { recentInsights: options.recentInsights }
              : {}),
          };

          // Build system prompt using CratePrompt
          const systemPrompt = CratePrompt.buildSystemPrompt(promptContext);

          // Merge with user message using Prompt.merge
          return pipe(
            systemPrompt,
            Prompt.merge(
              Prompt.make([
                {
                  role: "user",
                  content: [
                    { type: "text", text: buildPlayMessage(playContext) },
                  ],
                },
              ])
            )
          );
        },
        catch: (error) =>
          new PromptBuildError({
            message: "Failed to build @effect/ai prompt for KEXP play",
            cause: error,
          }),
      }),
      Effect.tap(() =>
        Effect.annotateCurrentSpan({
          play_id: play.id,
          artist: play.artist ?? "Unknown",
          has_show: !!options.show,
        })
      ),
      Effect.withSpan("PromptBuilder.buildPromptForKexpPlay")
    );

  return {
    buildForPlay,
    buildForKexpPlay,
    buildPromptForKexpPlay,
    getDjBio: (name: string) =>
      Effect.succeed(Option.getOrUndefined(assets.findDjBio(name))),
    getShowDescription: (name: string) =>
      Effect.succeed(Option.getOrUndefined(assets.findShowDescription(name))),
    getAllDjBios: () => Effect.succeed(assets.djBios),
    getAllShowDescriptions: () => Effect.succeed(assets.showDescriptions),
  } satisfies PromptBuilderServiceInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for PromptBuilderService
 * Requires Assets service
 */
export const PromptBuilderServiceLive: Layer.Layer<
  PromptBuilderService,
  never,
  Assets
> = Layer.effect(PromptBuilderService, makePromptBuilderService);

/**
 * Fully composed layer with all dependencies (Assets)
 * This is what you use to provide the service.
 * Uses Layer.provideMerge to properly compose layers.
 */
export const PromptBuilderServiceFull: Layer.Layer<PromptBuilderService> =
  Layer.provideMerge(PromptBuilderServiceLive, AssetsLive);

/**
 * Test layer with mock implementation
 */
export const PromptBuilderServiceTest: Layer.Layer<PromptBuilderService> =
  Layer.succeed(PromptBuilderService, {
    buildForPlay: (play, _options) =>
      Effect.succeed({
        systemPrompt: "TEST_SYSTEM_PROMPT",
        userMessage: buildPlayMessage(play),
        metadata: {
          playId: play.id,
          artist: play.artist,
          track: play.track,
          hasComment: !!play.comment,
          hasDjBio: false,
        },
      } satisfies BuiltPrompt),

    buildForKexpPlay: (play, _options) =>
      Effect.succeed({
        systemPrompt: "TEST_SYSTEM_PROMPT",
        userMessage: buildPlayMessage(kexpPlayToPlayContext(play)),
        metadata: {
          playId: play.id,
          artist: play.artist || "Unknown",
          track: play.song || "Unknown",
          hasComment: !!play.comment,
          hasDjBio: false,
        },
      } satisfies BuiltPrompt),

    buildPromptForKexpPlay: (play, _options) =>
      Effect.succeed(
        Prompt.make([
          { role: "system", content: "TEST_SYSTEM_PROMPT" },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildPlayMessage(kexpPlayToPlayContext(play)),
              },
            ],
          },
        ])
      ),

    getDjBio: () => Effect.succeed(undefined),
    getShowDescription: () => Effect.succeed(undefined),
    getAllDjBios: () => Effect.succeed([]),
    getAllShowDescriptions: () => Effect.succeed([]),
  } satisfies PromptBuilderServiceInterface);

// =============================================================================
// Re-exports for backwards compatibility
// =============================================================================

export { type DjBio, type ShowDescription } from "./Assets.js";
export type {
  PlayContext,
  ShowContext,
  SimpleShowContext,
  InsightSummary,
  PromptContext,
} from "../prompts/system-prompt.js";
