/**
 * MCP Server for Crate Research Agent
 *
 * Exposes the Crate tools via Model Context Protocol (MCP).
 * Supports both stdio transport (for Claude Desktop) and HTTP transport.
 *
 * @effect-hook-ignore
 * Note: Layer.provide usage here is correct - we're providing individual layers
 * to effects, not providing merged layers to other merged layers.
 *
 * @module
 */

import { Effect, Layer, Logger, ConfigProvider } from "effect"
import { NodeRuntime, NodeStream, NodeSink } from "@effect/platform-node"
import { McpServer } from "@effect/ai"

import { CrateToolkit } from "../tools/definitions.js"
import { CrateToolHandlersLayer } from "../tools/handlers.js"
import { ServicesFull } from "../layers.js"

// =============================================================================
// Server Configuration
// =============================================================================

/**
 * MCP Server metadata
 */
export const SERVER_INFO = {
  name: "crate-research-agent",
  version: "1.0.0"
} as const

// =============================================================================
// Stdio Server Layer
// =============================================================================

/**
 * Tool handlers with services wired
 */
const HandlersWithServices = CrateToolHandlersLayer.pipe(
  Layer.provide(ServicesFull)
)

/**
 * MCP Server layer using stdio transport
 *
 * This is the primary transport for Claude Desktop integration.
 * Communicates via stdin/stdout using newline-delimited JSON-RPC.
 *
 * Usage:
 * ```ts
 * Layer.launch(CrateMcpServerStdio).pipe(NodeRuntime.runMain)
 * ```
 */
export const CrateMcpServerStdio: Layer.Layer<never> = McpServer.toolkit(CrateToolkit).pipe(
  // Provide toolkit handlers with services
  Layer.provide(HandlersWithServices),
  // Provide MCP server with stdio transport
  Layer.provide(
    McpServer.layerStdio({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      stdin: NodeStream.stdin,
      stdout: NodeSink.stdout
    })
  ),
  // Add stderr logger (stdout is reserved for MCP protocol)
  Layer.provide(Logger.add(Logger.prettyLogger({ stderr: true })))
)

// =============================================================================
// HTTP Server Layer (optional)
// =============================================================================

/**
 * MCP Server layer using HTTP transport
 *
 * Alternative transport for web-based integrations.
 * Requires an HTTP server to be provided.
 *
 * Usage:
 * ```ts
 * import { NodeHttpServer } from "@effect/platform-node"
 * import { createServer } from "node:http"
 *
 * const ServerLayer = CrateMcpServerHttp("/mcp").pipe(
 *   Layer.provide(HttpRouter.Default.serve()),
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 }))
 * )
 *
 * Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)
 * ```
 */
export const CrateMcpServerHttp = (path: string = "/mcp"): Layer.Layer<
  McpServer.McpServer | McpServer.McpServerClient
> =>
  McpServer.toolkit(CrateToolkit).pipe(
    // Provide toolkit handlers with services
    Layer.provide(HandlersWithServices),
    // Provide MCP server with HTTP transport
    Layer.provide(
      McpServer.layerHttp({
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        path
      })
    )
  )

// =============================================================================
// Server Runner
// =============================================================================

/**
 * Run the MCP server with stdio transport
 *
 * This function starts the server and runs until interrupted.
 * Configuration is read from environment variables.
 *
 * Environment variables:
 * - FAISS_API_URL: FAISS API base URL (default: http://localhost:8000)
 * - MUSICBRAINZ_USER_AGENT: User-Agent for MusicBrainz API
 * - JINA_API_KEY: Optional API key for Jina Reader
 */
export const runStdio = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Starting ${SERVER_INFO.name} v${SERVER_INFO.version}`)
    yield* Effect.logInfo("MCP Server ready on stdio")

    // The layer launch keeps the server running
    yield* Layer.launch(CrateMcpServerStdio)
  }).pipe(
    // Use environment variables for configuration
    Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv()))
  )

/**
 * Main entry point for stdio server
 *
 * Run directly with:
 * ```bash
 * bun run src/mcp/server.ts
 * ```
 */
export const main = (): void => {
  runStdio().pipe(NodeRuntime.runMain)
}

// =============================================================================
// Claude Desktop Configuration Helper
// =============================================================================

/**
 * Get the Claude Desktop configuration for this MCP server
 *
 * Add this to your Claude Desktop config file:
 * - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
 * - Windows: %APPDATA%\Claude\claude_desktop_config.json
 *
 * @param serverPath - Absolute path to the server entry point
 * @returns Configuration object for claude_desktop_config.json
 */
export const getClaudeDesktopConfig = (serverPath: string): object => ({
  mcpServers: {
    "crate-research-agent": {
      command: "bun",
      args: ["run", serverPath],
      env: {
        FAISS_API_URL: "http://localhost:8000",
        MUSICBRAINZ_USER_AGENT: "Crate/1.0 (https://github.com/crate-music)"
      }
    }
  }
})

// Run if this file is executed directly
// Check if running as main module (Bun/Node ESM)
const isMain = typeof process !== "undefined" &&
  process.argv[1]?.endsWith("server.ts")

if (isMain) {
  main()
}
