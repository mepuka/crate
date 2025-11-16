/**
 * HTTP Server Entry Point
 *
 * Composes all layers and runs the HTTP server
 */

import { Layer } from "effect";
import { HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import { router } from "./router.js";
import { AgentAppLive } from "./index.js";

// Create the NodeHttpServer layer first
const ServerLive = NodeHttpServer.layer(() => createServer(), { port: 8080 });

// Create the HTTP server layer
// Pattern: router.pipe(HttpServer.serve, HttpServer.withLogAddress, Layer.provideMerge(deps))
const HttpLive = router.pipe(
  HttpServer.serve(), // Converts router to a Layer requiring HttpServer + router deps
  HttpServer.withLogAddress, // Logs the server address on startup
  Layer.provideMerge(ServerLive), // Provides HttpServer + HttpPlatform
  Layer.provideMerge(AgentAppLive) // Provides MusicAgent + FaissClient + HttpClient + Config
);

// Launch the server as a layer
NodeRuntime.runMain(Layer.launch(HttpLive));
