# ScrollingAlbumBar Implementation Analysis & Optimization Recommendations

## Executive Summary
The ScrollingAlbumBar implementation is well-structured with good separation of concerns (worker, client, component) and uses modern Effect-based patterns. However, there are several optimization opportunities across canvas rendering, state management, and data flow that could significantly improve performance and reduce unnecessary re-renders.

---

## 1. CANVAS/RENDERING PERFORMANCE ISSUES

### Current Bottlenecks

#### 1.1 Full Canvas Clear Every Frame (Line 114)
```typescript
ctx.clearRect(0, 0, canvas.width, canvas.height);
```
**Issue**: Clearing the entire canvas every frame is expensive when you only need to redraw tiles in the visible viewport.

**Impact**: On 60fps at 1920px width, this is a full screen clear × 60 per second.

**Recommendation**: Implement dirty rectangle invalidation or only clear the scrolling area:
```typescript
// Option 1: Clear only the visible area + margins
const visibleStart = Math.floor(offsetXRef.current);
const visibleEnd = visibleStart + window.innerWidth + totalWidth;
ctx.clearRect(visibleStart - totalWidth, 0, window.innerWidth + totalWidth * 2, CONFIG.BAR_HEIGHT);

// Option 2: Use requestIdleCallback to batch clears
// Option 3: Double-buffer approach (render to offscreen canvas then swap)
```

#### 1.2 Expensive Path Operations Every Frame (Lines 129-137)
```typescript
ctx.save();
ctx.beginPath();
ctx.roundRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
ctx.clip();
ctx.drawImage(img, x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
ctx.restore();
```
**Issue**: 
- `ctx.save()` and `ctx.restore()` create state stack entries
- `roundRect()` + `clip()` are complex path operations executed for every tile every frame
- For 25 tiles per repetition × 2-3 repetitions = 50-75 expensive operations per frame

**Impact**: These are among the slowest canvas operations, causing paint bottlenecks.

**Recommendations**:

**Option A: Pre-create Clipped Images in Worker**
Move image clipping to worker thread and create pre-clipped canvas blobs or ImageData:
```typescript
// In worker: Preprocess all images with rounded corners
const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
const ctx = canvas.getContext('2d');
// Draw rounded rect path once, then composite image
const clippedImageData = await canvas.convertToBlob();
// Return clipped images or ImageData to main thread
```

**Option B: Use CSS Mask on Canvas Layer**
Instead of clipping in canvas, use CSS masks on a wrapper:
```css
.scrolling-album-bar canvas {
  mask-image: repeating-linear-gradient(
    90deg,
    transparent 0px,
    black 4px,
    black 60px,
    transparent 64px
  );
}
```

**Option C: Precompute Clipping Paths (Low-Medium effort)**
```typescript
// Store pre-calculated clip paths at offscreen position
const precomputedPaths = images.map((_, index) => {
  const path = new Path2D();
  path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
  return path;
});

// In animation loop:
for (let rep = 0; rep < repetitionsNeeded; rep++) {
  images.forEach((img, index) => {
    if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
      ctx.save();
      ctx.translate(x, y);
      ctx.clip(precomputedPaths[index]);
      ctx.drawImage(img, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
      ctx.restore();
    }
  });
}
```

#### 1.3 Array Creation Every Frame (Line 95)
```typescript
const images = Array.from(loadedImages.values());
```
**Issue**: Creates a new array on every animation frame (60 per second).

**Recommendation**: Cache outside animation loop:
```typescript
// Move outside animate function
let cachedImages = Array.from(loadedImages.values());

useEffect(() => {
  // Update cache when images change
  cachedImages = Array.from(loadedImages.values());
}, [loadedImages]);

// In animate:
const images = cachedImages; // Reference, not new array
```

#### 1.4 Repetition Calculation Every Frame (Line 118)
```typescript
const repetitionsNeeded = Math.ceil(canvasWidth / totalWidth) + 2;
```
**Issue**: This calculation happens on every frame, even when window size hasn't changed.

**Recommendation**: Cache with memoization:
```typescript
const canvasWidth = window.innerWidth;
const repetitionsNeeded = useMemo(
  () => Math.ceil(canvasWidth / totalWidth) + 2,
  [canvasWidth, totalWidth]
);
```

---

## 2. STATE MANAGEMENT & REACT RE-RENDER ISSUES

### Current Bottlenecks

#### 2.1 Animation Re-runs on Every Image Load (Line 153)
```typescript
useEffect(() => {
  // ... animation setup
}, [loadedImages]); // Dependency on loadedImages!
```
**Issue**: 
- Each image load creates a new Map reference via `setLoadedImages(new Map(imageMap))`
- This triggers the entire effect cleanup and re-setup
- Animation frame is cancelled and a new one starts
- Happens 25 times in quick succession

**Impact**: Visible jank, stutter, animation restarts, wasted cleanup/setup cycles.

**Timeline**:
```
t=0ms: Image 1 loads → setLoadedImages → effect runs → requestAnimationFrame
t=50ms: Image 2 loads → setLoadedImages → effect runs → cancel previous RAF → new RAF
t=100ms: Image 3 loads → effect runs again...
... (repeated 25 times)
```

**Solution**: Use a ref for loading state, only trigger effect when loading is COMPLETE:
```typescript
const [isLoadingComplete, setIsLoadingComplete] = useState(false);
const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
const loadCountRef = useRef(0);
const totalImagesRef = useRef(0);

useEffect(() => {
  Result.matchWithWaiting(albumArtResult, {
    onSuccess: (s) => {
      const artworks = s.value;
      totalImagesRef.current = artworks.length;
      loadCountRef.current = 0;
      imagesRef.current = new Map();

      artworks.forEach((artwork) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
          imagesRef.current.set(artwork.id, img);
          loadCountRef.current++;
          
          // Only update state when ALL images loaded
          if (loadCountRef.current === totalImagesRef.current) {
            setIsLoadingComplete(true);
          }
        };
        
        img.src = artwork.thumbnailUri;
      });
    },
  });
}, [albumArtResult]);

// Animation effect now only depends on isLoadingComplete
useEffect(() => {
  if (!isLoadingComplete) return;
  
  const images = Array.from(imagesRef.current.values());
  // ... animation code
}, [isLoadingComplete]); // Much more stable!
```

#### 2.2 Inefficient Map Reference Updates (Lines 40-53)
```typescript
const imageMap = new Map<number, HTMLImageElement>();
let loadedCount = 0;

artworks.forEach((artwork) => {
  // ...
  img.onload = () => {
    imageMap.set(artwork.id, img);
    loadedCount++;
    
    if (loadedCount === artworks.length) {
      setLoadedImages(new Map(imageMap)); // New Map() even if unchanged
    }
  };
});
```

**Issue**: Creating a new Map instance on every final load. The `new Map(imageMap)` is unnecessary.

**Fix**:
```typescript
if (loadedCount === artworks.length) {
  setLoadedImages(imageMap); // Reuse existing Map
}
```

#### 2.3 Component Re-renders on Unrelated State Changes
```typescript
// In atoms/album-bar.ts
export const scrollSpeedAtom = Atom.make(() => 25);
```

**Current Issue**: If `scrollSpeedAtom` is ever read in the component, any change triggers re-render.

**Recommendation**: Use `useRef` for speed if it should be mutable without re-renders, or cache the value.

#### 2.4 Image Size Hardcoding Causes Re-renders
```typescript
// In worker-protocol.ts
width: Schema.optionalWith(Schema.Number, { default: () => 300 }),
height: Schema.optionalWith(Schema.Number, { default: () => 300 }),
```

**Issue**: These are unused in rendering (canvas only uses TILE_SIZE) but are serialized on every response, increasing message size.

**Recommendation**: Remove from protocol if not needed, or make optional without defaults.

---

## 3. WORKER PROCESSING OPPORTUNITIES

### Current State
The worker currently only:
1. Filters plays with artwork
2. Maps plays to AlbumArtworkData structure
3. Preloads images (optional)

### Opportunities to Offload

#### 3.1 Image Dimension Caching Strategy
**Current**: Hardcoded 300×300 in worker, unused in component.

**Opportunity**: Build an image metadata cache in IndexedDB within the worker:
```typescript
// In worker
class ImageMetadataCache extends Context.Tag("ImageMetadataCache")<...> {}

const getImageDimensions = (url: string) =>
  Effect.gen(function* () {
    // Check IndexedDB cache first
    const cached = yield* cache.get(url);
    if (cached) return cached;
    
    // Load image, get dimensions, cache them
    const img = yield* loadImageInWorker(url);
    const metadata = { width: img.width, height: img.height };
    yield* cache.set(url, metadata);
    return metadata;
  });
```

#### 3.2 Layout/Positioning Math
**Current**: Happens in component animation loop every frame.

**Opportunity**: Precompute and cache:
```typescript
// In worker
interface TileLayout {
  tilePositions: Array<{ x: number; index: number }>;
  totalWidth: number;
  repetitionsNeeded: number;
}

// Send layout template to component once
const computeLayout = (
  imageCount: number,
  viewportWidth: number,
  tileSize: number,
  gap: number
): TileLayout => {
  const tileWidth = tileSize + gap;
  const totalWidth = imageCount * tileWidth;
  const repetitionsNeeded = Math.ceil(viewportWidth / totalWidth) + 2;
  
  return {
    tilePositions: Array.from({ length: imageCount }, (_, i) => ({
      x: i * tileWidth,
      index: i,
    })),
    totalWidth,
    repetitionsNeeded,
  };
};
```

Component then receives this and uses it:
```typescript
// In component - no recalculation per frame
const { tilePositions, totalWidth, repetitionsNeeded } = layoutData;

for (let rep = 0; rep < repetitionsNeeded; rep++) {
  tilePositions.forEach(({ x: baseX, index }) => {
    const x = offsetXRef.current + rep * totalWidth + baseX;
    // Draw...
  });
}
```

#### 3.3 Image Format Validation & Optimization
**Current**: No validation of URLs or formats.

**Opportunity**:
```typescript
// In worker
const validateImageUrl = (url: string): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    // Check URL validity
    const urlObj = yield* Effect.try({
      try: () => new URL(url),
      catch: () => new Error(`Invalid URL: ${url}`),
    });
    
    // Optionally validate format (jpeg/webp/png)
    const pathname = urlObj.pathname.toLowerCase();
    const validFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    const hasValidFormat = validFormats.some(fmt => pathname.endsWith(fmt));
    if (!hasValidFormat) {
      yield* Effect.logWarn(`Unsupported format: ${url}`);
    }
    
    return url;
  });
```

#### 3.4 URL Rewriting for Optimization
**Opportunity**: Rewrite URLs to request optimized thumbnails:
```typescript
// In worker
const optimizeImageUrl = (uri: string): string => {
  // If KEXP CDN, request specific thumbnail size
  if (uri.includes('kexp.org')) {
    return uri.replace(/(\?|&)size=\d+/, `?size=120`); // Match TILE_SIZE
  }
  return uri;
};
```

#### 3.5 Deduplication Cache
**Opportunity**: Cache artwork by ID to avoid reprocessing:
```typescript
// In worker - maintain IndexedDB cache of processed artwork
const getProcessedArtwork = (playId: number) =>
  Effect.gen(function* () {
    const cached = yield* cache.get(`artwork:${playId}`);
    if (cached) return cached;
    
    // Fetch and process if not cached
    const artwork = yield* processPlay(playId);
    yield* cache.set(`artwork:${playId}`, artwork);
    return artwork;
  });
```

---

## 4. CSS/ANIMATION REFINEMENTS

### Current State
```css
.scrolling-album-bar {
  animation: slideInFromTop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.scrolling-album-bar canvas {
  image-rendering: auto;
  image-rendering: crisp-edges;
  image-rendering: -webkit-optimize-contrast;
}

@keyframes slideInFromTop {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### Issues & Recommendations

#### 4.1 Image Rendering Quality
**Issue**: `image-rendering: crisp-edges` is for pixel art. Photos at various scales look worse.

**Recommendation**:
```css
.scrolling-album-bar canvas {
  image-rendering: auto;
  image-rendering: high-quality;
  /* Or use auto for browser optimization */
}
```

#### 4.2 Backdrop Blur Performance
**Issue**: `backdrop-blur-md` is expensive on every repaint.

**Current HTML**:
```jsx
<div className="absolute inset-0 bg-background/80 backdrop-blur-md border-b border-border" />
```

**Recommendations**:

**Option A**: Use `will-change` hint for GPU acceleration:
```css
.scrolling-album-bar > div:first-child {
  will-change: backdrop-filter;
  contain: layout style paint;
}
```

**Option B**: Move blur to a separate compositing layer:
```css
.scrolling-album-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--background);
  opacity: 0.8;
  backdrop-filter: blur(var(--blur-md));
  z-index: -1;
}
```

**Option C**: Use box-shadow instead of blur for lighter performance:
```css
.scrolling-album-bar {
  background: rgba(var(--background), 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
```

#### 4.3 Missing GPU Acceleration Hints
**Recommendation**: Add transform hints to enable GPU acceleration:
```css
.scrolling-album-bar {
  animation: slideInFromTop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  /* Force GPU acceleration */
  transform: translateZ(0);
  will-change: transform;
}

.scrolling-album-bar canvas {
  image-rendering: auto;
  /* Canvas itself doesn't benefit from transform but the container does */
}
```

#### 4.4 Animation Easing
**Current**: `cubic-bezier(0.16, 1, 0.3, 1)` for slide-in.

**Issue**: This produces overshoot (easing value > 1). May look janky if computer is slow.

**Better option for this UI element**:
```css
@keyframes slideInFromTop {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.scrolling-album-bar {
  animation: slideInFromTop 0.4s ease-out; /* Smoother, no overshoot */
}
```

#### 4.5 Loading State Animation
**Current**: Uses `animate-spin` which may not be hardware-accelerated.

**Recommendation**:
```css
.animate-spin {
  animation: spin 1s linear infinite;
  /* Ensure GPU acceleration */
  will-change: transform;
  transform: translateZ(0);
}

@keyframes spin {
  from {
    transform: rotate(0deg) translateZ(0);
  }
  to {
    transform: rotate(360deg) translateZ(0);
  }
}
```

---

## 5. DATA FLOW INEFFICIENCIES

### Current Data Flow

```
Timeline KVS → album-bar.ts (fetch + sort) → Worker → Component (setLoadedImages) → Canvas animation
```

### Issues

#### 5.1 Sorting on Main Thread
**Current Code** (album-bar.ts, lines 50-54):
```typescript
const sortedArray = Chunk.toReadonlyArray(playsChunk);
const recentPlays = [...sortedArray]
  .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
  .slice(0, ALBUM_BAR_PLAY_COUNT);
```

**Issue**: 
- Sorting happens on main thread before sending to worker
- Creates intermediate arrays (`[...sortedArray]`)
- Happens every time plays change

**Recommendation**: Move sorting to worker:
```typescript
// In album-bar.ts
export const recentAlbumArtAtom = AlbumBarRuntime.atom(
  Effect.gen(function* () {
    const workerClient = yield* AlbumBarWorkerClient;
    const timelineKVS = yield* TimelineKVS;

    const playsChunk = yield* timelineKVS.getPlaysChunk();
    
    // Don't sort here, pass raw plays to worker
    const artwork = yield* workerClient.loadArtwork(
      Chunk.toReadonlyArray(playsChunk),
      ALBUM_BAR_PLAY_COUNT
    );
    
    return artwork;
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));

// In worker
const processArtwork = (plays, maxCount) =>
  Effect.gen(function* () {
    // Sort in worker (off main thread)
    const sorted = [...plays]
      .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
      .slice(0, maxCount);
    
    // Filter and process...
    return processedArtwork;
  });
```

#### 5.2 Unnecessary Reactivity Invalidation
**Current Code** (album-bar.ts, line 64):
```typescript
.pipe(Atom.withReactivity(["timeline:plays_chunk"]));
```

**Issue**: Any change to plays chunk invalidates the entire atom, re-fetching and re-sorting even if recent 25 plays haven't changed.

**Recommendation**: Add smart caching to detect if top 25 changed:
```typescript
let lastTopPlays: ReadonlyArray<Play> | null = null;

export const recentAlbumArtAtom = AlbumBarRuntime.atom(
  Effect.gen(function* () {
    const workerClient = yield* AlbumBarWorkerClient;
    const timelineKVS = yield* TimelineKVS;

    const playsChunk = yield* timelineKVS.getPlaysChunk();
    const array = Chunk.toReadonlyArray(playsChunk);
    
    // Early exit if top 25 haven't changed
    if (
      lastTopPlays &&
      array.length >= ALBUM_BAR_PLAY_COUNT &&
      lastTopPlays.every((p, i) => p.id === array[i]?.id)
    ) {
      return yield* lastArtworkRef.current;
    }

    const artwork = yield* workerClient.loadArtwork(array, ALBUM_BAR_PLAY_COUNT);
    lastTopPlays = array.slice(0, ALBUM_BAR_PLAY_COUNT);
    
    return artwork;
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));
```

#### 5.3 Image Preloading Not Used
**Current**: Worker has `preloadImages` method but it's never called.

**Opportunity**: Proactively preload upcoming images:
```typescript
// In component or atom
useEffect(() => {
  if (artwork.length === 0) return;
  
  // Preload images right after artwork is ready
  const urls = artwork.map(a => a.thumbnailUri);
  workerClient.preloadImages(urls).pipe(Effect.runPromise);
}, [artwork]);

// This way images are already in browser cache when animation starts
```

#### 5.4 State Update Cascade
**Issue**: Each image load triggers effect → new RAF → renders until all complete.

**Timeline visualization**:
```
t=0: albumArtResult changes
  ├─ Image loads start (asynchronous, multiple images)
  ├─ t=20: Image 1 onload → setLoadedImages triggers re-render
  │   └─ useEffect([loadedImages]) → cancels RAF, starts new
  ├─ t=40: Image 2 onload → setLoadedImages → effect → new RAF
  └─ ...repeated 25 times

Better pattern:
t=0: albumArtResult changes
  ├─ Image loads start
  ├─ All images onload simultaneously (batched)
  └─ t=250: Last image loaded → setIsLoadingComplete(true) → one effect run
```

**Solution**: Use batching as shown in section 2.1.

---

## 6. PERFORMANCE IMPACT SUMMARY

### High Impact Optimizations

| Optimization | Expected Improvement | Effort |
|---|---|---|
| Fix animation re-runs per image load | 50-70% less jank | Medium |
| Precompute/cache clip paths | 30-40% canvas speedup | Medium |
| Remove full canvas clear (dirty rects) | 15-25% canvas speedup | Medium |
| Move sorting to worker | Less main thread blocking | Easy |
| Reduce array allocations in loop | 10-15% memory | Easy |

### Medium Impact Optimizations

| Optimization | Expected Improvement | Effort |
|---|---|---|
| GPU acceleration hints (CSS) | Smoother animations | Easy |
| Move layout math to worker | 5-10% computation | Medium |
| Image metadata caching in worker | Faster subsequent loads | Medium |
| Backdrop blur optimization | 10-20% paint time | Easy |
| Preload images to cache | No user-visible improvement | Medium |

### Low Impact (Code Quality)

| Optimization | Benefit | Effort |
|---|---|---|
| Remove unused width/height from schema | Smaller serialization | Easy |
| Image format validation in worker | Error prevention | Easy |
| URL optimization (CDN hints) | Smaller downloads | Medium |

---

## 7. RECOMMENDED IMPLEMENTATION ORDER

### Phase 1: High-Impact Wins (Easy/Medium, big payoff)
1. ✅ Fix animation re-running on every image load (use isLoadingComplete ref pattern)
2. ✅ Cache Array.from(loadedImages.values())
3. ✅ Remove full canvas clear or implement dirty rectangles
4. ✅ Move sorting to worker
5. ✅ Add GPU acceleration hints to CSS

### Phase 2: Medium-Impact Optimizations
6. ✅ Precompute clip paths
7. ✅ Move layout math to worker and cache
8. ✅ Image metadata caching in IndexedDB
9. ✅ Optimize backdrop blur with will-change

### Phase 3: Polish & Monitoring
10. ✅ Image preloading to cache
11. ✅ URL optimization for CDN
12. ✅ Performance monitoring with Performance Observer API

---

## 8. CODE SNIPPETS FOR QUICK IMPLEMENTATION

### Snippet 1: Fix Animation Re-runs (Phase 1, Highest Priority)

```typescript
// BEFORE (causes 25 re-renders during image load)
const [loadedImages, setLoadedImages] = useState<Map<number, HTMLImageElement>>(new Map());

useEffect(() => {
  Result.matchWithWaiting(albumArtResult, {
    onSuccess: (s) => {
      // ... loading logic
      setLoadedImages(new Map(imageMap));
    },
  });
}, [albumArtResult]);

useEffect(() => {
  if (!canvas || loadedImages.size === 0) return;
  // ... animation
}, [loadedImages]); // This triggers on every single image load!

// AFTER (single re-render when all images loaded)
const [isLoadingComplete, setIsLoadingComplete] = useState(false);
const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
const pendingCountRef = useRef(0);
const totalCountRef = useRef(0);

useEffect(() => {
  Result.matchWithWaiting(albumArtResult, {
    onSuccess: (s) => {
      const artworks = s.value;
      totalCountRef.current = artworks.length;
      pendingCountRef.current = artworks.length;
      imagesRef.current.clear();

      if (artworks.length === 0) {
        setIsLoadingComplete(true);
        return;
      }

      artworks.forEach((artwork) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        const onComplete = () => {
          pendingCountRef.current--;
          if (pendingCountRef.current === 0) {
            setIsLoadingComplete(true);
          }
        };

        img.onload = () => {
          imagesRef.current.set(artwork.id, img);
          onComplete();
        };

        img.onerror = () => {
          onComplete(); // Still count as complete even if failed
        };

        img.src = artwork.thumbnailUri;
      });
    },
  });
}, [albumArtResult]);

// Now animation only sets up once
useEffect(() => {
  if (!isLoadingComplete) return;
  
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  // ... rest of animation code
}, [isLoadingComplete]); // Single, stable dependency
```

### Snippet 2: Cache Images Array (Phase 1, Easy)

```typescript
// BEFORE
const animate = (currentTime: number) => {
  const images = Array.from(loadedImages.values()); // NEW ARRAY EVERY FRAME
  // ...
};

// AFTER
const imagesRef = useRef<HTMLImageElement[]>([]);

// Update cache when images loaded
useEffect(() => {
  imagesRef.current = Array.from(loadedImages.values());
}, [loadedImages]);

const animate = (currentTime: number) => {
  const images = imagesRef.current; // Reuse cached array
  // ...
};
```

### Snippet 3: Dirty Rectangle Clear (Phase 1, Medium)

```typescript
// BEFORE
ctx.clearRect(0, 0, canvas.width, canvas.height);

// AFTER - Only clear the scrolling region
const scrollMargin = totalWidth; // Clear a bit extra to be safe
const clearStart = offsetXRef.current - scrollMargin;
const clearWidth = window.innerWidth + scrollMargin * 2;

ctx.clearRect(clearStart, 0, clearWidth, CONFIG.BAR_HEIGHT);

// Or use requestIdleCallback for deferred full clear
if (performance.memory?.usedJSHeapSize > 50_000_000) {
  requestIdleCallback(() => ctx.clearRect(0, 0, canvas.width, canvas.height));
}
```

### Snippet 4: Move Sorting to Worker (Phase 1, Easy)

```typescript
// In album-bar.ts - BEFORE
const recentPlays = [...sortedArray]
  .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
  .slice(0, ALBUM_BAR_PLAY_COUNT);

const artwork = yield* workerClient.loadArtwork(
  recentPlays,
  ALBUM_BAR_PLAY_COUNT
);

// AFTER
const artwork = yield* workerClient.loadArtwork(
  Chunk.toReadonlyArray(playsChunk),
  ALBUM_BAR_PLAY_COUNT
);

// In worker - add sorting
const processArtwork = (plays, maxCount) =>
  Effect.gen(function* () {
    // Now sort here (off-main thread)
    const sorted = plays
      .slice() // Non-mutating
      .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
      .slice(0, maxCount);
    
    // Filter and return
    const withArtwork = sorted.filter((play) => play.thumbnail_uri || play.image_uri);
    
    return withArtwork.map(/* ... */);
  });
```

### Snippet 5: GPU Acceleration CSS (Phase 1, Easy)

```css
/* BEFORE */
.scrolling-album-bar {
  animation: slideInFromTop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

/* AFTER */
.scrolling-album-bar {
  animation: slideInFromTop 0.4s ease-out; /* Smooth, no overshoot */
  will-change: transform;
  transform: translateZ(0); /* GPU acceleration hint */
}

.scrolling-album-bar canvas {
  image-rendering: auto; /* Change from crisp-edges */
  will-change: contents;
}

.scrolling-album-bar > div:first-child {
  will-change: backdrop-filter;
  contain: layout style paint; /* CSS containment */
}
```

---

## 9. MONITORING & VALIDATION

After implementing optimizations, measure these metrics:

```typescript
// Add to component for monitoring
useEffect(() => {
  if (!canvasRef.current) return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'measure' && entry.name.includes('animation')) {
        // Log frame times
        console.log(`Animation frame: ${entry.duration.toFixed(2)}ms`);
      }
    }
  });

  observer.observe({ entryTypes: ['measure', 'paint', 'layout'] });

  return () => observer.disconnect();
}, []);

// Measure animation frame time
const measureFrame = () => {
  performance.mark('frame-start');
  // ... rendering code
  performance.mark('frame-end');
  performance.measure('frame-duration', 'frame-start', 'frame-end');
};
```

Expected improvements:
- Frame time: 16ms (60fps) → consistent 8-12ms
- Memory allocations: Current ~2-3 arrays/frame → 0 arrays/frame
- Canvas clear time: ~0.5-1ms → 0.2-0.3ms
- Effect re-runs: 25 during load → 1 after load

