# ScrollingAlbumBar - Optimization Checklist

Use this checklist to track implementation progress through all phases.

---

## PHASE 1: CRITICAL FIXES (2-3 hours total)

### 1. Fix Animation Re-runs on Every Image Load ⚠️ HIGHEST PRIORITY
- [ ] Locate: `ScrollingAlbumBar.tsx` lines 29-72, 75-153
- [ ] Change: Replace `loadedImages` state with `isLoadingComplete` boolean
- [ ] Add: `imagesRef`, `pendingCountRef`, `totalCountRef` refs
- [ ] Update: First useEffect to only update state when ALL images loaded
- [ ] Update: Second useEffect to depend on `isLoadingComplete` only
- [ ] Test: Verify animation is smooth, no restarts during load
- [ ] Measure: Check DevTools Performance - should see single effect run

**Expected**: 50-70% less jank, smooth scrolling during image load

---

### 2. Cache Clip Paths
- [ ] Locate: `ScrollingAlbumBar.tsx` lines 129-137
- [ ] Add: `useMemo` hook to create `clipPaths` array
- [ ] Update: Animation loop to use `ctx.translate()` + cached `clipPaths[index]`
- [ ] Remove: `ctx.beginPath()` and `ctx.roundRect()` from animate loop
- [ ] Test: Verify rounded corners still visible
- [ ] Verify: No visual artifacts in canvas rendering

**Expected**: 30-40% canvas paint speedup

---

### 3. Dirty Rectangle Clear
- [ ] Locate: `ScrollingAlbumBar.tsx` line 114 `ctx.clearRect(0, 0, canvas.width, canvas.height)`
- [ ] Replace: With dirty rectangle calculation
- [ ] Add: `const clearMargin = totalWidth;`
- [ ] Add: `const clearStart = Math.floor(offsetXRef.current - clearMargin);`
- [ ] Add: `const clearWidth = window.innerWidth + clearMargin * 2;`
- [ ] Update: `ctx.clearRect(clearStart, 0, clearWidth, CONFIG.BAR_HEIGHT);`
- [ ] Test: Check for visual artifacts at boundaries
- [ ] Test: Verify at different window widths

**Expected**: 15-25% canvas paint speedup

---

### 4. Move Sorting to Worker
- [ ] Locate: `album-bar.ts` lines 50-54
- [ ] Remove: Sorting logic from atom
- [ ] Update: Remove `[...sortedArray].sort(...).slice(...)`
- [ ] Pass: Raw plays array to worker instead
- [ ] Locate: `album-bar-worker.ts` line 53 in `processArtwork`
- [ ] Add: Sorting before filtering
- [ ] Add: `const sorted = [...plays].sort((a, b) => b.airdate.getTime() - a.airdate.getTime()).slice(0, maxCount);`
- [ ] Update: Filter on `sorted` instead of raw plays
- [ ] Test: Verify album art is still newest first
- [ ] Profile: Check main thread is unblocked

**Expected**: Main thread unblocked, cleaner data flow

---

### 5. Cache Image Array
- [ ] Locate: `ScrollingAlbumBar.tsx` in animation effect
- [ ] Add: Outside loop: `const images = Array.from(imagesRef.current.values());`
- [ ] Remove: Array creation inside animate callback
- [ ] Verify: `images` variable is captured once, reused in animate
- [ ] Test: Monitor memory allocations in DevTools

**Expected**: Reduce GC pressure, slightly lower frame time

---

### 6. CSS GPU Acceleration
- [ ] Locate: `index.css` lines 73-82
- [ ] Add: `will-change: transform;` to `.scrolling-album-bar`
- [ ] Add: `transform: translateZ(0);` to `.scrolling-album-bar`
- [ ] Add: `will-change: contents;` to `.scrolling-album-bar canvas`
- [ ] Change: `image-rendering: crisp-edges;` to `image-rendering: auto;`
- [ ] Update: Animation easing from `cubic-bezier(0.16, 1, 0.3, 1)` to `ease-out`
- [ ] Add: `will-change: backdrop-filter;` and `contain: layout style paint;` to blur div
- [ ] Test: Verify animations are smooth
- [ ] Test: No paint thrashing in DevTools

**Expected**: Smoother animations, better paint performance

---

## PHASE 2: MEDIUM IMPACT (Future Enhancement)

### 7. Precompute Layout Math
- [ ] Design: Create `TileLayout` interface in worker response
- [ ] Implement: `computeLayout()` function in worker
- [ ] Send: Layout data with artwork response
- [ ] Update: Component to use precomputed values
- [ ] Remove: Per-frame calculations from animate loop

**Expected**: 5-10% compute reduction

---

### 8. Image Metadata Caching
- [ ] Add: IndexedDB cache in worker
- [ ] Implement: `getImageDimensions()` function
- [ ] Cache: URLs and their metadata
- [ ] Return: Metadata with artwork response

**Expected**: Faster subsequent loads, metadata accuracy

---

### 9. Image Format Validation
- [ ] Add: URL validation in worker
- [ ] Implement: Format checking (.jpg, .png, .webp, etc)
- [ ] Add: Error handling and logging

**Expected**: Better error prevention

---

### 10. URL Optimization
- [ ] Detect: KEXP CDN URLs
- [ ] Rewrite: Add/update `size` query param to match TILE_SIZE
- [ ] Test: Smaller image downloads

**Expected**: Faster image loading, reduced bandwidth

---

### 11. Deduplication Cache
- [ ] Add: IndexedDB cache for processed artwork
- [ ] Implement: `getProcessedArtwork(playId)` function
- [ ] Cache: By play ID to avoid reprocessing

**Expected**: Better performance on repeated plays

---

## PHASE 3: POLISH & MONITORING

### 12. Add Performance Monitoring
- [ ] Add: PerformanceObserver in component
- [ ] Measure: Frame time with `performance.mark/measure`
- [ ] Log: Canvas paint times
- [ ] Track: Effect re-runs

**Code template available in IMPLEMENTATION guide**

---

### 13. Create Performance Dashboard
- [ ] Add: Metrics display for debugging
- [ ] Track: FPS, jank duration, memory usage
- [ ] Optional: Send to analytics

---

## VALIDATION & TESTING

### Before Optimization
- [ ] Open DevTools Performance tab
- [ ] Record 10 seconds of scrolling
- [ ] Note: FPS, frame time, paint time
- [ ] Count: Effect re-runs during load
- [ ] Memory: Allocations per frame

### After Each Phase 1 Optimization
- [ ] Visual test: Verify no regressions
- [ ] Performance test: Record same scenario
- [ ] Compare: Metrics to baseline
- [ ] Check: No visual artifacts

### After All Phase 1
- [ ] Run: Full performance profile
- [ ] Target: 60fps solid, <16ms frame time
- [ ] Verify: Single effect run on load
- [ ] Check: No canvas artifacts or glitches

---

## PERFORMANCE TARGETS

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Frame time | 16-18ms | 8-12ms | <16ms |
| FPS during load | 30-45 | 55-60 | 60 |
| Effect re-runs | 25 | 1 | 1 |
| Memory alloc/frame | 2-3 | 0 | 0 |
| Canvas clear time | 0.5-1ms | 0.2-0.3ms | <0.3ms |
| Jank during load | Severe | None | None |

---

## IMPLEMENTATION ORDER RECOMMENDATION

Best order for smooth workflow:

1. **Fix animation re-runs** (1 hour) - Biggest impact, will immediately feel better
2. **Cache clip paths** (30 min) - Easy confidence builder
3. **Dirty rect clear** (30 min) - Measurable performance gain
4. **Move sorting** (15 min) - Simple data flow improvement
5. **CSS GPU hints** (10 min) - Polish and smoothness
6. **Image array cache** (15 min) - Last polish

**Total Phase 1: ~2.5 hours**

Then assess Phase 2 based on remaining performance targets.

---

## HELPFUL RESOURCES IN CRATE

- `SCROLLING_ALBUM_BAR_QUICK_SUMMARY.md` - 5-minute overview
- `SCROLLING_ALBUM_BAR_ANALYSIS.md` - Detailed technical analysis
- `SCROLLING_ALBUM_BAR_IMPLEMENTATION.md` - Complete code examples

---

## NOTES FOR IMPLEMENTATION

### Key Files to Reference
- `/home/user/crate/packages/web/src/components/ScrollingAlbumBar.tsx` - Main component
- `/home/user/crate/packages/web/src/atoms/album-bar.ts` - State & fetching
- `/home/user/crate/packages/web/src/workers/album-bar-worker.ts` - Worker logic
- `/home/user/crate/packages/web/src/index.css` - Styling

### Testing Tips
- Use Chrome DevTools Performance tab for frame time measurement
- Watch for layout shift or glitches after each change
- Test on slower device/simulator to catch frame drops
- Use console to verify effect dependencies are correct

### Common Pitfalls
- Forgetting to cleanup event listeners in useEffect return
- Creating new array/object references in dependencies
- Not testing visual artifacts after canvas optimization
- Failing to update worker code when changing atom protocol

---

## QUESTIONS TO ASK WHILE IMPLEMENTING

- Does this change reduce allocations or ref recreations?
- Does it move work off the main thread?
- Did I test visual correctness?
- Did I add proper error handling?
- Is the performance improvement measurable?

---

**Last Updated**: 2025-11-14
**Total Analysis**: 15+ optimizations identified
**Estimated Phase 1 Time**: 2.5-3 hours
**Expected FPS Improvement**: 30-45fps → 60fps stable

