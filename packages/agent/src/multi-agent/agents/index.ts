/**
 * Multi-Agent Specialist Agents
 *
 * @module
 */

// CuratorAgent - prioritizes plays for research
export {
  CuratorAgent,
  CuratorAgentLive,
  CuratorAgentTest,
  CuratorError,
  type CuratorAgentInterface,
  type PlayForCuration,
} from "./CuratorAgent.js";

// DiscoveryAgent - finds patterns and connections
export {
  DiscoveryAgent,
  DiscoveryAgentLive,
  DiscoveryAgentTest,
  DiscoveryError,
  type DiscoveryAgentInterface,
} from "./DiscoveryAgent.js";

// WriterAgent - crafts narratives
export {
  WriterAgent,
  WriterAgentLive,
  WriterAgentTest,
  WriterError,
  type WriterAgentInterface,
  type WriterOutput,
} from "./WriterAgent.js";

// CriticAgent - reviews quality
export {
  CriticAgent,
  CriticAgentLive,
  CriticAgentTest,
  CriticError,
  type CriticAgentInterface,
} from "./CriticAgent.js";
