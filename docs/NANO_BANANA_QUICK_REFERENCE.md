# Nano Banana Pro Quick Reference
## Album Art Enhancement Prompts

**Model**: `gemini-3-pro-image-preview`
**Service**: `AlbumArtEnhancementService.ts`

---

## Ready-to-Use Enhancement Styles

### 1. Lo-Fi Indie (`style: "lo-fi-indie"`)
**When to use**: Indie/DIY artists, garage bands, Pacific Northwest artists
**Aesthetic**: Warm analog tones, film grain, vintage photography, SubPop 90s
**Output**: Square 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "lo-fi-indie",
};
```

---

### 2. Concert Poster (`style: "concert-poster"`)
**When to use**: Live shows, venue promotions, event announcements
**Aesthetic**: Screen-printed punk/indie, DIY show poster, earth tones + accent color
**Output**: Portrait 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "concert-poster",
  textOverlay: {
    text: "Live at The Crocodile - March 15, 2025",
    typography: "clean sans-serif, bold",
    placement: "bottom margin, centered",
  },
};
```

---

### 3. Vinyl Sleeve (`style: "vinyl-sleeve"`)
**When to use**: Reissues, archival releases, physical media emphasis
**Aesthetic**: Paper texture, gentle wear, mid-century album design, analog warmth
**Output**: Square 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "vinyl-sleeve",
};
```

---

### 4. Synth-Pop Retro (`style: "synth-pop-retro"`)
**When to use**: Electronic/synth artists, retro-futuristic aesthetics
**Aesthetic**: Cyan/magenta neon, 80s computer graphics, Kraftwerk meets Boards of Canada
**Output**: Square 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "synth-pop-retro",
};
```

---

### 5. PNW Local (`style: "pnw-local"`)
**When to use**: Seattle/Pacific Northwest local artists (`is_local: true`)
**Aesthetic**: Muted greens, misty grays, forest textures, sense of place
**Output**: Square 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "pnw-local",
};
```

---

### 6. Minimal (`style: "minimal"`)
**When to use**: Subtle enhancement only, preserving original heavily
**Aesthetic**: Warm color grading + gentle texture, no major changes
**Output**: Square 2K by default

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "minimal",
};
```

---

## Custom Prompts with Guardrails

For full control, use `style: "custom"` with your own prompt. KEXP guardrails are automatically injected.

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  style: "custom",
  customPrompt: `
    Using the provided album art, apply a watercolor wash effect
    over the background only. Preserve the artist and all foreground
    elements entirely. Style: dreamy, ethereal, hand-painted aesthetic.
  `,
  resolution: "2K",
  aspectRatio: "square",
};
```

**KEXP Guardrails (auto-injected)**:
- Preserve artist identity and composition
- Avoid commercial/glossy aesthetics
- Indie music culture, not major label
- Earnest tone, not marketing speak

---

## Style Transfer with Reference Images

Apply aesthetic from reference image(s) to album art.

```typescript
const request: EnhancementRequest = {
  albumArtBase64: "...",
  styleReferences: [styleRef1Base64, styleRef2Base64],
  style: "custom",
  customPrompt: `
    Apply color palette from Image 2 and texture from Image 3
    to the album art (Image 1). Preserve Image 1's composition entirely.
  `,
};
```

**Limits**: Up to 14 reference images (6 objects + 5 humans recommended)

---

## Conversational Refinement

Multi-turn editing for incremental adjustments.

```typescript
// Turn 1: Initial enhancement
const response1 = await enhance({
  albumArtBase64: "...",
  style: "minimal",
});

// Turn 2: Refine
const response2 = await refine(
  response1,
  "Make the color palette warmer with more sepia tones"
);

// Turn 3: Further refinement
const response3 = await refine(
  response2,
  "Add subtle film grain texture"
);
```

**Note**: `thoughtSignature` is handled automatically by SDK.

---

## Prompt Engineering Principles

### ✅ DO

1. **Describe Intent**: Write like briefing a designer
   - "Transform into a concert poster with screen-printed aesthetic"
   - Not: "concert, poster, print, aesthetic, indie"

2. **Positive Framing**: Say what you WANT
   - "Sharp details, authentic indie aesthetic"
   - Not: "No blur, no commercial look"

3. **Preserve Artist Identity**: Always include preservation constraint
   - "Preserve artist identity and composition entirely"

4. **Use Specific Details**: Sound nerd details for visuals
   - "35mm film grain, SubPop 90s aesthetic"
   - Not: "vintage style"

5. **Cultural Anchoring**: Reference music culture
   - "Think record store listening station, not Billboard ad"

### ❌ DON'T

1. **Tag Soup**: Don't just list keywords
   - Avoid: "album art, vintage, indie, lo-fi, warm, 4k"

2. **Negative Prompts in Action Descriptions**: Model works better with positive language
   - Avoid: "No commercial look, no polish, no mainstream"
   - Use: "authentic indie aesthetic, raw analog feel"

   **Note**: Constraint sections (like KEXP_GUARDRAILS) CAN use "Avoid X" language to define boundaries. The distinction is:
   - **Action**: Describe what you WANT (positive framing)
   - **Constraints**: Define what to AVOID (boundaries are acceptable here)

3. **Over-Polish**: Don't request glossy/commercial aesthetics
   - Avoid: "Make professional and high-quality with glossy finish"

4. **Lose Identity**: Don't transform beyond recognition
   - Avoid: "Redesign with totally new concept"

5. **Vague Requests**: Be specific about desired changes
   - Avoid: "Make this look better"

---

## Resolution & Aspect Ratio Options

```typescript
resolution: "1K" | "2K" | "4K"
aspectRatio: "square" | "portrait" | "landscape"
```

**Defaults**: 2K square
**Recommendation**: Use 2K for most cases (good balance of quality/speed)

---

## Error Handling

```typescript
import { pipe } from "effect";

const program = pipe(
  enhance(request),
  Effect.retry({ times: 3, schedule: Effect.Schedule.exponential("1 second") }),
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Console.error(`Enhancement failed: ${error.message}`);
      // Fallback: return original album art
      return { enhancedImageBase64: request.albumArtBase64, ... };
    })
  )
);
```

---

## KEXP Cultural Values (Embedded in All Prompts)

Every prompt automatically includes:

1. **The Even Playing Field**: Local artists get same depth as major acts
2. **Discovery Over Data**: Create "aha!" moments, not just information
3. **Earnest, Not Snobby**: Music nerds, not gatekeepers
4. **Grounded in Evidence**: No invented connections
5. **Echo the DJ Voice**: Warm, personal, knowledgeable

**Visual Translation**:
- SubPop 90s = authentic indie aesthetic
- Record store listening station = tactile, physical music culture
- Basement venues = community, DIY ethic
- College radio = anti-commercial, pro-discovery

---

## Common Use Cases

### Local Artist Debut
```typescript
{ style: "pnw-local" } // or "lo-fi-indie"
```

### Vinyl Reissue Announcement
```typescript
{ style: "vinyl-sleeve" }
```

### Live Show Promotion
```typescript
{
  style: "concert-poster",
  textOverlay: { text: "...", typography: "...", placement: "..." }
}
```

### Electronic/Synth Set
```typescript
{ style: "synth-pop-retro" }
```

### Subtle Enhancement (default)
```typescript
{ style: "minimal" }
```

---

## Model Capabilities Summary

- ✅ High-resolution output (1K/2K/4K)
- ✅ Multi-turn conversational editing
- ✅ Up to 14 reference images
- ✅ Text rendering (artist names, concert info)
- ✅ Advanced reasoning process ("thinking")
- ✅ Style transfer
- ⚠️ May struggle with small faces, fine details
- ⚠️ SynthID watermarks embedded (denotes AI generation)

---

## Quick Start

```typescript
import { enhance } from "./services/AlbumArtEnhancementService";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const response = yield* enhance({
    albumArtBase64: loadImageAsBase64("album-art.jpg"),
    style: "lo-fi-indie",
  });

  saveBase64Image(response.enhancedImageBase64, "enhanced.png");
});
```

---

**Full Guide**: `/Users/pooks/Dev/crate/docs/NANO_BANANA_PRO_PROMPTING_GUIDE.md`
**Test Script**: `/Users/pooks/Dev/crate/packages/agent/src/scripts/test-album-art-enhancement.ts`
**Service**: `/Users/pooks/Dev/crate/packages/agent/src/services/AlbumArtEnhancementService.ts`
