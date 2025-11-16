# Live Updates Design System
## Streaming Enrichments for Music Discovery

**Version**: 1.0
**Date**: 2025-11-16
**Status**: Design Specification

---

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Design Tokens](#design-tokens)
4. [Component Specifications](#component-specifications)
5. [Animation Patterns](#animation-patterns)
6. [State Transitions](#state-transitions)
7. [Implementation Architecture](#implementation-architecture)
8. [Accessibility & Performance](#accessibility--performance)
9. [Examples & Use Cases](#examples--use-cases)

---

## Overview

### Purpose

This design system defines how enrichments—text snippets, links, analysis results, and agentic discoveries—stream into the timeline in real-time. The system must:

- **Inform without overwhelming**: Updates appear subtly, respecting user focus
- **Maintain the vibe**: Fits the "Late Night Radio Broadcast" aesthetic
- **Build anticipation**: Shows that analysis is happening in the background
- **Preserve context**: Links past plays, builds narrative threads
- **Stay performant**: Handles multiple concurrent updates gracefully

### Key Scenarios

1. **New play arrives** → DJ comment triggers agentic search → Related plays discovered
2. **Enrichment completes** → Text snippet appends to play card → Link appears to past play
3. **Timeline open** → Background analysis runs → Insights stream in over 5-30 seconds
4. **User scrolling** → Updates pause/defer to avoid distraction
5. **Multiple enrichments** → Queue intelligently, animate sequentially

---

## Design Philosophy

### Core Principles

#### 1. **Whisper, Don't Shout**
Enrichments arrive like whispered discoveries from a music-obsessed friend, not breaking news alerts. They enhance rather than interrupt.

#### 2. **Temporal Awareness**
Live updates have a temporal quality—they're happening *now*, which should feel different from static historical data. Use subtle motion and state changes to convey "liveness."

#### 3. **Radio Broadcast Metaphor Extended**
Think of enrichments as the DJ pulling up liner notes mid-show, or calling back to a song they played last week. They're editorial additions that deepen the listening experience.

#### 4. **Progressive Enhancement**
The basic play card works perfectly without enrichments. They layer on top, adding value without being essential to core functionality.

---

## Design Tokens

### Color Tokens for Live States

Building on the existing color system:

```css
/* Existing Foundation */
--color-primary: 27deg 92% 53%;        /* Orange #F58216 */
--color-accent: 180deg 100% 50%;       /* Teal - for links */
--color-background: 0deg 0% 7%;        /* Deep charcoal #121212 */
--color-foreground: 210deg 40% 98%;    /* Warm white */

/* NEW: Live Update States */
--color-enrichment-pending: 180deg 60% 50%;      /* Teal (muted) */
--color-enrichment-streaming: 180deg 80% 55%;    /* Teal (vibrant) */
--color-enrichment-complete: 180deg 100% 50%;    /* Teal (full accent) */
--color-enrichment-error: 0deg 70% 55%;          /* Red (muted) */

/* NEW: Enrichment Type Indicators */
--color-type-link: 180deg 100% 50%;              /* Teal - discovered link */
--color-type-text: 210deg 30% 70%;               /* Cool gray - text snippet */
--color-type-connection: 270deg 60% 60%;         /* Purple - related play */
--color-type-insight: 45deg 85% 55%;             /* Amber - agentic insight */

/* NEW: Glow Effects */
--glow-enrichment-subtle: 0 0 8px hsl(180deg 100% 50% / 0.15);
--glow-enrichment-active: 0 0 16px hsl(180deg 100% 50% / 0.25);
--glow-enrichment-pulse: 0 0 24px hsl(180deg 100% 50% / 0.35);
```

### Opacity Tokens for Streaming States

```css
/* State Opacity Levels */
--opacity-enrichment-ghost: 0.0;        /* Before arrival */
--opacity-enrichment-arriving: 0.3;     /* Fading in */
--opacity-enrichment-settling: 0.7;     /* Becoming solid */
--opacity-enrichment-complete: 1.0;     /* Fully visible */
--opacity-enrichment-background: 0.4;   /* Backgrounded during scroll */
```

### Animation Duration Tokens

```css
/* Timing for Live Updates */
--duration-enrichment-arrive: 600ms;        /* Fade in */
--duration-enrichment-expand: 400ms;        /* Height expansion */
--duration-enrichment-settle: 300ms;        /* Final positioning */
--duration-enrichment-pulse: 2000ms;        /* Attention pulse (once) */
--duration-enrichment-shimmer: 1200ms;      /* Shimmer sweep */

/* Stagger Delays */
--delay-enrichment-stagger-base: 150ms;     /* Between items */
--delay-enrichment-stagger-max: 800ms;      /* Max accumulated delay */
```

### Spacing Tokens for Enrichment Zones

```css
/* Layout Spacing */
--space-enrichment-margin-top: 8px;         /* Above enrichment block */
--space-enrichment-padding: 12px;           /* Internal padding */
--space-enrichment-gap: 6px;                /* Between items */
--space-enrichment-indent: 16px;            /* Indent from main content */
```

### Typography Tokens for Enrichments

```css
/* Text Styling */
--font-enrichment-size: 12px;               /* Slightly smaller than body */
--font-enrichment-weight: 400;              /* Regular (vs 300 body) */
--font-enrichment-line-height: 1.5;         /* Readable line spacing */
--font-enrichment-letter-spacing: 0.01em;   /* Subtle spacing */

/* Labels */
--font-enrichment-label-size: 10px;         /* Tiny uppercase labels */
--font-enrichment-label-weight: 600;        /* Semi-bold */
--font-enrichment-label-spacing: 0.08em;    /* Wide letter spacing */
```

---

## Component Specifications

### 1. EnrichmentContainer

**Purpose**: Wrapper for all enrichment content within a PlayCard

**Visual Design**:
```
┌─────────────────────────────────────┐
│  [Play Card Content]                │
│                                     │
│  ┌─ Enrichments ──────────────────┐│
│  │ [Enrichment Item 1]            ││
│  │ [Enrichment Item 2]            ││
│  │ [Enrichment Item 3 - streaming]││
│  └────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Structure**:
- Positioned below DJ comment (if present)
- Subtle top border with teal accent (10% opacity)
- Glassmorphic background: `rgba(8, 10, 15, 0.20)` with 8px blur
- Rounded corners: 12px
- Padding: 12px
- Margin-top: 8px

**States**:
- `empty`: Not rendered
- `has-enrichments`: Rendered with content
- `streaming`: Additional subtle pulse on container border

**CSS Class**:
```css
.enrichment-container {
  margin-top: var(--space-enrichment-margin-top);
  padding: var(--space-enrichment-padding);

  background: rgba(8, 10, 15, 0.20);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border-top: 1px solid hsl(var(--color-enrichment-complete) / 0.1);

  display: flex;
  flex-direction: column;
  gap: var(--space-enrichment-gap);

  /* Smooth height changes as items arrive */
  transition: height var(--duration-enrichment-expand) cubic-bezier(0.16, 1, 0.3, 1);
}

.enrichment-container[data-streaming="true"] {
  border-top-color: hsl(var(--color-enrichment-streaming) / 0.2);
  box-shadow: var(--glow-enrichment-subtle);
}
```

---

### 2. EnrichmentItem

**Purpose**: Individual enrichment unit (text, link, or connection)

**Variants**:

#### A. Text Snippet
```
┌─────────────────────────────────────┐
│ ┆  "Similar vibe to the 2023..."   │
│    └─ INSIGHT • Just now            │
└─────────────────────────────────────┘
```

#### B. Related Play Link
```
┌─────────────────────────────────────┐
│ ↗  Played 3 days ago                │
│    Artist Name - Track Title         │
│    └─ CONNECTION • 2m ago           │
└─────────────────────────────────────┘
```

#### C. External Link
```
┌─────────────────────────────────────┐
│ 🔗 Interview on NPR Music           │
│    └─ LINK • 5m ago                 │
└─────────────────────────────────────┘
```

**Structure**:
- Left indicator (icon/glyph) in type color
- Main content (text or link)
- Timestamp + type label (subtle, 10px)
- Hover state: Slight lift + shadow

**CSS Classes**:
```css
.enrichment-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;

  font-size: var(--font-enrichment-size);
  font-weight: var(--font-enrichment-weight);
  line-height: var(--font-enrichment-line-height);

  /* Initial state: invisible */
  opacity: 0;
  transform: translateY(10px);

  transition:
    opacity var(--duration-enrichment-arrive) ease-out,
    transform var(--duration-enrichment-arrive) cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.2s ease;
}

/* Arrived state */
.enrichment-item[data-state="complete"] {
  opacity: 1;
  transform: translateY(0);
}

/* Streaming state */
.enrichment-item[data-state="streaming"] {
  opacity: var(--opacity-enrichment-settling);
  animation: shimmerOnce var(--duration-enrichment-shimmer) ease-out;
}

.enrichment-item:hover {
  background-color: rgba(255, 255, 255, 0.03);
  transform: translateY(-1px);
}

/* Type-specific colors */
.enrichment-item[data-type="link"] .enrichment-icon {
  color: hsl(var(--color-type-link));
}

.enrichment-item[data-type="connection"] .enrichment-icon {
  color: hsl(var(--color-type-connection));
}

.enrichment-item[data-type="insight"] .enrichment-icon {
  color: hsl(var(--color-type-insight));
}

.enrichment-item[data-type="text"] .enrichment-icon {
  color: hsl(var(--color-type-text));
}
```

**Icon Set**:
- **Link**: `🔗` or Lucide `ExternalLink`
- **Connection**: `↗` or Lucide `GitBranch`
- **Insight**: `┆` or Lucide `Sparkles`
- **Text**: `"` or Lucide `Quote`

---

### 3. StreamingIndicator

**Purpose**: Shows that enrichment is actively being generated

**Visual Design**:
```
┌─────────────────────────────────────┐
│ ┆  Analyzing DJ comment...          │
│    └─ • • •  (animated dots)        │
└─────────────────────────────────────┘
```

**States**:
- Appears when enrichment process starts
- Animated dots pulse sequentially
- Disappears when first enrichment arrives OR after 10s timeout

**CSS**:
```css
.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;

  font-size: var(--font-enrichment-label-size);
  font-weight: var(--font-enrichment-label-weight);
  letter-spacing: var(--font-enrichment-label-spacing);
  text-transform: uppercase;

  color: hsl(var(--color-enrichment-streaming) / 0.6);

  opacity: 0;
  animation: fadeIn 0.3s ease-out forwards;
}

.streaming-indicator-dots {
  display: flex;
  gap: 4px;
}

.streaming-indicator-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: hsl(var(--color-enrichment-streaming));

  animation: dotPulse 1.4s ease-in-out infinite;
}

.streaming-indicator-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-indicator-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1.2);
  }
}
```

---

### 4. EnrichmentTimestamp

**Purpose**: Shows when enrichment was added (relative time)

**Visual Design**:
```
└─ CONNECTION • 2m ago
```

**CSS**:
```css
.enrichment-timestamp {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;

  font-size: var(--font-enrichment-label-size);
  font-weight: 500;
  font-variant-numeric: tabular-nums;

  color: hsl(var(--color-foreground) / 0.4);
}

.enrichment-timestamp-separator {
  color: hsl(var(--color-foreground) / 0.2);
}

.enrichment-timestamp-type {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--color-foreground) / 0.5);
}
```

---

### 5. RelatedPlayCard (Mini)

**Purpose**: Compact preview of a related play within enrichments

**Visual Design**:
```
┌─────────────────────────────────────┐
│ ↗  Played 3 days ago                │
│    ┌─┐                              │
│    │■│ Artist Name - Track Title     │
│    └─┘ Album (Year)                 │
│        └─ CONNECTION • 2m ago       │
└─────────────────────────────────────┘
```

**Structure**:
- Mini album art: 32x32px with border-radius: 4px
- Two-line layout: Artist - Title / Album (Year)
- Click opens that play's details panel
- Hover: Subtle teal border glow

**CSS**:
```css
.related-play-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid transparent;

  cursor: pointer;
  transition: all 0.2s ease;
}

.related-play-mini:hover {
  background-color: rgba(255, 255, 255, 0.03);
  border-color: hsl(var(--color-accent) / 0.3);
  box-shadow: var(--glow-enrichment-subtle);
}

.related-play-mini-art {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  flex-shrink: 0;

  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.1));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.related-play-mini-content {
  flex: 1;
  min-width: 0; /* Enable text truncation */
}

.related-play-mini-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--color-foreground));

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related-play-mini-album {
  font-size: 10px;
  font-weight: 400;
  color: hsl(var(--color-foreground) / 0.6);

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## Animation Patterns

### 1. Enrichment Arrival Sequence

**Behavior**: When a single enrichment completes

```
1. Container fades in (if first enrichment)       [300ms]
2. Streaming indicator fades out                  [200ms]
3. Item fades in from below with shimmer          [600ms]
4. Single attention pulse                         [1000ms]
5. Settle to static state                         [300ms]
```

**Keyframes**:

```css
@keyframes enrichmentArrive {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes attentionPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 hsl(var(--color-enrichment-complete) / 0);
  }
  50% {
    box-shadow: 0 0 12px 4px hsl(var(--color-enrichment-complete) / 0.15);
  }
}

@keyframes shimmerOnce {
  0% {
    background-position: -100% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

**Usage**:
```css
.enrichment-item[data-state="arriving"] {
  animation:
    enrichmentArrive var(--duration-enrichment-arrive) cubic-bezier(0.16, 1, 0.3, 1) forwards,
    attentionPulse var(--duration-enrichment-pulse) ease-out 0.7s;

  /* Shimmer overlay */
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.05) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmerOnce var(--duration-enrichment-shimmer) ease-out;
}
```

---

### 2. Staggered Multi-Enrichment Arrival

**Behavior**: When multiple enrichments arrive in quick succession

```
Enrichment 1: Starts at 0ms
Enrichment 2: Starts at 150ms (stagger)
Enrichment 3: Starts at 300ms (stagger)
Enrichment 4: Starts at 450ms (stagger)
...
Max stagger: 800ms total
```

**Implementation**:
```typescript
const STAGGER_BASE = 150; // ms
const STAGGER_MAX = 800;  // ms

function calculateStaggerDelay(index: number): number {
  return Math.min(index * STAGGER_BASE, STAGGER_MAX);
}

// In component
<EnrichmentItem
  style={{
    animationDelay: `${calculateStaggerDelay(index)}ms`
  }}
  data-state="arriving"
/>
```

---

### 3. Streaming Text Animation

**Behavior**: For text snippets that stream character-by-character

```
"Similar vibe to the 2023..."
 ^---- Characters appear sequentially
```

**Implementation**:
```typescript
function StreamingText({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i <= text.length) {
        setDisplayedText(text.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 30); // 30ms per character (~33 chars/sec)

    return () => clearInterval(interval);
  }, [text]);

  return <span className="streaming-text">{displayedText}</span>;
}
```

**CSS**:
```css
.streaming-text {
  position: relative;
}

.streaming-text::after {
  content: '▋';
  color: hsl(var(--color-enrichment-streaming));
  animation: cursorBlink 1s step-end infinite;
  margin-left: 2px;
}

.streaming-text[data-complete="true"]::after {
  display: none;
}

@keyframes cursorBlink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

---

### 4. Container Height Expansion

**Behavior**: Smooth height change as enrichments are added

**CSS**:
```css
.enrichment-container {
  overflow: hidden;
  max-height: 0;
  transition: max-height var(--duration-enrichment-expand) cubic-bezier(0.16, 1, 0.3, 1);
}

.enrichment-container[data-has-items="true"] {
  max-height: 500px; /* Practical max */
}
```

**Alternative with auto-height**:
```css
.enrichment-container {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--duration-enrichment-expand) cubic-bezier(0.16, 1, 0.3, 1);
}

.enrichment-container[data-has-items="true"] {
  grid-template-rows: 1fr;
}

.enrichment-container-inner {
  overflow: hidden;
}
```

---

### 5. Scroll-Aware Pause

**Behavior**: When user scrolls timeline, defer new enrichment animations

**Implementation**:
```typescript
function useScrollAwarePause() {
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleScroll = () => {
      setIsPaused(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setIsPaused(false);
      }, 500); // Resume 500ms after scroll stops
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, []);

  return isPaused;
}
```

**CSS Class Toggle**:
```css
.enrichment-item[data-paused="true"] {
  /* Pause animations */
  animation-play-state: paused;
  transition: none;
}
```

---

## State Transitions

### Enrichment Lifecycle States

```
IDLE
  ↓ (enrichment process triggered)
PENDING
  ↓ (API call in progress)
STREAMING
  ↓ (first result arrives)
ARRIVING
  ↓ (animation completes)
COMPLETE
  ↓ (user interaction or time)
SETTLED
```

**State Attributes**:

```typescript
type EnrichmentState =
  | "idle"        // No enrichment process
  | "pending"     // Process started, no results yet
  | "streaming"   // Results arriving
  | "arriving"    // Individual item animating in
  | "complete"    // Item fully visible
  | "settled"     // Item is now part of historical data
  | "error";      // Process failed

interface EnrichmentItem {
  id: string;
  type: "link" | "connection" | "insight" | "text";
  state: EnrichmentState;
  content: string | RelatedPlay | ExternalLink;
  timestamp: Date;
  order: number; // For stagger calculation
}
```

**Visual Indicators per State**:

| State      | Opacity | Animation         | Border Color  | Glow        |
|------------|---------|-------------------|---------------|-------------|
| idle       | 0       | None              | N/A           | None        |
| pending    | 0.3     | StreamingIndicator| Teal 10%      | Subtle      |
| streaming  | 0.7     | Shimmer           | Teal 20%      | Active      |
| arriving   | 0→1     | enrichmentArrive  | Teal 30%      | Pulse       |
| complete   | 1       | None              | Teal 10%      | None        |
| settled    | 1       | None              | Transparent   | None        |
| error      | 0.5     | None              | Red 20%       | None        |

---

## Implementation Architecture

### Data Flow

```
Backend (Agentic Analysis)
    ↓ (Server-Sent Events / WebSocket)
Frontend (Event Stream)
    ↓
EnrichmentService (Effect Layer)
    ↓
enrichmentAtom (Effect-Atom)
    ↓
React Component (useAtomValue)
    ↓
EnrichmentContainer → EnrichmentItem[]
```

---

### Effect-Atom Structure

**New Atoms**:

```typescript
// packages/web/src/atoms/enrichment-atoms.ts

import { Atom } from "@effect/atom"
import { Effect, Chunk, HashMap, Option } from "effect"
import type { PlayId } from "@/lib/models"

/**
 * Enrichment for a specific play
 */
export interface Enrichment {
  readonly id: string
  readonly playId: PlayId
  readonly type: "link" | "connection" | "insight" | "text"
  readonly content: unknown
  readonly state: EnrichmentState
  readonly timestamp: Date
  readonly order: number
}

/**
 * Family atom: Get enrichments for a specific play
 */
export const playEnrichmentsAtom = Atom.family((playId: PlayId) =>
  Atom.make<Chunk.Chunk<Enrichment>>(Chunk.empty())
)

/**
 * Add a new enrichment to a play
 */
export const addEnrichmentAtom = Atom.make(
  (playId: PlayId, enrichment: Omit<Enrichment, "order">) =>
    Effect.gen(function* () {
      const current = yield* playEnrichmentsAtom(playId).get
      const order = Chunk.size(current)
      const newEnrichment = { ...enrichment, order }

      yield* playEnrichmentsAtom(playId).set(
        Chunk.append(current, newEnrichment)
      )
    })
)

/**
 * Update enrichment state
 */
export const updateEnrichmentStateAtom = Atom.make(
  (playId: PlayId, enrichmentId: string, state: EnrichmentState) =>
    Effect.gen(function* () {
      const current = yield* playEnrichmentsAtom(playId).get

      const updated = Chunk.map(current, (e) =>
        e.id === enrichmentId ? { ...e, state } : e
      )

      yield* playEnrichmentsAtom(playId).set(updated)
    })
)

/**
 * Streaming indicator state
 */
export const isStreamingAtom = Atom.family((playId: PlayId) =>
  Atom.make<boolean>(false)
)
```

---

### Service Layer (Effect)

```typescript
// packages/web/src/services/enrichment-service.ts

import { Effect, Stream, Duration, Schedule } from "effect"
import type { PlayId } from "@/lib/models"

export interface EnrichmentService {
  /**
   * Start enrichment process for a play
   * Returns a Stream of enrichment items as they're discovered
   */
  readonly enrichPlay: (playId: PlayId) => Stream.Stream<Enrichment, EnrichmentError>

  /**
   * Cancel enrichment process
   */
  readonly cancelEnrichment: (playId: PlayId) => Effect.Effect<void>
}

export const EnrichmentService = Context.GenericTag<EnrichmentService>("EnrichmentService")

/**
 * Live implementation using Server-Sent Events
 */
export const EnrichmentServiceLive = Layer.effect(
  EnrichmentService,
  Effect.gen(function* () {
    const httpClient = yield* FetchHttpClient.FetchHttpClient

    return {
      enrichPlay: (playId: PlayId) =>
        Stream.asyncEffect<Enrichment, EnrichmentError>((emit) =>
          Effect.gen(function* () {
            // Open SSE connection to backend
            const eventSource = new EventSource(`/api/enrich/${playId}`)

            eventSource.onmessage = (event) => {
              const enrichment = JSON.parse(event.data)
              emit.single(enrichment)
            }

            eventSource.onerror = () => {
              emit.fail(new EnrichmentError({ playId, message: "Stream failed" }))
              eventSource.close()
            }

            // Cleanup
            return Effect.sync(() => eventSource.close())
          })
        ).pipe(
          // Add stagger delay between items
          Stream.schedule(Schedule.spaced(Duration.millis(150))),
          // Timeout after 30 seconds
          Stream.timeout(Duration.seconds(30))
        ),

      cancelEnrichment: (playId: PlayId) =>
        Effect.sync(() => {
          // Close SSE connection
          // (implementation depends on state management)
        })
    }
  })
)
```

---

### React Component Integration

```typescript
// packages/web/src/components/PlayCard.tsx

import { useAtomValue, useAtomDispatch } from "@effect-rx/rx-react"
import { playEnrichmentsAtom, isStreamingAtom } from "@/atoms/enrichment-atoms"

export function PlayCard({ play }: { play: Play }) {
  const enrichments = useAtomValue(playEnrichmentsAtom(play.id))
  const isStreaming = useAtomValue(isStreamingAtom(play.id))

  return (
    <div className="play-card">
      {/* Existing play card content */}

      <EnrichmentContainer
        enrichments={enrichments}
        isStreaming={isStreaming}
      />
    </div>
  )
}

function EnrichmentContainer({
  enrichments,
  isStreaming
}: {
  enrichments: Chunk.Chunk<Enrichment>
  isStreaming: boolean
}) {
  const hasItems = Chunk.size(enrichments) > 0

  if (!hasItems && !isStreaming) return null

  return (
    <div
      className="enrichment-container"
      data-has-items={hasItems}
      data-streaming={isStreaming}
    >
      {isStreaming && <StreamingIndicator />}

      {Chunk.toArray(enrichments).map((enrichment) => (
        <EnrichmentItem
          key={enrichment.id}
          enrichment={enrichment}
        />
      ))}
    </div>
  )
}
```

---

### Backend API Endpoint

```typescript
// packages/server/src/routes/enrichment.ts

import { Effect, Stream, Duration } from "effect"
import { OpenAI } from "@/services/openai"
import { PlayRepository } from "@/services/play-repository"

/**
 * POST /api/enrich/:playId
 *
 * Starts agentic enrichment process and streams results
 */
export const enrichPlayRoute = Route.post("/api/enrich/:playId")(
  Effect.gen(function* () {
    const playId = yield* Route.param("playId")
    const play = yield* PlayRepository.getPlay(playId)
    const openai = yield* OpenAI

    // Create SSE stream
    const stream = Stream.asyncEffect<Enrichment>((emit) =>
      Effect.gen(function* () {
        // 1. Extract DJ comment
        const comment = play.comment

        // 2. Search for related plays
        const relatedPlays = yield* searchRelatedPlays(comment)
        relatedPlays.forEach((relatedPlay) => {
          emit.single({
            id: `conn-${relatedPlay.id}`,
            playId,
            type: "connection",
            content: relatedPlay,
            state: "arriving",
            timestamp: new Date()
          })
        })

        // 3. Extract links from comment
        const links = extractLinks(comment)
        links.forEach((link) => {
          emit.single({
            id: `link-${link.url}`,
            playId,
            type: "link",
            content: link,
            state: "arriving",
            timestamp: new Date()
          })
        })

        // 4. Generate agentic insights
        const insights = yield* openai.generateInsights(play)
        insights.forEach((insight) => {
          emit.single({
            id: `insight-${Math.random()}`,
            playId,
            type: "insight",
            content: insight,
            state: "arriving",
            timestamp: new Date()
          })
        })

        emit.end()
      })
    )

    return Response.sse(stream)
  })
)
```

---

## Accessibility & Performance

### Accessibility Considerations

#### 1. **Screen Reader Announcements**

```typescript
function EnrichmentItem({ enrichment }: { enrichment: Enrichment }) {
  const [announced, setAnnounced] = useState(false)

  useEffect(() => {
    if (enrichment.state === "complete" && !announced) {
      // Announce to screen readers
      const announcement = document.createElement("div")
      announcement.setAttribute("role", "status")
      announcement.setAttribute("aria-live", "polite")
      announcement.textContent = `New ${enrichment.type}: ${getContentSummary(enrichment)}`
      document.body.appendChild(announcement)

      setTimeout(() => announcement.remove(), 1000)
      setAnnounced(true)
    }
  }, [enrichment.state, announced])

  // ... rest of component
}
```

#### 2. **Reduced Motion**

```css
@media (prefers-reduced-motion: reduce) {
  .enrichment-item {
    animation: none !important;
    transition: opacity 0.1s ease, background-color 0.2s ease;
  }

  .enrichment-container {
    transition: none;
  }

  .streaming-indicator-dot {
    animation: none;
    opacity: 0.6;
  }
}
```

#### 3. **Focus Management**

```typescript
function EnrichmentContainer({ enrichments }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(0)

  useEffect(() => {
    const currentCount = Chunk.size(enrichments)

    // New enrichment arrived
    if (currentCount > previousCount.current) {
      // Don't steal focus, but make focusable
      const newItem = containerRef.current?.querySelector('[data-state="arriving"]')
      if (newItem instanceof HTMLElement) {
        newItem.setAttribute("tabindex", "0")
      }
    }

    previousCount.current = currentCount
  }, [enrichments])

  return <div ref={containerRef}>...</div>
}
```

---

### Performance Optimizations

#### 1. **Virtual Scrolling for Many Enrichments**

If a play accumulates 50+ enrichments, use virtualization:

```typescript
import { useVirtualizer } from "@tanstack/react-virtual"

function EnrichmentList({ enrichments }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: Chunk.size(enrichments),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Estimated item height
    overscan: 5
  })

  return (
    <div ref={parentRef} style={{ maxHeight: "400px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const enrichment = Chunk.unsafeGet(enrichments, virtualItem.index)
          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              <EnrichmentItem enrichment={enrichment} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

#### 2. **Animation Throttling**

Limit concurrent animations to avoid jank:

```typescript
const MAX_CONCURRENT_ANIMATIONS = 3

function useStaggeredAnimations(items: Enrichment[]) {
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set())

  useEffect(() => {
    const pending = items.filter((i) => i.state === "arriving")

    const startNext = () => {
      if (animatingItems.size >= MAX_CONCURRENT_ANIMATIONS) return

      const next = pending.find((i) => !animatingItems.has(i.id))
      if (next) {
        setAnimatingItems((prev) => new Set([...prev, next.id]))

        setTimeout(() => {
          setAnimatingItems((prev) => {
            const updated = new Set(prev)
            updated.delete(next.id)
            return updated
          })
          startNext()
        }, 600) // Animation duration
      }
    }

    startNext()
  }, [items, animatingItems])

  return animatingItems
}
```

#### 3. **Debounced State Updates**

```typescript
function useDebounced EnrichmentState(enrichments: Chunk.Chunk<Enrichment>) {
  const [debouncedEnrichments, setDebouncedEnrichments] = useState(enrichments)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedEnrichments(enrichments)
    }, 100)

    return () => clearTimeout(timeout)
  }, [enrichments])

  return debouncedEnrichments
}
```

#### 4. **CSS Containment**

```css
.enrichment-container {
  /* Isolate layout and paint */
  contain: layout paint;
}

.enrichment-item {
  /* Hint at transform animations */
  will-change: transform, opacity;
}

.enrichment-item[data-state="complete"] {
  /* Remove hint after animation */
  will-change: auto;
}
```

---

## Examples & Use Cases

### Use Case 1: DJ Comment Triggers Search

**Scenario**: DJ says "This reminds me of that Khruangbin track we played last month"

**Enrichment Flow**:

1. **T+0ms**: User sees new play appear in timeline
2. **T+500ms**: Backend detects "reminds me" + "played last month" keywords
3. **T+800ms**: Streaming indicator appears in play card
   ```
   ┆  Searching for related plays...
      └─ • • •
   ```
4. **T+2000ms**: First related play found, arrives with animation
   ```
   ↗  Played 23 days ago
      ┌─┐
      │■│ Khruangbin - Maria También
      └─┘ Con Todo El Mundo (2018)
          └─ CONNECTION • Just now
   ```
5. **T+2600ms**: Second related play arrives (staggered 600ms)
6. **T+3200ms**: Third related play arrives
7. **T+3500ms**: Streaming indicator fades out
8. **T+4000ms**: All enrichments settled

**Visual Result**:
```
┌──────────────────────────────────────────┐
│ ● Currently Playing                      │
│ Artist Name - Track Title                │
│ Album (2024)                             │
│                                          │
│ DJ: "This reminds me of that Khruangbin  │
│      track we played last month"         │
│                                          │
│ ┌─ Enrichments ────────────────────────┐ │
│ │ ↗ Played 23 days ago                 │ │
│ │   ┌─┐                                │ │
│ │   │■│ Khruangbin - Maria También      │ │
│ │   └─┘ Con Todo El Mundo (2018)       │ │
│ │       └─ CONNECTION • Just now       │ │
│ │                                      │ │
│ │ ↗ Played 31 days ago                 │ │
│ │   ┌─┐                                │ │
│ │   │■│ Khruangbin - August 10          │ │
│ │   └─┘ Mordechai (2020)               │ │
│ │       └─ CONNECTION • Just now       │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

---

### Use Case 2: External Link Discovery

**Scenario**: DJ plays new single, backend finds NPR article about the artist

**Enrichment Flow**:

1. New play detected with "NEW MUSIC" badge
2. Backend searches artist name + "interview" OR "feature"
3. Finds NPR Music article from 2 weeks ago
4. Enrichment arrives:
   ```
   🔗 NPR Music: Artist Name on navigating fame
       └─ LINK • 3m ago
   ```
5. Click opens article in new tab

---

### Use Case 3: Agentic Insight Generation

**Scenario**: AI analyzes genre patterns and discovers cross-era connection

**Enrichment Flow**:

1. Backend analyzes recent plays
2. Discovers: "This neo-soul track shares production techniques with 1970s jazz-funk"
3. Streams insight character-by-character:
   ```
   ┆  "Shares production techniques with 1970s jazz-funk,
       particularly the use of..."
       └─ INSIGHT • 5m ago
   ```
4. User can expand for full analysis

---

### Use Case 4: Multi-Play Timeline View

**Scenario**: User has timeline open with 10 visible plays, 3 are being enriched concurrently

**Behavior**:
- Each play's enrichments arrive independently
- Max 3 animations on screen at once (throttled)
- Scroll pauses new arrivals until user stops
- Each play maintains its own streaming indicator
- No performance degradation

**Visual**:
```
Timeline (scrolled to middle)
  Play A (2 hours ago)    [3 enrichments, all complete]
  Play B (1.5 hours ago)  [Streaming... • • •]
  Play C (1 hour ago)     [No enrichments]
  Play D (45 min ago)     [1 enrichment arriving ✨]
  Play E (30 min ago)     [Streaming... • • •]
  Play F (15 min ago)     [No enrichments]
  ...
```

---

## Future Considerations

### Phase 2 Enhancements

1. **User Preferences**
   - Toggle enrichments on/off per play
   - Auto-collapse old enrichments
   - Hide certain enrichment types

2. **Enrichment Grouping**
   - "Show 5 more connections" collapse/expand
   - Categorized tabs: Connections | Links | Insights

3. **Interactive Enrichments**
   - Hover over connection → Preview tooltip
   - Click insight → Full analysis modal
   - React to enrichment: 👍 helpful / 👎 not relevant

4. **Persistence**
   - Save enrichments to database
   - Show enrichments on historical plays
   - Export enrichments as JSON

5. **Social Features**
   - Share interesting connections
   - Crowdsourced enrichments
   - DJ can pin favorite enrichments

---

## Conclusion

This design system balances **subtlety with visibility**, ensuring enrichments enhance the music discovery experience without overwhelming users. By extending the existing "Late Night Radio Broadcast" aesthetic with carefully considered animations, timing, and visual hierarchy, enrichments feel like natural discoveries rather than intrusive notifications.

**Key Principles Recap**:
- 🎙️ **Whisper, don't shout**: Subtle arrivals with tasteful animations
- ⏱️ **Temporal awareness**: Live updates feel different from static data
- 🎨 **Consistent aesthetic**: Teal accents, glassmorphism, era-based colors
- ⚡ **Performance-first**: Throttled animations, scroll-aware pausing
- ♿ **Accessible**: Screen reader support, reduced motion, focus management

**Next Steps**:
1. Implement `EnrichmentContainer` and `EnrichmentItem` components
2. Build Effect-Atom state management for enrichments
3. Create backend SSE endpoint for streaming enrichments
4. Add animation keyframes to CSS
5. Test with real agentic workflows

---

**Document Version**: 1.0
**Last Updated**: 2025-11-16
**Author**: Design System Team
**Status**: Ready for Implementation 🚀
