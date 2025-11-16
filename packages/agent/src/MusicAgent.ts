/**
 * Music Agent Service
 *
 * AI agent that can search for music using natural language queries.
 * Simple implementation that directly searches FAISS API.
 */

import { Effect } from "effect"
import { SearchParams } from "@crate/domain/faiss/schemas"
import { FaissClient } from "./FaissClient.js"

/**
 * Music Agent service
 *
 * This is a simple implementation that directly searches FAISS.
 * For full AI-powered conversation, integrate with @effect/ai OpenAI provider.
 */
export class MusicAgent extends Effect.Service<MusicAgent>()("MusicAgent", {
  effect: Effect.gen(function* () {
    const faissClient = yield* FaissClient

    return {
      /**
       * Ask the agent a question about music and get a response
       */
      ask: (question: string) =>
        Effect.gen(function* () {
          // For now, use the question directly as a search query
          // In a full implementation, you would use OpenAI to:
          // 1. Parse the question to extract search intent
          // 2. Call the search tool
          // 3. Format results into a natural language response

          const searchRequest = new SearchParams({
            query: question,
            limit: 5,
            offset: 0
          })

          const results = yield* faissClient.search(searchRequest)

          // Format results into a simple response
          if (results.results.length === 0) {
            return `I couldn't find any tracks matching "${question}". Try a different search term.`
          }

          const formatted = results.results
            .map(
              (play, i) =>
                `${i + 1}. "${play.song}" by ${play.artist}` +
                (play.album ? ` (from "${play.album}")` : "") +
                ` - Aired: ${play.airdate.toLocaleDateString()}`
            )
            .join("\n")

          return `Found ${results.results.length} tracks matching "${question}":\n\n${formatted}\n\n(Query took ${results.query_time_ms}ms)`
        })
    }
  }),
  dependencies: [FaissClient.Default]
}) {}

/**
 * Music Agent layer with all dependencies
 */
export const MusicAgentLive = MusicAgent.Default
