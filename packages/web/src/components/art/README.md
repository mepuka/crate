# Art Enhancement Components

Album art display with derived ambient assets and KEXP-aligned aesthetics.

## Philosophy: Derived Assets, Not Altered Art

**The album art itself is NEVER altered.** We add complementary elements extracted from its visual style (glows, gradients, textures) that create an ambient "vinyl den" atmosphere.

This approach:
1. Respects the artist's original creative vision
2. Avoids the uncanny valley of AI-altered art
3. Enables fast, pre-computed effects (no API calls on render)

## Components

### EnhancedAlbumArt

Album art with ambient glow and texture overlay derived from the art's color palette.

```tsx
import { EnhancedAlbumArt } from "@/components/art";

<EnhancedAlbumArt
  src={play.image_uri}           // Required: album art URL
  alt={`${play.artist} - ${play.track}`}
  size={120}
  derivedStyle={{                // Pre-computed by backend ArtCurationService
    glowColor: "#8b4513",        // Dominant color for ambient glow
    textureType: "grain",        // "grain" | "noise" | "paper" | "none"
    temperature: "warm",         // "warm" | "cool" | "neutral"
  }}
  enableGlow={true}              // Ambient glow behind art (default: true)
  enableTexture={true}           // Subtle texture overlay (default: true)
  isNewMusic={false}             // Pass through to AlbumArt component
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string \| null` | required | Album art URL |
| `alt` | `string` | required | Alt text |
| `size` | `number` | 120 | Size in pixels |
| `derivedStyle` | `DerivedStyle` | undefined | Pre-computed style from backend |
| `enableGlow` | `boolean` | true | Show ambient glow |
| `enableTexture` | `boolean` | true | Show texture overlay |
| `isNewMusic` | `boolean` | false | New music indicator |
| `className` | `string` | undefined | Additional CSS classes |

### ParallaxAlbumArt

Apple Music-style depth effect with mouse/gyro tracking.

```tsx
import { ParallaxAlbumArt } from "@/components/art";

<ParallaxAlbumArt
  src={play.image_uri}
  alt={`${play.artist} - ${play.track}`}
  size={200}
  intensity={0.15}            // Parallax movement amount
  enableGyro={true}           // Mobile gyroscope support
  enableReflection={true}     // Light reflection overlay
/>
```

## DerivedStyle Interface

The `derivedStyle` prop contains pre-computed values from the backend `ArtCurationService`:

```typescript
interface DerivedStyle {
  /** Dominant color from album art palette (hex) */
  glowColor?: string;
  /** CSS gradient for ambient background */
  backgroundGradient?: string;
  /** Texture type matching album era */
  textureType?: "grain" | "noise" | "paper" | "none";
  /** Color temperature */
  temperature?: "warm" | "cool" | "neutral";
}
```

## Style Presets

The backend `AlbumArtEnhancementService` supports these style presets for generating enhanced art:

| Style | Use Case | Aesthetic |
|-------|----------|-----------|
| `lo-fi-indie` | Indie/DIY artists | Warm analog, SubPop 90s |
| `pnw-local` | Seattle local artists | Misty greens, forest texture |
| `vinyl-sleeve` | Reissues, archival | Paper texture, mid-century |
| `concert-poster` | Live shows | Screen-printed, DIY poster |
| `synth-pop-retro` | Electronic | Neon, 80s computer graphics |
| `minimal` | Subtle enhancement | Warm grading only |

## Asset Sizes

```typescript
import { STANDARD_SIZES, ENHANCEMENT_RESOLUTIONS } from "@/components/art";

STANDARD_SIZES = {
  trackThumb: 48,    // Track list item
  queueThumb: 56,    // Play queue item
  nowPlaying: 80,    // Now playing card
  cardThumb: 120,    // Card thumbnail
  cardLarge: 180,    // Card large
  hero: 300,         // Hero/featured
  fullHero: 480,     // Full page hero
};

ENHANCEMENT_RESOLUTIONS = {
  "1K": 1024,
  "2K": 2048,  // Default, recommended
  "4K": 4096,
};
```

## Utilities

```typescript
import { validateSourceImage, assertSourceImage } from "@/components/art";

// Check if URL is valid for enhancement (returns boolean)
const isValid = validateSourceImage(url);

// Throws if URL is not valid (for use in pipelines)
assertSourceImage(url); // throws if null/undefined/empty
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Backend (packages/agent)                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ArtCurationService.curate(imageUrl, context)                │
│     ├── Analyzes album art via Gemini vision                   │
│     └── Returns: palette, derivedAssets (glow, gradient, etc.) │
│                                                                 │
│  2. AlbumArtEnhancementService.enhance(request) [optional]      │
│     ├── Generates enhanced version via Nano Banana Pro         │
│     └── Returns: enhancedImageBase64, mimeType                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (stored in database)
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  3. Fetch play with pre-computed derivedStyle                   │
│                                                                 │
│  4. EnhancedAlbumArt displays                                   │
│     ├── Original album art (untouched)                         │
│     ├── Ambient glow from derivedStyle.glowColor               │
│     └── Texture overlay from derivedStyle.textureType          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files

- `EnhancedAlbumArt.tsx` - Main component with glow/texture effects
- `ParallaxAlbumArt.tsx` - Depth effect component
- `artUtils.ts` - Image validation and size constants
- `index.ts` - Public exports
