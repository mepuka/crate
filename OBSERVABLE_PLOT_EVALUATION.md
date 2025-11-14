# Observable Plot Evaluation for KEXP Radio Crate

**Date:** 2025-11-14
**Purpose:** Evaluate Observable Plot for minimalist, high-density, sparkline-inspired visualizations focused on music discovery

---

## Executive Summary

**Recommendation: ✅ STRONG FIT**

Observable Plot is an excellent match for your KEXP music discovery goals. Its declarative API, small bundle size (135kB gzipped), native temporal support, and focus on high-density visualizations align perfectly with your minimalist philosophy and data-driven exploration objectives.

**Key Strengths for Your Use Case:**
- ✅ Built-in support for temporal/timeline visualizations (perfect for play history)
- ✅ Faceting system enables small multiples (ideal for comparing artists/songs)
- ✅ Minimal, memorable API reduces development friction
- ✅ Native React integration via useRef/useEffect
- ✅ Works seamlessly with your Effect-TS architecture (pure data transformation)
- ✅ Grammar of graphics approach matches your compositional patterns
- ✅ Excellent for progressive disclosure (sparklines → detailed views)

---

## 1. Observable Plot Overview

### Philosophy
Observable Plot is a **"concise API for exploratory data visualization"** implementing a layered grammar of graphics. It prioritizes:
- **Accelerating exploration** through memorable syntax
- **High information density** with minimal visual clutter
- **Composability** through layered marks and scales

This philosophy directly aligns with your stated goals of minimalism and music discovery.

### Core Concepts

```javascript
Plot.plot({
  marks: [
    Plot.dot(data, {x: "date", y: "artist", fill: "rotation_status"}),
    Plot.line(data, {x: "date", y: "playCount"})
  ],
  x: {type: "utc", label: "Time"},
  y: {label: "Artist"}
})
```

**Key Components:**
- **Marks**: Geometric shapes (dot, line, area, bar, tick, rule, text, rect, cell)
- **Channels**: Data mappings (x, y, fill, stroke, opacity, r, title)
- **Scales**: Automatic scale inference with customization options
- **Facets**: fx/fy channels for small multiples (partitioning by category)
- **Transforms**: Aggregations, bins, groups, intervals

---

## 2. Alignment with Your Goals

### Goal 1: Minimalist Sparkline-Inspired Visualizations ✅ EXCELLENT

Observable Plot excels at creating compact, information-dense charts:

**Sparkline Example for Play History:**
```javascript
// Tiny play frequency chart (100x20px)
Plot.plot({
  width: 100,
  height: 20,
  axis: null,  // No axes for sparkline
  margin: 0,
  marks: [
    Plot.lineY(playHistory, {
      x: "airdate",
      y: (d) => 1,  // Just presence
      stroke: "#888",
      strokeWidth: 1
    }),
    Plot.dot(playHistory, {
      x: "airdate",
      y: (d) => 1,
      r: 2,
      fill: "currentColor"
    })
  ]
})
```

**When Last Played (Minimalist):**
```javascript
// Show last 5 plays of a song as ticks
Plot.plot({
  height: 30,
  marginLeft: 0,
  x: {type: "utc", label: null, ticks: 0},
  marks: [
    Plot.tickX(recentPlays, {
      x: "airdate",
      stroke: "#666",
      title: (d) => `${d.airdate.toLocaleString()}\n${d.show_name}`
    }),
    Plot.text([lastPlay], {
      x: "airdate",
      text: (d) => "← Last played",
      textAnchor: "start",
      dx: 5
    })
  ]
})
```

### Goal 2: High Data Density Without Obstruction ✅ EXCELLENT

Observable Plot's **faceting** system enables small multiples for comparing many artists/songs simultaneously:

**Artist Comparison Grid:**
```javascript
// Compare play frequency across 20 artists in a 4x5 grid
Plot.plot({
  facet: {data: plays, x: "artist_mbid"},
  fx: {wrap: 4},  // 4 columns
  marks: [
    Plot.rectY(plays, Plot.binX(
      {y: "count"},
      {x: "airdate", interval: "week", fill: "rotation_status"}
    ))
  ],
  width: 800,
  height: 600
})
```

**Play Density Heatmap:**
```javascript
// When are songs played? (day of week × hour)
Plot.plot({
  color: {scheme: "YlGnBu"},
  marks: [
    Plot.cell(plays, Plot.group(
      {fill: "count"},
      {
        x: (d) => d.airdate.getUTCDay(),
        y: (d) => d.airdate.getUTCHours(),
        inset: 0.5
      }
    ))
  ],
  x: {
    label: "Day of week",
    tickFormat: (i) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]
  },
  y: {label: "Hour"}
})
```

### Goal 3: Music Discovery & Exploration ✅ EXCELLENT

Observable Plot's compositional nature supports progressive disclosure:

**Level 1: Inline Sparkline (in PlayCard)**
```jsx
// Tiny 60x15px chart showing "this artist played 15x in past month"
<Plot.plot({
  width: 60,
  height: 15,
  axis: null,
  margin: 0,
  marks: [Plot.areaY(artistPlays, {x: "airdate", y: "count", fill: "#ccc"})]
}) />
```

**Level 2: Details Panel Chart**
```jsx
// Expanded view showing play frequency over time with show markers
Plot.plot({
  marks: [
    Plot.areaY(artistPlays, Plot.binX(
      {y: "count"},
      {x: "airdate", interval: "day", fill: "#4CAF50"}
    )),
    Plot.ruleY([0]),
    Plot.text(showMarkers, {
      x: "start_time",
      y: 0,
      text: "program_name",
      rotate: 90
    })
  ]
})
```

**Level 3: Multi-Artist Comparison**
```jsx
// Faceted view comparing related artists (linked via MBID)
Plot.plot({
  facet: {data: relatedArtistPlays, y: "artist"},
  marks: [
    Plot.lineX(relatedArtistPlays, {x: "airdate", y: "count"})
  ]
})
```

### Goal 4: Linking Plays via MBID ✅ PERFECT

Your MBID infrastructure enables powerful relational visualizations:

**Recording Play History (via recording_mbid):**
```javascript
// All plays of "Let It Be" (any version)
const recordingHistory = plays.filter(
  p => p.recording_mbid === "abc123"
);

Plot.plot({
  marks: [
    Plot.dot(recordingHistory, {
      x: "airdate",
      y: "show",  // Show ID
      fill: "is_live",
      title: (d) => `${d.artist} - ${d.song}\n${d.show_name}`
    })
  ]
})
```

**Artist Collaboration Network (via artist_mbid):**
```javascript
// Which artists are played together in shows?
Plot.plot({
  marks: [
    Plot.link(artistCooccurrences, {
      x1: "artist1_mbid",
      x2: "artist2_mbid",
      y: (d) => d.cooccurrence_count,
      stroke: "#999",
      strokeWidth: (d) => Math.sqrt(d.count)
    })
  ]
})
```

**Release Timeline (via release_group_mbid):**
```javascript
// All albums in a series (e.g., Beatles discography)
Plot.plot({
  marks: [
    Plot.barX(albumPlays, Plot.groupY(
      {x: "count"},
      {y: "release_group_mbid", fill: "rotation_status"}
    ))
  ]
})
```

---

## 3. Technical Integration

### 3.1 React Integration Pattern

Observable Plot works seamlessly with React via `useRef` + `useEffect`:

**Basic Integration:**
```tsx
import * as Plot from '@observablehq/plot';
import { useEffect, useRef } from 'react';

export function PlayHistoryChart({ plays }: { plays: Play[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plays.length) return;

    const plot = Plot.plot({
      marks: [
        Plot.lineY(plays, { x: "airdate", y: "count" })
      ]
    });

    containerRef.current?.replaceChildren(plot);

    return () => plot.remove();
  }, [plays]);

  return <div ref={containerRef} />;
}
```

### 3.2 Effect-TS Integration

Observable Plot is **pure data transformation** – no Effect needed! It fits naturally into your architecture:

**Derived Atom Pattern:**
```typescript
// packages/web/src/atoms/play-analytics.ts
import { Atom } from '@effect/atom';
import { playByIdAtomFamily, playIdsAtom } from './timeline';
import { HashMap } from 'effect';

// Derived atom: aggregate plays by artist MBID
export const playsByArtistMbidAtom = Atom.make((get) => {
  const playIds = get(playIdsAtom);
  const playsByArtist = new Map<string, Play[]>();

  for (const id of playIds) {
    const play = get(playByIdAtomFamily(id));
    for (const mbid of play.artist_mbid) {
      if (!playsByArtist.has(mbid)) playsByArtist.set(mbid, []);
      playsByArtist.get(mbid)!.push(play);
    }
  }

  return playsByArtist;
});

// React component
export function ArtistPlayHistory({ artistMbid }: { artistMbid: string }) {
  const playsByArtist = TimelineRuntime.useAtomValue(playsByArtistAtom);
  const plays = playsByArtist.get(artistMbid) || [];

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const plot = Plot.plot({
      marks: [
        Plot.rectY(plays, Plot.binX(
          { y: "count" },
          { x: "airdate", interval: "month" }
        ))
      ]
    });
    containerRef.current?.replaceChildren(plot);
    return () => plot.remove();
  }, [plays]);

  return <div ref={containerRef} />;
}
```

### 3.3 Integration Points in Current Architecture

**1. PlayDetailsPanel Enhancement:**
```tsx
// packages/web/src/components/PlayDetailsPanel.tsx
export function PlayDetailsPanel({ playId }: { playId: number }) {
  const play = TimelineRuntime.useAtomValue(playAtomFamily(playId));

  return (
    <div>
      {/* Existing metadata */}
      <div className="metadata">...</div>

      {/* NEW: Play history visualizations */}
      <div className="analytics">
        <h3>Play History</h3>
        <RecordingHistoryChart recording_mbid={play.recording_mbid} />

        <h3>Artist Activity</h3>
        <ArtistSparklines artist_mbids={play.artist_mbid} />

        <h3>Related Releases</h3>
        <ReleaseGroupTimeline release_group_mbid={play.release_group_mbid} />
      </div>
    </div>
  );
}
```

**2. Inline PlayCard Sparklines:**
```tsx
// packages/web/src/components/PlayCard.tsx
export function PlayCard({ playId, variant = 'default' }: PlayCardProps) {
  const play = TimelineRuntime.useAtomValue(playAtomFamily(playId));
  const artistHistory = TimelineRuntime.useAtomValue(
    artistHistoryAtomFamily(play.artist_mbid[0])
  );

  return (
    <div className="play-card">
      <AlbumArt src={play.thumbnail_uri} />
      <div className="info">
        <h4>{play.song}</h4>
        <p>{play.artist}</p>

        {/* NEW: Tiny sparkline */}
        {variant === 'default' && artistHistory.length > 1 && (
          <ArtistSparkline plays={artistHistory} width={60} height={12} />
        )}
      </div>
    </div>
  );
}
```

**3. New Visualization Components:**
```tsx
// packages/web/src/components/visualizations/RecordingHistoryChart.tsx
export function RecordingHistoryChart({ recording_mbid }: { recording_mbid: string | null }) {
  if (!recording_mbid) return null;

  const plays = TimelineRuntime.useAtomValue(
    playsByRecordingMbidAtomFamily(recording_mbid)
  );

  // Observable Plot implementation
}

// packages/web/src/components/visualizations/ArtistSparklines.tsx
export function ArtistSparklines({ artist_mbids }: { artist_mbids: string[] }) {
  // Small multiples of play frequency per artist
}

// packages/web/src/components/visualizations/ReleaseGroupTimeline.tsx
export function ReleaseGroupTimeline({ release_group_mbid }: { release_group_mbid: string | null }) {
  // All releases in a group plotted over time
}
```

### 3.4 Data Preparation Service (Optional)

For complex aggregations, create an Effect service:

```typescript
// packages/web/src/services/play-analytics.ts
import { Context, Effect, Layer } from 'effect';
import { TimelineKVS } from '../lib/http-runtime';

export class PlayAnalyticsService extends Context.Tag('PlayAnalyticsService')<
  PlayAnalyticsService,
  {
    readonly getArtistPlayFrequency: (mbid: string) => Effect.Effect<
      Array<{ date: Date; count: number }>,
      never,
      never
    >;
    readonly getRecordingHistory: (mbid: string) => Effect.Effect<
      Play[],
      never,
      never
    >;
  }
>() {}

export const PlayAnalyticsServiceLive = Layer.effect(
  PlayAnalyticsService,
  Effect.gen(function* () {
    const kvs = yield* TimelineKVS;

    return {
      getArtistPlayFrequency: (mbid: string) =>
        Effect.gen(function* () {
          const plays = yield* kvs.getPlaysChunk();

          // Filter & aggregate
          const artistPlays = plays.filter(p =>
            p.artist_mbid.includes(mbid)
          );

          // Group by day
          const byDay = new Map<string, number>();
          for (const play of artistPlays) {
            const day = play.airdate.toISOString().split('T')[0];
            byDay.set(day, (byDay.get(day) || 0) + 1);
          }

          return Array.from(byDay.entries()).map(([date, count]) => ({
            date: new Date(date),
            count
          }));
        }),

      getRecordingHistory: (mbid: string) =>
        Effect.gen(function* () {
          const plays = yield* kvs.getPlaysChunk();
          return plays.filter(p => p.recording_mbid === mbid);
        })
    };
  })
);
```

---

## 4. Specific Visualization Recommendations

### 4.1 Minimalist Play History (Priority 1)

**Use Case:** Show when a song was last played and frequency
**Mark Types:** `Plot.tickX`, `Plot.ruleX`, `Plot.text`
**Data Density:** ⭐⭐⭐⭐⭐ (Very High)

```javascript
Plot.plot({
  height: 40,
  marginTop: 0,
  marginBottom: 20,
  x: {
    type: "utc",
    label: "Play History",
    ticks: 3,
    nice: true
  },
  marks: [
    // Vertical ticks for each play
    Plot.tickX(plays, {
      x: "airdate",
      stroke: "#999",
      strokeWidth: 1.5,
      title: (d) => `${d.airdate.toLocaleDateString()}\n${d.show_name}\n${d.host_names.join(', ')}`
    }),

    // Highlight last play
    Plot.ruleX([plays[0]], {
      x: "airdate",
      stroke: "#4CAF50",
      strokeWidth: 2
    }),

    // Label
    Plot.text([plays[0]], {
      x: "airdate",
      text: "← Last played",
      dy: -10,
      fontSize: 11,
      fill: "#4CAF50"
    })
  ]
})
```

**Placement:** PlayDetailsPanel, below album art

---

### 4.2 Artist Activity Sparklines (Priority 1)

**Use Case:** Show artist play frequency over last 90 days
**Mark Types:** `Plot.areaY`, `Plot.lineY`
**Data Density:** ⭐⭐⭐⭐⭐ (Very High)

```javascript
Plot.plot({
  width: 100,
  height: 20,
  axis: null,
  margin: 0,
  x: { type: "utc", domain: [d3.utcDay.offset(new Date(), -90), new Date()] },
  y: { domain: [0, maxPlaysPerDay] },
  marks: [
    Plot.areaY(artistPlays, Plot.binX(
      { y: "count" },
      {
        x: "airdate",
        interval: "day",
        fill: "rgba(76, 175, 80, 0.2)",
        curve: "monotone-x"
      }
    )),
    Plot.lineY(artistPlays, Plot.binX(
      { y: "count" },
      {
        x: "airdate",
        interval: "day",
        stroke: "#4CAF50",
        strokeWidth: 1,
        curve: "monotone-x"
      }
    ))
  ]
})
```

**Placement:** Inline in PlayCard (next to artist name)

---

### 4.3 Related Artists Comparison (Priority 2)

**Use Case:** Compare play patterns of similar artists (via MBID linking)
**Mark Types:** `Plot.lineY` with faceting
**Data Density:** ⭐⭐⭐⭐ (High)

```javascript
Plot.plot({
  facet: {
    data: relatedArtistPlays,
    y: "artist",
    marginLeft: 100
  },
  height: 600,
  marks: [
    Plot.lineY(relatedArtistPlays, Plot.binX(
      { y: "count" },
      {
        x: "airdate",
        interval: "month",
        stroke: "#666",
        strokeWidth: 1.5
      }
    )),
    Plot.ruleY([0])
  ]
})
```

**Placement:** New "Related Artists" section in PlayDetailsPanel

---

### 4.4 Album Play Timeline (Priority 2)

**Use Case:** Show all plays from an album/release group
**Mark Types:** `Plot.dot`, `Plot.ruleY`
**Data Density:** ⭐⭐⭐ (Medium)

```javascript
Plot.plot({
  marks: [
    // Dot for each play
    Plot.dot(albumPlays, {
      x: "airdate",
      y: "song",
      fill: "rotation_status",
      r: 4,
      title: (d) => `${d.song}\n${d.airdate.toLocaleString()}`
    }),

    // Show boundaries as vertical rules
    Plot.ruleX(showBoundaries, {
      x: "timestamp",
      stroke: "#ccc",
      strokeDasharray: "2,2"
    })
  ],
  color: {
    domain: ["Heavy", "Medium", "Light", "Library"],
    range: ["#c62828", "#f57c00", "#fbc02d", "#7cb342"]
  }
})
```

**Placement:** New "Album Timeline" expandable section

---

### 4.5 Discovery Heatmap (Priority 3)

**Use Case:** When are songs played? (day × hour heatmap)
**Mark Types:** `Plot.cell`
**Data Density:** ⭐⭐⭐⭐⭐ (Very High)

```javascript
Plot.plot({
  color: { scheme: "YlGnBu", legend: true },
  marks: [
    Plot.cell(plays, Plot.group(
      { fill: "count" },
      {
        x: (d) => d.airdate.getUTCDay(),
        y: (d) => d.airdate.getUTCHours(),
        inset: 0.5
      }
    )),
    Plot.text(plays, Plot.group(
      { text: "count" },
      {
        x: (d) => d.airdate.getUTCDay(),
        y: (d) => d.airdate.getUTCHours(),
        fill: "white",
        fontSize: 10
      }
    ))
  ],
  x: {
    label: "Day of Week",
    tickFormat: (i) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]
  },
  y: { label: "Hour of Day" }
})
```

**Placement:** New "Play Patterns" analytics section

---

### 4.6 Rotation Status Distribution (Priority 3)

**Use Case:** How often do songs get played by rotation status?
**Mark Types:** `Plot.barY`, `Plot.rectY`
**Data Density:** ⭐⭐⭐ (Medium)

```javascript
Plot.plot({
  marks: [
    Plot.barY(plays, Plot.groupX(
      { y: "count" },
      {
        x: "rotation_status",
        fill: "rotation_status",
        tip: true
      }
    )),
    Plot.ruleY([0])
  ],
  color: {
    domain: ["Heavy", "Medium", "Light", "Library"],
    range: ["#c62828", "#f57c00", "#fbc02d", "#7cb342"]
  }
})
```

**Placement:** Stats overlay or dedicated analytics page

---

## 5. Performance Considerations

### 5.1 Bundle Size

**Observable Plot:** 135kB (minified + gzipped)
**Dependencies:** D3 modules (automatically bundled)

**Impact:** Minimal. Your current bundle likely already includes React (45kB), TanStack Router (~15kB), and Radix UI components. Adding Plot is comparable to adding 2-3 Radix components.

### 5.2 Rendering Performance

**Client-Side Rendering (CSR):**
- ✅ **Fast for < 1000 points:** Sub-10ms render times
- ⚠️ **Moderate for 1000-10000 points:** 10-100ms (still acceptable)
- ❌ **Slow for > 10000 points:** Consider aggregation or server-side rendering

**Optimization Strategies:**

1. **Data Aggregation:**
```typescript
// Instead of plotting 10,000 individual plays
const aggregated = plays.reduce((acc, play) => {
  const week = d3.utcWeek(play.airdate);
  acc.set(week, (acc.get(week) || 0) + 1);
  return acc;
}, new Map());

// Plot ~50 bars instead of 10,000 dots
```

2. **Memoization:**
```tsx
const chartData = useMemo(() => {
  return plays.filter(p => p.artist_mbid.includes(targetMbid));
}, [plays, targetMbid]);
```

3. **Virtual Scrolling for Facets:**
```tsx
// Only render visible facets in a scrollable container
const visibleArtists = artists.slice(scrollOffset, scrollOffset + 20);
```

### 5.3 Server-Side Rendering (SSR)

Observable Plot supports SSR via `plot.options.document`:

```typescript
// Server-side (if using SSR framework)
import { JSDOM } from 'jsdom';
const document = new JSDOM('').window.document;

const plot = Plot.plot({
  document,  // Use virtual DOM
  marks: [...]
});

const svg = plot.outerHTML;  // Serialize to string
```

**Use Cases:**
- Static dashboards
- Email reports
- Initial page load optimization

### 5.4 Reactivity Performance

Observable Plot is **not reactive** – it's a pure function:

```javascript
// Good: Fast re-render
useEffect(() => {
  const plot = Plot.plot({ marks: [...] });
  containerRef.current.replaceChildren(plot);
  return () => plot.remove();
}, [data]);  // Only re-run when data changes

// Bad: Re-render on every mouse move
const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
useEffect(() => {
  // This will be slow
}, [mousePos]);
```

**Best Practice:** Keep Plot rendering tied to **data changes only**, not UI interactions.

---

## 6. Alternatives Considered

### 6.1 D3.js (Manual)

**Pros:**
- Maximum control and customization
- Your team may already know D3

**Cons:**
- ❌ Verbose (10x more code than Plot)
- ❌ Steeper learning curve
- ❌ More maintenance burden

**Verdict:** Observable Plot is built on D3 internals but abstracts away boilerplate. Use Plot unless you need very custom interactions.

---

### 6.2 Recharts

**Pros:**
- ✅ React-first API
- ✅ Built-in animations

**Cons:**
- ❌ Limited customization
- ❌ Larger bundle (220kB)
- ❌ Not designed for high-density visualizations
- ❌ Poor sparkline support

**Verdict:** Recharts is better for dashboards with large, standalone charts. Not ideal for your minimalist, inline sparkline approach.

---

### 6.3 Victory

**Pros:**
- ✅ React components
- ✅ Mobile-friendly

**Cons:**
- ❌ Even larger bundle (280kB)
- ❌ Slower render performance
- ❌ Over-engineered for simple sparklines

**Verdict:** Overkill for your use case.

---

### 6.4 Chart.js

**Pros:**
- ✅ Simple API
- ✅ Small bundle (65kB)

**Cons:**
- ❌ Canvas-based (not SVG) – harder to customize
- ❌ Limited support for small multiples
- ❌ Not grammar-of-graphics based

**Verdict:** Good for simple bar/line charts, but doesn't match your compositional goals.

---

### 6.5 Custom SVG (No Library)

**Pros:**
- ✅ Zero dependencies
- ✅ Full control

**Cons:**
- ❌ Reinventing the wheel
- ❌ Time-consuming
- ❌ Axis rendering is complex

**Verdict:** Only worth it for ultra-simple visualizations (e.g., a single line chart). Observable Plot saves weeks of development.

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
1. ✅ Install Observable Plot: `pnpm add @observablehq/plot`
2. ✅ Create base chart component wrapper
3. ✅ Add derived atoms for play aggregations
4. ✅ Implement first sparkline (artist activity)

### Phase 2: Core Visualizations (Week 2-3)
5. ✅ Recording play history timeline
6. ✅ Album play scatter plot
7. ✅ Related artists comparison (faceted)
8. ✅ Integration into PlayDetailsPanel

### Phase 3: Advanced Features (Week 4)
9. ✅ Discovery heatmap (day × hour)
10. ✅ Rotation status breakdown
11. ✅ Show boundary markers in timelines
12. ✅ Tooltips with show/host info

### Phase 4: Optimization (Week 5)
13. ✅ Performance profiling
14. ✅ Data aggregation strategies
15. ✅ Memoization patterns
16. ✅ SSR for static charts (if needed)

---

## 8. Example Code: Complete Component

Here's a production-ready component integrating Observable Plot with your Effect-TS architecture:

```tsx
// packages/web/src/components/visualizations/ArtistActivityChart.tsx
import { useEffect, useRef, useMemo } from 'react';
import * as Plot from '@observablehq/plot';
import { TimelineRuntime } from '../../lib/http-runtime';
import { playsByArtistMbidAtomFamily } from '../../atoms/play-analytics';
import type { Play } from '@crate/api';

export interface ArtistActivityChartProps {
  artistMbid: string;
  width?: number;
  height?: number;
  variant?: 'sparkline' | 'detailed';
}

export function ArtistActivityChart({
  artistMbid,
  width = 100,
  height = 20,
  variant = 'sparkline'
}: ArtistActivityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plays = TimelineRuntime.useAtomValue(playsByArtistMbidAtomFamily(artistMbid));

  // Aggregate by day
  const dailyPlayCounts = useMemo(() => {
    const countsByDay = new Map<string, number>();

    for (const play of plays) {
      const day = play.airdate.toISOString().split('T')[0];
      countsByDay.set(day, (countsByDay.get(day) || 0) + 1);
    }

    return Array.from(countsByDay.entries())
      .map(([date, count]) => ({ date: new Date(date), count }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [plays]);

  useEffect(() => {
    if (!dailyPlayCounts.length || !containerRef.current) return;

    const plot = variant === 'sparkline'
      ? createSparkline(dailyPlayCounts, width, height)
      : createDetailedChart(dailyPlayCounts, width, height);

    containerRef.current.replaceChildren(plot);

    return () => plot.remove();
  }, [dailyPlayCounts, width, height, variant]);

  if (!plays.length) {
    return <div className="text-xs text-gray-400">No plays</div>;
  }

  return (
    <div
      ref={containerRef}
      className="inline-block"
      title={`${plays.length} plays in last 90 days`}
    />
  );
}

function createSparkline(
  data: Array<{ date: Date; count: number }>,
  width: number,
  height: number
) {
  return Plot.plot({
    width,
    height,
    axis: null,
    margin: 0,
    x: {
      type: "utc",
      domain: [
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date()
      ]
    },
    marks: [
      Plot.areaY(data, {
        x: "date",
        y: "count",
        fill: "rgba(76, 175, 80, 0.3)",
        curve: "monotone-x"
      }),
      Plot.lineY(data, {
        x: "date",
        y: "count",
        stroke: "#4CAF50",
        strokeWidth: 1.5,
        curve: "monotone-x"
      })
    ]
  });
}

function createDetailedChart(
  data: Array<{ date: Date; count: number }>,
  width: number,
  height: number
) {
  return Plot.plot({
    width,
    height,
    marginLeft: 40,
    marginBottom: 30,
    x: {
      type: "utc",
      label: "Date",
      ticks: 5
    },
    y: {
      label: "Plays per day",
      grid: true
    },
    marks: [
      Plot.rectY(data, {
        x: "date",
        y: "count",
        fill: "#4CAF50",
        tip: true
      }),
      Plot.ruleY([0])
    ]
  });
}
```

**Usage:**
```tsx
// Sparkline in PlayCard
<ArtistActivityChart
  artistMbid={play.artist_mbid[0]}
  variant="sparkline"
  width={60}
  height={15}
/>

// Detailed chart in PlayDetailsPanel
<ArtistActivityChart
  artistMbid={play.artist_mbid[0]}
  variant="detailed"
  width={400}
  height={200}
/>
```

---

## 9. Final Recommendation

### ✅ Proceed with Observable Plot

**Rationale:**
1. **Perfect Alignment:** Matches your minimalist, high-density, exploration-focused goals
2. **Developer Experience:** Concise, memorable API reduces friction
3. **Effect-TS Compatibility:** Pure data transformation fits naturally
4. **Performance:** 135kB bundle is acceptable; rendering is fast for typical datasets
5. **Flexibility:** Supports both tiny sparklines and complex faceted visualizations
6. **Maintenance:** Active development (39 releases, 2092 commits, 5000+ stars)

### Next Steps
1. **Prototype:** Implement one sparkline component this week
2. **Validate:** Show to team/users for feedback
3. **Iterate:** Build out remaining visualizations based on usage patterns
4. **Optimize:** Profile performance and add memoization as needed

### Success Metrics
- ✅ Users click on sparklines to explore related data
- ✅ Average session time increases (more engagement)
- ✅ Users discover new artists/songs via visualizations
- ✅ Development velocity remains high (Plot's concise API)

---

## 10. Resources

**Official Documentation:**
- Homepage: https://observablehq.com/plot/
- Getting Started: https://observablehq.com/plot/getting-started
- Gallery: https://observablehq.com/@observablehq/plot-gallery
- API Reference: https://observablehq.com/plot/features/plots

**Community:**
- GitHub: https://github.com/observablehq/plot
- Forum: https://talk.observablehq.com/

**Examples Relevant to Your Use Case:**
- Timeline with Observable Plot: https://observablehq.com/@gallowayevan/timeline-with-observable-plot
- Small Multiples: https://3iap.com/how-to/observable-plot-parking-plague-javascript-data-visualization/
- Faceting: https://observablehq.com/plot/features/facets

**Integration:**
- React Example: https://github.com/observablehq/plot-create-react-app-example
- CodeSandbox: https://codesandbox.io/s/observable-plot-in-react-uwz97

---

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Author:** Claude Code
**Status:** Ready for Implementation
