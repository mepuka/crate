/**
 * HTTP Router for Agent Service
 *
 * Defines all HTTP endpoints for the agent
 */

import { Effect } from "effect";
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
} from "@effect/platform";
import { MusicAgent } from "./MusicAgent.js";
import { EnrichmentTrigger } from "@crate/domain/faiss/schemas";

// Create router with /enrich endpoint
export const router = HttpRouter.empty.pipe(
  HttpRouter.post(
    "/enrich",
    Effect.gen(function* () {
      // Parse request body
      const body = yield* HttpServerRequest.schemaBodyJson(EnrichmentTrigger);

      yield* Effect.log(
        `Received enrichment request for ${body.play_ids.length} plays`
      );

      // Get agent and run enrichment synchronously (Cloud Run waits for completion)
      const agent = yield* MusicAgent;
      const result = yield* agent.enrichPlays([...body.play_ids]);

      // Return after processing is complete
      return yield* HttpServerResponse.json({
        status: "completed",
        play_ids: body.play_ids,
        count: result.count,
      });
    })
  ),
  HttpRouter.get(
    "/health",
    Effect.gen(function* () {
      return yield* HttpServerResponse.json({ status: "ok" });
    })
  )
);
