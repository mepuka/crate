/**
 * HTTP Router for Agent Service
 *
 * Defines all HTTP endpoints for the agent
 */

import { Effect, Schema } from "effect";
import { Buffer } from "node:buffer";
import {
  HttpRouter,
  HttpServerResponse,
  HttpServerRequest,
} from "@effect/platform";
import { MusicAgent } from "./MusicAgent.js";
import { EnrichmentTrigger } from "@crate/domain/faiss/schemas";
import { PubSubConfig } from "./config.js";
import { PubSubAuthError, PubSubDecodeError } from "./services/errors.js";
import { FaissClient } from "./FaissClient.js";

const PubSubEnvelope = Schema.Struct({
  message: Schema.Struct({
    data: Schema.String,
    messageId: Schema.optional(Schema.String),
    publishTime: Schema.optional(Schema.String),
    attributes: Schema.optional(Schema.Unknown),
  }),
  subscription: Schema.optional(Schema.String),
});

const PubSubHeaders = Schema.Struct({
  "x-goog-authenticated-identity": Schema.optional(Schema.String),
});

const decodeTrigger = Schema.decodeUnknown(EnrichmentTrigger);

const verifyPubSubCaller = (
  expectedEmail: string | null,
  identityHeader: string | undefined
) =>
  expectedEmail === null
    ? Effect.succeed<void>(undefined)
    : identityHeader?.includes(expectedEmail)
      ? Effect.succeed<void>(undefined)
      : Effect.fail(
          new PubSubAuthError({
            message: "Unauthorized Pub/Sub caller",
            ...(identityHeader ? { identity: identityHeader } : {}),
          })
        );

const parsePubSubPayload = (envelope: typeof PubSubEnvelope.Type) =>
  Effect.gen(function* () {
    const decoded = yield* Effect.try({
      try: () => Buffer.from(envelope.message.data, "base64").toString("utf8"),
      catch: (cause) =>
        new PubSubDecodeError({
          message: "Failed to base64 decode Pub/Sub message data",
          cause,
        }),
    });

    const parsed = yield* Effect.try({
      try: () => JSON.parse(decoded),
      catch: (cause) =>
        new PubSubDecodeError({
          message: "Pub/Sub message data is not valid JSON",
          cause,
        }),
    });

    const trigger = yield* decodeTrigger(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new PubSubDecodeError({
            message: "Pub/Sub payload failed enrichment schema validation",
            cause,
          })
      )
    );

    return {
      trigger,
      raw: parsed,
      envelope,
    };
  });

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
  HttpRouter.post(
    "/pubsub",
    Effect.gen(function* () {
      const config = yield* PubSubConfig;
      const headers = yield* HttpServerRequest.schemaHeaders(PubSubHeaders);
      const envelope = yield* HttpServerRequest.schemaBodyJson(PubSubEnvelope);

      yield* verifyPubSubCaller(
        config.invokerEmail,
        headers["x-goog-authenticated-identity"]
      );

      const { trigger, envelope: rawEnvelope } =
        yield* parsePubSubPayload(envelope);

      yield* Effect.logInfo(
        `Received Pub/Sub new-play trigger messageId=${rawEnvelope.message.messageId ?? "unknown"} count=${trigger.play_ids.length}`
      );

      const agent = yield* MusicAgent;
      const result = yield* agent.enrichPlays([...trigger.play_ids]);

      return yield* HttpServerResponse.json({
        status: "completed",
        play_ids: trigger.play_ids,
        count: result.count,
      });
    }).pipe(
      Effect.catchTag("PubSubAuthError", (error) =>
        HttpServerResponse.json(
          { status: "unauthorized", message: error.message },
          { status: 403 }
        )
      ),
      Effect.catchTag("PubSubDecodeError", (error) =>
        HttpServerResponse.json(
          { status: "invalid_message", message: error.message },
          { status: 400 }
        )
      ),
      Effect.catchAll((error) =>
        HttpServerResponse.json(
          { status: "error", message: "Failed to process Pub/Sub event" },
          { status: 500 }
        )
      )
    )
  ),
  HttpRouter.get(
    "/health",
    Effect.gen(function* () {
      return yield* HttpServerResponse.json({ status: "ok" });
    })
  ),
  // Cloud Scheduler endpoint - auto-select and enrich unprocessed plays
  HttpRouter.post(
    "/enrich-batch",
    Effect.gen(function* () {
      // Parse optional query params from request
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.url, "http://localhost");
      const limitParam = url.searchParams.get("limit");
      const strategyParam = url.searchParams.get("strategy");

      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      const strategy = (strategyParam as "oldest_first" | "newest_first" | "random") || "oldest_first";

      // Validate limit
      if (isNaN(limit) || limit < 1 || limit > 50) {
        return yield* HttpServerResponse.json(
          { status: "error", message: "Limit must be between 1 and 50" },
          { status: 400 }
        );
      }

      yield* Effect.logInfo(
        `Enrich batch: fetching up to ${limit} unprocessed plays (strategy: ${strategy})`
      );

      // Get unprocessed plays from FAISS API
      const faiss = yield* FaissClient;
      const unprocessedResult = yield* faiss.getUnprocessedPlays(limit, strategy);

      if (unprocessedResult.count === 0) {
        yield* Effect.logInfo("No unprocessed plays found");
        return yield* HttpServerResponse.json({
          status: "completed",
          message: "No unprocessed plays to enrich",
          count: 0,
          total_unprocessed: unprocessedResult.total_unprocessed,
        });
      }

      yield* Effect.logInfo(
        `Found ${unprocessedResult.count} unprocessed plays (total pending: ${unprocessedResult.total_unprocessed})`
      );

      // Run enrichment on the selected plays
      const agent = yield* MusicAgent;
      const result = yield* agent.enrichPlays([...unprocessedResult.play_ids]);

      yield* Effect.logInfo(
        `Batch enrichment complete: processed ${result.count} plays`
      );

      return yield* HttpServerResponse.json({
        status: "completed",
        play_ids: [...unprocessedResult.play_ids],
        count: result.count,
        total_unprocessed: unprocessedResult.total_unprocessed - unprocessedResult.count,
        strategy: unprocessedResult.strategy,
      });
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logError(`Batch enrichment failed: ${error}`);
          return yield* HttpServerResponse.json(
            { status: "error", message: "Batch enrichment failed" },
            { status: 500 }
          );
        })
      )
    )
  )
);
