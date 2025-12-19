# Timeline Feature - Unified Synthesis & Master Improvement Plan

**Date:** December 16, 2025
**Synthesizer:** Claude (Synthesis Agent)
**Source Reviews:**
- Performance Review
- UX & Accessibility Review
- Feature Research
- Backend Review

---

## Executive Summary

This synthesis consolidates findings from four comprehensive timeline reviews, identifying cross-cutting themes and creating a unified improvement roadmap. The timeline feature demonstrates strong technical foundations but faces critical issues around image reliability and accessibility compliance.

### Critical Cross-Review Finding: Image Staleness

**The most significant issue appears in both Performance and Backend reviews:**

**Root Cause Identified:**
1. **Backend Issue**: KXEP API provides ephemeral image URLs from archive.org CDN that change over time
2. **No Validation Pipeline**: URLs pass through BFF → Database → API → Frontend without validation
3. **30-Day Proxy Cache**: Broken images persist for 30 days due to aggressive caching
4. **No Monitoring**: No detection or alerting for broken image URLs

**User Impact:**
- ~30% of album art fails to load or becomes stale
- Broken images persist for extended periods
- No fallback mechanism beyond frontend placeholder gradients

**Solution Requires:** Backend + Frontend coordination (see Critical Priority section below)

### Overall Health Assessment

| Dimension | Grade | Status | Notes |
|-----------|-------|--------|-------|
| **Backend Architecture** | A | Excellent | Clean separation, efficient pagination, strong Effect patterns |
| **Frontend Performance** | B+ | Good | Virtualization works well, needs image/insight optimization |
| **Accessibility** | C | Poor | Missing keyboard nav, WCAG violations, touch targets |
| **User Experience** | B | Good | Needs scroll snapping, better navigation aids |
| **Image Reliability** | D | Critical | Root cause identified, comprehensive fix needed |
| **Discovery Features** | B+ | Good | Strong foundation, room for enhancement |

---

## Cross-Review Analysis

### Theme 1: Image Reliability Crisis

**Evidence Across Reviews:**

**Performance Review:**
> "Album Art Loading Staleness - Images fail to load or become stale after extended browser sessions... Missing Image Proxy Implementation - CORS-blocked domains rely on non-existent proxy endpoint"

**Backend Review:**
> "Image Staleness Root Cause: KXEP API Provides Ephemeral URLs... Archive.org URLs can change over time: CDN subdomain rotation, path changes due to metadata updates... No URL Validation Pipeline: KXEP API → BFF (pass-through) → SQLite (no validation) → FastAPI (pass-through) → Frontend"

**Common Ground:**
- Both reviews identify image staleness as critical
- Backend review provides root cause analysis (ephemeral URLs)
- Performance review identifies missing proxy and retry logic
- Solution requires full-stack coordination

**Master Recommendation:**
Implement 5-layer defense (see Critical Priority #1 below)

### Theme 2: Performance Optimization Opportunities

**Evidence Across Reviews:**

**Performance Review:**
> "Excessive Insight Fetching - Insight data fetched for every expanded card without batching or caching... Network (insight fetch efficiency): No caching - Poor (redundant fetches)"

**Backend Review:**
> "Percentage Jump (50%): O(N) - Slow with OFFSET... ~200ms (index scan but must skip 1.1M rows)... Recommendation: Replace percentage jump with time-range scrubber"

**UX Review:**
> "Missing scroll snapping for better navigation feel... No scroll momentum/physics tuning"

**Common Ground:**
- All reviews identify specific performance bottlenecks
- Backend recommends query optimization (percentage → time-range)
- Performance recommends insight caching
- UX recommends scroll physics improvements

**Master Recommendation:**
Coordinated performance package (see High Priority #1-3 below)

### Theme 3: Accessibility Compliance Gap

**Evidence Across Reviews:**

**UX Review:**
> "Critical Gaps: Missing scroll snapping, incomplete WCAG 2.2 compliance (keyboard nav, focus management, touch targets)... Lighthouse Accessibility: ~78/100 - Needs Work"

**Feature Research:**
> "Keyboard Navigation - Arrow keys to navigate plays, Enter to open detail panel, Shortcuts for common actions"

**Common Ground:**
- UX review provides comprehensive WCAG audit
- Feature research identifies keyboard navigation as enhancement
- Both recognize accessibility as table stakes

**Master Recommendation:**
WCAG 2.2 AA compliance sprint (see Critical Priority #2 below)

### Theme 4: Discovery & Navigation Enhancement

**Evidence Across Reviews:**

**Feature Research:**
> "Recommended Priority Additions: Advanced Sorting & Views (High Impact, Medium Effort), Time-based Navigation Enhancements (High Impact, Low Effort), Collection & Bookmark Features (High Impact, Medium Effort)"

**UX Review:**
> "Time Period Quick Jump - Preset buttons: 'Today', 'This Week', 'This Month', 'This Year', '1 Year Ago', 'Random Date'"

**Backend Review:**
> "Recommendation: Replace percentage jump with time-range scrubber - Faster: O(log N + K) vs O(N), Better UX: user selects date range instead of percentage"

**Common Ground:**
- All three reviews advocate for time-based navigation
- Feature research provides comprehensive feature inventory
- Backend supports with performance rationale

**Master Recommendation:**
Enhanced navigation package (see High Priority #4-6 below)

### Theme 5: Data Pipeline Robustness

**Evidence Across Reviews:**

**Backend Review:**
> "No Monitoring or Alerting: No logs for 404 image URLs, No metrics for image proxy failure rate, No automated detection of broken images"

**Performance Review:**
> "Background polling may be aggressive for battery life - Consider adaptive polling (faster when active, slower when idle)"

**Common Ground:**
- Backend identifies monitoring gaps
- Performance identifies polling optimization
- Both recognize need for operational excellence

**Master Recommendation:**
Monitoring & observability package (see Medium Priority #3 below)

---

## Prioritized Master Improvement Plan

### Critical Priority - Fix Now (Week 1-2)

#### 1. Image Reliability Package (5-Layer Defense)

**Problem:** Images fail to load or become stale (Performance + Backend reviews)

**Solution - Multi-Layer Approach:**

**Layer 1: Backend URL Validation (Backend Priority)**
- Add image URL validation in backfill script before database insert
- Validate with HEAD request, set to null if 404
- Log broken URLs for analysis
- **File:** `packages/server/src/knowledge_base/fact_plays/schemas.ts`
- **Effort:** 2 hours
- **Impact:** Prevents broken URLs from entering database

**Layer 2: Database Schema Update (Backend Priority)**
```sql
ALTER TABLE fact_plays ADD COLUMN image_validated_at TEXT;
CREATE INDEX idx_fact_plays_image_validation
  ON fact_plays(image_validated_at)
  WHERE image_uri IS NOT NULL;
```
- **Effort:** 1 hour
- **Impact:** Enables tracking of validation status

**Layer 3: Background Re-Validation Job (Backend Priority)**
- Find plays with `image_uri IS NOT NULL AND image_validated_at < 7 days ago`
- Validate URLs (HEAD request with 5s timeout)
- Update `image_uri = null` if broken, `image_validated_at = now()` if valid
- Run daily via cron
- **File:** `packages/server/src/scripts/validate_image_urls.ts`
- **Effort:** 4 hours
- **Impact:** Automatically heals broken images over time

**Layer 4: Reduce Proxy Cache Duration (Backend Critical)**
```python
# faiss-search-api/app/main.py:1527
# Change from 30 days to 7 days for successful fetches
return StreamingResponse(
    iter([response.content]),
    media_type=content_type,
    headers={
        "Cache-Control": "public, max-age=604800",  # 7 days (was 30)
    }
)

# Add short cache for 404s (1 hour instead of indefinite)
if response.status_code == 404:
    return StreamingResponse(
        iter([b'']),
        status_code=404,
        headers={
            "Cache-Control": "public, max-age=3600",  # 1 hour
        }
    )
```
- **Effort:** 10 minutes
- **Impact:** Reduces staleness window from 30 days to 7 days

**Layer 5: Frontend Retry Logic (Performance Priority)**
```typescript
// packages/web/src/components/AlbumArt.tsx
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

const handleError = useCallback(() => {
  if (retryCount < MAX_RETRIES) {
    const delay = RETRY_DELAYS[retryCount];
    retryTimeoutRef.current = window.setTimeout(() => {
      setError(false);
      setRetryCount(prev => prev + 1);
    }, delay);
  } else {
    setError(true);
  }
}, [retryCount]);
```
- **File:** `packages/web/src/components/AlbumArt.tsx`
- **Effort:** 3 hours
- **Impact:** Automatic retry with exponential backoff, cache busting

**Total Effort:** 1-2 days
**Total Impact:** Critical - fixes primary user-facing issue

**Success Metrics:**
- Image load success rate >95% (currently ~70%)
- No stale images after 7 days (currently indefinite)
- Retry-to-success rate >80%

---

#### 2. WCAG 2.2 AA Compliance Package

**Problem:** Accessibility violations prevent keyboard and screen reader usage (UX Review)

**Solution - Comprehensive Accessibility Sprint:**

**A. Keyboard Navigation (UX Critical)**
```typescript
// hooks/useTimelineKeyboardNav.ts
export function useTimelineKeyboardNav({
  containerRef,
  enabled = true
}: UseTimelineKeyboardNavOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const allCards = Array.from(
      container.querySelectorAll('[data-play-card]')
    ) as HTMLElement[];

    switch (e.key) {
      case 'ArrowDown': // Next card
      case 'ArrowUp':   // Previous card
      case 'Home':      // First card
      case 'End':       // Last card
        // Implementation...
    }
  }, [enabled, containerRef]);
}
```
- **Effort:** 4 hours
- **Impact:** Full keyboard navigation through timeline

**B. Touch Targets (UX Critical)**
```css
/* Fix FilterChip clear button - currently 20x20px */
.filter-chip-clear {
  min-width: 44px;
  min-height: 44px;
  /* Icon stays 20x20 via SVG sizing */
}

@media (max-width: 768px) {
  .play-card {
    min-height: 88px; /* Larger touch area */
    padding: 10px 12px;
  }
}
```
- **Effort:** 2 hours
- **Impact:** All interactive elements meet 44x44px WCAG requirement

**C. Focus Management (UX Critical)**
```typescript
// utils/focusManager.ts
export const FocusManager = {
  storeFocus(key: string) {
    // Store currently focused element
    sessionStorage.setItem(`focus:${key}`, playId);
  },

  restoreFocus(key: string, fallbackSelector?: string) {
    // Restore focus after panel close
    requestAnimationFrame(() => {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
};
```
- **Effort:** 3 hours
- **Impact:** Proper focus restoration when closing detail panel

**D. ARIA Live Regions (UX Critical)**
```tsx
// components/TimelineAnnouncements.tsx
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {loadingState.isLoadingMore && "Loading more plays..."}
  {!loadingState.hasMore && "End of timeline reached"}
</div>
```
- **Effort:** 2 hours
- **Impact:** Screen reader users get loading state updates

**E. Color Contrast Audit (UX Important)**
```css
/* Verify all text meets 4.5:1 minimum */
.timestamp {
  opacity: 0.65; /* Up from 0.55 - ensure 4.5:1 contrast */
}

.artist-name {
  opacity: 0.85; /* Up from 0.75 */
}
```
- **Effort:** 2 hours (testing + fixes)
- **Impact:** All text readable for low-vision users

**Total Effort:** 1-2 days
**Total Impact:** Critical - WCAG 2.2 AA compliance

**Success Metrics:**
- Lighthouse Accessibility score >95 (currently ~78)
- All interactive elements keyboard accessible
- Screen reader compatible
- Zero WCAG Level A/AA violations

---

### High Priority - Next Sprint (Week 3-4)

#### 1. Insight Caching & Optimization

**Problem:** Insight data fetched redundantly for every expanded card (Performance Review)

**Solution:**

**A. Extend TimelineKVS with Insight Storage**
```typescript
// packages/web/src/lib/http-runtime.ts
export class TimelineKVS extends Effect.Service<TimelineKVS>()("TimelineKVS", {
  effect: Effect.gen(function* () {
    const insightStore = kvs.forSchema(Schema.Array(InsightSchema));

    const storeInsights = (playId: number, insights: Insight[]) =>
      Effect.gen(function* () {
        const timestamp = Date.now();
        yield* insightStore.set(`timeline:insights:${playId}`, {
          data: insights,
          timestamp,
        });
        yield* Reactivity.invalidate([`timeline:insights:${playId}`]);
      });

    const getInsights = (playId: number) =>
      Effect.gen(function* () {
        const cached = yield* insightStore.get(`timeline:insights:${playId}`);

        if (Option.isNone(cached)) {
          return Option.none<Insight[]>();
        }

        const { data, timestamp } = cached.value;
        const age = Date.now() - timestamp;
        const TTL = 1000 * 60 * 60 * 24; // 24 hours

        if (age > TTL) {
          return Option.none<Insight[]>(); // Expired
        }

        return Option.some(data);
      });

    return { storeInsights, getInsights } as const;
  }),
})
```
- **Effort:** 4 hours
- **Impact:** 95% reduction in insight API calls

**B. Update Insight Atom to Use Cache**
```typescript
// packages/web/src/atoms/insights.ts
export const insightsAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const timelineKVS = yield* TimelineKVS;
      const insightsClient = yield* InsightsClient;

      // Try cache first
      const cached = yield* timelineKVS.getInsights(playId);

      if (Option.isSome(cached)) {
        yield* Effect.log(`Insights cache hit for play ${playId}`);
        return cached.value;
      }

      // Cache miss - fetch from API
      const response = yield* insightsClient.insights.getInsights({
        urlParams: { play_id: playId }
      });

      // Store in cache
      yield* timelineKVS.storeInsights(playId, response.insights);

      return response.insights;
    })
  ).pipe(Atom.withReactivity([`timeline:insights:${playId}`]))
);
```
- **Effort:** 2 hours
- **Impact:** Atomic insight loading with deduplication

**Total Effort:** 6 hours
**Success Metrics:** Insight API calls reduced by >90%

---

#### 2. Virtualization & Scroll Optimization

**Problem:** Scroll physics suboptimal, no snap behavior (UX Review + Performance Review)

**Solution:**

**A. CSS Scroll Snap (UX High Priority)**
```css
/* index.css - Add scroll snap styles */
.scroll-snap-container {
  /* Scroll snapping */
  scroll-snap-type: y proximity;
  scroll-padding-top: 8px;
  scroll-padding-bottom: 8px;

  /* Physics */
  scroll-behavior: smooth;
  overscroll-behavior-y: contain;

  /* Touch optimization */
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;

  /* Performance */
  will-change: scroll-position;
}

.timeline-item {
  scroll-snap-align: start;
  scroll-snap-stop: normal;
  min-height: 90px;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .scroll-snap-container {
    scroll-padding-top: 12px;
    scroll-padding-bottom: 60px;
  }

  .timeline-item {
    min-height: 88px;
  }
}

/* Reduced motion override */
@media (prefers-reduced-motion: reduce) {
  .scroll-snap-container {
    scroll-behavior: auto;
    scroll-snap-type: none;
  }
}
```
- **Effort:** 1 hour
- **Impact:** Cards naturally align when scrolling stops

**B. Increase Virtualization Overscan (Performance Medium Priority)**
```typescript
// VirtualizedTimeline.tsx
const virtualizer = useVirtualizer({
  count: playIds.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => ESTIMATED_ITEM_HEIGHT,
  overscan: 8, // Increased from 5
});
```
- **Effort:** 15 minutes
- **Impact:** Smoother fast scrolling, fewer blank items

**C. Adaptive Background Polling (Performance Medium Priority)**
```typescript
// http-runtime.ts
import { usePageVisibility } from '@/hooks/usePageVisibility';

const pollingInterval = isVisible
  ? Duration.seconds(30)  // Active
  : Duration.seconds(60); // Hidden tab

export const FetchLatestLive = Effect.gen(function* () {
  // ... fetch logic
}).pipe(
  Effect.repeat(Schedule.spaced(pollingInterval)),
  // ...
);
```
- **Effort:** 2 hours
- **Impact:** 50% reduction in battery drain for backgrounded tabs

**Total Effort:** 3-4 hours
**Success Metrics:**
- Scroll FPS remains 55-60fps during fast scroll
- Cards snap naturally into position
- Background polling reduces battery impact by >50%

---

#### 3. Backend Query Optimization

**Problem:** Percentage jump uses O(N) OFFSET, slow for large datasets (Backend Review)

**Solution:**

**A. Replace Percentage Jump with Time-Range Scrubber**
```python
# faiss-search-api/app/services/db_service.py

# OLD: Percentage jump (slow)
# SELECT * FROM fact_plays ORDER BY airdate DESC LIMIT 50 OFFSET 1100000
# Performance: ~200ms (must skip 1.1M rows)

# NEW: Time-range scrubber (fast)
def get_plays_by_time_range(
    self,
    since: str,  # ISO 8601 datetime
    until: str,  # ISO 8601 datetime
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get plays within time range using indexed query.
    Performance: O(log N + K) instead of O(N)
    """
    cursor = self.conn.cursor()

    query = """
        SELECT fp.*
        FROM fact_plays fp
        WHERE fp.airdate >= ? AND fp.airdate < ?
        ORDER BY fp.airdate DESC, fp.id DESC
        LIMIT ?
    """

    cursor.execute(query, (since, until, limit + 1))
    rows = cursor.fetchall()

    has_more = len(rows) > limit
    results = [self._row_to_dict(row) for row in rows[:limit]]

    return {
        'results': results,
        'next_cursor': self.encode_cursor(results[-1]['airdate'], results[-1]['id']) if has_more else None,
        'has_more': has_more
    }

# Performance: ~5-10ms (indexed range scan)
```
- **Effort:** 4 hours (backend + frontend scrubber UI)
- **Impact:** Percentage jump from ~200ms to ~5ms

**B. Materialized Entity Play Counts (Backend Medium Priority)**
```sql
-- Pre-compute counts instead of COUNT(*) on every request
CREATE TABLE entity_play_counts (
  entity_type TEXT NOT NULL,  -- 'artist', 'recording', 'release_group'
  entity_mbid TEXT NOT NULL,
  play_count INTEGER NOT NULL,
  last_updated_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_mbid)
);

-- Updated by triggers on fact_plays INSERT/DELETE
CREATE TRIGGER update_artist_play_counts
AFTER INSERT ON play_artists
BEGIN
  INSERT INTO entity_play_counts (entity_type, entity_mbid, play_count, last_updated_at)
  VALUES ('artist', NEW.artist_mbid, 1, datetime('now'))
  ON CONFLICT (entity_type, entity_mbid) DO UPDATE
  SET play_count = play_count + 1,
      last_updated_at = datetime('now');
END;

-- GET /api/plays/count becomes O(1) instead of O(N)
SELECT play_count FROM entity_play_counts
WHERE entity_type = 'artist' AND entity_mbid = ?;
```
- **Effort:** 6 hours
- **Impact:** Entity page header loads instantly

**Total Effort:** 10 hours
**Success Metrics:**
- Scrubber navigation <10ms (vs ~200ms)
- Entity count queries <1ms (vs ~5-10ms)

---

### Medium Priority - Sprint 2 (Week 5-6)

#### 1. Enhanced Navigation & Discovery (Feature Research Tier 1)

**Solution:**

**A. Sort Controls**
```typescript
// atoms/timeline-sort.ts
export const sortModeAtom = Atom.searchParam("sort", {
  defaultValue: "desc",
  parse: (value) => value as "desc" | "asc" | "new-music" | "shuffle",
  format: (value) => value,
});

export const sortedPlayIdsAtom = Atom.make((get) => {
  const playIds = get(playIdsAtom);
  const sortMode = get(sortModeAtom);

  switch (sortMode) {
    case "desc": return sortPlaysByAirdateDesc(playIds);
    case "asc": return sortPlaysByAirdateAsc(playIds);
    case "new-music": return sortPlaysByNewMusicFirst(playIds);
    case "shuffle": return shufflePlays(playIds);
  }
});
```
- **Effort:** 3 hours
- **Impact:** User control over timeline ordering

**B. View Density Toggle**
```typescript
// atoms/timeline-preferences.ts
export const viewDensityAtom = Atom.make("compact" as "compact" | "comfortable" | "expanded")
  .pipe(Atom.withLocalStorage("timeline:view-density"));

// VirtualizedTimeline.tsx
const ESTIMATED_HEIGHTS = {
  compact: 90,
  comfortable: 120,
  expanded: 200,
};

const virtualizer = useVirtualizer({
  estimateSize: () => ESTIMATED_HEIGHTS[viewDensity],
  // ...
});
```
- **Effort:** 2 hours
- **Impact:** User preference for information density

**C. Time Period Quick Jump**
```typescript
// components/TimelineQuickJump.tsx
const quickJumpOptions = [
  { label: "Today", since: startOfToday(), until: endOfToday() },
  { label: "This Week", since: startOfWeek(), until: endOfWeek() },
  { label: "This Month", since: startOfMonth(), until: endOfMonth() },
  { label: "1 Year Ago", since: oneYearAgo(), until: oneYearAgoEnd() },
  { label: "Random Date", since: randomDate(), until: randomDateEnd() },
];

<Button onClick={() => navigateToTimeRange(option.since, option.until)}>
  {option.label}
</Button>
```
- **Effort:** 3 hours
- **Impact:** One-click navigation to interesting time periods

**Total Effort:** 8 hours
**Success Metrics:**
- Sort controls used by >40% of users
- Quick jump reduces time-to-interesting-content by >60%

---

#### 2. Favorites & Collections (Feature Research Tier 1)

**Solution:**

**A. Client-Side Favorites (localStorage)**
```typescript
// atoms/favorites.ts
export const favoritesAtom = Atom.make(new Set<number>())
  .pipe(Atom.withLocalStorage("timeline:favorites"));

export const toggleFavorite = (playId: number) =>
  Effect.gen(function* () {
    const favorites = yield* favoritesAtom;
    const updated = new Set(favorites);

    if (updated.has(playId)) {
      updated.delete(playId);
    } else {
      updated.add(playId);
    }

    yield* Atom.set(favoritesAtom, updated);
  });

export const isFavoriteAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const favorites = get(favoritesAtom);
    return favorites.has(playId);
  })
);
```
- **Effort:** 4 hours
- **Impact:** User can star plays for later

**B. Favorites Timeline View**
```typescript
// pages/favorites.tsx
export const FavoritesPage = () => {
  const [favorites] = useAtom(favoritesAtom);
  const favoritePlayIds = Array.from(favorites);

  return (
    <VirtualizedTimeline
      playIdsOverride={favoritePlayIds}
      title="Your Starred Plays"
    />
  );
};
```
- **Effort:** 2 hours
- **Impact:** Dedicated view for saved plays

**Total Effort:** 6 hours
**Success Metrics:**
- >30% of active users star at least one play
- Average 15 starred plays per user

---

#### 3. Monitoring & Observability (Backend + Performance)

**Solution:**

**A. Structured Logging**
```python
# faiss-search-api/app/logging_config.py
import structlog

logger = structlog.get_logger()

# Timeline query logging
logger.info(
    "timeline_query",
    method="cursor",
    limit=50,
    cursor=cursor[:10] if cursor else None,
    mbid_filters={"artist": artist_mbid},
    result_count=len(results),
    query_time_ms=query_time,
)

# Image proxy logging
logger.warning(
    "broken_image_url",
    play_id=play_id,
    image_url=image_uri,
    error_type="404_not_found",
    origin="archive.org",
)
```
- **Effort:** 4 hours
- **Impact:** Better debugging and analysis

**B. Prometheus Metrics**
```python
# metrics.py
from prometheus_client import Counter, Histogram, Gauge

timeline_requests = Counter('timeline_requests_total', 'Total timeline requests', ['method'])
timeline_errors = Counter('timeline_errors_total', 'Total timeline errors', ['error_type'])
timeline_latency = Histogram('timeline_latency_seconds', 'Timeline query latency')

image_proxy_requests = Counter('image_proxy_requests_total', 'Total image proxy requests')
image_proxy_errors = Counter('image_proxy_errors_total', 'Image proxy errors', ['status_code'])

broken_image_urls = Counter('broken_image_urls_total', 'Broken image URLs detected', ['origin'])
```
- **Effort:** 8 hours (setup + dashboards)
- **Impact:** Proactive issue detection

**C. Alerting Rules**
```yaml
# alerts/timeline.yml
- alert: ImageProxy404RateHigh
  expr: rate(image_proxy_errors_total{status_code="404"}[5m]) > 50
  for: 5m
  annotations:
    summary: "Image proxy 404 rate above 50/sec - possible CDN issues"

- alert: BrokenImageUrlsIncreasing
  expr: increase(broken_image_urls_total[1h]) > 100
  annotations:
    summary: "100+ broken image URLs detected in last hour"
```
- **Effort:** 2 hours
- **Impact:** Automatic alerting for image issues

**Total Effort:** 14 hours
**Success Metrics:**
- Mean time to detect issues <5 minutes
- Image staleness detected automatically

---

### Low Priority - Future Enhancements (Week 7+)

#### 1. Visual Timeline Features (Feature Research Tier 2)

- Play density heatmap visualization
- Mini calendar widget with play density
- "On This Day" historical feature
- **Effort:** 16 hours
- **Impact:** Medium - visual interest, pattern discovery

#### 2. Advanced Filtering (Feature Research Tier 2)

- Multi-entity filtering (combine artist + show + year range)
- Text search within current timeline view
- Saved filter presets
- **Effort:** 12 hours
- **Impact:** Medium - power user feature

#### 3. Grid View Option (UX + Feature Research)

- Alternative layout focused on album art
- 2-3 column responsive grid
- Optimized for visual browsing
- **Effort:** 16 hours
- **Impact:** Medium - appeals to visual learners

#### 4. Export Features (Feature Research Tier 3)

- CSV export of plays with metadata
- Spotify/Apple Music playlist generation
- Share timeline slice as social card
- **Effort:** 20 hours
- **Impact:** Low-Medium - power user utility

---

## Phased Implementation Roadmap

### Phase 1: Critical Fixes (Week 1-2) - "Stabilization Sprint"

**Goal:** Fix user-facing issues and achieve WCAG compliance

**Deliverables:**
1. Image Reliability Package (5 layers)
   - Backend URL validation
   - Database schema update
   - Background re-validation job
   - Reduced proxy cache duration
   - Frontend retry logic

2. WCAG 2.2 AA Compliance Package
   - Keyboard navigation (arrows, Home, End)
   - Touch targets (44x44px minimum)
   - Focus management (restoration on panel close)
   - ARIA live regions (loading announcements)
   - Color contrast audit & fixes

**Success Criteria:**
- Image load success rate >95%
- Lighthouse Accessibility score >95
- Zero WCAG Level A/AA violations
- All interactive elements keyboard accessible

**Effort:** 3-4 days
**Team:** 1 backend engineer + 1 frontend engineer

---

### Phase 2: Performance & UX (Week 3-4) - "Optimization Sprint"

**Goal:** Improve performance and scroll behavior

**Deliverables:**
1. Insight Caching & Optimization
   - Extend TimelineKVS with insight storage
   - Update insight atom to use cache first
   - 24-hour TTL with reactive invalidation

2. Virtualization & Scroll Optimization
   - CSS scroll snap (y proximity)
   - Increase overscan from 5 to 8
   - Adaptive background polling (30s active, 60s hidden)

3. Backend Query Optimization
   - Replace percentage jump with time-range scrubber
   - Materialized entity play counts table
   - Covering indexes for timeline queries

**Success Criteria:**
- Insight API calls reduced by >90%
- Scroll remains 55-60 FPS during fast scroll
- Time-range navigation <10ms (vs ~200ms)
- Cards snap naturally into position

**Effort:** 1 week
**Team:** 1 backend engineer + 1 frontend engineer

---

### Phase 3: Discovery & Engagement (Week 5-6) - "Feature Sprint"

**Goal:** Add high-value user-facing features

**Deliverables:**
1. Enhanced Navigation & Discovery
   - Sort controls (asc/desc/new-music/shuffle)
   - View density toggle (compact/comfortable/expanded)
   - Time period quick jump (Today, This Week, Random, etc.)

2. Favorites & Collections
   - Client-side localStorage favorites
   - Star/unstar plays
   - Dedicated favorites timeline view

3. Monitoring & Observability
   - Structured logging with structlog
   - Prometheus metrics (requests, errors, latency, image health)
   - Alerting rules for critical issues

**Success Criteria:**
- Sort controls used by >40% of users
- >30% of users star at least one play
- Mean time to detect issues <5 minutes
- Broken images auto-detected within 1 hour

**Effort:** 1.5 weeks
**Team:** 1 backend engineer + 1 frontend engineer

---

### Phase 4: Polish & Advanced Features (Week 7+) - "Enhancement Sprint"

**Goal:** Add nice-to-have features based on user feedback

**Deliverables:**
1. Visual Timeline Features
   - Play density heatmap
   - Mini calendar widget
   - "On This Day" historical view

2. Advanced Filtering
   - Multi-entity filters (combine artist + show + year)
   - Text search within timeline
   - Saved filter presets

3. Grid View Option
   - Album art-focused layout
   - 2-3 column responsive grid

4. Export Features
   - CSV export
   - Spotify/Apple Music playlist generation
   - Social sharing cards

**Success Criteria:**
- Feature adoption measured via analytics
- User feedback indicates high value
- No performance regressions

**Effort:** 2-3 weeks
**Team:** 1 backend engineer + 1 frontend engineer

---

## Dependencies and Prerequisites

### Technical Dependencies

**Phase 1 (Critical) depends on:**
- ✅ No blocking dependencies - can start immediately
- Effect-TS knowledge for frontend changes
- Python FastAPI knowledge for backend changes
- Access to production database for migrations

**Phase 2 (Performance) depends on:**
- ✅ Phase 1 completion not required (parallel work possible)
- Understanding of TanStack Virtual for scroll optimizations
- SQLite query optimization knowledge

**Phase 3 (Discovery) depends on:**
- ✅ Phase 1/2 completion not required
- Monitoring infrastructure (Prometheus, Grafana) for observability
- localStorage API for favorites

**Phase 4 (Polish) depends on:**
- User feedback from Phase 1-3
- Analytics data showing feature usage
- Design mockups for grid view and visualizations

### Infrastructure Prerequisites

1. **Database Migrations**
   - Access to production database
   - Backup strategy in place
   - Migration rollback plan

2. **Monitoring Stack**
   - Prometheus server running
   - Grafana dashboards configured
   - Alertmanager for notifications

3. **CDN/Caching** (optional for Phase 2)
   - CloudFlare or Fastly account
   - DNS configuration access

### Team Prerequisites

1. **Backend Engineer**
   - Python FastAPI experience
   - SQLite optimization knowledge
   - Effect-TS familiarity (for BFF layer)

2. **Frontend Engineer**
   - React + TypeScript experience
   - Effect Atom patterns knowledge
   - Accessibility/WCAG experience

3. **Design Support** (Phase 4)
   - Grid view mockups
   - Calendar widget design
   - Social sharing card templates

---

## Success Metrics

### Quantitative Metrics

**Phase 1 - Critical Fixes:**
| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Image load success rate | ~70% | >95% | Frontend monitoring |
| Image staleness window | Indefinite | <7 days | Backend validation logs |
| Lighthouse Accessibility | 78 | >95 | Automated Lighthouse CI |
| WCAG violations | ~15 | 0 | axe DevTools audit |
| Keyboard navigation | 0% | 100% | Manual testing |

**Phase 2 - Performance:**
| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Insight API calls (100 plays expanded) | 100 | <10 | Network tab |
| Scroll FPS (fast scroll) | 55 | 60 | Chrome DevTools |
| Time-range query latency | ~200ms | <10ms | Backend logs |
| Background polling (hidden tab) | 30s | 60s | Implementation |

**Phase 3 - Discovery:**
| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Sort control usage | N/A | >40% | Analytics |
| Users with favorites | N/A | >30% | LocalStorage stats |
| Mean time to detect broken images | N/A | <1 hour | Monitoring alerts |

### Qualitative Metrics

**User Satisfaction:**
- Net Promoter Score (NPS) for timeline feature
- User feedback on accessibility improvements
- Reported instances of broken images (should decrease)

**Developer Experience:**
- Time to debug issues (should decrease with monitoring)
- Confidence in data pipeline (should increase)

**Operational Excellence:**
- Number of production incidents (should decrease)
- Alerting accuracy (should increase)

---

## Risk Assessment & Mitigation

### High Risk Items

**Risk 1: Database Migration Failures**
- **Impact:** Data loss, downtime
- **Probability:** Low (SQLite is resilient)
- **Mitigation:**
  - Full database backup before migration
  - Test migrations on copy of production database
  - Rollback plan: restore from backup
  - Monitor migration progress with structured logging

**Risk 2: Image Validation Job Performance Impact**
- **Impact:** Database lock contention, slow queries
- **Probability:** Medium (2.2M rows to validate)
- **Mitigation:**
  - Rate limit validation to 100 URLs/minute
  - Run during off-peak hours (2-6 AM)
  - Use batch processing with LIMIT 1000
  - Monitor database lock metrics

**Risk 3: Frontend Retry Logic Breaking User Experience**
- **Impact:** Slower image loads, UI jank
- **Probability:** Low
- **Mitigation:**
  - Use exponential backoff (1s, 2s, 4s)
  - Limit to 3 retries max
  - Timeout cleanup to prevent memory leaks
  - A/B test with 10% of users first

### Medium Risk Items

**Risk 4: Scroll Snap Breaking Existing Behavior**
- **Impact:** User confusion, changed scroll feel
- **Probability:** Medium
- **Mitigation:**
  - Use `proximity` instead of `mandatory` (gentle snap)
  - Respect `prefers-reduced-motion` preference
  - A/B test with 50% of users
  - Add toggle in settings if needed

**Risk 5: Monitoring Overhead**
- **Impact:** Performance degradation from metrics collection
- **Probability:** Low
- **Mitigation:**
  - Sample metrics (not every request)
  - Use asynchronous logging
  - Monitor impact on p95/p99 latency

### Low Risk Items

**Risk 6: Feature Complexity Creep**
- **Impact:** Delayed timeline, technical debt
- **Probability:** Medium
- **Mitigation:**
  - Strict adherence to phased roadmap
  - Regular stakeholder check-ins
  - "Phase 4" clearly marked as optional

---

## Alignment with KEXP Philosophy

### Philosophy Principles (from Backend Review)

1. **KEXP as Source of Truth**: Respect KEXP API as authoritative data source
2. **Non-blocking Architecture**: Worker-based fetching to keep UI responsive
3. **Caching with TTL**: Balance between freshness and API load
4. **Transparency**: Show markers and metadata to users

### How This Plan Aligns

**Image Reliability Package:**
- ✅ Validates KEXP-provided URLs but doesn't modify source data
- ✅ Transparent to users (broken images become gradient placeholders)
- ✅ Respects KEXP as source while adding resilience layer
- ✅ Monitoring helps identify issues to report back to KEXP

**Accessibility Compliance:**
- ✅ Transparency: screen reader users get full access to timeline
- ✅ Non-blocking: keyboard navigation doesn't interfere with normal UX
- ✅ Respects user preferences (reduced motion, high contrast)

**Performance Optimizations:**
- ✅ Caching with TTL: insight cache (24h), image proxy (7 days)
- ✅ Non-blocking: background polling, async validation
- ✅ Respects KEXP API load: reduces redundant requests by >90%

**Discovery Features:**
- ✅ Transparency: sort/filter options clearly presented
- ✅ Source of truth: favorites stored client-side, KEXP data unchanged
- ✅ Serendipity: random date jump, shuffle mode align with "crate digging"

### Philosophy Score: A-

Strong alignment overall. The plan enhances reliability and accessibility while respecting KEXP as the authoritative source.

---

## Conclusion

### Summary of Key Decisions

1. **Image Staleness is Priority #1**: Appears in both Performance and Backend reviews as critical user-facing issue. Requires 5-layer defense (backend validation + caching + frontend retry).

2. **Accessibility is Non-Negotiable**: WCAG 2.2 AA compliance is table stakes for modern web apps. Current score of 78 is unacceptable; target >95.

3. **Performance Optimizations are High-Impact**: Insight caching (95% reduction in API calls), query optimization (20x speedup), and scroll improvements are achievable with modest effort.

4. **Discovery Features are High-Value**: Feature research identifies sort controls, time navigation, and favorites as high-impact, low-effort wins.

5. **Phased Approach Manages Risk**: Critical fixes first (image reliability + accessibility), then performance, then discovery features.

### Expected Outcomes

**End of Phase 1 (Week 2):**
- Image load success rate >95%
- WCAG 2.2 AA compliant
- Zero critical accessibility violations
- Broken images heal automatically within 7 days

**End of Phase 2 (Week 4):**
- Scroll behavior feels native (snap, smooth physics)
- Insight fetching 95% more efficient
- Time-range navigation 20x faster
- Background polling battery-friendly

**End of Phase 3 (Week 6):**
- Users can sort, filter, save favorite plays
- One-click navigation to interesting time periods
- Comprehensive monitoring catches issues proactively
- Mean time to detect <1 hour

**End of Phase 4 (Week 9):**
- Advanced features based on user feedback
- Visual timeline enhancements
- Export capabilities
- Grid view option

### Final Assessment

This unified improvement plan addresses all critical issues identified across four reviews while maintaining a practical, phased approach. The image staleness issue, identified independently by Performance and Backend reviews, receives the attention it deserves with a comprehensive 5-layer solution.

**Timeline:** 9 weeks (2 weeks critical, 2 weeks performance, 2 weeks discovery, 3 weeks polish)
**Team Size:** 2 engineers (1 backend, 1 frontend)
**Total Effort:** ~240 hours
**Expected ROI:** Critical user issues resolved, accessibility compliance achieved, strong foundation for future features

**The timeline feature will transform from "good but flawed" to "excellent and delightful."**

---

**Synthesis Completed:** December 16, 2025
**Next Steps:** Stakeholder review, sprint planning, Phase 1 kickoff
**Status:** Ready for Implementation
