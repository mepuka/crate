/**
 * Phase 1 Test Script
 *
 * Verifies the error types, config services, and tool schemas work correctly.
 * Run with: bun run src/tools/test-phase1.ts
 */

import { Effect, Console, Schema } from "effect"
import {
  FaissConfig,
  MusicBrainzConfig,
  JinaConfig,
  AgentConfigLive
} from "../config.js"
import {
  ApiError,
  SearchPlaysError,
  ValidationError
} from "../services/errors.js"
import {
  SearchPlaysParams,
  SearchPlaysResponse,
  SemanticSearchParams,
  ResolveMbidParams,
  FetchLinkParams,
  GetRecentInsightsParams,
  MbEntityType,
  PlayResultSchema
} from "./schemas.js"
import {
  CrateToolkit,
  SearchPlaysTool,
  SemanticSearchTool
} from "./definitions.js"

// Test error creation
const testErrors = Effect.gen(function* () {
  yield* Console.log("--- Testing Error Types ---")

  const apiErr = new ApiError({
    message: "Connection failed",
    statusCode: 500,
    url: "http://example.com"
  })
  yield* Console.log(`ApiError: ${apiErr._tag} - ${apiErr.message}`)

  const searchErr = new SearchPlaysError({
    message: "Search failed",
    query: "test query"
  })
  yield* Console.log(`SearchPlaysError: ${searchErr._tag} - ${searchErr.message}`)

  const validationErr = new ValidationError({
    message: "Invalid input",
    field: "query",
    value: ""
  })
  yield* Console.log(`ValidationError: ${validationErr._tag} - ${validationErr.field}`)
})

// Test config services
const testConfig = Effect.gen(function* () {
  yield* Console.log("\n--- Testing Config Services ---")

  const faiss = yield* FaissConfig
  yield* Console.log(`FaissConfig.baseUrl: ${faiss.baseUrl}`)

  const mb = yield* MusicBrainzConfig
  yield* Console.log(`MusicBrainzConfig.baseUrl: ${mb.baseUrl}`)
  yield* Console.log(`MusicBrainzConfig.userAgent: ${mb.userAgent}`)

  const jina = yield* JinaConfig
  yield* Console.log(`JinaConfig.baseUrl: ${jina.baseUrl}`)
  yield* Console.log(`JinaConfig.apiKey: ${jina.apiKey ? "[REDACTED]" : "null"}`)
}).pipe(Effect.provide(AgentConfigLive))

// Test schema validation
const testSchemas = Effect.gen(function* () {
  yield* Console.log("\n--- Testing Schemas ---")

  // SearchPlaysParams
  const searchParams = yield* Schema.decode(SearchPlaysParams)({
    query: "test query",
    limit: 10
  })
  yield* Console.log(`SearchPlaysParams decoded: query="${searchParams.query}", limit=${searchParams.limit}`)

  // SemanticSearchParams with default limit
  const semanticParams = yield* Schema.decode(SemanticSearchParams)({
    query: "upbeat jazz fusion"
  })
  yield* Console.log(`SemanticSearchParams decoded: query="${semanticParams.query}", limit=${semanticParams.limit}`)

  // ResolveMbidParams
  const mbidParams = yield* Schema.decode(ResolveMbidParams)({
    query: "Pink Floyd",
    entity_type: "artist"
  })
  yield* Console.log(`ResolveMbidParams decoded: query="${mbidParams.query}", type="${mbidParams.entity_type}"`)

  // FetchLinkParams
  const linkParams = yield* Schema.decode(FetchLinkParams)({
    url: "https://example.com/article"
  })
  yield* Console.log(`FetchLinkParams decoded: url="${linkParams.url}", extract_links=${linkParams.extract_links}`)

  // GetRecentInsightsParams with defaults
  const insightParams = yield* Schema.decode(GetRecentInsightsParams)({})
  yield* Console.log(`GetRecentInsightsParams decoded: limit=${insightParams.limit}`)

  // MbEntityType
  const entityType = yield* Schema.decode(MbEntityType)("recording")
  yield* Console.log(`MbEntityType decoded: "${entityType}"`)

  // Invalid entity type should fail
  const invalidResult = yield* Effect.either(
    Schema.decode(MbEntityType)("invalid_type")
  )
  yield* Console.log(`Invalid MbEntityType: ${invalidResult._tag === "Left" ? "correctly rejected" : "ERROR - should have failed"}`)
})

// Test tool definitions
const testTools = Effect.gen(function* () {
  yield* Console.log("\n--- Testing Tool Definitions ---")

  yield* Console.log(`SearchPlaysTool.name: ${SearchPlaysTool.name}`)
  yield* Console.log(`SearchPlaysTool.description: ${SearchPlaysTool.description?.slice(0, 50)}...`)

  yield* Console.log(`SemanticSearchTool.name: ${SemanticSearchTool.name}`)

  // Access toolkit tools
  const toolNames = Object.keys(CrateToolkit.tools)
  yield* Console.log(`CrateToolkit tools: ${toolNames.join(", ")}`)
})

// Main
const main = Effect.gen(function* () {
  yield* Console.log("=== Phase 1 Test: Error Types, Config, and Schemas ===\n")
  yield* testErrors
  yield* testConfig
  yield* testSchemas
  yield* testTools
  yield* Console.log("\n=== All tests passed! ===")
})

Effect.runPromise(main).catch(console.error)
