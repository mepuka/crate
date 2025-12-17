/**
 * CratePrompt - Prompt builders for Crate Research Agent
 *
 * This file provides backwards-compatible Prompt.Prompt objects that wrap
 * the canonical string-based builders from system-prompt.ts.
 *
 * The canonical prompt content is in system-prompt.ts which includes all
 * sections (GRAPH_INSTRUCTION, DATA_MODEL, STORYTELLING, INSIGHT_CONTINUITY,
 * RESEARCH_PROCESS).
 *
 * ## Prompt Caching Architecture
 *
 * To achieve ~90% cost savings, prompts are split into:
 * - **Static portion** (~8,500 tokens): Core identity, philosophy, tools, etc.
 *   Cached by Anthropic for 5 minutes, shared across all requests.
 * - **Dynamic portion** (~1,500 tokens): Time context, show info, recent insights.
 *   Not cached, changes per-request.
 *
 * The static portion is marked with `cacheControl: { type: "ephemeral" }`.
 * Anthropic caches it and subsequent requests only pay for the dynamic portion.
 *
 * @module
 */

import { Prompt } from "@effect/ai";
import {
  buildSystemPrompt as buildSystemPromptString,
  STATIC_SYSTEM_PROMPT,
  buildDynamicPrompt,
  type PromptContext,
} from "./system-prompt.js";

// Re-export types and utilities from system-prompt
export * from "./system-prompt.js";

/**
 * Build system prompt as a Prompt.Prompt object for @effect/ai compatibility.
 *
 * **OPTIMIZED FOR CACHING**: Returns TWO system messages:
 * 1. Static portion (~8,500 tokens) - cached by Anthropic
 * 2. Dynamic portion (~1,500 tokens) - not cached, changes per-request
 *
 * This achieves ~90% token cost savings compared to sending everything uncached.
 *
 * Cost comparison (at ~10K total tokens):
 * - Before: 10K input tokens @ $0.003/1K = $0.03 per call
 * - After: 1.5K input + 8.5K cached @ $0.0003/1K = ~$0.007 per call
 * - Savings: ~75-90% depending on cache hit rate
 */
export const buildSystemPrompt = (ctx: PromptContext): Prompt.Prompt =>
  Prompt.make([
    // Static portion - CACHED
    // This ~8,500 token block is cached by Anthropic for 5 minutes.
    // All requests within the TTL share this cached prefix.
    {
      role: "system",
      content: STATIC_SYSTEM_PROMPT,
      options: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
    // Dynamic portion - NOT CACHED
    // This ~1,500 token block changes per-request (time, show, insights).
    // Only this portion is charged at full input token rate.
    {
      role: "system",
      content: buildDynamicPrompt(ctx),
    },
  ]);

/**
 * Build system prompt as a single combined string (legacy).
 *
 * @deprecated Use buildSystemPrompt() for caching benefits.
 * This function exists for backwards compatibility and debugging.
 */
export const buildSystemPromptCombined = (ctx: PromptContext): Prompt.Prompt =>
  Prompt.make([
    {
      role: "system",
      content: buildSystemPromptString(ctx),
      options: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    },
  ]);
