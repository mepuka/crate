/**
 * HTTP Server for Agent Service
 *
 * Provides /enrich endpoint for triggering play enrichments
 */

import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse, HttpServerRequest } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import { AgentAppLive } from "./index.js"
import { MusicAgent } from "./MusicAgent.js"
import { EnrichmentTrigger } from "@crate/domain/faiss/schemas"

// Create router with /enrich endpoint
const router = HttpRouter.empty.pipe(
  HttpRouter.post("/enrich",
    Effect.gen(function* () {
      // Parse request body
      const body = yield* HttpServerRequest.schemaBodyJson(EnrichmentTrigger)

      yield* Effect.log(`Received enrichment request for ${body.play_ids.length} plays`)

      // Get agent and trigger enrichment (fire and forget)
      const agent = yield* MusicAgent
      yield* Effect.forkDaemon(agent.enrichPlays([...body.play_ids]))

      // Return immediately (async processing)
      return yield* HttpServerResponse.json({
        status: "processing",
        play_ids: body.play_ids
      })
    })
  ),
  HttpRouter.get("/health",
    Effect.gen(function* () {
      return yield* HttpServerResponse.json({ status: "ok" })
    })
  )
)

// Create server layer
const ServerLive = HttpServer.serve(router).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 8080 }))
)

// Main program
const program = Effect.gen(function* () {
  yield* Effect.log("Starting agent HTTP server on port 8080...")
  yield* Effect.never
})

// Run server with all dependencies
NodeRuntime.runMain(
  program.pipe(
    Effect.provide(ServerLive),
    Effect.provide(AgentAppLive)
  )
)
