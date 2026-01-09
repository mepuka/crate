/**
 * HTTP Server Entry Point
 *
 * Composes all layers and runs the HTTP server
 */

import { Effect, Layer } from "effect";
import { HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { router } from "./router.js";
import { AgentAppLive } from "./index.js";
import { ServerConfig } from "./config.js";

// Create the NodeHttpServer layer from ServerConfig
// Uses Layer.unwrapEffect to access config before building the server layer
const ServerLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const { port } = yield* ServerConfig;
    return NodeHttpServer.layer(() => createServer(), { port });
  })
);

// Create the HTTP server layer
// Pattern: router.pipe(HttpServer.serve, HttpServer.withLogAddress, Layer.provideMerge(deps))
const HttpLive = router.pipe(
  HttpServer.serve(), // Converts router to a Layer requiring HttpServer + router deps
  HttpServer.withLogAddress, // Logs the server address on startup
  Layer.provideMerge(ServerLive), // Provides HttpServer + HttpPlatform (requires ServerConfig)
  Layer.provideMerge(AgentAppLive), // Provides MusicAgent + FaissClient + HttpClient + Config
  Layer.provide(ServerConfig.Default) // Provides ServerConfig
);

// Launch the server as a layer
NodeRuntime.runMain(Layer.launch(HttpLive));
