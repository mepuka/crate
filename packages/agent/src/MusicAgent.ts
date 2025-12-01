/**
 * Music Agent Service
 *
 * AI agent that can search for music using natural language queries.
 * Simple implementation that directly searches FAISS API.
 */

import { DateTime, Effect } from "effect";
import {
  EnrichmentItem,
  EnrichmentRequest,
  HelloWorldEnrichment,
  SearchParams,
} from "@crate/domain/faiss/schemas";
import { FaissClient } from "./FaissClient.js";

/**
 * Music Agent service
 *
 * This is a simple implementation that directly searches FAISS.
 * For full AI-powered conversation, integrate with @effect/ai OpenAI provider.
 */
export class MusicAgent extends Effect.Service<MusicAgent>()("MusicAgent", {
  effect: Effect.gen(function* () {
    const faissClient = yield* FaissClient;

    return {
      /**
       * Ask the agent a question about music and get a response
       */
      ask: (question: string) => Effect.gen(function* () {

        

      }),

      /**
       * Enrich plays with hello world data
       */
      enrichPlays: (playIds: number[]) =>
        Effect.gen(function* () {
          yield* Effect.log(`Starting enrichment for ${playIds.length} plays`);

          // 1. Fetch play data from FAISS API
          const { plays } = yield* faissClient.getPlaysBatch(playIds);

          // 2. Generate hello world enrichments
          const enrichments = plays.map(
            (play: any) =>
              new EnrichmentItem({
                play_id: play.id,
                data: new HelloWorldEnrichment({
                  status: "processed",
                  timestamp: DateTime.formatIsoDateUtc(DateTime.unsafeNow()),
                  message: "Hello from Cloud Run agent!",
                  agent_version: "0.1.0",
                }),
              })
          );

          // 3. POST enrichments back to FAISS API
          const response = yield* faissClient.postEnrichments(
            new EnrichmentRequest({
              enrichment_type: "hello_world",
              enrichments,
            })
          );

          yield* Effect.log(`Successfully enriched ${response.count} plays`);
          return response;
        }),
    } as const;
  }),
  dependencies: [FaissClient.Default],
}) {}

/**
 * Music Agent layer with all dependencies
 */
export const MusicAgentLive = MusicAgent.Default;
