# Effect-Focused Claude Code Hooks Design

**Date**: 2025-11-15
**Status**: Design Complete
**Purpose**: Comprehensive hook system to improve Effect usage, implementation correctness, pattern adherence, code style, and optimizations

## Overview

This design establishes a hook system that provides **comprehensive coverage** across all Claude Code lifecycle events to ensure Effect-TS code follows best practices, avoids production pitfalls, and leverages the full Effect API surface area.

**Key Principles**:
- **Block critical issues** (resource leaks, type safety violations)
- **Warn on questionable patterns** (suboptimal implementations)
- **Inject guidance** (API exploration, layer topology)
- **Leverage local Effect source** (docs/effect-source/ for validation)

## Architecture

### Event-Lifecycle with Tiered Validation

The hook system uses **event-lifecycle organization** with **tiered validation**:

**Hook Files Structure:**
```
.claude/hooks/
├── effect-session-start.sh      # Load patterns + scan codebase
├── effect-pre-write.sh           # Fast pattern checks
├── effect-post-write.sh          # Deep validation + refresh state
├── effect-stop-validation.sh     # Final coherence check
└── lib/
    ├── pattern-matchers.sh       # Regex for anti-patterns
    ├── codebase-scanner.sh       # Find layers/services/deps
    └── source-validator.sh       # Grep Effect source
```

**Event Mapping:**
- `SessionStart (startup/resume)` → effect-session-start.sh
- `PreToolUse (Write|Edit)` → effect-pre-write.sh
- `PostToolUse (Write|Edit)` → effect-post-write.sh
- `Stop|SubagentStop` → effect-stop-validation.sh

### Shared State Management

Hooks communicate via `~/.claude/effect-session-state.json`:

```json
{
  "session_id": "abc123",
  "layers": ["DatabaseLive", "ConfigLive", "LoggerLive"],
  "services": {
    "Database": ["query", "transaction"],
    "Config": ["getString", "getNumber"],
    "Logger": ["info", "error", "debug"]
  },
  "dependencies": {
    "DatabaseLive": ["ConfigLive", "LoggerLive"],
    "ConfigLive": []
  },
  "last_scan": "2025-11-15T10:30:00Z"
}
```

**State Refresh Strategy**: Per-write refresh. PostToolUse re-evaluates codebase after each Write/Edit to ensure hooks always have current layer/service topology.

## Tiered Validation Flow

### Tier 1: Codebase Evaluation

**When**: SessionStart + PostToolUse (after every write)

**What**:
- Scan for `Effect.Service`, `Layer.effect`, `Layer.scoped` definitions
- Build dependency graph from `Layer.provide*` calls
- Extract service method signatures
- Cache in session state JSON

**Tools**:
- `grep -r "class.*extends Effect.Service"`
- `grep -r "Layer.provide\|provideMerge"`
- Parse AST for method signatures

### Tier 2: Pattern Matching

**When**: PreToolUse (fast blocking before write)

**What**: Block critical anti-patterns using regex

**Patterns Blocked**:
```bash
- "Effect.all\(" without "concurrency:"
  → Error: "Unbounded concurrency - add { concurrency: N }"

- "Effect.fork\("
  → Error: "Use Effect.forkScoped for automatic cleanup"

- "Layer.provide\(" on merged layers
  → Error: "Use Layer.provideMerge to preserve shared dependencies"

- "Effect.promise\("
  → Error: "Use Effect.tryPromise with typed error"

- "catchAll.*new.*Error\("
  → Error: "Don't eat errors - check layer composition instead"

- "mapError.*=>.*\(.*as"
  → Error: "Don't force error types - let compiler guide"

- "yield\* Effect.sync.*\n.*return \{"
  → Error: "Don't execute Effects in service construction - return builders"
```

### Tier 3: Source Validation

**When**: PostToolUse (deep analysis after write)

**What**: Validate against Effect source code in docs/effect-source/

**Validations**:
```bash
# Resource handling
grep -r "Layer.scoped" docs/effect-source/effect/src/Layer.ts
→ Verify resources use Layer.scoped, not Layer.effect

# Scoped patterns
grep -r "acquireRelease" docs/effect-source/effect/src/Effect.ts
→ Confirm acquireRelease usage matches source patterns

# Optional config
grep -r "Config.option" docs/effect-source/effect/src/Config.ts
→ Validate optional configuration handling

# Observability
grep -r "Effect.fn" docs/effect-source/effect/src/Effect.ts
→ Verify service methods wrapped with Effect.fn

# API exploration
grep -r "export.*function.*<pattern>" docs/effect-source/
→ Suggest existing APIs for common patterns
```

## Pattern Checks by Category

### 1. Resource Leaks Detection

**Critical Focus**: Layer.effect vs Layer.scoped, forkScoped wrapping, ManagedRuntime usage

**PreToolUse Blocking**:
```bash
- Layer.effect with acquireRelease → Error: "Use Layer.scoped for resources"
- forkScoped without Effect.scoped wrapper → Error: "Wrap in Effect.scoped"
- ManagedRuntime.make in request handler → Error: "Create once at startup"
```

**PostToolUse Validation**:
```bash
- Grep Effect source to verify scoped usage
- Check for dataLoader/streaming without scoped
- Scan for resources (DB connections, file handles) without cleanup
```

### 2. Type Safety Erosion & Error Channel Integrity

**Critical Focus**: Typed errors, avoiding catch-all patterns, preserving error information

**PreToolUse Blocking**:
```bash
- Effect.promise( → Error: "Use Effect.tryPromise with typed error"
- catch: (e) => e as → Error: "Create TaggedError class"
- catchAll.*new.*Error\( → Error: "Don't eat errors - check layer composition"
- mapError.*=>.*\(.*as → Error: "Don't force error types - let compiler guide"
```

**PostToolUse Validation**:
```bash
# Find all external API calls
- Verify each has Effect.tryPromise + custom error type
- Detect catchAll/mapError immediately after Effect definition
  → Warn: "Error mapping at definition suggests layer composition issue"
- Check for declared service error type + universal error mapping
  → Error: "Leave error channel clear - don't collapse error information"
```

**Stop Validation**:
```bash
# Scan for services with single error type + universal error mapping
- Cross-reference with compiler errors in diagnostics
- Suggest: "Type error? Check layer composition, don't add catchAll"
```

**Detection Pattern Example**:
```typescript
// BAD - hook should flag this:
const myEffect = Effect.gen(function* () {
  yield* serviceA.method()  // Returns Effect<A, ServiceAError | ConfigError>
  yield* serviceB.call()    // Returns Effect<B, ServiceBError>
}).pipe(
  Effect.catchAll(e => new MyServiceError(e))  // ❌ Eating all errors!
)

// GOOD - compiler guides proper error handling:
const myEffect = Effect.gen(function* () {
  yield* serviceA.method()  // Errors flow through
  yield* serviceB.call()    // Errors accumulate
})
// Error channel: ServiceAError | ConfigError | ServiceBError
// Compiler shows what can fail → handle explicitly or propagate
```

### 3. Layer Composition Issues

**Critical Focus**: provide vs provideMerge, dependency mapping, shared service instances

**PostToolUse Analysis**:
```bash
# Parse all Layer.provide vs Layer.provideMerge
- Build dependency graph from session state
- Detect if merged layers lose shared dependencies
- Warn: "ServiceB won't receive SharedDep - use provideMerge"

# Validate service instance sharing
- Check if multiple services expect same instance
- Verify Layer.provideMerge used to preserve sharing
```

**SessionStart Guidance**:
```bash
# Inject current layer topology into context
- Show which services require which dependencies
- Display dependency graph for composition planning
```

**Example Detection**:
```typescript
// BAD - hook detects this:
Layer.mergeAll(ServiceA, ServiceB).pipe(
  Layer.provide(SharedDep)  // ❌ ServiceB loses SharedDep
)

// GOOD:
Layer.mergeAll(ServiceA, ServiceB).pipe(
  Layer.provideMerge(SharedDep)  // ✓ Both services receive SharedDep
)
```

### 4. Effect/Non-Effect Mixing

**Critical Focus**: Detecting Promise/Effect mixing, async/await alongside Effect.gen

**PostToolUse Detection**:
```bash
- Scan for async/await in same file as Effect.gen
- Find Promise.all alongside Effect.all
- Detect .then() chains near Effect code
- Warn: "Mixing Promise and Effect - consider Effect.promise"
```

## Effect API Exploration and Discovery

**Problem**: Effect has vast surface area. Developers often reinvent patterns with dedicated APIs.

**Strategy**: Encourage source exploration before implementing patterns.

### SessionStart Context Injection

```bash
# Add to effect-session-start.sh
cat <<EOF
{
  "additionalContext": "## Effect API Exploration Reminder

**Before implementing a pattern, search Effect source:**

Common scenarios with dedicated APIs:
- Batching/deduplication → Effect.cached, Effect.cachedFunction, Request/RequestResolver
- Retries with backoff → Schedule.exponential, Schedule.spaced
- Resource pooling → Pool.make, Pool.get
- Concurrent execution → Effect.all with concurrency, Effect.forEach
- Optional values → Effect.option, Effect.fromNullable
- Validation → Schema.decodeUnknown, Config.validate
- Streaming data → Stream.*, Sink.*, Channel.*

**Search commands:**
\`\`\`bash
grep -r 'export.*function.*cache' docs/effect-source/effect/src/
grep -r 'export.*function.*pool' docs/effect-source/platform/src/
grep -r 'Schedule\.' docs/effect-source/effect/src/Schedule.ts
\`\`\`

**Don't conform to existing patterns when better APIs exist.**"
}
EOF
```

### PreToolUse Pattern Detection

```bash
# Detect common patterns that have dedicated APIs

# Manual batching
if echo "$TOOL_INPUT" | grep -q "const batch.*=.*\[\].*push.*setTimeout"; then
  echo "{
    \"decision\": \"ask\",
    \"systemMessage\": \"⚠️ Manual batching detected. Consider Effect.cached, Request/RequestResolver, or DataLoader pattern. Search: grep -r 'RequestResolver' docs/effect-source/\"
  }"
fi

# Manual retry logic
if echo "$TOOL_INPUT" | grep -q "for.*let.*retry.*<.*maxRetries"; then
  echo "{
    \"decision\": \"ask\",
    \"systemMessage\": \"⚠️ Manual retry logic. Use Schedule.* APIs: grep -r 'Schedule.exponential' docs/effect-source/effect/src/Schedule.ts\"
  }"
fi

# Manual resource pooling
if echo "$TOOL_INPUT" | grep -q "const pool.*=.*new Map.*available.*acquire"; then
  echo "{
    \"decision\": \"ask\",
    \"systemMessage\": \"⚠️ Manual pooling. Use Pool.make: grep -r 'Pool.make' docs/effect-source/platform/src/Pool.ts\"
  }"
fi
```

### PostToolUse Source Suggestions

```bash
# After write, suggest better APIs based on patterns
source ~/.claude/hooks/lib/source-validator.sh

SUGGESTIONS=$(analyze_for_better_apis "$FILE_PATH")

if [[ -n "$SUGGESTIONS" ]]; then
  echo "{
    \"continue\": true,
    \"additionalContext\": \"## Effect API Suggestions\n\n$SUGGESTIONS\n\nExplore docs/effect-source/ for canonical patterns.\"
  }"
fi
```

## Hook Implementation Details

### SessionStart Hook (effect-session-start.sh)

```bash
#!/bin/bash
# Runs on startup/resume/clear/compact

# 1. Scan codebase for Effect patterns
layers=$(grep -r "class.*extends Effect.Service" --include="*.ts" | \
         grep -o "class \w*" | cut -d' ' -f2)

services=$(grep -r "Effect.Service<" --include="*.ts" -A 5 | \
           parse_service_methods)

dependencies=$(grep -r "Layer.provide\|provideMerge" --include="*.ts" | \
               build_dependency_graph)

# 2. Save state
echo "{
  \"session_id\": \"$SESSION_ID\",
  \"layers\": $(echo "$layers" | jq -R . | jq -s .),
  \"services\": $services,
  \"dependencies\": $dependencies,
  \"last_scan\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}" > ~/.claude/effect-session-state.json

# 3. Inject context guidance
cat <<EOF
{
  "continue": true,
  "additionalContext": "## Current Effect Topology

**Layers**: $(echo "$layers" | tr '\n' ', ')

**Services**: $(echo "$services" | jq -r 'keys[]' | tr '\n' ', ')

**Pattern Reminders**:
- Use Layer.scoped (not Layer.effect) for resources
- Use Layer.provideMerge (not provide) for merged layers
- Leave error channels clear - let compiler guide error handling
- Validate against local source: docs/effect-source/

**Dependency Graph**: See session state for composition requirements"
}
EOF
```

### PreToolUse Hook (effect-pre-write.sh)

```bash
#!/bin/bash
# Fast blocking checks before Write/Edit

TOOL_INPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.new_string // .tool_input.content')

# Run pattern matchers
source ~/.claude/hooks/lib/pattern-matchers.sh
check_all_patterns "$TOOL_INPUT"

# Exit codes:
# 0 = allow
# 2 = block
# anything else = non-blocking error
```

### PostToolUse Hook (effect-post-write.sh)

```bash
#!/bin/bash
# Deep validation after Write/Edit completes

FILE_PATH=$(echo "$HOOK_INPUT" | jq -r '.tool_input.file_path')

# 1. Refresh codebase state (per-write refresh)
source ~/.claude/hooks/lib/codebase-scanner.sh
update_session_state "$FILE_PATH"

# 2. Load current state
STATE=$(cat ~/.claude/effect-session-state.json)
LAYERS=$(echo "$STATE" | jq -r '.layers[]')
DEPS=$(echo "$STATE" | jq -r '.dependencies')

# 3. Deep pattern validation
source ~/.claude/hooks/lib/pattern-matchers.sh
WARNINGS=$(validate_written_file "$FILE_PATH")

# 4. Source validation against Effect source
source ~/.claude/hooks/lib/source-validator.sh
SOURCE_ISSUES=$(validate_against_effect_source "$FILE_PATH")

# 5. Layer composition validation
COMPOSITION_ISSUES=$(check_layer_composition "$FILE_PATH" "$DEPS")

# 6. Aggregate results
if [[ -n "$SOURCE_ISSUES" || -n "$COMPOSITION_ISSUES" ]]; then
  echo "{
    \"continue\": true,
    \"systemMessage\": \"⚠️ Effect Validation Issues:\n$SOURCE_ISSUES\n$COMPOSITION_ISSUES\",
    \"additionalContext\": \"Check layer dependencies: $DEPS\n\nSearch Effect source: docs/effect-source/\"
  }"
else
  echo '{"continue": true}'
fi
```

### Stop/SubagentStop Hook (effect-stop-validation.sh)

```bash
#!/bin/bash
# Final coherence check before completion

# 1. Validate all services have proper error channels
COLLAPSED_ERRORS=$(grep -r "catchAll.*new.*Error" --include="*.ts" | wc -l)

if [[ $COLLAPSED_ERRORS -gt 0 ]]; then
  echo "{
    \"decision\": \"block\",
    \"stopReason\": \"Found $COLLAPSED_ERRORS instances of error collapsing. Review error channels - don't catch all to fix types.\"
  }"
  exit 0
fi

# 2. Check layer composition consistency
source ~/.claude/hooks/lib/codebase-scanner.sh
ORPHANED_LAYERS=$(find_orphaned_dependencies)

if [[ -n "$ORPHANED_LAYERS" ]]; then
  echo "{
    \"decision\": \"block\",
    \"stopReason\": \"Layer composition issues: $ORPHANED_LAYERS. Use provideMerge for merged layers.\"
  }"
  exit 0
fi

# 3. All clear
echo '{"continue": true}'
```

## Configuration

### Settings File (.claude/settings.local.json)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-session-start.sh",
            "timeout": 10000
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-pre-write.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-post-write.sh",
            "timeout": 15000
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh"
          }
        ]
      }
    ]
  }
}
```

## Debugging and Maintenance

### Debugging Hooks

```bash
# Enable debug output
claude --debug

# Check hook registration
/hooks

# Test individual hooks
echo '{"session_id": "test", "cwd": "/path"}' | \
  .claude/hooks/effect-session-start.sh

# View session state
cat ~/.claude/effect-session-state.json | jq .

# Bypass hooks temporarily (for testing)
# Edit settings.local.json and comment out hooks
```

### Maintenance

```bash
# Update pattern matchers as new anti-patterns discovered
vim .claude/hooks/lib/pattern-matchers.sh

# Refresh Effect source when upgrading packages
cd ~/Dev/effect-source/effect && git pull origin main

# Clear stale session state
rm ~/.claude/effect-session-state.json
```

### Escape Hatches

```bash
# In pattern-matchers.sh, allow override comments:
# // @effect-hook-ignore: using fork intentionally
if echo "$CODE" | grep -q "@effect-hook-ignore"; then
  return 0  # Skip validation
fi
```

## Severity Levels

**Block (exit 2)**: Critical issues that will cause production problems
- Resource leaks (Layer.effect for resources, missing scoped)
- Type safety violations (untyped promises, error eating)
- Unbounded concurrency
- Layer composition issues

**Warn (exit 0 + systemMessage)**: Suboptimal patterns
- Missing Effect.fn for observability
- Manual implementation of existing APIs
- Questionable patterns that might be intentional

**Context (exit 0 + additionalContext)**: Guidance for improvement
- API exploration suggestions
- Layer topology information
- Effect source search commands

## Success Criteria

This hook system succeeds if it:

1. **Catches resource leaks** before they reach production
2. **Preserves error channel integrity** - no collapsed error types
3. **Guides layer composition** - correct provide/provideMerge usage
4. **Encourages API exploration** - developers find existing utilities
5. **Validates against source** - canonical Effect patterns used
6. **Maintains performance** - hooks complete quickly enough not to disrupt flow

## Next Steps

1. **Implementation**: Create hook scripts in .claude/hooks/
2. **Library functions**: Build pattern-matchers.sh, codebase-scanner.sh, source-validator.sh
3. **Testing**: Validate hooks against known anti-patterns
4. **Iteration**: Refine patterns based on real usage
5. **Documentation**: Add examples and troubleshooting guide

## References

- Claude Code Hooks: https://code.claude.com/docs/en/hooks
- Effect Production Pitfalls: effect-production-pitfalls skill
- Local Effect Source: docs/effect-source/
- Project Context: CLAUDE.local.md
