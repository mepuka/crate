---
name: effect-index
description: Skill index and decision guide. Use to pick the right Effect Skill quickly and follow a minimal decision tree.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Effect Skill Index

Use this as a quick router to the right Skill for your task. Each entry links to a focused Skill optimized for a coding agent’s limited context.

## Decision Tree

- I need to write or refactor some Effect code → [Foundations](../effect-foundations/SKILL.md)
- I need robust error handling/retries → [Errors & Retries](../effect-errors-retries/SKILL.md)
- I must run things in parallel / manage fibers → [Concurrency & Fibers](../effect-concurrency-fibers/SKILL.md)
- This is a data pipeline / batching / backpressure → [Streams & Pipelines](../effect-streams-pipelines/SKILL.md)
- I need DI/services/layers or test/live wiring → [Layers & Services](../effect-layers-services/SKILL.md)
- Opening files/sockets/servers with cleanup → [Resources & Scope](../effect-resources-scope/SKILL.md)
- Add HTTP endpoints / JSON responses → [HTTP & Routing](../effect-http-routing/SKILL.md)
- Validate inputs / parse config → [Config & Schema](../effect-config-schema/SKILL.md)
- Value-based equality / high-perf immutable collections → [Data Structures](../effect-collections-datastructs/SKILL.md)
- Time, logging, spans/tracing → [Time/Tracing/Logging](../effect-time-tracing-logging/SKILL.md)
- Queues, PubSub, background workers → [Queues & Background](../effect-queues-background/SKILL.md)
- Write tests/mocks for services → [Testing & Mocking](../effect-testing-mocking/SKILL.md)

## Cross-Skill Patterns (from EffectPatterns)

- Retry transient failures with schedules → see [Errors & Retries](../effect-errors-retries/SKILL.md) and [EffectPatterns (Retry Operations Based on Specific Errors)](https://github.com/PaulJPhilp/EffectPatterns)
- Resource-safe streaming → see [Streams & Pipelines](../effect-streams-pipelines/SKILL.md) and [EffectPatterns (Manage Resources Safely in a Pipeline)](https://github.com/PaulJPhilp/EffectPatterns)
- Graceful shutdown with runFork → see [Queues & Background](../effect-queues-background/SKILL.md) and [EffectPatterns (Execute Long-Running Apps with Effect.runFork)](https://github.com/PaulJPhilp/EffectPatterns)

## References

- Agent Skills overview: [Introducing Agent Skills](https://www.anthropic.com/news/skills)
- Skills guide: [Claude Code Skills Documentation](https://docs.claude.com/en/docs/claude-code/skills)
- EffectPatterns (patterns index): [PaulJPhilp/EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns)


