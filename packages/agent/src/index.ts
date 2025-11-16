/**
 * @crate/agent
 *
 * AI Agent for interacting with the FAISS search API
 */

import { Layer } from "effect"
import { FaissClientLive } from "./FaissClient.js"
import { MusicAgentLive } from "./MusicAgent.js"

// Export individual services
export * from "./FaissClient.js"
export * from "./MusicAgent.js"

/**
 * Complete agent application layer with all dependencies
 */
export const AgentAppLive = Layer.mergeAll(
  FaissClientLive,
  MusicAgentLive
)
