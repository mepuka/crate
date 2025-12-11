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
  )
);
