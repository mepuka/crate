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
 * @module
 */

import { Prompt } from "@effect/ai";
import {
  buildSystemPrompt as buildSystemPromptString,
  type PromptContext,
} from "./system-prompt.js";

// Re-export types and utilities from system-prompt
export * from "./system-prompt.js";

/**
 * Build system prompt as a Prompt.Prompt object for @effect/ai compatibility.
 *
 * This wraps the canonical buildSystemPrompt from system-prompt.ts
 * (which returns a string) into a Prompt.Prompt object.
 *
 * Uses Anthropic's prompt caching for the system message to reduce costs
 * (~90% savings on repeated prompts within 5 minute TTL).
 */
export const buildSystemPrompt = (ctx: PromptContext): Prompt.Prompt =>
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
