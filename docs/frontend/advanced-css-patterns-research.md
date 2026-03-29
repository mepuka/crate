# Advanced CSS Patterns Research for Crate Frontend

**Date:** 2025-11-12
**Context:** Research on modern CSS patterns for subtle, interactive, beautiful UI enhancements that integrate with Effect atoms and the Crate philosophy

> **Note**: This document focuses on CSS patterns and UI design. For state management architecture using effect-atom, see:
> - [Effect-Atom State Architecture](./effect-atom-state-architecture.md) (comprehensive guide)
> - [State Architecture Summary](./state-architecture-summary.md) (quick reference)

---

## Table of Contents

1. [Design Philosophy Alignment](#design-philosophy-alignment)
2. [Effect Atoms & Reactive UI Integration](#effect-atoms--reactive-ui-integration)
3. [Modern CSS Features for 2025](#modern-css-features-for-2025)
4. [Advanced CSS Patterns](#advanced-css-patterns)
5. [Timeline Bar Component Design](#timeline-bar-component-design)
6. [Implementation Recommendations](#implementation-recommendations)

---

## Design Philosophy Alignment

### Crate's Core Principles

Based on `GEMINI.md` and the existing Effect-based architecture:

- **Functional Purity**: All operations are immutable and pure
- **Type Safety**: Schema-first design using Effect Schema
- **Structured Concurrency**: Effect's Fiber-based concurrency model
- **Algebraic Reasoning**: Inspired by algebraic property graphs (APG)

### CSS Philosophy Mapping

To align with Crate's functional paradigm, our CSS approach should be:

1. **Declarative over Imperative**: Use CSS features that describe "what" not "how"
2. **Composable**: Design tokens and utilities that compose like Effect Layers
3. **Type-Safe**: Leverage TypeScript for design system tokens
4. **Minimal Runtime**: Static CSS when possible, avoiding heavy JavaScript
5. **Pure Visual Functions**: CSS as pure transformations (input → output)

---

## Effect Atoms & Reactive UI Integration

### Effect Reactivity in Crate

Currently used in backend (`packages/server/src/sql/Sql.ts`):
```typescript
import { Reactivity } from "@effect/experimental"
Layer.provide(Reactivity.layer)
```

### Recommended Frontend Integration Patterns

#### 1. Effect-UI Pattern (New 2025 Approach)

Recently emerged: **effect-ui** - reactive UI library built entirely on Effect TypeScript

**Key Concept**: Reactivity from Effect's Stream type
- Every state change → stream emission
- Every async operation → Effect
- Every cleanup → scope-managed

**Benefits for Crate**:
- Full type safety end-to-end
- Aligns with existing Effect architecture
- No impedance mismatch between frontend/backend
- Leverages Effect's streams, fibers, scopes natively

#### 2. Effect + Jotai Pattern (Hybrid Approach)

**Jotai** (atomic state management) + **Effect** (business logic)

```typescript
import { atom } from 'jotai'
import { Effect, Schema } from 'effect'

// Define state atoms with Schema validation
const playIdAtom = atom<number | null>(null)
const timelineRangeAtom = atom({ start: 0, end: 100 })

// Effect-based service integration
const loadPlaysEffect = (range: { start: number, end: number }) =>
  Effect.gen(function*() {
    const playsService = yield* FactPlaysService
    return yield* playsService.getPlays(range)
  })

// Bridge: Atom updates trigger Effects
const usePlaysInRange = () => {
  const [range] = useAtom(timelineRangeAtom)
  const [plays, setPlays] = useState([])

  useEffect(() => {
    Effect.runPromise(loadPlaysEffect(range))
      .then(setPlays)
  }, [range])

  return plays
}
```

**Benefits**:
- Clean separation: business logic (Effect) vs UI state (Jotai)
- Minimal boilerplate
- React-friendly while preserving Effect patterns
- Atomic updates minimize re-renders

#### 3. CSS Custom Properties as Reactive Interface

Use CSS custom properties as the "effect" of state changes:

```typescript
// Effect-driven CSS variable updates
const updateTimelinePosition = (playId: number, totalPlays: number) =>
  Effect.sync(() => {
    const percentage = (playId / totalPlays) * 100
    document.documentElement.style.setProperty(
      '--timeline-position',
      `${percentage}%`
    )
  })
```

```css
/* CSS reacts to variable changes */
.timeline-indicator {
  transform: translateY(var(--timeline-position));
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Benefits**:
- Declarative visual state
- Browser handles interpolation (performance)
- Minimal JS/CSS coupling
- Aligns with functional "input → output" model

---

## Modern CSS Features for 2025

### Battle-Tested & Production-Ready

#### 1. Container Queries

**Use Case**: Responsive components based on container size, not viewport

```css
.play-card {
  container-type: inline-size;
}

/* Component responds to its own width */
@container (min-width: 400px) {
  .play-card__artwork {
    float: left;
    width: 150px;
  }
}
```

**Benefits for Crate**:
- Play cards adapt to sidebar, main view, or modal contexts
- Timeline component adjusts without media queries
- True component-level responsiveness

#### 2. `:has()` Relational Pseudo-Class

**Use Case**: Parent/sibling styling based on child state

```css
/* Timeline bar highlights when play is active */
.timeline:has(.play-marker--active) {
  --timeline-glow: var(--color-accent);
}

/* Play card with album art gets different layout */
.play-card:has(.artwork) {
  grid-template-columns: auto 1fr;
}

/* Container with loading state */
.container:has(.loading-spinner) {
  opacity: 0.6;
  pointer-events: none;
}
```

**Benefits**:
- Reduces state management
- Declarative relationships
- No JavaScript for conditional styling

#### 3. Scroll-Driven Animations

**Use Case**: Animations tied to scroll position (runs off main thread!)

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.play-card {
  animation: fade-in-up linear;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}
```

**Benefits**:
- No scroll event listeners in JS
- Runs on compositor thread (60fps+)
- Automatic cleanup
- Perfect for infinite scroll play lists

#### 4. View Transitions API

**Use Case**: Smooth transitions between pages/states

```css
@view-transition {
  navigation: auto;
}

/* Customize transitions for specific elements */
::view-transition-old(play-detail),
::view-transition-new(play-detail) {
  animation-duration: 0.4s;
}
```

**Benefits**:
- Shared element transitions (play card → detail view)
- Minimal code, maximum polish
- Works across page navigations

#### 5. CSS `@property` Rule

**Use Case**: Define custom properties with types, defaults, and animation support

```css
@property --timeline-progress {
  syntax: '<percentage>';
  initial-value: 0%;
  inherits: false;
}

.timeline {
  background: linear-gradient(
    to bottom,
    var(--color-present) var(--timeline-progress),
    var(--color-past) var(--timeline-progress)
  );
  transition: --timeline-progress 0.3s ease-out;
}
```

**Benefits**:
- Animate gradients smoothly
- Type safety in CSS
- Better performance than JS interpolation

---

## Advanced CSS Patterns

### 1. Glassmorphism (Frosted Glass Effect)

**Use Case**: Subtle, modern UI surfaces with depth

```css
.timeline-overlay {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
```

**Best Practices**:
- Use sparingly for focal points (modals, nav, timeline overlay)
- Ensure text contrast (WCAG AA minimum)
- Fallback for Safari on older devices
- Browser support: Excellent in 2025 (Chrome, Edge, Safari, Firefox)

**Crate Applications**:
- Timeline scrubber overlay
- Play detail modal
- Floating controls
- Notification toasts

### 2. Mesh Gradients (Ambient Backgrounds)

**Use Case**: Rich, organic color transitions

```css
.background-ambient {
  background:
    radial-gradient(at 0% 0%, hsla(253, 70%, 50%, 0.2) 0px, transparent 50%),
    radial-gradient(at 50% 50%, hsla(180, 70%, 50%, 0.2) 0px, transparent 50%),
    radial-gradient(at 100% 100%, hsla(300, 70%, 50%, 0.2) 0px, transparent 50%);
  animation: meshMove 20s ease-in-out infinite;
}

@keyframes meshMove {
  0%, 100% { background-position: 0% 0%, 50% 50%, 100% 100%; }
  50% { background-position: 100% 100%, 50% 50%, 0% 0%; }
}
```

**Performance Note**:
- GPU-accelerated (background-position)
- Use `will-change: background-position` sparingly
- Consider static mesh for low-power devices

**Crate Applications**:
- App background (subtle, slow-moving)
- Empty states
- Hero sections

### 3. Reactive Animations with CSS Variables

**Use Case**: JavaScript-driven values, CSS-driven interpolation

```typescript
// Effect-based reactive updates
const updateHoverIntensity = (intensity: number) =>
  Effect.sync(() => {
    document.documentElement.style.setProperty(
      '--hover-intensity',
      `${intensity}`
    )
  })
```

```css
@property --hover-intensity {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

.play-card {
  --card-lift: calc(var(--hover-intensity) * 8px);
  --shadow-opacity: calc(var(--hover-intensity) * 0.2);

  transform: translateY(calc(-1 * var(--card-lift)));
  box-shadow: 0 var(--card-lift) 24px rgba(0, 0, 0, var(--shadow-opacity));
  transition:
    --hover-intensity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Benefits**:
- Browser interpolates values (smooth)
- Single source of truth (--hover-intensity)
- Cascades to all dependent properties

### 4. Color Functions & Design Tokens

**Use Case**: Systematic color with mathematical relationships

```css
:root {
  /* Base colors */
  --color-accent-h: 220;
  --color-accent-s: 80%;
  --color-accent-l: 55%;

  /* Derived colors */
  --color-accent: hsl(var(--color-accent-h) var(--color-accent-s) var(--color-accent-l));
  --color-accent-light: hsl(var(--color-accent-h) var(--color-accent-s) calc(var(--color-accent-l) + 10%));
  --color-accent-dark: hsl(var(--color-accent-h) var(--color-accent-s) calc(var(--color-accent-l) - 10%));

  /* Opacity variants */
  --color-accent-10: hsl(var(--color-accent-h) var(--color-accent-s) var(--color-accent-l) / 0.1);
  --color-accent-20: hsl(var(--color-accent-h) var(--color-accent-s) var(--color-accent-l) / 0.2);
}
```

**Effect Schema Integration**:

```typescript
import { Schema } from 'effect'

// Type-safe design tokens
export const ColorToken = Schema.Struct({
  h: Schema.Number.pipe(Schema.between(0, 360)),
  s: Schema.Number.pipe(Schema.between(0, 100)),
  l: Schema.Number.pipe(Schema.between(0, 100)),
})

export const Theme = Schema.Struct({
  accent: ColorToken,
  background: ColorToken,
  surface: ColorToken,
})

// Generate CSS from Schema
const generateCSSVariables = (theme: typeof Theme.Type) =>
  Effect.sync(() => {
    document.documentElement.style.setProperty(
      '--color-accent-h',
      `${theme.accent.h}`
    )
    // ... etc
  })
```

### 5. Micro-Interactions

**Use Case**: Subtle feedback that delights

```css
/* Button press physics */
.button {
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.6, 1);
}

.button:active {
  transform: scale(0.97);
}

/* Play button ripple */
@keyframes ripple {
  from {
    transform: scale(0);
    opacity: 1;
  }
  to {
    transform: scale(2);
    opacity: 0;
  }
}

.play-button::after {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  border-radius: inherit;
  opacity: 0;
}

.play-button:active::after {
  animation: ripple 0.6s ease-out;
}

/* Checkbox tick animation */
.checkbox__tick {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  transition: stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.checkbox:checked ~ .checkbox__tick {
  stroke-dashoffset: 0;
}
```

**Performance**:
- Use `transform` and `opacity` (compositor-only)
- Avoid `width`, `height`, `top`, `left` (triggers layout)
- `will-change` only when actively animating

---

## Timeline Bar Component Design

### Challenge: Visualizing 2.2M Records

**Problem**: SVG limited to ~1K points, Canvas to ~10K points at 60fps

**Solution**: Mathematical aggregation + hybrid rendering

### Architecture

```
┌─────────────────────────────────────┐
│         Timeline Bar (SVG)          │
│  ┌───────────────────────────────┐  │
│  │   Gradient Background         │  │
│  │   (Time → Darkness)           │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   Density Heatmap (Canvas)    │  │
│  │   (Aggregated play density)   │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   Viewport Markers (SVG)      │  │
│  │   (Currently viewed plays)    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   Interaction Layer (SVG)     │  │
│  │   (Hover, click, scrubbing)   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Layer 1: SVG Structure & Gradient

```tsx
// Vertical timeline with time-based gradient
<svg viewBox="0 0 60 1000" className="timeline">
  <defs>
    <linearGradient id="timeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      {/* Present (top) to Past (bottom) */}
      <stop offset="0%" stopColor="hsl(220 20% 90% / 0.3)" />
      <stop offset="50%" stopColor="hsl(220 20% 60% / 0.2)" />
      <stop offset="100%" stopColor="hsl(220 20% 20% / 0.1)" />
    </linearGradient>
  </defs>

  {/* Base bar */}
  <rect
    x="20"
    y="0"
    width="20"
    height="1000"
    fill="url(#timeGradient)"
    rx="10"
  />
</svg>
```

### Layer 2: Density Visualization (Math-Based)

**Concept**: Divide 2.2M plays into time buckets, visualize density

```typescript
import { Effect, Schema, Chunk } from 'effect'

// Schema for aggregated data
const TimelineBucket = Schema.Struct({
  startTime: Schema.Date,
  endTime: Schema.Date,
  playCount: Schema.Number,
  density: Schema.Number.pipe(Schema.between(0, 1)), // Normalized
})

// Effect-based aggregation
const aggregateTimeline = (
  plays: ReadonlyArray<FactPlay>,
  bucketCount: number = 500 // 500 buckets for 1000px height
) =>
  Effect.gen(function*() {
    const minDate = new Date(Math.min(...plays.map(p => new Date(p.airdate).getTime())))
    const maxDate = new Date(Math.max(...plays.map(p => new Date(p.airdate).getTime())))
    const timeSpan = maxDate.getTime() - minDate.getTime()
    const bucketDuration = timeSpan / bucketCount

    // Initialize buckets
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      startTime: new Date(minDate.getTime() + i * bucketDuration),
      endTime: new Date(minDate.getTime() + (i + 1) * bucketDuration),
      playCount: 0,
      density: 0,
    }))

    // Count plays per bucket
    for (const play of plays) {
      const playTime = new Date(play.airdate).getTime()
      const bucketIndex = Math.floor((playTime - minDate.getTime()) / bucketDuration)
      if (bucketIndex >= 0 && bucketIndex < bucketCount) {
        buckets[bucketIndex].playCount++
      }
    }

    // Normalize density
    const maxCount = Math.max(...buckets.map(b => b.playCount))
    buckets.forEach(b => {
      b.density = maxCount > 0 ? b.playCount / maxCount : 0
    })

    return buckets
  })

// Render density as Canvas overlay
const renderDensityHeatmap = (
  ctx: CanvasRenderingContext2D,
  buckets: ReadonlyArray<typeof TimelineBucket.Type>,
  width: number,
  height: number
) =>
  Effect.sync(() => {
    const bucketHeight = height / buckets.length

    buckets.forEach((bucket, i) => {
      const opacity = bucket.density * 0.5 // Max 50% opacity
      ctx.fillStyle = `hsla(220, 80%, 60%, ${opacity})`
      ctx.fillRect(0, i * bucketHeight, width, bucketHeight)
    })
  })
```

**Visual Result**:
- Darker bands = more plays in that time period
- Lighter bands = fewer plays
- Smooth gradient falloff for aesthetic appeal

### Layer 3: Viewport Markers (Current View)

```tsx
// SVG markers for currently viewed plays
const TimelineMarkers = ({
  viewedPlayIds,
  totalPlays
}: {
  viewedPlayIds: readonly number[]
  totalPlays: number
}) => {
  return (
    <>
      {viewedPlayIds.map(playId => {
        const position = (playId / totalPlays) * 100 // Percentage
        return (
          <g key={playId}>
            {/* Glow effect */}
            <circle
              cx="30"
              cy={`${position}%`}
              r="8"
              fill="hsl(45 100% 50% / 0.3)"
              filter="blur(4px)"
            />
            {/* Marker */}
            <circle
              cx="30"
              cy={`${position}%`}
              r="4"
              fill="hsl(45 100% 60%)"
              stroke="hsl(45 100% 80%)"
              strokeWidth="1"
            />
          </g>
        )
      })}
    </>
  )
}
```

### Layer 4: Interaction

```tsx
import { atom, useAtom } from 'jotai'
import { Effect } from 'effect'

// Atoms for reactive state
const hoveredPositionAtom = atom<number | null>(null)
const selectedPositionAtom = atom<number | null>(null)

const TimelineInteraction = ({
  totalPlays,
  onSeek
}: {
  totalPlays: number
  onSeek: (playId: number) => Effect.Effect<void>
}) => {
  const [hoveredPosition, setHoveredPosition] = useAtom(hoveredPositionAtom)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const percentage = y / rect.height
    setHoveredPosition(percentage)
  }

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const percentage = y / rect.height
    const targetPlayId = Math.floor(percentage * totalPlays)

    Effect.runPromise(onSeek(targetPlayId))
  }

  return (
    <svg
      className="timeline-interaction"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onMouseLeave={() => setHoveredPosition(null)}
    >
      {/* Hover indicator */}
      {hoveredPosition !== null && (
        <g>
          <line
            x1="0"
            x2="60"
            y1={`${hoveredPosition * 100}%`}
            y2={`${hoveredPosition * 100}%`}
            stroke="white"
            strokeWidth="1"
            strokeOpacity="0.5"
            strokeDasharray="4 2"
          />
          <text
            x="65"
            y={`${hoveredPosition * 100}%`}
            fontSize="12"
            fill="white"
            dominantBaseline="middle"
          >
            Play #{Math.floor(hoveredPosition * totalPlays).toLocaleString()}
          </text>
        </g>
      )}
    </svg>
  )
}
```

### Complete Component (Composed)

```tsx
import { Effect, Schema } from 'effect'
import { atom, useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'

// Timeline state atoms
const timelineDataAtom = atom<ReadonlyArray<typeof TimelineBucket.Type>>([])
const viewportPlayIdsAtom = atom<readonly number[]>([])

export const Timeline = ({
  totalPlays = 2_200_000
}: {
  totalPlays?: number
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [timelineData] = useAtom(timelineDataAtom)
  const [viewportPlayIds] = useAtom(viewportPlayIdsAtom)

  // Render density heatmap on Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || timelineData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    Effect.runSync(
      renderDensityHeatmap(ctx, timelineData, 60, 1000)
    )
  }, [timelineData])

  const handleSeek = (playId: number) =>
    Effect.gen(function*() {
      // Load plays around this ID
      const playsService = yield* FactPlaysService
      const contextPlays = yield* playsService.getPlaysAround(playId, 20)
      // Navigate to this position
      // ... implementation
    })

  return (
    <div className="timeline-container">
      {/* Canvas layer (density) */}
      <canvas
        ref={canvasRef}
        width={60}
        height={1000}
        className="timeline-canvas"
      />

      {/* SVG layer (structure + markers + interaction) */}
      <svg
        viewBox="0 0 60 1000"
        className="timeline-svg"
        preserveAspectRatio="none"
      >
        {/* Gradient background */}
        <defs>
          <linearGradient id="timeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(220 20% 90% / 0.3)" />
            <stop offset="100%" stopColor="hsl(220 20% 20% / 0.1)" />
          </linearGradient>
        </defs>

        <rect
          x="20"
          y="0"
          width="20"
          height="1000"
          fill="url(#timeGradient)"
          rx="10"
        />

        {/* Viewport markers */}
        <TimelineMarkers
          viewedPlayIds={viewportPlayIds}
          totalPlays={totalPlays}
        />

        {/* Interaction layer */}
        <TimelineInteraction
          totalPlays={totalPlays}
          onSeek={handleSeek}
        />
      </svg>
    </div>
  )
}
```

### Styling

```css
.timeline-container {
  position: relative;
  width: 60px;
  height: 100vh;
  overflow: hidden;
}

.timeline-canvas,
.timeline-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.timeline-svg {
  pointer-events: all;
  cursor: pointer;
}

.timeline-interaction:hover {
  --timeline-glow: 1;
}

/* Glassmorphism overlay for tooltip */
.timeline-tooltip {
  position: fixed;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  pointer-events: none;
  transform: translate(-50%, -100%);
  margin-top: -8px;
}
```

---

## Implementation Recommendations

### 1. Tech Stack

**Recommended**:
- **Framework**: React (already familiar pattern)
- **State**: Jotai (atomic, minimal, Effect-friendly)
- **Styling**: CSS Modules + CSS Variables
- **Effect Integration**: Direct Effect import in components

**Alternative** (More aligned with Crate philosophy):
- **Framework**: effect-ui (pure Effect, experimental)
- **State**: Effect Stream
- **Styling**: Same (CSS Modules + Variables)

### 2. Project Structure

```
packages/
  frontend/
    src/
      components/
        Timeline/
          Timeline.tsx
          Timeline.module.css
          TimelineEffects.ts     # Effect-based logic
          TimelineAtoms.ts       # Jotai atoms
          TimelineBuckets.ts     # Aggregation math
        PlayCard/
          PlayCard.tsx
          PlayCard.module.css
        ...
      design-system/
        tokens.ts               # Effect Schema design tokens
        tokens.css              # Generated CSS variables
        theme.ts                # Theme switching logic
      effects/
        plays.ts                # FactPlaysService client
        navigation.ts           # URL state management
        ...
      atoms/
        timeline.ts             # Timeline state atoms
        viewport.ts             # Viewport state atoms
        ...
```

### 3. Design System Setup

**Step 1**: Define tokens with Effect Schema

```typescript
// design-system/tokens.ts
import { Schema } from 'effect'

export const SpacingScale = Schema.Literal(0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128)
export const ColorToken = Schema.Struct({
  h: Schema.Number.pipe(Schema.between(0, 360)),
  s: Schema.Number.pipe(Schema.between(0, 100)),
  l: Schema.Number.pipe(Schema.between(0, 100)),
})

export const DesignTokens = Schema.Struct({
  spacing: Schema.Record(Schema.String, SpacingScale),
  colors: Schema.Record(Schema.String, ColorToken),
  radii: Schema.Record(Schema.String, Schema.Number),
  shadows: Schema.Record(Schema.String, Schema.String),
})
```

**Step 2**: Generate CSS from tokens

```typescript
// design-system/generateCSS.ts
import { Effect } from 'effect'
import * as fs from 'fs'

const generateCSSVariables = (tokens: typeof DesignTokens.Type) =>
  Effect.gen(function*() {
    let css = ':root {\n'

    // Colors
    for (const [name, color] of Object.entries(tokens.colors)) {
      css += `  --color-${name}-h: ${color.h};\n`
      css += `  --color-${name}-s: ${color.s}%;\n`
      css += `  --color-${name}-l: ${color.l}%;\n`
      css += `  --color-${name}: hsl(${color.h} ${color.s}% ${color.l}%);\n`
    }

    // Spacing
    for (const [name, value] of Object.entries(tokens.spacing)) {
      css += `  --spacing-${name}: ${value}px;\n`
    }

    css += '}\n'

    yield* Effect.tryPromise(() =>
      fs.promises.writeFile('design-system/tokens.css', css)
    )
  })
```

### 4. Performance Checklist

- [ ] Use `transform` and `opacity` for animations
- [ ] Leverage scroll-driven animations for scroll effects
- [ ] Aggregate timeline data (500-1000 buckets max)
- [ ] Virtualize play list (only render visible items)
- [ ] Use `content-visibility: auto` for off-screen cards
- [ ] Debounce timeline scrubbing (16ms / 60fps)
- [ ] Prefetch adjacent timeline segments
- [ ] Lazy load images with `loading="lazy"`
- [ ] Use `will-change` only during active animations

### 5. Accessibility Checklist

- [ ] Keyboard navigation for timeline (arrow keys)
- [ ] ARIA labels for timeline regions
- [ ] Focus indicators (visible, high-contrast)
- [ ] Prefers-reduced-motion support
- [ ] Minimum contrast ratios (WCAG AA)
- [ ] Screen reader announcements for play changes
- [ ] Skip links for long lists

### 6. Integration with Effect Backend

```typescript
// effects/plays.ts
import { Effect, Schema, Layer } from 'effect'
import { FactPlay } from '@crate/domain/kexp/schemas'

// Client service for frontend
export class PlaysClient extends Effect.Service<PlaysClient>()("PlaysClient", {
  effect: Effect.gen(function*() {
    const fetch = yield* Effect.tryPromise(() =>
      window.fetch('/api/plays')
    )

    return {
      getPlays: (offset: number, limit: number) =>
        Effect.gen(function*() {
          const response = yield* Effect.tryPromise(() =>
            fetch(`/api/plays?offset=${offset}&limit=${limit}`)
              .then(r => r.json())
          )
          return yield* Schema.decodeUnknown(Schema.Array(FactPlay))(response)
        }),

      getPlaysAround: (playId: number, context: number) =>
        Effect.gen(function*() {
          const offset = Math.max(0, playId - Math.floor(context / 2))
          return yield* this.getPlays(offset, context)
        })
    }
  })
}) {}
```

---

## Summary

### Top 5 CSS Patterns for Crate

1. **Container Queries**: Responsive components without media queries
2. **Scroll-Driven Animations**: Performant scroll effects (off main thread)
3. **Glassmorphism**: Subtle depth and hierarchy
4. **CSS @property + Variables**: Reactive, animatable design tokens
5. **:has() Pseudo-Class**: Declarative relational styling

### Timeline Bar Architecture

- **Hybrid SVG + Canvas**: SVG for structure/interaction, Canvas for density
- **Math-Based Aggregation**: 2.2M plays → 500 buckets → smooth visualization
- **Effect Atoms Integration**: Jotai atoms bridge React UI ↔ Effect logic
- **Layered Composition**: Gradient → Density → Markers → Interaction

### Next Steps

1. Set up frontend package in monorepo
2. Implement design system with Effect Schema tokens
3. Build Timeline component (start with static, add interactivity)
4. Connect to backend API
5. Add scroll-driven animations for play list
6. Implement glassmorphism UI surfaces
7. Add View Transitions between pages

---

**Files Generated**:
- `/docs/frontend/advanced-css-patterns-research.md` (this document)

**Related Docs**:
- `/GEMINI.md` - Crate philosophy
- `/packages/server/src/api/API_SPECIFICATION.md` - Backend API
- `/docs/plans/2025-11-11-faiss-search-api-design.md` - Search API
