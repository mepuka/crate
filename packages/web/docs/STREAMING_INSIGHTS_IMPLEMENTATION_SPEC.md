# Engineering Spec: Streaming Narrative Insights ("Living Liner Notes")

**Status:** Draft
**Date:** 2025-05-15
**Target:** `packages/web` (Frontend), `packages/domain` (Shared)
**Prerequisites:** `faiss-search-api` V3 (Deployed)

## 1. Overview & Philosophy

This specification details the implementation of the **Streaming Insights** feature (internally "Living Liner Notes").

### The "Unified Feed"
We are moving away from disparate metadata widgets (`FeaturedLinkPreview`, `CommentWithLinks`) toward a single **Insight Stream**. When a user expands a `PlayCard`, they see a unified narrative feed of insights (DJ comments, AI discoveries, external links) that "stream" in visually.

### The "Spectrum Notch"
A subtle vertical bar on the right edge of the `PlayCard` serves as the primary data indicator, replacing noisy icons. It has three states:
1.  **Idle/Digging:** Muted pulse (fetching).
2.  **Ready:** Glowing spectrum gradient (has data).
3.  **Expanded:** Anchors the content.

## 2. Domain Model (Effect Schema)

We must strictly type the "Insight" polymorphic data structure to match the Python `faiss-search-api` models (`faiss-search-api/app/models/insights.py`).

**File:** `packages/domain/src/insights.ts` (New File)

```typescript
import { Schema } from "effect";

// Base Entities
export const ArtistRef = Schema.Struct({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String)
});

export const RecordingRef = Schema.Struct({
  title: Schema.String,
  mbid: Schema.NullOr(Schema.String),
  artists: Schema.Array(ArtistRef)
});

export const LabelRef = Schema.Struct({
  name: Schema.String,
  mbid: Schema.NullOr(Schema.String)
});

// Insight Variants
export const ConcertInsight = Schema.Struct({
  _tag: Schema.Literal("Concert"),
  artist: ArtistRef,
  venue: Schema.NullOr(Schema.String),
  date: Schema.NullOr(Schema.String), // ISO Date
  sourceQuote: Schema.String
});

export const CoverInsight = Schema.Struct({
  _tag: Schema.Literal("Cover"),
  original: RecordingRef,
  sourceQuote: Schema.String
});

export const SampleInsight = Schema.Struct({
  _tag: Schema.Literal("Sample"),
  sampled: RecordingRef,
  direction: Schema.Literal("samples", "sampled_by"),
  sourceQuote: Schema.String
});

export const PlayHistoryInsight = Schema.Struct({
  _tag: Schema.Literal("PlayHistory"),
  entityMbid: Schema.String,
  entityType: Schema.Literal("recording", "artist", "release", "release_group"),
  totalPlays: Schema.Number,
  firstPlay: Schema.NullOr(Schema.Struct({
      date: Schema.String,
      showName: Schema.String,
      playId: Schema.Number
  })),
  lastPlay: Schema.NullOr(Schema.Struct({
      date: Schema.String,
      showName: Schema.String,
      playId: Schema.Number
  }))
});

export const ConnectionInsight = Schema.Struct({
  _tag: Schema.Literal("Connection"),
  fromArtist: ArtistRef,
  toArtist: ArtistRef,
  connectionType: Schema.Literal("labelmate", "collaborator", "member_of", "same_release_group"),
  viaLabel: Schema.NullOr(LabelRef),
  explanation: Schema.String
});

export const LinkInsight = Schema.Struct({
  _tag: Schema.Literal("Link"),
  url: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  linkType: Schema.Literal("bandcamp", "wikipedia", "discogs", "article", "video", "social", "other")
});

// Discriminated Union
export const Insight = Schema.Union(
  ConcertInsight,
  CoverInsight,
  SampleInsight,
  PlayHistoryInsight,
  ConnectionInsight,
  LinkInsight
);

export type Insight = typeof Insight.Type;
```

## 3. Architecture (Effect-TS)

We follow the **Atom + Runtime** pattern found in `packages/web/src/lib/http-runtime.ts`.

### 3.1 API Client
Extend `AtomHttpApi` to create an `InsightsClient`.

**File:** `packages/web/src/lib/http-runtime.ts`

```typescript
export class InsightsClient extends AtomHttpApi.Tag<InsightsClient>()("InsightsClient", {
  api: KexpApi, // Reuse existing API definition config if possible, or define new
  httpClient: FetchHttpClient.layer,
  baseUrl: API_BASE_URL
}) {}

// Must add InsightsClient.layer to TimelineRuntime definition
```

### 3.2 State Management (Atoms)

We need a per-play state machine. We will use `Atom.family` to create atoms for each `playId`.

**File:** `packages/web/src/atoms/insights.ts`

```typescript
import { Atom, Result } from "@effect-atom/atom-react";
import { Insight } from "@crate/domain/insights";
import { InsightsClient } from "@/lib/http-runtime";
import { TimelineRuntime } from "@/lib/http-runtime";

// State: Result<Insight[]>
// - Initial: Result.initial()
// - Loading: Result.waiting(prev)
// - Success: Result.success(data)
// - Error: Result.fail(error)
export const insightsAtom = Atom.family((playId: number) =>
  Atom.make<Result.Result<Insight[]>>(Result.initial())
);

// Derived: Status for the "Spectrum Notch"
export type NotchState = "idle" | "digging" | "ready" | "empty" | "error";

export const notchStateAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get(insightsAtom(playId));
    return Result.match(result, {
      onInitial: () => "idle",
      onWaiting: () => "digging",
      onSuccess: (data) => data.length > 0 ? "ready" : "empty",
      onFail: () => "error" // "Fail Quietly" -> UI treats as empty or hidden
    });
  })
);
```

### 3.3 The "Stream" Effect
Although the API is request/response (`GET /api/insights/plays/:id`), we treat the *loading process* as a stream to handle race conditions and "fail quietly" requirements.

**Action:** `fetchInsightsAction`

```typescript
export const fetchInsightsAction = TimelineRuntime.fn((playId: number) =>
  Effect.gen(function* (_) {
    const client = yield* _(InsightsClient);
    const atom = insightsAtom(playId);

    // Check if already loaded
    const current = yield* _(Atom.get(atom));
    if (Result.isSuccess(current)) return;

    // 1. Set Loading (Digging)
    yield* _(Atom.set(atom, Result.waiting(current)));

    // 2. Fetch API
    // "Fail Quietly": We catch errors and just set empty/fail without toasting
    const response = yield* _(
      client.get(`/api/insights/plays/${playId}`),
      Effect.map(res => res.insights), // Assuming response shape { insights: [...] }
      Effect.catchAll(err => {
         // Log error but don't crash UI
         return Effect.succeed([]);
      })
    );

    // 3. Set Data
    yield* _(Atom.set(atom, Result.success(response)));
  })
);
```

## 4. UI Implementation Details

### 4.1 `InsightNotch` (Component)
The visual indicator on the card edge.
- **Props:** `playId`
- **Logic:** Reads `notchStateAtom(playId)`.
- **Visuals:**
  - `idle`: Invisible or faint gray line.
  - `digging`: `animate-pulse` opacity.
  - `ready`: Glowing vertical bar (`w-1` or `w-1.5`) with gradient background `bg-gradient-to-b from-teal-400 to-blue-500`.
  - **Animation:** CSS transition on `height` and `opacity`.

### 4.2 `InsightPanel` (Component)
The container that expands inline within `PlayCard`.
- **Replaces:** `FeaturedLinkPreview` and `CommentWithLinks` usage.
- **Logic:**
  - On mount (or when `PlayCard` expands): Triggers `fetchInsightsAction`.
  - Renders `InsightStream`.

### 4.3 `InsightStream` (Component)
Renders the list of insights with a **Staggered Fade-In**.
- **Input:** `Insight[]`
- **Animation:** Use `framer-motion` or Tailwind `animate-fade-in-up` with `animation-delay` (e.g., `stagger-1`, `stagger-2` classes from `globals.css`).
- **Layout:**
  - Map insights to `InsightBlock`.
  - Include DJ Comment as the first "Insight" if present (unified model).

### 4.4 `InsightBlock` (Component)
Polymorphic component rendering the specific insight type.
- **Props:** `insight: Insight`
- **Rendering:**
  - `Concert`: Ticket icon + "Live at [Venue]..."
  - `Cover`: Recycle icon + "Cover of [Original]..."
  - `Sample`: Waveform icon + "Samples [Track]..."
  - `Link`: External Link card (replacing `FeaturedLinkPreview`).
  - `Connection`: Network icon + "Connected to..."

## 5. Integration Plan

### Phase 1: Domain & Infrastructure
1.  **Define Domain Models:** Create `packages/domain/src/insights.ts` with strict Schemas.
2.  **Update Runtime:** Add `InsightsClient` to `packages/web/src/lib/http-runtime.ts` and merge into `TimelineRuntime`.
3.  **Create Atoms:** Implement `insightsAtom` and `fetchInsightsAction` in `packages/web/src/atoms/insights.ts`.

### Phase 2: UI Components
4.  **Create Components:**
    - `packages/web/src/components/insights/InsightNotch.tsx`
    - `packages/web/src/components/insights/InsightBlock.tsx`
    - `packages/web/src/components/insights/InsightStream.tsx`
    - `packages/web/src/components/insights/InsightPanel.tsx`
5.  **Storybook/Test:** Verify components in isolation (if applicable) or via `StreamDemo` route.

### Phase 3: Integration & Cleanup
6.  **Update `PlayCard.tsx`:**
    - Import `InsightNotch` and `InsightPanel`.
    - Add `InsightNotch` absolute positioned on the right.
    - Replace the existing expanded content (`FeaturedLinkPreview`, `CommentWithLinks`) with `InsightPanel`.
    - Ensure clicking the Notch triggers expansion (`setSelectedId`).
7.  **Deprecate/Remove:** Delete `FeaturedLinkPreview.tsx` and `CommentWithLinks.tsx` once verified.

## 6. CSS & Visuals
- **Gradients:** Use the "Spectrum" gradient defined in design docs (`from-teal-400 to-blue-500`).
- **Transitions:** All state changes (idle -> digging -> ready) must be smooth (>300ms).

## 7. References
- Design Doc: `docs/STREAMING_INSIGHTS_UX_DESIGN.md`
- Python Models: `faiss-search-api/app/models/insights.py`
- Existing Runtime: `packages/web/src/lib/http-runtime.ts`
