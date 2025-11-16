/**
 * @crate/agent
 *
 * AI Agent for interacting with the FAISS search API
 */

import { Layer } from "effect"
import { NodeHttpClient } from "@effect/platform-node"
import { FaissConfig, FaissClient } from "./FaissClient.js"
import { MusicAgent } from "./MusicAgent.js"

// Export individual services
export * from "./FaissClient.js"
export * from "./MusicAgent.js"

/**
 * Complete agent runtime with all dependencies resolved
 */
export const AgentAppLive = Layer.mergeAll(
  FaissConfig.Default,
  NodeHttpClient.layerUndici,
  FaissClient.Default,
  MusicAgent.Default
)
