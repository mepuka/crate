import { Prompt } from "@effect/ai";
import {
  CORE_IDENTITY,
  PHILOSOPHY,
  TONE,
  KEXP_CULTURE,
  KEXP_DJ_COMMENT_PATTERNS,
  KEXP_ROTATION,
  MBID_INSTRUCTION,
  INSIGHT_TYPES,
  TOOLS,
  GUIDELINES,
  TEMPORAL_REASONING,
  CONFIDENCE,
  CONSTRAINTS,
  formatTimeContext,
  formatShowContext,
  formatRecentInsights,
  type PromptContext,
  type ShowContext,
  type SimpleShowContext,
  type InsightSummary,
} from "./system-prompt.js";

/**
 * Separator for system prompt sections
 */
const SEP = "\n\n---\n\n";

/**
 * Base System Prompt
 * Contains the static identity, philosophy, and KEXP culture sections.
 */
export const BaseSystemPrompt = Prompt.make([
  {
    role: "system",
    content: [
      CORE_IDENTITY,
      PHILOSOPHY,
      TONE,
      KEXP_CULTURE,
      KEXP_DJ_COMMENT_PATTERNS,
      KEXP_ROTATION,
    ].join(SEP),
  },
]);

/**
 * Technical Instructions Prompt
 * Contains MBID instructions, insight types, tools, and guidelines.
 * This is usually appended after the dynamic context.
 */
export const TechnicalInstructionsPrompt = [
  MBID_INSTRUCTION,
  INSIGHT_TYPES,
  TOOLS,
  GUIDELINES,
  TEMPORAL_REASONING,
  CONFIDENCE,
  CONSTRAINTS,
].join(SEP);

/**
 * Append time context to the prompt
 */
export const appendTimeContext = (time: Date) => (prompt: Prompt.Prompt) =>
  Prompt.appendSystem(prompt, SEP + formatTimeContext(time));

/**
 * Append show context to the prompt
 */
export const appendShowContext =
  (show: ShowContext | SimpleShowContext | undefined) =>
  (prompt: Prompt.Prompt) => {
    if (!show) return prompt;
    return Prompt.appendSystem(prompt, SEP + formatShowContext(show));
  };

/**
 * Append recent insights context to the prompt
 */
export const appendRecentInsights =
  (insights: InsightSummary[] | undefined) => (prompt: Prompt.Prompt) => {
    if (!insights) return prompt;
    return Prompt.appendSystem(prompt, SEP + formatRecentInsights(insights));
  };

/**
 * Append technical instructions to the prompt
 */
export const appendTechnicalInstructions = (prompt: Prompt.Prompt) =>
  Prompt.appendSystem(prompt, SEP + TechnicalInstructionsPrompt);

/**
 * Build the complete system prompt with dynamic context
 */
export const buildSystemPrompt = (ctx: PromptContext): Prompt.Prompt => {
  // Start with base identity
  let prompt = BaseSystemPrompt;

  // Add dynamic context
  prompt = appendTimeContext(ctx.currentTime)(prompt);
  prompt = appendShowContext(ctx.showContext)(prompt);
  prompt = appendRecentInsights(ctx.recentInsights)(prompt);

  // Add technical instructions at the end
  prompt = appendTechnicalInstructions(prompt);

  return prompt;
};
