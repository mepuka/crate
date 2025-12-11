// KEXP types and schemas
export * as Kexp from "./kexp/schemas.js"

// FAISS API types and schemas
export * as Faiss from "./faiss/schemas.js"

// Events domain (venues, festivals, shows)
export * as Events from "./events/index.js"

// NLP
export * as Nlp from "./nlp/index.js"

// Streaming links (Spotify, Apple Music, etc.)
export * as Streaming from "./links/streaming.js"

// Graph schemas (relations, edges, queries)
export * as Graph from "./graph/schemas.js"

// Re-export commonly used graph types for direct import
export {
  GraphQueryType,
  GraphConnectionsRequest,
  GraphConnectionsResponse,
  ConnectionNode
} from "./graph/schemas.js"

// CSV utilities (not exported by default to prevent bundling into workers)
// Import directly from "@crate/domain/csv/parseLines" if needed

// Insights ("Living Liner Notes")
export * as Insights from "./insights.js"
