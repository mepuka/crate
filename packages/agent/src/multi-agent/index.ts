/**
 * Multi-Agent Coordination System
 *
 * Orchestrates specialist agents: Curator → Discovery → Research → Writer → Critic
 *
 * @module
 */

// Types and schemas
export * from "./types.js";

// AgentCoordinator - orchestrates the pipeline
export {
  AgentCoordinator,
  AgentCoordinatorLive,
  AgentCoordinatorTest,
  CoordinatorError,
  type AgentCoordinatorInterface,
  type SpecialistAgent,
} from "./AgentCoordinator.js";

// Specialist agents
export * from "./agents/index.js";
