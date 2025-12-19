# Canonical References

Drop folders here to register canonical visual references (mascots, settings, typography, textures).

## Structure

```
references/
├── crate-cat/              # Folder name = reference ID
│   ├── config.yaml         # Metadata, style guide, prompt template
│   ├── canonical.png       # Source of truth image
│   └── variants/           # Pre-made variants
│       ├── line-art.svg
│       ├── silhouette.svg
│       ├── warm.png
│       └── cool.png
├── kexp-studio/
│   ├── config.yaml
│   ├── canonical.jpg
│   └── variants/
│       └── wide-shot.jpg
└── README.md
```

## Quick Start

1. Create a folder with your reference name
2. Add `config.yaml` with metadata
3. Add your canonical image as `canonical.{png,jpg,svg}`
4. Optionally add variants in `variants/` folder

## Config Schema

```yaml
id: crate-cat                    # Unique identifier
name: Crate Cat                  # Display name
description: |                   # Rich description
  The mascot...

category: mascot                 # mascot | setting | typography | texture | prop

canonical: canonical.png         # Path to source of truth image

styleGuide:
  mustPreserve:                  # Elements that must stay consistent
    - Rounded ears
    - Curved tail
  canAdapt:                      # Elements that can change per context
    - Color palette
    - Pose
  neverChange:                   # Absolute constraints
    - Face structure
    - Eye style

promptTemplate: |                # Template for AI generation
  Generate this character...
  PALETTE: {{PALETTE}}
  MOOD: {{MOOD}}

variants:                        # Optional explicit variant definitions
  - name: Line Art
    file: line-art.svg
    useCase: overlays
    palette: neutral             # warm | cool | neutral | any
    style: line                  # line | filled | shaded | realistic | silhouette

tags:                           # Searchable tags
  - mascot
  - brand
```

## Auto-Discovery

Images in `variants/` are automatically discovered. The filename becomes the variant name:

- `line-art.svg` → "Line Art" variant
- `warm-cozy.png` → "Warm Cozy" variant

For richer metadata (palette, style, use case), define variants explicitly in config.yaml.

## Usage in Code

```typescript
import { getCanonical, getVariantForContext, getCanonicalImage } from "./services";

// Get a canonical reference
const catCanonical = await Effect.runPromise(
  getCanonical("crate-cat").pipe(
    Effect.provide(CanonicalReferenceServiceLive)
  )
);

// Get best variant for context
const variant = await Effect.runPromise(
  getVariantForContext("crate-cat", {
    palette: "warm",
    useCase: "album overlay"
  }).pipe(
    Effect.provide(CanonicalReferenceServiceLive)
  )
);

// Get canonical image as base64 for AI prompts
const image = await Effect.runPromise(
  getCanonicalImage("crate-cat").pipe(
    Effect.provide(CanonicalReferenceServiceLive)
  )
);
// { base64: "...", mediaType: "image/png" }
```

## Categories

- **mascot**: Characters (Crate Cat)
- **setting**: Locations (KEXP Studio, Cafe Vita)
- **typography**: Fonts, text treatments
- **texture**: Patterns, grain overlays
- **prop**: Objects (records, turntables, coffee cups)
