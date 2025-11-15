# Dynamic Album Art Gradients - Worker-Based Implementation

**Date:** 2025-11-14
**Status:** Planning
**Goal:** Generate organic gradients for missing album art based on color palette from recent album artwork

## Overview

Instead of using hash-based gradients, dynamically generate gradients by analyzing the dominant colors from recent album artwork in the scrolling background. This creates a cohesive visual language where missing album art feels connected to the rest of the UI.

## Architecture

### Current State (Phase 1 - Completed)
- Hash-based gradient generation in `AlbumArt.tsx`
- 6 hardcoded color palettes
- Consistent per-album based on alt text
- SVG noise texture overlay

### Target State (Phase 2)
- Worker analyzes recent album art colors
- Generates gradients from actual color palette
- Store gradients in atom/KVS for reuse
- Fallback to hash-based when no recent art available

## Implementation Plan

### Step 1: Extend Album Bar Worker

**File**: `packages/web/src/workers/album-bar-worker.ts`

Add color extraction capability:
- Use Canvas API to extract dominant colors from album images
- Calculate 3-5 dominant colors per image
- Store color palette alongside artwork data

```typescript
interface AlbumArtworkData {
  id: number
  imageUri: string
  thumbnailUri: string
  dominantColors?: string[]  // NEW: HSL color strings
}

// New function in worker
function extractDominantColors(imageData: ImageData): string[] {
  // Use color quantization algorithm (median cut or k-means)
  // Return 3-5 HSL color strings
  // Example: ['hsl(220, 70%, 45%)', 'hsl(260, 60%, 35%)', ...]
}
```

### Step 2: Create Gradient Generation Atom

**File**: `packages/web/src/atoms/album-gradients.ts` (NEW)

```typescript
import { Atom } from '@effect-atom/core'
import { recentAlbumArtAtom } from './album-bar'

// Aggregate color palette from recent album art
export const colorPaletteAtom = Atom.make(
  pipe(
    recentAlbumArtAtom,
    Atom.map((artworks) => {
      // Flatten all dominant colors from recent artworks
      const allColors = artworks
        .flatMap(a => a.dominantColors ?? [])
        .slice(0, 20) // Keep most recent 20 colors

      return allColors
    })
  )
)

// Generate gradient for a specific album ID
export function makeGradientAtom(albumId: number) {
  return Atom.make(
    pipe(
      colorPaletteAtom,
      Atom.map((palette) => {
        if (palette.length < 2) {
          // Fallback to hash-based gradient
          return generateOrganicGradient(String(albumId))
        }

        // Pick 2-3 colors from palette based on album ID
        const hash = simpleHash(String(albumId))
        const color1 = palette[hash % palette.length]
        const color2 = palette[(hash >> 8) % palette.length]
        const angle = 135 + (Math.abs(hash >> 16) % 90)

        return `linear-gradient(${angle}deg, ${color1}, ${color2})`
      })
    )
  )
}
```

### Step 3: Update AlbumArt Component

**File**: `packages/web/src/components/AlbumArt.tsx`

```typescript
interface AlbumArtProps {
  src: string | null
  alt: string
  playId?: number  // NEW: Optional play ID for gradient lookup
  size?: number
  className?: string
}

export function AlbumArt({ src, alt, playId, size = 120, className }: AlbumArtProps) {
  // If playId provided, use dynamic gradient; otherwise use hash
  const gradientAtom = useMemo(
    () => playId ? makeGradientAtom(playId) : null,
    [playId]
  )

  const dynamicGradient = useAtomValue(gradientAtom ?? Atom.succeed(''))
  const hashGradient = useMemo(() => generateOrganicGradient(alt), [alt])

  const gradient = Result.match(dynamicGradient, {
    onSuccess: (g) => g || hashGradient,
    onFailure: () => hashGradient
  })

  // Rest of component...
}
```

### Step 4: Pass Play ID from PlayCard

**File**: `packages/web/src/components/PlayCard.tsx`

```typescript
<AlbumArt
  src={play.thumbnail_uri || play.image_uri}
  alt={`${play.album} by ${play.artist}`}
  playId={play.id}  // NEW
  size={imageSize}
/>
```

## Color Extraction Algorithm

### Option A: Simple Average (Fast)
```typescript
function extractDominantColors(imageData: ImageData): string[] {
  // Sample every Nth pixel
  // Group by color similarity
  // Return top 5 colors by frequency
}
```

### Option B: K-Means Clustering (Better Quality)
```typescript
function extractDominantColors(imageData: ImageData): string[] {
  // Run k-means with k=5
  // Convert cluster centers to HSL
  // Sort by cluster size
  return topColors
}
```

### Option C: Median Cut (Balance)
```typescript
function extractDominantColors(imageData: ImageData): string[] {
  // Build color histogram
  // Recursively split color space
  // Return representative colors
}
```

**Recommendation**: Start with Option A for speed, upgrade to Option C if needed.

## Performance Considerations

1. **Worker Processing**:
   - Extract colors during initial image load
   - Cache results in worker memory
   - Don't block rendering

2. **Atom Updates**:
   - Color palette atom updates reactively
   - Gradient atoms memoized per play ID
   - No re-renders unless palette changes

3. **Fallback Strategy**:
   - Hash-based gradient if palette empty
   - Hash-based gradient for albums without ID
   - Graceful degradation

## Migration Path

### Phase 1 (✅ Complete)
- Hash-based gradients with noise texture
- No dependencies on workers

### Phase 2 (Next)
- Add color extraction to album bar worker
- Create gradient atoms
- Update AlbumArt to use dynamic gradients

### Phase 3 (Future)
- Persist color palettes in IndexedDB
- Add color harmony rules (complementary, analogous)
- Smooth transitions when palette changes

## Testing

1. **Visual Testing**:
   - Verify gradients look organic and cohesive
   - Check color harmony with dark theme
   - Test with no recent artwork (fallback)

2. **Performance Testing**:
   - Measure color extraction time per image
   - Check atom update frequency
   - Monitor memory usage in worker

3. **Edge Cases**:
   - All grayscale images
   - Very bright/dark images
   - No album art available

## Success Criteria

- ✅ Missing album art shows organic gradients
- ✅ Gradients derived from recent artwork colors
- ✅ Smooth fallback when no artwork available
- ✅ No performance degradation
- ✅ Cohesive visual language across timeline

## Notes

- Current implementation uses hash-based gradients as solid fallback
- Worker already loads album artwork for scrolling background
- Can reuse existing infrastructure
- Color extraction happens once per image
- Gradient generation is cheap (just string interpolation)
