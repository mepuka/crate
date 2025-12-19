/**
 * Multi-Agent Prompt Templates
 *
 * Culture-aware prompt templates for the Crate Research multi-agent pipeline.
 * Each agent receives tailored instructions while sharing core KEXP values.
 *
 * Pipeline: Curator → Discovery → Research → Writer → Critic
 *
 * @module
 */

// =============================================================================
// Shared Culture (used by all agents)
// =============================================================================

export {
  // Core values for all agents
  KEXP_CORE_VALUES,
  KEXP_VOICE_GUIDELINES,
  KEXP_DISCOVERY_SIGNALS,
  KEXP_CULTURE_CHECKLIST,
  // Re-exported from system-prompt
  PHILOSOPHY,
  TONE,
  STORYTELLING,
  KEXP_CULTURE,
  KEXP_DJ_COMMENT_PATTERNS,
  KEXP_ROTATION,
} from "./shared-culture.js";

// =============================================================================
// Agent-Specific Templates
// =============================================================================

// CuratorAgent: Prioritizes plays for research
export {
  CURATOR_IDENTITY,
  CURATOR_INSTRUCTIONS,
  DISCOVERY_INTENTS,
  buildCuratorPrompt,
} from "./curator.js";

// DiscoveryAgent: Finds patterns and connections
export {
  DISCOVERY_IDENTITY,
  DISCOVERY_INSTRUCTIONS,
  GRAPH_EXPLORATION,
  buildDiscoveryPrompt,
} from "./discovery.js";

// WriterAgent: Crafts narratives in KEXP voice
export {
  WRITER_IDENTITY,
  WRITER_INSTRUCTIONS,
  WRITING_EXAMPLES,
  buildWriterPrompt,
} from "./writer.js";

// CriticAgent: Quality gate and culture enforcement
export {
  CRITIC_IDENTITY,
  CRITIC_INSTRUCTIONS,
  COMMON_ISSUES,
  buildCriticPrompt,
} from "./critic.js";
