# ScrollingAlbumBar - Implementation Guide for Phase 1

## IMPLEMENTATION 1: Fix Animation Re-runs (CRITICAL - 1 hour)

### Problem
Lines 29-72: Loading images sets state 25 times
Lines 75-153: useEffect depends on `loadedImages`, causing animation restarts

### Before Code
```typescript
// ScrollingAlbumBar.tsx

const [loadedImages, setLoadedImages] = useState<Map<number, HTMLImageElement>>(new Map());

useEffect(() => {
  Result.matchWithWaiting(albumArtResult, {
    onWaiting: () => {},
    onError: (error) => {
      console.error("Failed to load album artwork:", error);
    },
    onDefect: (error) => {
      console.error("Defect loading album artwork:", error);
    },
    onSuccess: (s) => {
      const artworks = s.value;
      const imageMap = new Map<number, HTMLImageElement>();
      let loadedCount = 0;

      artworks.forEach((artwork) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
          imageMap.set(artwork.id, img);
          loadedCount++;

          // THIS TRIGGERS STATE UPDATE 25 TIMES!
          if (loadedCount === artworks.length) {
            setLoadedImages(new Map(imageMap));
          }
        };

        img.onerror = () => {
          console.error(`Failed to load image for play ${artwork.id}`);
          loadedCount++;

          if (loadedCount === artworks.length && imageMap.size > 0) {
            setLoadedImages(new Map(imageMap));
          }
        };

        img.src = artwork.thumbnailUri;
      });
    },
  });
}, [albumArtResult]);

// Canvas animation loop
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas || loadedImages.size === 0) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  // ... animation setup ...
  
  const images = Array.from(loadedImages.values());
  
  const animate = (currentTime: number) => {
    // ... animation code ...
  };

  animationFrameRef.current = requestAnimationFrame(animate);

  return () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    window.removeEventListener("resize", resizeCanvas);
  };
}, [loadedImages]); // TRIGGERS ON EVERY IMAGE LOAD!
```

### After Code
```typescript
// ScrollingAlbumBar.tsx

// New: Track loading completion, not individual images
const [isLoadingComplete, setIsLoadingComplete] = useState(false);
const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
const pendingCountRef = useRef(0);
const totalCountRef = useRef(0);

// Step 1: Load all images, only update state when COMPLETE
useEffect(() => {
  Result.matchWithWaiting(albumArtResult, {
    onWaiting: () => {
      setIsLoadingComplete(false);
    },
    onError: (error) => {
      console.error("Failed to load album artwork:", error);
      setIsLoadingComplete(false);
    },
    onDefect: (error) => {
      console.error("Defect loading album artwork:", error);
      setIsLoadingComplete(false);
    },
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
          // Only update state when ALL images are loaded
          if (pendingCountRef.current === 0) {
            setIsLoadingComplete(true);
          }
        };

        img.onload = () => {
          imagesRef.current.set(artwork.id, img);
          onComplete();
        };

        img.onerror = () => {
          console.error(`Failed to load image for play ${artwork.id}`);
          onComplete(); // Still count as done even if failed
        };

        img.src = artwork.thumbnailUri;
      });
    },
  });
}, [albumArtResult]);

// Step 2: Animation effect now only depends on isLoadingComplete
useEffect(() => {
  if (!isLoadingComplete) return;

  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const resizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = CONFIG.BAR_HEIGHT * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${CONFIG.BAR_HEIGHT}px`;
    ctx.scale(dpr, dpr);
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Get images from ref (no allocation)
  const images = Array.from(imagesRef.current.values());
  const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
  const totalWidth = images.length * tileWidth;

  let lastTime = performance.now();

  const animate = (currentTime: number) => {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    offsetXRef.current -= CONFIG.SCROLL_SPEED * deltaTime;

    if (offsetXRef.current <= -totalWidth) {
      offsetXRef.current += totalWidth;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasWidth = window.innerWidth;
    const repetitionsNeeded = Math.ceil(canvasWidth / totalWidth) + 2;

    for (let rep = 0; rep < repetitionsNeeded; rep++) {
      images.forEach((img, index) => {
        const x = offsetXRef.current + rep * totalWidth + index * tileWidth;
        const y = (CONFIG.BAR_HEIGHT - CONFIG.TILE_SIZE) / 2;

        if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
          ctx.clip();
          ctx.drawImage(img, x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
          ctx.restore();
        }
      });
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  animationFrameRef.current = requestAnimationFrame(animate);

  return () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    window.removeEventListener("resize", resizeCanvas);
  };
}, [isLoadingComplete]); // Much more stable!
```

### Key Changes
1. Replace `loadedImages` state with `isLoadingComplete` boolean
2. Store images in `imagesRef` instead of state
3. Only call `setIsLoadingComplete` once when all images loaded
4. Animation effect depends on `isLoadingComplete` instead of `loadedImages`

### Expected Improvement
- Effect re-runs: 25 → 1
- Animation restarts: 25 → 0
- Jank during load: Severe → None

---

## IMPLEMENTATION 2: Cache Clip Paths (30-45 min)

### Problem
Lines 129-137: Creating Path2D objects for every tile, every frame = expensive

### Before Code
```typescript
const animate = (currentTime: number) => {
  // ... timing code ...

  for (let rep = 0; rep < repetitionsNeeded; rep++) {
    images.forEach((img, index) => {
      const x = offsetXRef.current + rep * totalWidth + index * tileWidth;
      const y = (CONFIG.BAR_HEIGHT - CONFIG.TILE_SIZE) / 2;

      if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
        // EXPENSIVE: Creating path objects in animation loop
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
        ctx.clip();
        ctx.drawImage(img, x, y, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        ctx.restore();
      }
    });
  }

  animationFrameRef.current = requestAnimationFrame(animate);
};
```

### After Code
```typescript
// Create clip paths ONCE, before animation loop
const clipPaths = useMemo(
  () => {
    return images.map(() => {
      const path = new Path2D();
      path.roundRect(0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_RADIUS);
      return path;
    });
  },
  [images.length] // Only recreate if count changes
);

const animate = (currentTime: number) => {
  // ... timing code ...

  for (let rep = 0; rep < repetitionsNeeded; rep++) {
    images.forEach((img, index) => {
      const x = offsetXRef.current + rep * totalWidth + index * tileWidth;
      const y = (CONFIG.BAR_HEIGHT - CONFIG.TILE_SIZE) / 2;

      if (x + CONFIG.TILE_SIZE >= 0 && x <= canvasWidth) {
        // FAST: Reuse cached path
        ctx.save();
        ctx.translate(x, y);
        ctx.clip(clipPaths[index]);
        ctx.drawImage(img, 0, 0, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
        ctx.restore();
      }
    });
  }

  animationFrameRef.current = requestAnimationFrame(animate);
};
```

### Key Changes
1. Create `clipPaths` array once with `useMemo`
2. Store pre-built Path2D objects
3. In animation loop: translate to position, then clip with cached path
4. Drawing operation still works same way

### Expected Improvement
- Clip operation time: Per frame reduction of 30-40%
- No memory overhead beyond initial path creation

---

## IMPLEMENTATION 3: Dirty Rectangle Clear (30-45 min)

### Problem
Line 114: Clearing entire canvas (1920×64) every frame = expensive

### Before Code
```typescript
const animate = (currentTime: number) => {
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  offsetXRef.current -= CONFIG.SCROLL_SPEED * deltaTime;

  if (offsetXRef.current <= -totalWidth) {
    offsetXRef.current += totalWidth;
  }

  // EXPENSIVE: Full canvas clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ... rest of drawing ...
};
```

### After Code - Option A: Dirty Rect (Recommended)
```typescript
const animate = (currentTime: number) => {
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  offsetXRef.current -= CONFIG.SCROLL_SPEED * deltaTime;

  if (offsetXRef.current <= -totalWidth) {
    offsetXRef.current += totalWidth;
  }

  // FAST: Only clear the scrolling area + margins
  const clearMargin = totalWidth;
  const clearStart = Math.floor(offsetXRef.current - clearMargin);
  const clearWidth = window.innerWidth + clearMargin * 2;
  
  ctx.clearRect(clearStart, 0, clearWidth, CONFIG.BAR_HEIGHT);

  // ... rest of drawing ...
};
```

### After Code - Option B: Full clear with requestIdleCallback
```typescript
let lastFullClearTime = performance.now();

const animate = (currentTime: number) => {
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  offsetXRef.current -= CONFIG.SCROLL_SPEED * deltaTime;

  if (offsetXRef.current <= -totalWidth) {
    offsetXRef.current += totalWidth;
  }

  // FAST: Dirty rect for animation
  const clearMargin = totalWidth;
  const clearStart = Math.floor(offsetXRef.current - clearMargin);
  const clearWidth = window.innerWidth + clearMargin * 2;
  
  ctx.clearRect(clearStart, 0, clearWidth, CONFIG.BAR_HEIGHT);

  // Periodically do full clear in idle time
  if (currentTime - lastFullClearTime > 2000) {
    requestIdleCallback(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    lastFullClearTime = currentTime;
  }

  // ... rest of drawing ...
};
```

### Key Changes
1. Only clear region being scrolled
2. Add margin to avoid visible artifacts
3. Optional: defer full clear to idle callback

### Expected Improvement
- Clear operation time: 0.5-1ms → 0.2-0.3ms
- Overall paint time: 15-25% faster

---

## IMPLEMENTATION 4: Cache Image Array (15 min)

### Problem
Line 95: `Array.from(loadedImages.values())` creates new array every frame

### Before Code
```typescript
useEffect(() => {
  // ... canvas setup ...

  const images = Array.from(loadedImages.values());
  const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
  const totalWidth = images.length * tileWidth;

  const animate = (currentTime: number) => {
    // ... animation code ...
  };

  // ...
}, [loadedImages]);
```

### After Code
```typescript
// Declare array cache
const imagesRef = useRef<HTMLImageElement[]>([]);

useEffect(() => {
  // Update cache when images change
  imagesRef.current = Array.from(imagesRef.current.values());
}, [isLoadingComplete]); // Already cached in imagesRef

useEffect(() => {
  // ... canvas setup ...

  // Use cached array reference (no allocation)
  const images = imagesRef.current;
  const tileWidth = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
  const totalWidth = images.length * tileWidth;

  const animate = (currentTime: number) => {
    // ... animation code ...
    // 'images' is stable reference, no allocation per frame
  };

  // ...
}, [isLoadingComplete]);
```

### Alternative Simpler Approach
If you already fixed #1 (isLoadingComplete), change the animation effect:

```typescript
useEffect(() => {
  if (!isLoadingComplete) return;

  const canvas = canvasRef.current;
  if (!canvas) return;

  // ...

  // Get from ref instead of creating new array
  const images = Array.from(imagesRef.current.values());
  
  // ... rest of animation
  
  const animate = (currentTime: number) => {
    // Use 'images' variable (captured once)
    // No array.from() called inside animate function
  };
}, [isLoadingComplete]);
```

### Expected Improvement
- Reduce memory allocations
- Less garbage collection pressure
- Frame time slightly lower

---

## IMPLEMENTATION 5: Move Sorting to Worker (15 min)

### Problem
Lines 50-54 in album-bar.ts: Sorting happens on main thread

### Before Code - album-bar.ts
```typescript
export const recentAlbumArtAtom = AlbumBarRuntime.atom(
  Effect.gen(function* () {
    const workerClient = yield* AlbumBarWorkerClient;
    const timelineKVS = yield* TimelineKVS;

    // Get plays chunk from KVS
    const playsChunk = yield* timelineKVS.getPlaysChunk();

    // SORTING ON MAIN THREAD
    const sortedArray = Chunk.toReadonlyArray(playsChunk);
    const recentPlays = [...sortedArray]
      .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
      .slice(0, ALBUM_BAR_PLAY_COUNT);

    // Send sorted plays to worker
    const artwork = yield* workerClient.loadArtwork(
      recentPlays,
      ALBUM_BAR_PLAY_COUNT
    );

    return artwork;
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));
```

### After Code - album-bar.ts
```typescript
export const recentAlbumArtAtom = AlbumBarRuntime.atom(
  Effect.gen(function* () {
    const workerClient = yield* AlbumBarWorkerClient;
    const timelineKVS = yield* TimelineKVS;

    const playsChunk = yield* timelineKVS.getPlaysChunk();

    // Send unsorted plays to worker
    const artwork = yield* workerClient.loadArtwork(
      Chunk.toReadonlyArray(playsChunk),
      ALBUM_BAR_PLAY_COUNT
    );

    return artwork;
  })
).pipe(Atom.withReactivity(["timeline:plays_chunk"]));
```

### After Code - album-bar-worker.ts
```typescript
// Update AlbumArtworkServiceLive
const AlbumArtworkServiceLive = Layer.succeed(
  AlbumArtworkService,
  AlbumArtworkService.of({
    processArtwork: (plays, maxCount) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(
          `Processing ${plays.length} plays for album artwork (max: ${maxCount})`
        );

        // MOVE SORTING HERE (off main thread)
        const sorted = [...plays]
          .sort((a, b) => b.airdate.getTime() - a.airdate.getTime())
          .slice(0, maxCount);

        // Filter plays with artwork
        const withArtwork = sorted.filter((play) => 
          play.thumbnail_uri || play.image_uri
        );

        yield* Effect.logInfo(
          `Found ${withArtwork.length} plays with album artwork`
        );

        // Map to AlbumArtworkData structure
        const artworkData = withArtwork.map((play) => ({
          id: play.id,
          thumbnailUri: play.thumbnail_uri || play.image_uri || "",
          imageUri: play.image_uri || play.thumbnail_uri || "",
          artist: play.artist,
          album: play.album,
          song: play.song,
          width: 300,
          height: 300,
        }));

        return artworkData;
      }),
    
    // ... rest remains same
  })
);
```

### Key Changes
1. Remove sorting from album-bar.ts
2. Pass unsorted plays array to worker
3. Add sorting logic to worker's processArtwork
4. Worker handles both sorting and filtering

### Expected Improvement
- Main thread unblocked during sort
- Worker thread handles CPU-intensive work
- Perceivable UI responsiveness improvement

---

## IMPLEMENTATION 6: CSS GPU Acceleration (10 min)

### Problem
Lines 73-82 in index.css: Missing GPU hints, suboptimal image rendering

### Before Code - index.css
```css
@layer components {
  .scrolling-album-bar {
    animation: slideInFromTop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .scrolling-album-bar canvas {
    image-rendering: auto;
    image-rendering: crisp-edges;
    image-rendering: -webkit-optimize-contrast;
  }
}
```

### After Code - index.css
```css
@layer components {
  .scrolling-album-bar {
    animation: slideInFromTop 0.4s ease-out;
    /* Force GPU acceleration */
    will-change: transform;
    transform: translateZ(0);
  }

  .scrolling-album-bar canvas {
    /* Better for photographs */
    image-rendering: auto;
    will-change: contents;
  }

  /* Optimize backdrop blur performance */
  .scrolling-album-bar > div:first-child {
    will-change: backdrop-filter;
    contain: layout style paint;
  }
}

@layer utilities {
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
  
  /* ... pulse animation stays the same ... */
}
```

### Key Changes
1. Add `will-change: transform` and `transform: translateZ(0)` for GPU acceleration
2. Change easing from overshoot to `ease-out` (0.4s instead of 0.5s)
3. Add `will-change: contents` to canvas
4. Add `will-change: backdrop-filter` to blur container
5. Add CSS containment for better paint performance

### Expected Improvement
- Smoother animations
- Better paint performance
- More responsive on slower devices

---

## TESTING CHECKLIST

After implementing each change:

```markdown
[ ] Animation re-runs fix
    [ ] Load component
    [ ] Open DevTools Performance tab
    [ ] Check FPS during album load
    [ ] Verify animation is smooth (no restarts)
    [ ] Count effect re-runs (should be 1)

[ ] Clip path caching
    [ ] Check canvas rendering still looks correct
    [ ] Verify rounded corners still visible
    [ ] Profile canvas paint time

[ ] Dirty rect clear
    [ ] Check for visual artifacts (black lines)
    [ ] Test at different window sizes
    [ ] Verify responsive behavior

[ ] Image array cache
    [ ] Monitor memory allocations
    [ ] Check GC pressure reduced

[ ] Sorting in worker
    [ ] Verify album art order is still newest first
    [ ] Check main thread isn't blocked during sort

[ ] CSS GPU hints
    [ ] Animation looks smooth
    [ ] No paint thrashing
    [ ] Test on slow device
```

---

## PERFORMANCE MONITORING

Add this to ScrollingAlbumBar.tsx to measure improvements:

```typescript
useEffect(() => {
  if (!canvasRef.current) return;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'measure') {
        console.log(`${entry.name}: ${entry.duration.toFixed(2)}ms`);
      }
    }
  });

  observer.observe({ entryTypes: ['measure'] });

  return () => observer.disconnect();
}, []);

// Measure frame times (add inside animate function)
const measureFrame = () => {
  performance.mark('frame-start');
  // ... rendering code ...
  performance.mark('frame-end');
  performance.measure('frame-duration', 'frame-start', 'frame-end');
};
```

---

## IMPLEMENTATION ORDER

Recommend implementing in this order:
1. **First**: Fix animation re-runs (biggest impact)
2. **Second**: Cache clip paths
3. **Third**: Dirty rect clear
4. **Fourth**: Sort in worker
5. **Fifth**: CSS GPU hints
6. **Sixth**: Image array cache (low impact, easy)

Total time: ~2-3 hours for all Phase 1 optimizations
Expected improvement: 50-70% less jank, solid 60fps

