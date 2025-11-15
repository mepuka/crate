# Effect-Focused Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive Claude Code hooks to improve Effect-TS usage, catch production pitfalls, and guide API exploration.

**Architecture:** Event-lifecycle hooks with tiered validation (codebase eval → pattern matching → source validation). Hooks share state via JSON, validate against local Effect source, and provide adaptive severity (block/warn/guide).

**Tech Stack:** Bash scripts, jq for JSON processing, grep/sed for pattern matching, Claude Code hooks API

---

## Task 1: Project Setup and Directory Structure

**Files:**
- Create: `.claude/hooks/lib/` (directory)
- Create: `.claude/hooks/test/` (directory)
- Verify: `.claude/settings.local.json` exists or create

**Step 1: Create hook directories**

```bash
mkdir -p .claude/hooks/lib
mkdir -p .claude/hooks/test
```

**Step 2: Verify directories created**

Run: `ls -la .claude/hooks/`
Expected: See `lib/` and `test/` directories

**Step 3: Check for settings file**

Run: `ls .claude/settings.local.json`
Expected: File exists or "No such file" (we'll create in next task)

**Step 4: Create settings file if needed**

If file doesn't exist:
```bash
echo '{"hooks": {}}' > .claude/settings.local.json
```

**Step 5: Commit directory structure**

```bash
git add .claude/hooks/
git commit -m "chore: create hooks directory structure"
```

---

## Task 2: Pattern Matchers Library

**Files:**
- Create: `.claude/hooks/lib/pattern-matchers.sh`
- Create: `.claude/hooks/test/test-patterns.sh`

**Step 1: Write test cases for pattern detection**

Create `.claude/hooks/test/test-patterns.sh`:

```bash
#!/bin/bash
# Test cases for pattern matchers

set -e

source "$(dirname "$0")/../lib/pattern-matchers.sh"

# Test 1: Detect unbounded Effect.all
TEST_CODE='Effect.all(items.map(x => process(x)))'
if detect_unbounded_concurrency "$TEST_CODE"; then
  echo "✓ Test 1: Unbounded concurrency detected"
else
  echo "✗ Test 1: FAILED to detect unbounded concurrency"
  exit 1
fi

# Test 2: Allow bounded Effect.all
TEST_CODE='Effect.all(items.map(x => process(x)), { concurrency: 10 })'
if ! detect_unbounded_concurrency "$TEST_CODE"; then
  echo "✓ Test 2: Bounded concurrency allowed"
else
  echo "✗ Test 2: FAILED - false positive on bounded concurrency"
  exit 1
fi

# Test 3: Detect Effect.fork (should use forkScoped)
TEST_CODE='const fiber = yield* Effect.fork(task)'
if detect_fork_usage "$TEST_CODE"; then
  echo "✓ Test 3: Effect.fork detected"
else
  echo "✗ Test 3: FAILED to detect Effect.fork"
  exit 1
fi

# Test 4: Detect error eating
TEST_CODE='Effect.catchAll(e => new MyError(e))'
if detect_error_eating "$TEST_CODE"; then
  echo "✓ Test 4: Error eating detected"
else
  echo "✗ Test 4: FAILED to detect error eating"
  exit 1
fi

# Test 5: Detect Layer.provide on merged layers
TEST_CODE='Layer.mergeAll(A, B).pipe(Layer.provide(Dep))'
if detect_layer_provide_misuse "$TEST_CODE"; then
  echo "✓ Test 5: Layer.provide misuse detected"
else
  echo "✗ Test 5: FAILED to detect Layer.provide misuse"
  exit 1
fi

# Test 6: Detect override comment
TEST_CODE='// @effect-hook-ignore: intentional fork
const fiber = yield* Effect.fork(task)'
if check_override_comment "$TEST_CODE"; then
  echo "✓ Test 6: Override comment detected"
else
  echo "✗ Test 6: FAILED to detect override comment"
  exit 1
fi

echo ""
echo "All pattern matcher tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-patterns.sh
.claude/hooks/test/test-patterns.sh
```

Expected: Errors about missing functions (source file doesn't exist yet)

**Step 3: Implement pattern matchers**

Create `.claude/hooks/lib/pattern-matchers.sh`:

```bash
#!/bin/bash
# Pattern matching library for Effect anti-patterns

# Check for override comment
check_override_comment() {
  local code="$1"
  echo "$code" | grep -q "@effect-hook-ignore"
}

# Detect unbounded Effect.all
detect_unbounded_concurrency() {
  local code="$1"

  # Check for override
  if check_override_comment "$code"; then
    return 1  # Not detected (override active)
  fi

  # Pattern: Effect.all( without { concurrency:
  if echo "$code" | grep -q "Effect\.all\s*(" && \
     ! echo "$code" | grep -q "concurrency\s*:"; then
    return 0  # Detected
  fi

  return 1  # Not detected
}

# Detect Effect.fork (should use forkScoped)
detect_fork_usage() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  echo "$code" | grep -q "Effect\.fork\s*("
}

# Detect error eating (catchAll/mapError immediately after definition)
detect_error_eating() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: catchAll.*new.*Error
  if echo "$code" | grep -q "catchAll.*new.*Error\s*("; then
    return 0
  fi

  # Pattern: mapError with type coercion
  if echo "$code" | grep -q "mapError.*=>.*as\s"; then
    return 0
  fi

  return 1
}

# Detect Layer.provide on merged layers
detect_layer_provide_misuse() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: mergeAll/merge followed by Layer.provide (not provideMerge)
  if echo "$code" | grep -q "merge" && \
     echo "$code" | grep -q "Layer\.provide\s*(" && \
     ! echo "$code" | grep -q "provideMerge"; then
    return 0
  fi

  return 1
}

# Detect Effect.promise (should use tryPromise)
detect_untyped_promise() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  echo "$code" | grep -q "Effect\.promise\s*("
}

# Detect Layer.effect with resources (should use Layer.scoped)
detect_layer_effect_with_resources() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: Layer.effect with acquireRelease
  if echo "$code" | grep -q "Layer\.effect" && \
     echo "$code" | grep -q "acquireRelease"; then
    return 0
  fi

  return 1
}

# Detect manual retry logic (should use Schedule)
detect_manual_retry() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: for loop with retry counter
  echo "$code" | grep -q "for.*retry.*<.*max"
}

# Detect manual batching (should use Effect.cached or RequestResolver)
detect_manual_batching() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: batch array with push and setTimeout
  if echo "$code" | grep -q "batch.*=.*\[\]" && \
     echo "$code" | grep -q "push" && \
     echo "$code" | grep -q "setTimeout"; then
    return 0
  fi

  return 1
}

# Detect manual pooling (should use Pool.make)
detect_manual_pooling() {
  local code="$1"

  if check_override_comment "$code"; then
    return 1
  fi

  # Pattern: Map with available/acquire pattern
  if echo "$code" | grep -q "pool.*=.*new Map" && \
     echo "$code" | grep -q "available" && \
     echo "$code" | grep -q "acquire"; then
    return 0
  fi

  return 1
}

# Main validation function - checks all patterns
check_all_patterns() {
  local code="$1"
  local errors=""

  if detect_unbounded_concurrency "$code"; then
    errors="${errors}❌ Unbounded concurrency detected. Add { concurrency: N } to Effect.all\n"
  fi

  if detect_fork_usage "$code"; then
    errors="${errors}❌ Effect.fork detected. Use Effect.forkScoped for automatic cleanup\n"
  fi

  if detect_error_eating "$code"; then
    errors="${errors}❌ Error eating detected. Don't catchAll to fix types - check layer composition\n"
  fi

  if detect_layer_provide_misuse "$code"; then
    errors="${errors}❌ Layer.provide on merged layers. Use Layer.provideMerge to preserve shared dependencies\n"
  fi

  if detect_untyped_promise "$code"; then
    errors="${errors}❌ Effect.promise detected. Use Effect.tryPromise with typed error\n"
  fi

  if detect_layer_effect_with_resources "$code"; then
    errors="${errors}❌ Layer.effect with resources. Use Layer.scoped for proper cleanup\n"
  fi

  if detect_manual_retry "$code"; then
    echo "⚠️  Manual retry logic detected. Consider Schedule.exponential: grep -r 'Schedule.exponential' docs/effect-source/effect/src/Schedule.ts" >&2
  fi

  if detect_manual_batching "$code"; then
    echo "⚠️  Manual batching detected. Consider Effect.cached or Request/RequestResolver: grep -r 'RequestResolver' docs/effect-source/" >&2
  fi

  if detect_manual_pooling "$code"; then
    echo "⚠️  Manual pooling detected. Use Pool.make: grep -r 'Pool.make' docs/effect-source/platform/src/Pool.ts" >&2
  fi

  if [[ -n "$errors" ]]; then
    echo -e "$errors" >&2
    exit 2  # Block with exit code 2
  fi

  exit 0  # Allow
}
```

**Step 4: Make executable and run tests**

```bash
chmod +x .claude/hooks/lib/pattern-matchers.sh
.claude/hooks/test/test-patterns.sh
```

Expected: All tests pass

**Step 5: Commit pattern matchers**

```bash
git add .claude/hooks/lib/pattern-matchers.sh .claude/hooks/test/test-patterns.sh
git commit -m "feat: add Effect pattern matchers library with tests"
```

---

## Task 3: Codebase Scanner Library

**Files:**
- Create: `.claude/hooks/lib/codebase-scanner.sh`
- Create: `.claude/hooks/test/test-scanner.sh`

**Step 1: Write test for codebase scanner**

Create `.claude/hooks/test/test-scanner.sh`:

```bash
#!/bin/bash
# Test codebase scanner

set -e

source "$(dirname "$0")/../lib/codebase-scanner.sh"

# Create test directory structure
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/src"

# Create test service file
cat > "$TEST_DIR/src/TestService.ts" <<'EOF'
export class TestService extends Effect.Service<TestService>()("TestService", {
  scoped: Effect.gen(function* () {
    return {
      query: (id: string) => Effect.succeed(id),
      update: (id: string, data: any) => Effect.succeed(data)
    }
  })
}) {}

export const TestServiceLive = Layer.scoped(
  TestService,
  Effect.gen(function* () {
    const config = yield* Config
    return new TestService()
  })
)
EOF

# Create test layer file
cat > "$TEST_DIR/src/Layers.ts" <<'EOF'
const DatabaseLive = Layer.scoped(Database, makeDatabase)
const ConfigLive = Layer.effect(Config, loadConfig)

const AppLive = Layer.mergeAll(DatabaseLive, LoggerLive).pipe(
  Layer.provideMerge(ConfigLive)
)
EOF

# Test scanning
cd "$TEST_DIR"
RESULT=$(scan_services "src")

if echo "$RESULT" | grep -q "TestService"; then
  echo "✓ Service scanning works"
else
  echo "✗ Service scanning failed"
  rm -rf "$TEST_DIR"
  exit 1
fi

LAYERS=$(scan_layers "src")
if echo "$LAYERS" | grep -q "DatabaseLive"; then
  echo "✓ Layer scanning works"
else
  echo "✗ Layer scanning failed"
  rm -rf "$TEST_DIR"
  exit 1
fi

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "All scanner tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-scanner.sh
.claude/hooks/test/test-scanner.sh
```

Expected: Errors about missing functions

**Step 3: Implement codebase scanner**

Create `.claude/hooks/lib/codebase-scanner.sh`:

```bash
#!/bin/bash
# Codebase scanning library for Effect patterns

# Scan for Effect.Service definitions
scan_services() {
  local search_path="${1:-.}"

  # Find all service class definitions
  grep -r "class.*extends Effect\.Service" \
    --include="*.ts" \
    --include="*.tsx" \
    "$search_path" 2>/dev/null | \
    grep -o "class \w*" | \
    cut -d' ' -f2 | \
    sort -u | \
    jq -R . | jq -s .
}

# Scan for Layer definitions
scan_layers() {
  local search_path="${1:-.}"

  # Find all Layer.* assignments
  grep -r "const \w*Live.*=.*Layer\." \
    --include="*.ts" \
    --include="*.tsx" \
    "$search_path" 2>/dev/null | \
    grep -o "const \w*Live" | \
    cut -d' ' -f2 | \
    sort -u | \
    jq -R . | jq -s .
}

# Extract service methods from a service file
extract_service_methods() {
  local file_path="$1"

  # Simple extraction: look for method names in return object
  # This is approximate - full AST parsing would be better
  grep -A 20 "return {" "$file_path" | \
    grep -o "^\s*\w*:" | \
    sed 's/://g' | \
    sed 's/^\s*//g' | \
    jq -R . | jq -s .
}

# Build dependency graph from Layer.provide calls
build_dependency_graph() {
  local search_path="${1:-.}"

  # Find all Layer.provide and Layer.provideMerge calls
  # Extract what's being provided to what
  local deps="{}"

  while IFS= read -r line; do
    # Extract layer name and dependencies
    # This is simplified - real implementation would need better parsing
    if echo "$line" | grep -q "Layer.provide"; then
      local layer=$(echo "$line" | grep -o "const \w*" | cut -d' ' -f2)
      deps=$(echo "$deps" | jq --arg layer "$layer" '. + {($layer): []}')
    fi
  done < <(grep -r "Layer\.provide" --include="*.ts" "$search_path" 2>/dev/null)

  echo "$deps"
}

# Update session state after file write
update_session_state() {
  local file_path="$1"
  local state_file="${EFFECT_STATE_FILE:-$HOME/.claude/effect-session-state.json}"

  # If file is a service/layer file, rescan
  if echo "$file_path" | grep -qE "(Service|Layer|Live)\.ts"; then
    # Rescan entire codebase (per-write refresh)
    local layers=$(scan_layers ".")
    local services=$(scan_services ".")
    local deps=$(build_dependency_graph ".")

    # Update state file
    local state="{}"
    if [[ -f "$state_file" ]]; then
      state=$(cat "$state_file")
    fi

    state=$(echo "$state" | jq \
      --argjson layers "$layers" \
      --argjson services "$services" \
      --argjson deps "$deps" \
      --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '.layers = $layers | .services = $services | .dependencies = $deps | .last_scan = $timestamp')

    echo "$state" > "$state_file"
  fi
}

# Find orphaned layer dependencies
find_orphaned_dependencies() {
  local state_file="${EFFECT_STATE_FILE:-$HOME/.claude/effect-session-state.json}"

  if [[ ! -f "$state_file" ]]; then
    return
  fi

  # Check for Layer.provide on merged layers
  local orphans=$(grep -r "Layer\.merge.*\.pipe.*Layer\.provide[^M]" \
    --include="*.ts" . 2>/dev/null)

  if [[ -n "$orphans" ]]; then
    echo "$orphans" | while read -r line; do
      echo "⚠️  Possible orphaned dependency: $line"
      echo "   Consider using Layer.provideMerge instead"
    done
  fi
}
```

**Step 4: Run scanner tests**

```bash
.claude/hooks/test/test-scanner.sh
```

Expected: All tests pass

**Step 5: Commit codebase scanner**

```bash
git add .claude/hooks/lib/codebase-scanner.sh .claude/hooks/test/test-scanner.sh
git commit -m "feat: add codebase scanner for Effect services and layers"
```

---

## Task 4: Source Validator Library

**Files:**
- Create: `.claude/hooks/lib/source-validator.sh`

**Step 1: Implement source validator**

Create `.claude/hooks/lib/source-validator.sh`:

```bash
#!/bin/bash
# Effect source validation library

EFFECT_SOURCE_PATH="${EFFECT_SOURCE_PATH:-docs/effect-source}"

# Validate Layer.scoped usage for resources
validate_layer_scoped() {
  local file_path="$1"

  # Check if file has acquireRelease with Layer.effect
  if grep -q "Layer\.effect" "$file_path" && \
     grep -q "acquireRelease" "$file_path"; then
    echo "❌ File uses Layer.effect with acquireRelease - should use Layer.scoped"
    echo "   Reference: grep -r 'Layer.scoped' $EFFECT_SOURCE_PATH/effect/src/Layer.ts"
    return 1
  fi

  return 0
}

# Validate Effect.tryPromise usage
validate_promise_wrapping() {
  local file_path="$1"

  # Find Effect.promise usage
  if grep -q "Effect\.promise\s*(" "$file_path"; then
    echo "❌ File uses Effect.promise - should use Effect.tryPromise with typed error"
    echo "   Reference: grep -r 'tryPromise' $EFFECT_SOURCE_PATH/effect/src/Effect.ts"
    return 1
  fi

  return 0
}

# Validate Config.option for optional config
validate_config_optional() {
  local file_path="$1"
  local issues=""

  # Check for Config.string without Config.option for optional values
  # This is heuristic - looks for config with "optional" in name
  while IFS= read -r line; do
    if echo "$line" | grep -q "Config\.\(string\|number\)" && \
       echo "$line" | grep -qi "optional" && \
       ! echo "$line" | grep -q "Config\.option"; then
      issues="${issues}Possible missing Config.option: $line\n"
    fi
  done < "$file_path"

  if [[ -n "$issues" ]]; then
    echo -e "⚠️  Possible missing Config.option for optional config:"
    echo -e "$issues"
    echo "   Reference: grep -r 'Config.option' $EFFECT_SOURCE_PATH/effect/src/Config.ts"
  fi
}

# Suggest better APIs for common patterns
analyze_for_better_apis() {
  local file_path="$1"
  local suggestions=""

  # Check for manual retry
  if grep -q "for.*retry.*<" "$file_path"; then
    suggestions="${suggestions}📖 Manual retry detected. Consider Schedule APIs:\n"
    suggestions="${suggestions}   grep -r 'Schedule.exponential' $EFFECT_SOURCE_PATH/effect/src/Schedule.ts\n\n"
  fi

  # Check for manual batching
  if grep -q "batch.*=.*\[\].*push" "$file_path"; then
    suggestions="${suggestions}📖 Manual batching detected. Consider Request/RequestResolver:\n"
    suggestions="${suggestions}   grep -r 'RequestResolver' $EFFECT_SOURCE_PATH/\n\n"
  fi

  # Check for manual caching
  if grep -q "cache.*=.*new Map" "$file_path" && \
     ! grep -q "Effect\.cached" "$file_path"; then
    suggestions="${suggestions}📖 Manual caching detected. Consider Effect.cached:\n"
    suggestions="${suggestions}   grep -r 'Effect.cached' $EFFECT_SOURCE_PATH/effect/src/Effect.ts\n\n"
  fi

  echo -e "$suggestions"
}

# Validate file against all Effect source patterns
validate_against_effect_source() {
  local file_path="$1"

  # Skip non-TypeScript files
  if [[ ! "$file_path" =~ \.tsx?$ ]]; then
    return 0
  fi

  local issues=""

  # Run all validators
  if ! validate_layer_scoped "$file_path"; then
    issues="${issues}Layer.scoped validation failed\n"
  fi

  if ! validate_promise_wrapping "$file_path"; then
    issues="${issues}Promise wrapping validation failed\n"
  fi

  validate_config_optional "$file_path"

  if [[ -n "$issues" ]]; then
    echo -e "$issues"
    return 1
  fi

  return 0
}
```

**Step 2: Make executable**

```bash
chmod +x .claude/hooks/lib/source-validator.sh
```

**Step 3: Test manually with a sample file**

```bash
# Create test file with anti-pattern
cat > /tmp/test-service.ts <<'EOF'
const MyLayer = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const resource = yield* Effect.acquireRelease(
      acquire,
      release
    )
    return new MyService(resource)
  })
)
EOF

source .claude/hooks/lib/source-validator.sh
validate_against_effect_source /tmp/test-service.ts
```

Expected: Error about Layer.effect with acquireRelease

**Step 4: Clean up test file**

```bash
rm /tmp/test-service.ts
```

**Step 5: Commit source validator**

```bash
git add .claude/hooks/lib/source-validator.sh
git commit -m "feat: add Effect source validation library"
```

---

## Task 5: SessionStart Hook

**Files:**
- Create: `.claude/hooks/effect-session-start.sh`
- Create: `.claude/hooks/test/test-session-start.sh`

**Step 1: Write test for session start hook**

Create `.claude/hooks/test/test-session-start.sh`:

```bash
#!/bin/bash
# Test SessionStart hook

set -e

# Create test hook input
TEST_INPUT='{
  "session_id": "test-123",
  "cwd": "'"$(pwd)"'",
  "hook_event_name": "SessionStart"
}'

# Run hook
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-session-start.sh)

# Verify JSON output
if ! echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✗ Invalid JSON output"
  exit 1
fi

# Check for additionalContext
if echo "$RESULT" | jq -e '.additionalContext' >/dev/null; then
  echo "✓ SessionStart hook produces context"
else
  echo "✗ Missing additionalContext"
  exit 1
fi

# Check for continue: true
if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ Hook continues execution"
else
  echo "✗ Hook doesn't continue"
  exit 1
fi

# Verify state file created
if [[ -f ~/.claude/effect-session-state.json ]]; then
  echo "✓ State file created"
else
  echo "✗ State file not created"
  exit 1
fi

echo ""
echo "SessionStart hook tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-session-start.sh
.claude/hooks/test/test-session-start.sh
```

Expected: Hook doesn't exist yet

**Step 3: Implement SessionStart hook**

Create `.claude/hooks/effect-session-start.sh`:

```bash
#!/bin/bash
# SessionStart hook - scan codebase and inject Effect guidance

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract session info
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
CWD=$(echo "$HOOK_INPUT" | jq -r '.cwd')

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"

# Scan codebase
cd "$CWD"
LAYERS=$(scan_layers "." 2>/dev/null || echo '[]')
SERVICES=$(scan_services "." 2>/dev/null || echo '[]')
DEPS=$(build_dependency_graph "." 2>/dev/null || echo '{}')

# Save state
STATE_FILE="$HOME/.claude/effect-session-state.json"
cat > "$STATE_FILE" <<EOF
{
  "session_id": "$SESSION_ID",
  "layers": $LAYERS,
  "services": $SERVICES,
  "dependencies": $DEPS,
  "last_scan": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Build context message
LAYERS_LIST=$(echo "$LAYERS" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')
SERVICES_LIST=$(echo "$SERVICES" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')

CONTEXT="## Effect Development Session Started

**Current Effect Topology:**
- **Layers**: ${LAYERS_LIST:-none found}
- **Services**: ${SERVICES_LIST:-none found}

**Pattern Reminders:**
- Use \`Layer.scoped\` (not \`Layer.effect\`) for resources with cleanup
- Use \`Layer.provideMerge\` (not \`provide\`) for merged layers to preserve shared dependencies
- Leave error channels clear - let the compiler guide error handling, don't collapse with catchAll
- Use \`Effect.tryPromise\` with typed errors, never \`Effect.promise\`
- Wrap \`Effect.forkScoped\` in \`Effect.scoped\` for cleanup
- Add \`{ concurrency: N }\` to all \`Effect.all\` calls

**Effect API Exploration:**
Before implementing common patterns, search Effect source for existing utilities:
- Batching/deduplication → \`Effect.cached\`, \`Request\`/\`RequestResolver\`
- Retries with backoff → \`Schedule.exponential\`, \`Schedule.spaced\`
- Resource pooling → \`Pool.make\`
- Streaming data → \`Stream.*\`, \`Sink.*\`

Search commands:
\`\`\`bash
grep -r 'export.*function.*pattern' docs/effect-source/effect/src/
grep -r 'Schedule\\.' docs/effect-source/effect/src/Schedule.ts
\`\`\`

**Local Effect Source**: docs/effect-source/ (always reference before writing Effect code)

**Session State**: ~/.claude/effect-session-state.json"

# Output JSON response
cat <<EOF
{
  "continue": true,
  "additionalContext": $(echo "$CONTEXT" | jq -Rs .)
}
EOF
```

**Step 4: Make executable and run tests**

```bash
chmod +x .claude/hooks/effect-session-start.sh
.claude/hooks/test/test-session-start.sh
```

Expected: All tests pass

**Step 5: Commit SessionStart hook**

```bash
git add .claude/hooks/effect-session-start.sh .claude/hooks/test/test-session-start.sh
git commit -m "feat: add SessionStart hook for Effect context injection"
```

---

## Task 6: PreToolUse Hook

**Files:**
- Create: `.claude/hooks/effect-pre-write.sh`
- Create: `.claude/hooks/test/test-pre-write.sh`

**Step 1: Write test for PreToolUse hook**

Create `.claude/hooks/test/test-pre-write.sh`:

```bash
#!/bin/bash
# Test PreToolUse hook

set -e

# Test 1: Block unbounded concurrency
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/tmp/test.ts",
    "content": "Effect.all(items.map(x => process(x)))"
  }
}'

RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 2 ]]; then
  echo "✓ Test 1: Blocked unbounded concurrency (exit 2)"
else
  echo "✗ Test 1: Should block unbounded concurrency (got exit $EXIT_CODE)"
  exit 1
fi

# Test 2: Allow bounded concurrency
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "content": "Effect.all(items.map(x => process(x)), { concurrency: 10 })"
  }
}'

RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ Test 2: Allowed bounded concurrency (exit 0)"
else
  echo "✗ Test 2: Should allow bounded concurrency (got exit $EXIT_CODE)"
  exit 1
fi

# Test 3: Respect override comment
TEST_INPUT='{
  "tool_name": "Edit",
  "tool_input": {
    "new_string": "// @effect-hook-ignore: intentional for testing\nEffect.fork(task)"
  }
}'

RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1)
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "✓ Test 3: Respected override comment (exit 0)"
else
  echo "✗ Test 3: Should respect override (got exit $EXIT_CODE)"
  exit 1
fi

echo ""
echo "PreToolUse hook tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-pre-write.sh
.claude/hooks/test/test-pre-write.sh
```

Expected: Hook doesn't exist

**Step 3: Implement PreToolUse hook**

Create `.claude/hooks/effect-pre-write.sh`:

```bash
#!/bin/bash
# PreToolUse hook - fast pattern checks before Write/Edit

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract tool input - handle both Write and Edit
CONTENT=$(echo "$HOOK_INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')

# Skip if no content
if [[ -z "$CONTENT" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Source pattern matchers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/pattern-matchers.sh"

# Run pattern checks (will exit 2 if blocked, 0 if allowed)
check_all_patterns "$CONTENT"
```

**Step 4: Make executable and run tests**

```bash
chmod +x .claude/hooks/effect-pre-write.sh
.claude/hooks/test/test-pre-write.sh
```

Expected: All tests pass

**Step 5: Commit PreToolUse hook**

```bash
git add .claude/hooks/effect-pre-write.sh .claude/hooks/test/test-pre-write.sh
git commit -m "feat: add PreToolUse hook for fast pattern blocking"
```

---

## Task 7: PostToolUse Hook

**Files:**
- Create: `.claude/hooks/effect-post-write.sh`
- Create: `.claude/hooks/test/test-post-write.sh`

**Step 1: Write test for PostToolUse hook**

Create `.claude/hooks/test/test-post-write.sh`:

```bash
#!/bin/bash
# Test PostToolUse hook

set -e

# Create test file
TEST_FILE="/tmp/test-effect-service.ts"
cat > "$TEST_FILE" <<'EOF'
export class TestService extends Effect.Service<TestService>()("TestService", {
  scoped: Effect.gen(function* () {
    return {
      query: Effect.succeed("test")
    }
  })
}) {}

export const TestServiceLive = Layer.scoped(
  TestService,
  Effect.gen(function* () {
    return new TestService()
  })
)
EOF

# Test hook
TEST_INPUT='{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "'"$TEST_FILE"'"
  }
}'

RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-post-write.sh)

# Verify JSON output
if ! echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✗ Invalid JSON output"
  rm "$TEST_FILE"
  exit 1
fi

# Check for continue: true
if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ PostToolUse hook continues"
else
  echo "✗ Hook should continue"
  rm "$TEST_FILE"
  exit 1
fi

# Verify state was updated
if [[ -f ~/.claude/effect-session-state.json ]]; then
  STATE=$(cat ~/.claude/effect-session-state.json)
  if echo "$STATE" | jq -e '.last_scan' >/dev/null; then
    echo "✓ State updated after write"
  else
    echo "✗ State not properly updated"
    rm "$TEST_FILE"
    exit 1
  fi
fi

# Cleanup
rm "$TEST_FILE"

echo ""
echo "PostToolUse hook tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-post-write.sh
.claude/hooks/test/test-post-write.sh
```

Expected: Hook doesn't exist

**Step 3: Implement PostToolUse hook**

Create `.claude/hooks/effect-post-write.sh`:

```bash
#!/bin/bash
# PostToolUse hook - deep validation and state refresh

set -e

# Read hook input
HOOK_INPUT=$(cat)

# Extract file path
FILE_PATH=$(echo "$HOOK_INPUT" | jq -r '.tool_input.file_path // ""')

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Skip if file doesn't exist (might have been deleted)
if [[ ! -f "$FILE_PATH" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"
source "$SCRIPT_DIR/lib/source-validator.sh"

# Update session state (per-write refresh)
update_session_state "$FILE_PATH"

# Run source validation
SOURCE_ISSUES=""
if ! validate_against_effect_source "$FILE_PATH" 2>&1; then
  SOURCE_ISSUES=$(validate_against_effect_source "$FILE_PATH" 2>&1)
fi

# Get API suggestions
API_SUGGESTIONS=$(analyze_for_better_apis "$FILE_PATH")

# Check for layer composition issues
STATE_FILE="$HOME/.claude/effect-session-state.json"
COMPOSITION_ISSUES=""
if [[ -f "$STATE_FILE" ]]; then
  COMPOSITION_ISSUES=$(find_orphaned_dependencies)
fi

# Build response
if [[ -n "$SOURCE_ISSUES" || -n "$COMPOSITION_ISSUES" ]]; then
  # Has issues - add warning
  MESSAGE="⚠️  Effect Validation Issues:"
  [[ -n "$SOURCE_ISSUES" ]] && MESSAGE="$MESSAGE\n\n$SOURCE_ISSUES"
  [[ -n "$COMPOSITION_ISSUES" ]] && MESSAGE="$MESSAGE\n\n$COMPOSITION_ISSUES"

  ADDITIONAL=""
  [[ -n "$API_SUGGESTIONS" ]] && ADDITIONAL="$API_SUGGESTIONS\n\nSearch Effect source: docs/effect-source/"

  cat <<EOF
{
  "continue": true,
  "systemMessage": $(echo -e "$MESSAGE" | jq -Rs .),
  "additionalContext": $(echo -e "$ADDITIONAL" | jq -Rs .)
}
EOF
else
  # No issues - maybe just suggestions
  if [[ -n "$API_SUGGESTIONS" ]]; then
    cat <<EOF
{
  "continue": true,
  "additionalContext": $(echo -e "$API_SUGGESTIONS" | jq -Rs .)
}
EOF
  else
    echo '{"continue": true}'
  fi
fi
```

**Step 4: Make executable and run tests**

```bash
chmod +x .claude/hooks/effect-post-write.sh
.claude/hooks/test/test-post-write.sh
```

Expected: All tests pass

**Step 5: Commit PostToolUse hook**

```bash
git add .claude/hooks/effect-post-write.sh .claude/hooks/test/test-post-write.sh
git commit -m "feat: add PostToolUse hook for deep validation and state refresh"
```

---

## Task 8: Stop Validation Hook

**Files:**
- Create: `.claude/hooks/effect-stop-validation.sh`
- Create: `.claude/hooks/test/test-stop-validation.sh`

**Step 1: Write test for Stop hook**

Create `.claude/hooks/test/test-stop-validation.sh`:

```bash
#!/bin/bash
# Test Stop validation hook

set -e

# Create test codebase with error eating
mkdir -p /tmp/test-codebase
cat > /tmp/test-codebase/bad-service.ts <<'EOF'
export const myEffect = Effect.gen(function* () {
  yield* serviceA.call()
}).pipe(
  Effect.catchAll(e => new MyError(e))
)
EOF

# Test hook (should block)
cd /tmp/test-codebase
TEST_INPUT='{
  "hook_event_name": "Stop"
}'

RESULT=$(echo "$TEST_INPUT" | ~/.claude/hooks/effect-stop-validation.sh 2>/dev/null || true)

if echo "$RESULT" | jq -e '.decision == "block"' >/dev/null 2>&1; then
  echo "✓ Test 1: Blocked on error eating"
else
  echo "✗ Test 1: Should block on error eating"
  rm -rf /tmp/test-codebase
  exit 1
fi

# Clean up and create good codebase
rm -rf /tmp/test-codebase
mkdir -p /tmp/test-codebase
cat > /tmp/test-codebase/good-service.ts <<'EOF'
export const myEffect = Effect.gen(function* () {
  yield* serviceA.call()
})
EOF

# Test hook (should continue)
cd /tmp/test-codebase
RESULT=$(echo "$TEST_INPUT" | ~/.claude/hooks/effect-stop-validation.sh)

if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ Test 2: Allowed clean code"
else
  echo "✗ Test 2: Should allow clean code"
  rm -rf /tmp/test-codebase
  exit 1
fi

# Cleanup
rm -rf /tmp/test-codebase

echo ""
echo "Stop validation hook tests passed!"
```

**Step 2: Make test executable and run (should fail)**

```bash
chmod +x .claude/hooks/test/test-stop-validation.sh
.claude/hooks/test/test-stop-validation.sh
```

Expected: Hook doesn't exist

**Step 3: Implement Stop validation hook**

Create `.claude/hooks/effect-stop-validation.sh`:

```bash
#!/bin/bash
# Stop/SubagentStop hook - final coherence check

set -e

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/codebase-scanner.sh"

# Check for error eating patterns
COLLAPSED_ERRORS=$(grep -r "catchAll.*new.*Error" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)

if [[ $COLLAPSED_ERRORS -gt 0 ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Found $COLLAPSED_ERRORS instance(s) of error collapsing with catchAll. Review error channels - don't catch all errors just to fix type errors. This usually indicates a layer composition issue. Let the compiler guide proper error handling."
}
EOF
  exit 0
fi

# Check for layer composition issues
ORPHANED=$(find_orphaned_dependencies)

if [[ -n "$ORPHANED" ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Layer composition issues detected:\n\n$ORPHANED\n\nUse Layer.provideMerge (not Layer.provide) when providing dependencies to merged layers to preserve shared service instances."
}
EOF
  exit 0
fi

# Check for untyped promises
UNTYPED_PROMISES=$(grep -r "Effect\.promise\s*(" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)

if [[ $UNTYPED_PROMISES -gt 0 ]]; then
  cat <<EOF
{
  "decision": "block",
  "stopReason": "Found $UNTYPED_PROMISES instance(s) of Effect.promise. Use Effect.tryPromise with typed errors to maintain type safety in the error channel."
}
EOF
  exit 0
fi

# All checks passed
echo '{"continue": true}'
```

**Step 4: Make executable and run tests**

```bash
chmod +x .claude/hooks/effect-stop-validation.sh
.claude/hooks/test/test-stop-validation.sh
```

Expected: All tests pass

**Step 5: Commit Stop validation hook**

```bash
git add .claude/hooks/effect-stop-validation.sh .claude/hooks/test/test-stop-validation.sh
git commit -m "feat: add Stop validation hook for final coherence checks"
```

---

## Task 9: Hook Configuration

**Files:**
- Modify: `.claude/settings.local.json`

**Step 1: Read current settings**

```bash
cat .claude/settings.local.json
```

**Step 2: Add hook configuration**

Update `.claude/settings.local.json` to add hooks configuration:

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
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-pre-write.sh",
            "timeout": 5000
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
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh",
            "timeout": 10000
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
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/effect-stop-validation.sh",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

**Step 3: Validate JSON syntax**

```bash
jq . .claude/settings.local.json > /dev/null && echo "✓ Valid JSON"
```

Expected: "✓ Valid JSON"

**Step 4: Commit configuration**

```bash
git add .claude/settings.local.json
git commit -m "feat: configure Effect-focused hooks in Claude Code settings"
```

---

## Task 10: Integration Testing

**Files:**
- Create: `.claude/hooks/test/integration-test.sh`

**Step 1: Create integration test**

Create `.claude/hooks/test/integration-test.sh`:

```bash
#!/bin/bash
# Integration test - verify all hooks work together

set -e

echo "Running Effect Hooks Integration Tests..."
echo ""

# Test 1: SessionStart
echo "Test 1: SessionStart hook..."
TEST_INPUT='{"session_id": "integration-test", "cwd": "'"$(pwd)"'", "hook_event_name": "SessionStart"}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-session-start.sh)

if echo "$RESULT" | jq -e '.continue == true and .additionalContext' >/dev/null; then
  echo "✓ SessionStart hook working"
else
  echo "✗ SessionStart hook failed"
  exit 1
fi

# Test 2: PreToolUse blocking
echo "Test 2: PreToolUse blocks anti-patterns..."
TEST_INPUT='{"tool_name": "Write", "tool_input": {"content": "Effect.all(items.map(x => x))"}}'
if echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh 2>&1 >/dev/null; then
  echo "✗ PreToolUse should have blocked"
  exit 1
else
  echo "✓ PreToolUse blocking works"
fi

# Test 3: PreToolUse allows good code
echo "Test 3: PreToolUse allows good code..."
TEST_INPUT='{"tool_name": "Write", "tool_input": {"content": "Effect.all(items.map(x => x), { concurrency: 10 })"}}'
if echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh >/dev/null 2>&1; then
  echo "✓ PreToolUse allows good code"
else
  echo "✗ PreToolUse should allow good code"
  exit 1
fi

# Test 4: PostToolUse
echo "Test 4: PostToolUse validates files..."
TEST_FILE="/tmp/integration-test.ts"
echo 'export const test = "test"' > "$TEST_FILE"
TEST_INPUT='{"tool_name": "Write", "tool_input": {"file_path": "'"$TEST_FILE"'"}}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-post-write.sh)

if echo "$RESULT" | jq -e '.continue == true' >/dev/null; then
  echo "✓ PostToolUse hook working"
else
  echo "✗ PostToolUse hook failed"
  exit 1
fi
rm "$TEST_FILE"

# Test 5: Stop validation
echo "Test 5: Stop validation..."
TEST_INPUT='{"hook_event_name": "Stop"}'
RESULT=$(echo "$TEST_INPUT" | .claude/hooks/effect-stop-validation.sh)

if echo "$RESULT" | jq . >/dev/null 2>&1; then
  echo "✓ Stop validation hook working"
else
  echo "✗ Stop validation hook failed"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All integration tests passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Effect hooks are ready to use!"
echo ""
echo "To verify hooks are registered, run:"
echo "  claude --debug"
echo "  /hooks"
```

**Step 2: Make executable and run**

```bash
chmod +x .claude/hooks/test/integration-test.sh
.claude/hooks/test/integration-test.sh
```

Expected: All integration tests pass

**Step 3: Commit integration test**

```bash
git add .claude/hooks/test/integration-test.sh
git commit -m "test: add integration tests for Effect hooks system"
```

---

## Task 11: Documentation

**Files:**
- Create: `.claude/hooks/README.md`

**Step 1: Create hook documentation**

Create `.claude/hooks/README.md`:

```markdown
# Effect-Focused Claude Code Hooks

Comprehensive hook system to improve Effect-TS usage, catch production pitfalls, and guide API exploration.

## Quick Start

Hooks are automatically active in this project. They will:
- **Block** critical anti-patterns (resource leaks, type safety violations)
- **Warn** about suboptimal implementations
- **Guide** you toward better Effect APIs

## Hook Events

### SessionStart
Scans codebase and injects Effect topology context at session start.

**What it does:**
- Finds all Effect services and layers
- Builds dependency graph
- Injects pattern reminders and API exploration guidance

### PreToolUse (Write/Edit)
Fast pattern checks **before** code is written.

**Blocks:**
- Unbounded `Effect.all` (missing `concurrency`)
- `Effect.fork` (should use `forkScoped`)
- `Layer.provide` on merged layers (should use `provideMerge`)
- `Effect.promise` (should use `tryPromise`)
- `catchAll` with error eating
- `Layer.effect` with resources (should use `Layer.scoped`)

### PostToolUse (Write/Edit)
Deep validation **after** code is written.

**Validates:**
- Layer composition correctness
- Resource cleanup patterns against Effect source
- Error channel integrity
- Config.option usage

**Suggests:**
- Better Effect APIs for common patterns
- Source references for canonical implementations

### Stop/SubagentStop
Final coherence check before completing work.

**Blocks if found:**
- Error collapsing patterns
- Orphaned layer dependencies
- Untyped promise wrappers

## Escape Hatch

To bypass validation for a specific case, add comment:

```typescript
// @effect-hook-ignore: reason for exception
Effect.fork(specialCase)
```

## Testing

Run hook tests:

```bash
# Test individual hooks
.claude/hooks/test/test-patterns.sh
.claude/hooks/test/test-scanner.sh
.claude/hooks/test/test-session-start.sh
.claude/hooks/test/test-pre-write.sh
.claude/hooks/test/test-post-write.sh
.claude/hooks/test/test-stop-validation.sh

# Integration test
.claude/hooks/test/integration-test.sh
```

## Debugging

```bash
# Enable debug mode
claude --debug

# Check hook registration
/hooks

# View session state
cat ~/.claude/effect-session-state.json | jq .

# Test hook manually
echo '{"session_id": "test"}' | .claude/hooks/effect-session-start.sh
```

## Architecture

**Libraries:**
- `lib/pattern-matchers.sh` - Regex-based anti-pattern detection
- `lib/codebase-scanner.sh` - Service/layer/dependency scanning
- `lib/source-validator.sh` - Validation against Effect source code

**State Management:**
- Session state: `~/.claude/effect-session-state.json`
- Updated after every file write (per-write refresh)
- Contains current layer topology and dependencies

**Severity Levels:**
- **Block (exit 2)**: Critical issues that cause production problems
- **Warn (exit 0 + message)**: Suboptimal patterns
- **Context (exit 0 + context)**: Guidance and suggestions

## References

- Design: `docs/plans/2025-11-15-effect-hooks-design.md`
- Effect Source: `docs/effect-source/`
- Production Pitfalls: `.claude/skills/effect-production-pitfalls/`
```

**Step 2: Commit documentation**

```bash
git add .claude/hooks/README.md
git commit -m "docs: add Effect hooks README with usage and architecture"
```

---

## Task 12: Final Verification

**Files:**
- None (verification only)

**Step 1: Run all tests**

```bash
echo "Running all hook tests..."
for test in .claude/hooks/test/test-*.sh; do
  echo ""
  echo "Running: $test"
  "$test"
done

echo ""
echo "Running integration test..."
.claude/hooks/test/integration-test.sh
```

Expected: All tests pass

**Step 2: Verify hook registration**

```bash
# Check settings file
echo "Checking hook configuration..."
jq '.hooks | keys' .claude/settings.local.json
```

Expected: See SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop

**Step 3: Test with real Effect code**

Create a test file with an anti-pattern:

```bash
cat > /tmp/test-effect-validation.ts <<'EOF'
// This should be caught by hooks
export const badPattern = Effect.all(
  items.map(item => fetchItem(item))
)
EOF

# Manually test PreToolUse hook
TEST_INPUT='{"tool_name": "Write", "tool_input": {"content": "'"$(cat /tmp/test-effect-validation.ts)"'"}}'
echo "$TEST_INPUT" | .claude/hooks/effect-pre-write.sh
```

Expected: Hook blocks with error about unbounded concurrency

**Step 4: Clean up test file**

```bash
rm /tmp/test-effect-validation.ts
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Effect-focused hooks system complete

Complete implementation of comprehensive Effect hooks:
- SessionStart: context injection and codebase scanning
- PreToolUse: fast pattern blocking
- PostToolUse: deep validation with state refresh
- Stop: final coherence checks

Includes full test suite and documentation.

All hooks validated and ready for production use."
```

---

## Success Criteria

✅ All hook scripts executable and tested
✅ Pattern matchers catch all documented anti-patterns
✅ Codebase scanner finds services and layers
✅ Source validator references Effect source code
✅ SessionStart injects comprehensive guidance
✅ PreToolUse blocks critical issues
✅ PostToolUse validates and suggests improvements
✅ Stop validation prevents error eating and composition issues
✅ Integration tests pass
✅ Documentation complete

## Next Steps

After implementation:

1. **Test in real usage** - Write Effect code and observe hook behavior
2. **Refine patterns** - Add new anti-patterns as discovered
3. **Performance tuning** - Optimize if hooks slow down workflow
4. **Extend coverage** - Add more Effect-specific validations
5. **Share learnings** - Document new patterns in effect-production-pitfalls skill

## Related Skills

- @effect-production-pitfalls - Common mistakes these hooks prevent
- @effect-foundations - Core Effect patterns validated by hooks
- @effect-layers-services - Layer composition guidance
- @superpowers:systematic-debugging - For debugging hook issues
