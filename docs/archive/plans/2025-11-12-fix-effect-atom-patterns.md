# Fix Effect Atom Frontend Design Patterns

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct all Effect-TS/Effect Atom pattern violations in FRONTEND_DESIGN.md and COMPONENT_SPECS.md while preserving component designs.

**Architecture:** Fix 8 critical issues in Effect Atom usage: imports, HttpClient service access, Atom API usage, TaggedError handling, and runtime setup. Documents define frontend architecture for React + Effect Atom state management.

**Tech Stack:** Effect-TS, @effect-atom/atom-react, @effect/platform HttpClient, @effect/schema

---

## Task 1: Fix Package Imports and Standardize

**Files:**
- Modify: `docs/COMPONENT_SPECS.md` (lines 751, 845, 847)
- Modify: `docs/FRONTEND_DESIGN.md` (imports section)

**Step 1: Fix Atom imports in COMPONENT_SPECS.md**

Replace incorrect imports with correct package:

```diff
-import { Atom } from "@effect-atom/atom"
+import { Atom } from "@effect-atom/atom-react"
```

Locations: Lines 751, 845

**Step 2: Standardize Schema imports**

Choose consistent pattern across both documents:

```typescript
import { Schema } from "@effect/schema"

// Then use: Schema.String, Schema.Number, Schema.struct, etc.
```

Replace all instances of:
- `import * as S from "@effect/schema/Schema"` → `import { Schema } from "@effect/schema"`
- `S.String` → `Schema.String`
- `S.struct` → `Schema.Struct`

**Step 3: Fix HttpClient imports**

Use modular imports for better tree-shaking:

```typescript
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
```

Apply to all HTTP-related code sections in both documents.

**Step 4: Verify imports compile**

Check syntax:
```bash
# No actual compilation yet, but verify format is correct
grep -n "import.*@effect" docs/*.md
```

Expected: All imports use correct package names

**Step 5: Commit**

```bash
git add docs/COMPONENT_SPECS.md docs/FRONTEND_DESIGN.md
git commit -m "fix: standardize Effect package imports"
```

---

## Task 2: Fix HttpClient Service Access Pattern

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (lines 240-244, 263-269, 399-449)
- Modify: `docs/COMPONENT_SPECS.md` (lines 789-794, 821-827, 905-920)

**Step 1: Add HttpClient Runtime Setup section in FRONTEND_DESIGN.md**

Add new section after Schema definitions (around line 220):

```markdown
### 3. HttpClient Runtime Setup

Effect Atom requires a runtime to provide services like HttpClient. Create a shared runtime with the FetchHttpClient layer:

**File: `src/lib/http-runtime.ts`**

\`\`\`typescript
import { Atom } from "@effect-atom/atom-react"
import { FetchHttpClient } from "@effect/platform"
import { Layer } from "effect"

// Create runtime with HTTP client for browser
export const httpRuntime = Atom.runtime(
  FetchHttpClient.layer
)

// For configuration (base URL, headers)
const httpConfig = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.mapRequest(
    HttpClient.fetchOk,
    HttpClientRequest.prependUrl(
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
    )
  )
)

// Runtime with configured client
export const configuredHttpRuntime = Atom.runtime(
  Layer.provide(FetchHttpClient.layer, httpConfig)
)
\`\`\`
```

**Step 2: Rewrite timelineAtom with proper service access**

Replace current implementation (lines 240-244) with:

```typescript
import { httpRuntime } from "@/lib/http-runtime"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"
import { Effect } from "effect"
import { Schema } from "@effect/schema"

// Define response schema (keep existing)
const TimelineResponse = Schema.Struct({
  results: Schema.Array(PlayResult),
  next_cursor: Schema.NullOr(Schema.String),
  has_more: Schema.Boolean,
  total_count: Schema.Number,
  anchor_position: Schema.optional(Schema.Number)
})

// Timeline atom with proper HttpClient service access
export const timelineAtom = httpRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({ limit: "50" })
    )

    const response = yield* client.execute(request)
    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response)

    return {
      plays: data.results,
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    } satisfies TimelineState
  })
).pipe(Atom.keepAlive)
```

**Step 3: Update appendPlaysAtom pattern (lines 263-269)**

```typescript
export const appendPlaysAtom = Atom.make(
  Effect.fn(function* (get: Atom.Context, cursor: string) {
    const client = yield* HttpClient.HttpClient
    const currentState = yield* get(timelineAtom)

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({
        cursor,
        limit: "50"
      })
    )

    const response = yield* client.execute(request)
    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response)

    return {
      ...currentState,
      plays: [...currentState.plays, ...data.results],
      cursor: data.next_cursor,
      hasMore: data.has_more
    }
  })
)
```

**Step 4: Apply same pattern to searchResultsAtom**

Update search atom with HttpClient service access following the same pattern.

**Step 5: Update COMPONENT_SPECS.md HTTP client setup (lines 905-920)**

Replace with reference to runtime setup:

```markdown
### HTTP Client Configuration

See `src/lib/http-runtime.ts` for the Effect Atom runtime configuration with HttpClient.

All HTTP-calling atoms use `httpRuntime.atom()` to access the HttpClient service:

\`\`\`typescript
import { httpRuntime } from "@/lib/http-runtime"

export const myApiAtom = httpRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    // ... use client
  })
)
\`\`\`
```

**Step 6: Remove invalid HttpClient.client reference**

Delete or replace lines 915 in COMPONENT_SPECS.md that reference `HttpClient.client`.

**Step 7: Commit**

```bash
git add docs/FRONTEND_DESIGN.md docs/COMPONENT_SPECS.md
git commit -m "fix: add HttpClient service access pattern with runtime setup"
```

---

## Task 3: Fix Atom.fn API Usage

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (line 281, line 256)

**Step 1: Fix jumpToPositionAtom (line 281)**

Replace incorrect `Atom.fn` usage:

```diff
-export const jumpToPositionAtom = Atom.fn((params: {
-  anchor_id?: number
-  since?: string
-  percentage?: number
-}) =>
-  Effect.gen(function* () {
-    // ...
-  })
-)

+export const jumpToPositionAtom = Atom.fn(
+  Effect.fn(function* (params: {
+    anchor_id?: number
+    since?: string
+    percentage?: number
+  }) {
+    const client = yield* HttpClient.HttpClient
+
+    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
+      HttpClientRequest.setUrlParams({
+        anchor_id: params.anchor_id?.toString(),
+        since: params.since,
+        percentage: params.percentage?.toString(),
+        limit: "50"
+      })
+    )
+
+    const response = yield* client.execute(request)
+    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response)
+
+    return {
+      plays: data.results,
+      cursor: data.next_cursor,
+      hasMore: data.has_more,
+      anchorPosition: data.anchor_position
+    }
+  })
+)
```

**Step 2: Check for other Atom.fn usages**

Search for all `Atom.fn` and `Atom.fnEffect`:

```bash
grep -n "Atom\.fn" docs/FRONTEND_DESIGN.md docs/COMPONENT_SPECS.md
```

**Step 3: Replace any Atom.fnEffect with Atom.fn + Effect.fn**

If found, replace pattern:

```diff
-Atom.fnEffect(function* (...) { })
+Atom.fn(Effect.fn(function* (...) { }))
```

**Step 4: Commit**

```bash
git add docs/FRONTEND_DESIGN.md
git commit -m "fix: correct Atom.fn API usage with Effect.fn wrapper"
```

---

## Task 4: Implement TaggedError Error Handling

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (lines 670-680, all atom implementations)
- Modify: `docs/COMPONENT_SPECS.md` (error handling sections)

**Step 1: Define comprehensive TaggedError classes**

Update error definitions section (line 670-680):

```typescript
import { Data } from "effect"

// API Errors
export class TimelineApiError extends Data.TaggedError("TimelineApiError")<{
  readonly cause: unknown
  readonly context?: string
}> {}

export class SearchApiError extends Data.TaggedError("SearchApiError")<{
  readonly cause: unknown
  readonly query: string
}> {}

export class PlayNotFoundError extends Data.TaggedError("PlayNotFoundError")<{
  readonly playId: number
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly cause: unknown
  readonly url: string
}> {}

// Validation Errors
export class InvalidCursorError extends Data.TaggedError("InvalidCursorError")<{
  readonly cursor: string
}> {}

export class InvalidPercentageError extends Data.TaggedError("InvalidPercentageError")<{
  readonly percentage: number
}> {}
```

**Step 2: Apply error handling to timelineAtom**

Wrap HTTP calls with proper error mapping:

```typescript
export const timelineAtom = httpRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const request = HttpClientRequest.get("/api/plays/timeline").pipe(
      HttpClientRequest.setUrlParams({ limit: "50" })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: "/api/plays/timeline"
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(TimelineResponse)(response).pipe(
      Effect.mapError(cause => new TimelineApiError({
        cause,
        context: "Failed to parse timeline response"
      }))
    )

    return {
      plays: data.results,
      cursor: data.next_cursor,
      hasMore: data.has_more,
      isLoading: false,
      error: null
    } satisfies TimelineState
  }).pipe(
    Effect.catchTags({
      NetworkError: (error) => Effect.succeed({
        plays: [],
        cursor: null,
        hasMore: false,
        isLoading: false,
        error: `Network error: ${error.url}`
      }),
      TimelineApiError: (error) => Effect.succeed({
        plays: [],
        cursor: null,
        hasMore: false,
        isLoading: false,
        error: `API error: ${error.context}`
      })
    })
  )
).pipe(Atom.keepAlive)
```

**Step 3: Apply to searchResultsAtom**

Use same pattern with SearchApiError:

```typescript
export const searchResultsAtom = httpRuntime.atom(
  Effect.gen(function* (get) {
    const query = yield* get(searchQueryAtom)
    const client = yield* HttpClient.HttpClient

    if (!query.trim()) {
      return { results: [], isLoading: false, error: null }
    }

    const request = HttpClientRequest.post("/api/plays/search").pipe(
      HttpClientRequest.jsonBody({ query, limit: 20 })
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError(cause => new NetworkError({
        cause,
        url: "/api/plays/search"
      }))
    )

    const data = yield* HttpClientResponse.schemaBodyJson(SearchResponse)(response).pipe(
      Effect.mapError(cause => new SearchApiError({
        cause,
        query
      }))
    )

    return {
      results: data.results,
      isLoading: false,
      error: null
    }
  }).pipe(
    Effect.catchTags({
      NetworkError: () => Effect.succeed({
        results: [],
        isLoading: false,
        error: "Network connection failed"
      }),
      SearchApiError: (error) => Effect.succeed({
        results: [],
        isLoading: false,
        error: `Search failed for "${error.query}"`
      })
    })
  )
)
```

**Step 4: Add error handling guide section**

Add new section in FRONTEND_DESIGN.md:

```markdown
### Error Handling Patterns

All HTTP-calling atoms follow this pattern:

1. **Define domain errors** with TaggedError
2. **Map HTTP errors** to domain errors with `mapError`
3. **Handle errors by tag** with `catchTags`
4. **Return user-friendly state** with error messages

Example:

\`\`\`typescript
const myAtom = httpRuntime.atom(
  Effect.gen(function* () {
    // ... fetch logic
  }).pipe(
    Effect.mapError(cause => new MyDomainError({ cause })),
    Effect.catchTag("MyDomainError", error =>
      Effect.succeed({ /* fallback state */ })
    )
  )
)
\`\`\`
```

**Step 5: Update COMPONENT_SPECS.md error display**

Show how components use typed errors:

```typescript
// In PlayCard or error boundary component
import { TimelineApiError, NetworkError } from "@/lib/errors"

function ErrorDisplay({ error }: { error: unknown }) {
  if (error instanceof TimelineApiError) {
    return <div>Timeline error: {error.context}</div>
  }
  if (error instanceof NetworkError) {
    return <div>Network error at: {error.url}</div>
  }
  return <div>Unknown error</div>
}
```

**Step 6: Commit**

```bash
git add docs/FRONTEND_DESIGN.md docs/COMPONENT_SPECS.md
git commit -m "feat: implement comprehensive TaggedError error handling"
```

---

## Task 5: Fix Schema Date Field

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (lines 147-149)

**Step 1: Replace invalid dateFromString with DateFromString**

```diff
const PlayResult = Schema.Struct({
  id: Schema.Number,
  song: Schema.String,
  artist: Schema.String,
  album: Schema.NullOr(Schema.String),
- airdate: Schema.String.pipe(Schema.dateFromString),
+ airdate: Schema.DateFromString,
  // ... rest of fields
})
```

**Step 2: Update schema documentation**

Add note about date handling:

```markdown
**Note:** `Schema.DateFromString` automatically transforms ISO 8601 strings to `Date` objects. If you need to preserve the string format, use `Schema.String` instead and parse in components.
```

**Step 3: Verify no other invalid pipe usage**

```bash
grep -n "\.pipe.*dateFromString\|\.pipe.*numberFromString" docs/*.md
```

Expected: No matches

**Step 4: Commit**

```bash
git add docs/FRONTEND_DESIGN.md
git commit -m "fix: use Schema.DateFromString for date fields"
```

---

## Task 6: Fix HTTP Method Inconsistencies

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (line 335)
- Modify: `docs/COMPONENT_SPECS.md` (line 863)

**Step 1: Standardize on jsonBody (not bodyJson)**

Find all instances:

```bash
grep -n "bodyJson\|jsonBody" docs/*.md
```

**Step 2: Replace bodyJson with jsonBody**

The correct API is `HttpClientRequest.jsonBody`:

```diff
-HttpClientRequest.bodyJson({ query, limit })
+HttpClientRequest.jsonBody({ query, limit })
```

**Step 3: Update documentation to use jsonBody**

Ensure all examples use `jsonBody` consistently.

**Step 4: Commit**

```bash
git add docs/FRONTEND_DESIGN.md docs/COMPONENT_SPECS.md
git commit -m "fix: use correct HttpClientRequest.jsonBody API"
```

---

## Task 7: Add Runtime Integration Example

**Files:**
- Modify: `docs/COMPONENT_SPECS.md` (add new section after line 750)

**Step 1: Add "Setting Up Effect Atom Runtime" section**

Insert after imports section:

```markdown
## Setting Up Effect Atom Runtime

**File: `src/lib/http-runtime.ts`**

\`\`\`typescript
import { Atom } from "@effect-atom/atom-react"
import { FetchHttpClient } from "@effect/platform"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { Layer } from "effect"

// Base HTTP client layer (browser fetch)
const baseHttpLayer = FetchHttpClient.layer

// Configure base URL and default headers
const httpConfigLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.mapRequest(
    HttpClient.fetchOk,
    HttpClientRequest.prependUrl(
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
    )
  )
)

// Combined runtime with configured HTTP
export const httpRuntime = Atom.runtime(
  Layer.provide(baseHttpLayer, httpConfigLayer)
)

// Export for use in all HTTP-calling atoms
export { httpRuntime }
\`\`\`

**File: `src/main.tsx`**

No special setup needed! The runtime is imported and used directly in atom definitions. Effect Atom handles the service provision automatically.

\`\`\`typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
\`\`\`
```

**Step 2: Add "Using the Runtime in Atoms" subsection**

```markdown
### Using the Runtime in Atoms

All atoms that make HTTP requests must use `httpRuntime.atom()`:

\`\`\`typescript
import { httpRuntime } from "@/lib/http-runtime"
import { HttpClient } from "@effect/platform"
import { Effect } from "effect"

export const myApiAtom = httpRuntime.atom(
  Effect.gen(function* () {
    // Access the HttpClient service
    const client = yield* HttpClient.HttpClient

    // Use client.execute() to make requests
    const response = yield* client.execute(
      HttpClientRequest.get("/api/endpoint")
    )

    return yield* HttpClientResponse.schemaBodyJson(MySchema)(response)
  })
)
\`\`\`

**Key Points:**
- Use `httpRuntime.atom()` not `Atom.make()` for HTTP atoms
- Always `yield* HttpClient.HttpClient` to get the client
- Use `client.execute(request)` to make HTTP calls
- The runtime provides the configured HttpClient automatically
```

**Step 3: Commit**

```bash
git add docs/COMPONENT_SPECS.md
git commit -m "docs: add Effect Atom runtime integration guide"
```

---

## Task 8: Add Reference Links and Verification

**Files:**
- Modify: `docs/FRONTEND_DESIGN.md` (add references section at end)
- Modify: `docs/COMPONENT_SPECS.md` (add references section at end)

**Step 1: Add References section to FRONTEND_DESIGN.md**

Add at end of document:

```markdown
---

## References and Resources

### Effect-TS Documentation
- **Effect Atom**: https://github.com/tim-smart/effect-atom
  - Reactive atoms for Effect
  - Packages: `@effect-atom/atom`, `@effect-atom/atom-react`

- **Effect Platform HTTP**: https://effect.website/docs/guides/platform/http-client
  - HttpClient service
  - HttpClientRequest/Response APIs

- **Effect Schema**: https://effect.website/docs/guides/schema/introduction
  - Runtime type validation
  - Schema definition and transformation

### Package Versions Used
\`\`\`json
{
  "effect": "^3.x",
  "@effect/platform": "^0.x",
  "@effect/schema": "^0.x",
  "@effect-atom/atom": "^0.x",
  "@effect-atom/atom-react": "^0.x"
}
\`\`\`

### Related Examples
- Effect Atom RxJS Demo: https://github.com/tim-smart/effect-atom/tree/main/examples/rx-optimistic-update-demo
- Cheffect (Effect in React): https://github.com/tim-smart/cheffect

---

## Verification Checklist

Before implementation, verify:

- [ ] All imports use correct package names
- [ ] All HTTP atoms use `httpRuntime.atom()`
- [ ] All HTTP calls properly `yield* HttpClient.HttpClient`
- [ ] All errors use TaggedError classes
- [ ] All errors are caught with `catchTags`
- [ ] Schema uses `DateFromString` not `dateFromString`
- [ ] All examples use `jsonBody` not `bodyJson`
- [ ] No references to `HttpClient.client`
- [ ] Runtime setup is documented
- [ ] Examples are self-contained and runnable
```

**Step 2: Add same references to COMPONENT_SPECS.md**

Copy references section to end of COMPONENT_SPECS.md.

**Step 3: Create verification script**

Create `docs/verify-effect-patterns.sh`:

```bash
#!/bin/bash

echo "Verifying Effect-TS patterns..."
echo ""

errors=0

# Check for wrong package names
if grep -n "from \"effect-atom\"" docs/*.md; then
  echo "❌ Found incorrect 'effect-atom' package (should be @effect-atom/atom-react)"
  errors=$((errors+1))
else
  echo "✓ No incorrect effect-atom imports"
fi

# Check for HttpClient.client
if grep -n "HttpClient\.client" docs/*.md; then
  echo "❌ Found invalid HttpClient.client reference"
  errors=$((errors+1))
else
  echo "✓ No invalid HttpClient.client references"
fi

# Check for bodyJson (should be jsonBody)
if grep -n "bodyJson" docs/*.md; then
  echo "❌ Found bodyJson (should be jsonBody)"
  errors=$((errors+1))
else
  echo "✓ Using correct jsonBody API"
fi

# Check for dateFromString (should be DateFromString)
if grep -n "dateFromString" docs/*.md; then
  echo "❌ Found dateFromString (should be DateFromString)"
  errors=$((errors+1))
else
  echo "✓ Using correct DateFromString"
fi

# Check for Atom.fnEffect
if grep -n "Atom\.fnEffect" docs/*.md; then
  echo "⚠️  Found Atom.fnEffect (may not exist, use Atom.fn + Effect.fn)"
  errors=$((errors+1))
else
  echo "✓ No Atom.fnEffect usage"
fi

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "❌ Found $errors issue(s)"
  exit 1
fi
```

**Step 4: Make script executable and run**

```bash
chmod +x docs/verify-effect-patterns.sh
./docs/verify-effect-patterns.sh
```

Expected: All checks pass

**Step 5: Commit**

```bash
git add docs/FRONTEND_DESIGN.md docs/COMPONENT_SPECS.md docs/verify-effect-patterns.sh
git commit -m "docs: add references, verification checklist, and validation script"
```

---

## Task 9: Final Review and PR Update

**Files:**
- Review: All modified files
- Update: PR description

**Step 1: Run verification script**

```bash
./docs/verify-effect-patterns.sh
```

Expected: All checks pass (0 errors)

**Step 2: Review all changes**

```bash
git diff origin/adjunct_new..HEAD --stat
```

Expected: Only docs/ files modified

**Step 3: Create summary of fixes**

Document what was fixed:

```markdown
## Effect-TS Pattern Fixes Applied

### Critical Issues Fixed (8)
1. ✅ Package imports standardized (@effect-atom/atom-react)
2. ✅ HttpClient service access pattern corrected
3. ✅ Atom.fn API usage fixed (Effect.fn wrapper)
4. ✅ TaggedError comprehensive error handling implemented
5. ✅ Schema DateFromString corrected
6. ✅ HTTP method API standardized (jsonBody)
7. ✅ Runtime integration documented
8. ✅ HttpClient.client references removed

### Improvements Added
- Runtime setup guide with FetchHttpClient.layer
- Error handling patterns and examples
- Comprehensive references section
- Verification script for pattern compliance
- Step-by-step integration examples

### What's Preserved
- All component designs (PlayCard, InfiniteTimeline, etc.)
- Virtual scrolling patterns
- React Suspense integration
- Visual mockups and specifications
- TanStack Virtual/Router integration patterns
```

**Step 4: Update PR description**

```bash
gh pr edit 1 --body "$(cat <<'EOF'
# Design KXP Radio Play Explorer Frontend

Comprehensive frontend design documentation for KXP Radio Crate SPA using Effect Atom reactive state management.

## Documents Included

### FRONTEND_DESIGN.md
- Effect Atom reactive state architecture with proper HttpClient service access
- Effect Schema for runtime type validation
- Tagged error handling patterns
- Timeline, search, and navigation state atoms
- HttpClient runtime setup with FetchHttpClient.layer

### COMPONENT_SPECS.md
- Production-ready React component implementations
- PlayCard, InfiniteTimeline, SearchBar, DateDivider components
- Effect Atom integration with useAtomValue, useAtomSet hooks
- Virtual scrolling with @tanstack/react-virtual
- Responsive designs (desktop + mobile)

## Effect-TS Patterns

All patterns follow idiomatic Effect-TS practices:
- ✅ Correct package names (@effect-atom/atom-react)
- ✅ Proper HttpClient service access via runtime
- ✅ TaggedError error handling with catchTags
- ✅ Effect Schema validation
- ✅ Runtime configuration with layers

## Verification

Run verification script:
\`\`\`bash
./docs/verify-effect-patterns.sh
\`\`\`

All patterns validated by effect-engineer agent.

## References
- Effect Atom: https://github.com/tim-smart/effect-atom
- Effect Platform: https://effect.website/docs/guides/platform/http-client
- Effect Schema: https://effect.website/docs/guides/schema/introduction
EOF
)"
```

**Step 5: Push changes**

```bash
git push origin claude/kxp-radio-scroll-search-011CV3MqRQY8qqkyXuLoGf2C
```

**Step 6: Request re-review**

Comment on PR:

```bash
gh pr comment 1 --body "All Effect-TS pattern issues have been addressed. Changes:

- Fixed 8 critical issues identified in review
- Added runtime setup documentation
- Implemented comprehensive error handling
- Added verification script
- All examples now use correct Effect APIs

Ready for re-review. Verification: \`./docs/verify-effect-patterns.sh\` passes."
```

**Step 7: Final verification**

Manually check key sections:
- [ ] FRONTEND_DESIGN.md imports section
- [ ] httpRuntime.atom() usage in all HTTP atoms
- [ ] TaggedError classes used in catchTags
- [ ] References section complete

**Step 8: Confirm ready to merge**

If all checks pass, the documents are ready to merge.

---

## Success Criteria

- [ ] All 8 critical issues from effect-engineer review fixed
- [ ] Verification script passes with 0 errors
- [ ] All imports use correct package names
- [ ] All HTTP atoms properly access HttpClient service
- [ ] All errors use TaggedError with catchTags
- [ ] Runtime setup fully documented
- [ ] PR description updated
- [ ] Component designs preserved
- [ ] Examples are complete and runnable
- [ ] References and resources added

---

## Notes for Implementation

**Key Patterns to Remember:**

1. **HTTP Atoms Pattern:**
```typescript
export const myAtom = httpRuntime.atom(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    // ... use client.execute()
  })
)
```

2. **Error Handling Pattern:**
```typescript
Effect.gen(...)
  .pipe(
    Effect.mapError(cause => new DomainError({ cause })),
    Effect.catchTag("DomainError", error =>
      Effect.succeed({ /* fallback */ })
    )
  )
```

3. **Imports Pattern:**
```typescript
import { Atom } from "@effect-atom/atom-react"
import { HttpClient } from "@effect/platform"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import { Schema } from "@effect/schema"
```

**Common Mistakes to Avoid:**
- Don't use `Atom.make` for HTTP atoms (use `httpRuntime.atom`)
- Don't forget to `yield* HttpClient.HttpClient`
- Don't use `HttpClient.client` (doesn't exist)
- Don't use string-based error handling (use TaggedError)
- Don't use `bodyJson` (use `jsonBody`)
