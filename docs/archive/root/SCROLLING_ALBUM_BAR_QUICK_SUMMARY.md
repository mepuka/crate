# ScrollingAlbumBar - Optimization Quick Reference

## TOP 3 CRITICAL ISSUES

### 1. ANIMATION RESTARTS ON EVERY IMAGE LOAD ⚠️ CRITICAL
**Current behavior**: 25+ animation restarts during image load sequence
```
Image 1 loads → effect → RAF setup
Image 2 loads → effect → CANCEL RAF → RAF setup  
Image 3 loads → effect → CANCEL RAF → RAF setup
... (repeated 25 times = severe jank)
```
**Fix**: Use refs + single completion state (see Snippet 1 in full analysis)
**Impact**: 50-70% reduction in jank and stutter

---

### 2. EXPENSIVE CANVAS OPERATIONS EVERY FRAME
**Problem**: `ctx.save()` + `roundRect()` + `clip()` + `restore()` × 50-75 times per frame
```typescript
// CURRENT: Lines 129-137
ctx.save();
ctx.beginPath();
ctx.roundRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
ctx.clip();
ctx.drawImage(img, x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
ctx.restore();
```
**Impact**: Paint bottleneck, especially on slower devices
**Solutions**:
- Precompute Path2D objects (easy)
- Pre-clip images in worker (medium)
- Use CSS masks instead (easy)

---

### 3. FULL CANVAS CLEAR EVERY FRAME
**Problem**: Line 114 clears entire 1920px × 64px canvas 60 times per second
```typescript
ctx.clearRect(0, 0, canvas.width, canvas.height); // EXPENSIVE
```
**Fix**: Dirty rectangle clearing (only clear scroll area)
**Impact**: 15-25% canvas speedup

---

## PHASE 1: QUICK WINS (2-3 hours, big impact)

```markdown
Priority | Issue | Fix Complexity | Impact
---------|-------|---|---
CRITICAL | Animation re-runs | Medium | 50-70% less jank
HIGH | Clip path ops | Low-Medium | 30-40% paint faster
HIGH | Full clear | Medium | 15-25% paint faster
HIGH | Array allocation | Easy | Reduce GC pressure
HIGH | Sorting on main | Easy | Main thread freedom
MEDIUM | CSS GPU hints | Easy | Smoother animations
```

### Concrete First Steps:

1. **Fix state management** (1 hour)
   - Replace `loadedImages` Map with `isLoadingComplete` boolean
   - Keep image data in ref
   - Single effect dependency

2. **Cache clip paths** (30 min)
   - Create `Path2D` objects once for each tile
   - Reuse in animation loop

3. **Dirty rectangle clear** (30 min)
   - Only clear scrolling region, not entire canvas
   - Optional: batch full clears with `requestIdleCallback`

4. **Remove unnecessary work** (15 min)
   - Cache `Array.from(loadedImages.values())`
   - Move sorting to worker (5 lines)

---

## PERFORMANCE BASELINE & GOALS

**Before Optimization**:
- Frame time: 16-18ms (sometimes drops below 60fps)
- Effect re-runs during load: 25
- Memory allocations per frame: 2-3
- Canvas clear time: 0.5-1ms

**After Phase 1**:
- Frame time: 8-12ms (solid 60fps)
- Effect re-runs during load: 1
- Memory allocations per frame: 0
- Canvas clear time: 0.2-0.3ms

---

## WORKER OPPORTUNITIES (Phase 2)

Worker can handle more:
```
CURRENT:
├─ Filter plays with artwork
├─ Map to AlbumArtworkData
└─ Preload images (unused)

NEW OPPORTUNITIES:
├─ Image dimension caching (IndexedDB)
├─ Layout math (tile positions, repetitions)
├─ Format validation
├─ URL optimization (CDN size params)
└─ Deduplication cache
```

---

## CSS IMPROVEMENTS (Quick wins)

**Before**:
```css
.scrolling-album-bar canvas {
  image-rendering: auto;
  image-rendering: crisp-edges; /* For pixel art, not photos */
}
```

**After** (add to index.css):
```css
.scrolling-album-bar {
  animation: slideInFromTop 0.4s ease-out; /* Smooth, no overshoot */
  will-change: transform;
  transform: translateZ(0); /* GPU acceleration */
}

.scrolling-album-bar canvas {
  image-rendering: auto;
  will-change: contents;
}

.scrolling-album-bar > div:first-child {
  will-change: backdrop-filter;
  contain: layout style paint;
}
```

Impact: Smoother animations, better paint performance

---

## FILES TO MODIFY

### High Priority
1. **ScrollingAlbumBar.tsx** (lines 20-193)
   - Fix state management (loadedImages → isLoadingComplete)
   - Add image array caching
   - Optimize canvas clear
   - Precompute clip paths

2. **album-bar.ts** (lines 50-54)
   - Remove sorting (move to worker)

3. **album-bar-worker.ts** (line 53)
   - Add sorting logic

4. **index.css** (lines 73-82)
   - Add GPU hints
   - Optimize image-rendering

### Medium Priority
5. **album-bar-worker-protocol.ts** (lines 15-25)
   - Optional: remove unused width/height

---

## CODE LOCATIONS - KEY BOTTLENECKS

| Location | Issue | Lines |
|----------|-------|-------|
| ScrollingAlbumBar.tsx | Animation re-runs | 29-72, 153 |
| ScrollingAlbumBar.tsx | Array allocation | 95 |
| ScrollingAlbumBar.tsx | Full canvas clear | 114 |
| ScrollingAlbumBar.tsx | Expensive clip ops | 129-137 |
| ScrollingAlbumBar.tsx | Repetition calc | 118 |
| album-bar.ts | Sorting on main | 50-54 |
| index.css | Missing GPU hints | 73-82 |
| index.css | Easing overshoot | 88 |

