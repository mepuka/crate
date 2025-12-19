# Nano Banana Pro Prompting Guide
## Album Art Enhancement for KEXP-Aligned Cultural Values

**Model**: `gemini-3-pro-image-preview` (Nano Banana Pro)
**Purpose**: Enhance existing album art while maintaining cultural authenticity and KEXP's design values
**Date**: 2025-12-18

---

## Table of Contents

1. [Overview](#overview)
2. [Model Capabilities](#model-capabilities)
3. [Image-to-Image Enhancement Workflow](#image-to-image-enhancement-workflow)
4. [Prompt Engineering Fundamentals](#prompt-engineering-fundamentals)
5. [KEXP-Aligned Prompt Templates](#kexp-aligned-prompt-templates)
6. [Style Transfer & Aesthetic Consistency](#style-transfer--aesthetic-consistency)
7. [Cultural Guardrails](#cultural-guardrails)
8. [Technical Implementation](#technical-implementation)
9. [Examples & Use Cases](#examples--use-cases)
10. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Overview

Nano Banana Pro (gemini-3-pro-image-preview) is Google's state-of-the-art image generation and editing model, optimized for professional asset production. For Crate, we use it to **enhance** album art, not generate from scratch.

### Our Use Case

- **Input**: Existing album art from KEXP plays
- **Goal**: Add visual enhancements that align with KEXP's cultural values
- **Output**: Enhanced visuals that maintain the original artist's identity while adding depth, texture, or stylistic elements
- **Constraint**: Must feel like something a KEXP DJ would approve - earnest, not commercial, grounded in music culture

---

## Model Capabilities

### Core Features Relevant to Album Art Enhancement

1. **Advanced Reasoning Process**
   - Model uses "thinking" process to reason through complex prompts
   - Generates interim "thought images" to refine composition
   - Critical for understanding *what to preserve* vs. *what to enhance*

2. **Multi-Image Reference (Up to 14 images)**
   - Up to 6 object images with high-fidelity
   - Up to 5 human images for character consistency
   - Perfect for providing style references alongside album art

3. **High-Resolution Output**
   - Native 1K, 2K, and 4K generation
   - Flexible aspect ratios (square, landscape, portrait)

4. **Conversational Editing**
   - Multi-turn refinement is recommended workflow
   - Uses `thoughtSignature` to maintain context across turns
   - Allows incremental adjustments

5. **Advanced Text Rendering**
   - Can add/modify text overlays (artist names, album titles)
   - Supports typography direction (e.g., "condensed gothic font")

6. **Search Grounding**
   - Can verify facts and generate imagery based on real-time data
   - Useful for historically accurate visual references

### Limitations to Be Aware Of

- **Not Perfect**: May struggle with small faces, fine details, complex spelling
- **Data Accuracy**: Can misinterpret factual information - always verify
- **Artifacts**: Masked editing or major lighting changes may produce unnatural results
- **Watermarking**: SynthID watermarks are embedded in all outputs (denotes AI generation)

---

## Image-to-Image Enhancement Workflow

### Step 1: Upload Source Album Art

Upload the original album art as base64 inline data or via Files API (for files > 20MB total request size).

```typescript
const request = {
  model: "gemini-3-pro-image-preview",
  contents: [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: albumArtBase64, // Base64 encoded album art
          },
        },
        {
          text: "Your enhancement prompt here",
        },
      ],
    },
  ],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
  },
};
```

### Step 2: Conversational Refinement

Use multi-turn conversation for iterative refinement:

```typescript
// Turn 1: Initial enhancement
const response1 = await googleClient.generateContent(request);

// Turn 2: Refine based on Turn 1
const request2 = {
  model: "gemini-3-pro-image-preview",
  contents: [
    ...previousContents, // Include full conversation history
    {
      role: "user",
      parts: [
        { text: "Make the color palette warmer and add subtle film grain" },
      ],
    },
  ],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
  },
};
```

**Critical**: For conversational editing, you must return `thoughtSignature` from previous responses. If using official Google Gen AI SDKs, this is handled automatically.

### Step 3: Extract Enhanced Image

```typescript
if (response.candidates?.[0]?.content?.parts) {
  for (const part of response.candidates[0].content.parts) {
    if ("inlineData" in part && part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync("enhanced-album-art.png", buffer);
    }
  }
}
```

---

## Prompt Engineering Fundamentals

### Prompt Structure (Best Practices)

**Template**:
```
Using the provided album art, [editing instruction].
[Preservation constraint].
[Style direction].
[Technical specifications].
```

**Key Elements**:

1. **Subject**: What is the image (album art, concert poster, etc.)
2. **Action**: What change/enhancement to apply
3. **Preservation Constraint**: What must remain unchanged (artist identity, composition, etc.)
4. **Style Direction**: Aesthetic guidance (texture, mood, color palette)
5. **Technical Specs**: Resolution, aspect ratio, output requirements

### Positive Framing (Not Negative Prompts)

Nano Banana Pro works better with positive reinforcement in the **main action description**. Describe what you **do want**, not what you **don't want**.

❌ **Avoid**: "No blur, no bad hands, no commercial look"
✅ **Use**: "Sharp details, natural composition, authentic indie aesthetic"

**Note on Constraints vs. Actions:**
- The **action** (what to do) should use positive language
- **Constraints** and **guardrails** (like KEXP_GUARDRAILS) CAN use "Avoid X" to define boundaries
- Example: The action is "Apply warm analog aesthetic" while the constraint is "Avoid glossy corporate design language"

### Describe Intent, Not Just Keywords

Stop using "tag soups" (dog, park, 4k, realistic). Act like a Creative Director.

❌ **Avoid**: "album art, vintage, warm, indie, aesthetic, 4k"
✅ **Use**: "Transform this album art into a vintage lo-fi aesthetic with warm sepia tones and subtle film grain, as if discovered in a dusty record store bin"

### Natural Language Understanding

The model understands natural language, physics, and composition. Write like you're briefing a designer.

✅ **Good**: "Apply a soft watercolor wash over the album art, preserving the artist's face but giving the background a dreamy, ethereal quality"

---

## KEXP-Aligned Prompt Templates

These templates embody KEXP's cultural values: earnest, community-focused, anti-commercial, discovery-oriented.

### Template 1: Lo-Fi Indie Aesthetic

**Use Case**: Enhance album art for indie/DIY artists

```
Using the provided album art, apply a warm lo-fi indie aesthetic with subtle film grain
and muted warm colors. Preserve the artist's identity and composition entirely.
Style: vintage analog photography, as if shot on 35mm film in a dimly lit Seattle basement
venue. Think SubPop 90s aesthetic - authentic, not polished. Output: 2K square.
```

**Cultural Alignment**:
- "Lo-fi indie" = KEXP's Pacific Northwest roots
- "Vintage analog" = music nerd authenticity
- "Not polished" = anti-commercial voice

### Template 2: Concert Poster Enhancement

**Use Case**: Transform album art into concert poster style

```
Using the provided album art, transform it into a concert poster for a small Seattle venue.
Preserve the original artwork as the central element. Add subtle texture overlays reminiscent
of screen-printed punk/indie posters. Color palette: muted earth tones with one bright accent
color. Style: DIY show poster aesthetic, not commercial advertising. Output: portrait 2K.
```

**Cultural Alignment**:
- "Small Seattle venue" = local music scene
- "Screen-printed punk/indie" = community radio tradition
- "DIY, not commercial" = KEXP core values

### Template 3: Vinyl Record Sleeve Enhancement

**Use Case**: Make album art feel like physical vinyl packaging

```
Using the provided album art, enhance it to evoke the tactile quality of a vinyl record sleeve.
Add subtle paper texture, gentle wear marks, and warm analog color grading. Preserve all
original elements and composition. Style: mid-century album design, intimate and analog,
as if held in your hands at a record store listening station. Output: square 2K.
```

**Cultural Alignment**:
- "Vinyl record sleeve" = physical music culture
- "Tactile quality" = anti-algorithm, pro-human curation
- "Record store listening station" = discovery moment

### Template 4: Synth-Pop / Electronic Enhancement

**Use Case**: Album art for electronic/synth artists

```
Using the provided album art, apply a retro-futuristic synth-pop aesthetic with soft neon
accents (cyan and magenta palette). Preserve artist identity and core composition.
Add subtle geometric patterns or grid overlays inspired by 80s computer graphics.
Style: Kraftwerk meets Boards of Canada - nostalgic, not flashy. Output: square 2K.
```

**Cultural Alignment**:
- "Retro-futuristic" = music history awareness
- "Nostalgic, not flashy" = earnest vs. commercial
- Specific artist references = music nerd credibility

### Template 5: Local Artist Spotlight

**Use Case**: Enhance album art for Seattle/PNW local artists

```
Using the provided album art, enhance with Pacific Northwest visual identity: muted greens,
misty grays, forest textures. Preserve all original artwork. Add subtle natural elements
(rain, trees, fog) as background texture without overwhelming the composition.
Style: organic, place-based, intimate - celebrating Seattle's indie music scene. Output: 2K square.
```

**Cultural Alignment**:
- "Pacific Northwest visual identity" = local pride
- "Place-based" = geographic anchoring (KEXP cultural pattern)
- "Celebrating Seattle's indie music scene" = community voice

### Template 6: Style Transfer from Reference

**Use Case**: Apply specific artistic style while maintaining album art identity

```
Using the provided album art (Image 1) and the style reference image (Image 2),
apply the texture, color palette, and artistic treatment from Image 2 to Image 1.
CRITICAL: Preserve the identity, composition, and subject matter of Image 1 entirely -
only transfer the aesthetic treatment. Style transfer should feel like re-photographing
the album art in a different medium (watercolor, oil painting, screen print, etc.). Output: 2K.
```

**Cultural Alignment**:
- Preserves artist identity (even playing field)
- Artistic treatment = music as art form
- Specific medium references = sound nerd details for visuals

---

## Style Transfer & Aesthetic Consistency

### Using Reference Images for Style Consistency

To maintain a consistent aesthetic across enhanced album art, use reference images:

```typescript
const request = {
  model: "gemini-3-pro-image-preview",
  contents: [
    {
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: albumArtBase64, // Target album art
          },
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: styleReferenceBase64, // Your design system reference
          },
        },
        {
          text: `Use Image 1 (album art) as the content.
                 Use Image 2 as the style reference.
                 Apply the color palette, texture, and artistic treatment from Image 2 to Image 1.
                 Preserve the composition and identity of Image 1 entirely.`,
        },
      ],
    },
  ],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
  },
};
```

### Creating a KEXP Design System Reference Library

Build a library of reference images that embody KEXP aesthetic:

1. **Lo-Fi Indie**: Vintage SubPop album covers, indie zine layouts
2. **Concert Posters**: Screen-printed show posters from Seattle venues
3. **Vinyl Aesthetic**: Mid-century album design, analog textures
4. **Local Scene**: Pacific Northwest photography (misty, green, organic)
5. **Electronic/Synth**: Retro-futuristic graphics, 80s computer art

**Usage Pattern**:
- Album art + Reference 1 (texture) = Lo-fi vinyl feel
- Album art + Reference 2 (color palette) = Pacific Northwest mood
- Album art + Reference 3 (composition) = Concert poster layout

### Hybrid Style Prompts (Combining Multiple References)

```
Using the provided album art (Image 1), apply:
- The color palette from Image 2 (warm sepia tones)
- The texture treatment from Image 3 (subtle film grain)
- The compositional framing from Image 4 (centered with generous margins)

Preserve the artist and core artwork from Image 1 entirely.
Output should feel like a carefully curated vinyl reissue with archival-quality design.
```

---

## Cultural Guardrails

### Enforcing KEXP Values in Prompts

Include explicit constraints to prevent off-brand outputs:

#### 1. Anti-Commercial Language

```
IMPORTANT: Avoid commercial/marketing aesthetics. This should feel like independent
music culture, not a major label advertisement. No glossy, polished, or corporate design language.
```

#### 2. Authenticity Constraint

```
CONSTRAINT: Output must feel authentic to indie/DIY music culture. Think record store
listening stations, basement venues, college radio - not Billboard or streaming service ads.
```

#### 3. Artist Respect & Privacy

```
PRESERVE: All artist identity, composition, and original creative intent.
We are enhancing, not reimagining. The artist's vision comes first.
```

#### 4. Community Voice (Inclusive Language)

```
TONE: This visual is for the KEXP community - music lovers, crate diggers, discovery seekers.
Inclusive, earnest, knowledgeable but not snobby. Avoid elitist or gatekeeping visual language.
```

### Example: Full Guardrailed Prompt

```
Using the provided album art, enhance with a warm lo-fi indie aesthetic.

PRESERVE:
- Artist identity and composition entirely
- Original creative intent and visual narrative

STYLE:
- Warm analog color grading (think 35mm film, not Instagram filters)
- Subtle film grain texture
- Muted earth tones with one accent color
- Authentic indie aesthetic, not commercial polish

CONSTRAINTS:
- Avoid glossy, corporate, or major-label design language
- No marketing/advertising aesthetics
- Should feel like independent music culture (record stores, basement venues, college radio)
- Inclusive and earnest tone - music nerd, not gatekeeper

CULTURAL ALIGNMENT:
- KEXP values: discovery, community, Pacific Northwest roots, human curation
- Think SubPop 90s, KCRW tastemaker prose, BBC 6 Music artist-as-curator

Output: 2K square, suitable for display alongside KEXP DJ commentary.
```

---

## Technical Implementation

### Effect Pipeline Integration

Based on `/Users/pooks/Dev/crate/packages/agent/src/scripts/test-nano-banana.ts`:

```typescript
import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";

const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

// Build the client layer with retry logic
const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(process.env.GOOGLE_API_KEY!),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

// Album art enhancement program
const enhanceAlbumArt = (
  albumArtBase64: string,
  prompt: string
) => Effect.gen(function* () {
  const googleClient = yield* GoogleClientModule.GoogleClient;

  const request = {
    model: NANO_BANANA_PRO_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: albumArtBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  yield* Console.log("📤 Enhancing album art...");
  const response = yield* googleClient.generateContent(request as any);

  // Extract enhanced image
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ("inlineData" in part && part.inlineData?.data) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        const filename = `/tmp/enhanced-album-art-${Date.now()}.png`;
        fs.writeFileSync(filename, buffer);
        yield* Console.log(`💾 Saved to: ${filename}`);
        return { filename, response };
      }
    }
  }

  return { filename: null, response };
});

// Run with Effect runtime
Effect.runPromise(
  enhanceAlbumArt(albumArtBase64, prompt).pipe(
    Effect.scoped,
    Effect.provide(GoogleClientLive)
  )
);
```

### Handling thoughtSignature for Conversational Editing

For multi-turn refinement:

```typescript
const conversationalEnhancement = Effect.gen(function* () {
  const googleClient = yield* GoogleClientModule.GoogleClient;

  // Turn 1: Initial enhancement
  const turn1Request = {
    model: NANO_BANANA_PRO_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: albumArtBase64 } },
          { text: "Apply warm lo-fi aesthetic with film grain" },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const response1 = yield* googleClient.generateContent(turn1Request as any);

  // Turn 2: Refine (thoughtSignature automatically handled by SDK)
  const turn2Request = {
    model: NANO_BANANA_PRO_MODEL,
    contents: [
      ...turn1Request.contents,
      response1.candidates[0].content, // Include full response with thoughtSignature
      {
        role: "user",
        parts: [{ text: "Make the color palette slightly warmer" }],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const response2 = yield* googleClient.generateContent(turn2Request as any);

  return response2;
});
```

**Note**: If using official Google Gen AI SDKs, `thoughtSignature` is handled automatically. If implementing manually, you must extract and return signatures from previous responses.

### Error Handling & Retries

```typescript
const enhanceWithRetry = (albumArtBase64: string, prompt: string) =>
  Effect.gen(function* () {
    const googleClient = yield* GoogleClientModule.GoogleClient;

    const request = {
      model: NANO_BANANA_PRO_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: albumArtBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    return yield* googleClient.generateContent(request as any);
  }).pipe(
    Effect.retry({ times: 3, schedule: Effect.Schedule.exponential("1 second") }),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Console.error(`Failed after retries: ${error}`);
        return Effect.fail(new Error("Album art enhancement failed"));
      })
    )
  );
```

---

## Examples & Use Cases

### Example 1: Local Seattle Artist Debut

**Context**: First KEXP play for a local garage band

**Album Art**: DIY black-and-white photocopied band photo

**Prompt**:
```
Using the provided album art, enhance with Pacific Northwest indie aesthetic.
Preserve the raw DIY photocopied look entirely - this is authentic and should remain.
Add subtle misty gray tones and forest-green color wash as background atmosphere only.
Apply gentle paper texture overlay. Style: Seattle indie zine aesthetic, SubPop 90s,
earnest and authentic. This is a KEXP debut - celebrate the discovery moment, not commercial polish.
Output: 2K square.
```

**Result**: Enhanced version maintains DIY authenticity while adding sense of place (PNW).

---

### Example 2: Synth-Pop Reissue

**Context**: Vinyl reissue of 80s synth album played during retro electronic set

**Album Art**: Original 80s geometric design

**Prompt**:
```
Using the provided album art (vintage 80s synth album cover), enhance for modern vinyl reissue.
Preserve all original geometric patterns and composition entirely. Apply gentle color grading
to bring out cyan/magenta neon accents without oversaturating. Add subtle analog texture
(as if scanned from original vinyl sleeve). Style: Kraftwerk meets Boards of Canada -
retro-futuristic, nostalgic, not flashy. Think independent record store reissue, not major label.
Output: square 2K.
```

**Result**: Updated for modern hi-res display while honoring original design.

---

### Example 3: Multi-Reference Style Transfer

**Context**: Apply consistent KEXP visual identity across multiple album arts

**Inputs**:
- Image 1: Album art (target)
- Image 2: KEXP design system reference (warm sepia, film grain)
- Image 3: Texture reference (screen-printed indie poster)

**Prompt**:
```
Using the provided album art (Image 1), apply:
- Color palette from Image 2 (warm sepia tones, muted earth colors)
- Texture treatment from Image 3 (subtle screen-print texture, DIY poster aesthetic)

PRESERVE Image 1's composition, artist identity, and all original elements entirely.
This is style transfer only - we're enhancing the presentation, not reimagining the content.
Style: Pacific Northwest indie music culture, KEXP curatorial voice, earnest and authentic.
Output: 2K square suitable for display alongside DJ commentary.
```

**Result**: Consistent KEXP aesthetic across diverse album arts.

---

### Example 4: Concert Annotation

**Context**: DJ mentioned upcoming show in comment, want to add concert info to album art

**Prompt**:
```
Using the provided album art, add text overlay with concert information:
"Live at The Crocodile - March 15, 2025"

CONSTRAINTS:
- Place text in bottom margin area, preserving album art composition
- Typography: clean sans-serif, legible but not commercial
- Color: white text with subtle shadow for readability
- Style: DIY show poster aesthetic, not major venue advertising
- Text should feel like hand-stamped addition, not professional graphic design

Preserve all original album art. Output: 2K square.
```

**Result**: Enhanced album art becomes mini concert poster.

---

## Anti-Patterns to Avoid

### 1. Over-Polishing (Commercial Look)

❌ **Bad Prompt**:
```
Make this album art look professional and high-quality with glossy finish and bright colors
```

✅ **Good Prompt**:
```
Enhance with authentic indie aesthetic - warm analog tones, subtle texture, not polished or commercial
```

### 2. Losing Artist Identity

❌ **Bad Prompt**:
```
Transform this album art into a cyberpunk style with neon city background
```

✅ **Good Prompt**:
```
Add subtle neon accent lighting to existing album art, preserving all original composition and artist identity
```

### 3. Tag Soup Prompts

❌ **Bad Prompt**:
```
album art, vintage, indie, aesthetic, lo-fi, 4k, warm, texture, grain, music
```

✅ **Good Prompt**:
```
Transform this album art into a warm lo-fi aesthetic with subtle film grain, as if photographed
on vintage 35mm film in a dimly lit record store
```

### 4. Vague Enhancement Requests

❌ **Bad Prompt**:
```
Make this look better
```

✅ **Good Prompt**:
```
Apply warm analog color grading (sepia tones), add subtle film grain texture, and preserve
all original elements. Style: vintage vinyl sleeve from 1970s folk album.
```

### 5. Forgetting Cultural Context

❌ **Bad Prompt**:
```
Make this album art trendy and Instagram-ready with vibrant filters
```

✅ **Good Prompt**:
```
Enhance with KEXP-aligned aesthetic: earnest, community-focused, celebrating discovery.
Warm analog tones, authentic indie culture, not social media trends.
```

### 6. Ignoring Preservation Constraints

❌ **Bad Prompt**:
```
Redesign this album art with a totally new concept
```

✅ **Good Prompt**:
```
PRESERVE all original album art composition and artist identity entirely.
Apply texture and color grading only to enhance the existing visual, not reimagine it.
```

---

## Prompt Template Library

### Quick Reference Templates

Copy-paste these templates and customize for your use case:

#### Template A: Minimal Enhancement
```
Using the provided album art, apply [STYLE: e.g., warm analog color grading].
Preserve all original elements entirely. Subtle enhancement only, maintaining artist's creative vision.
Output: 2K square.
```

#### Template B: Texture Overlay
```
Using the provided album art, add [TEXTURE: e.g., subtle film grain / paper texture / screen-print texture].
Preserve composition and artist identity completely. Style: [REFERENCE: e.g., vintage vinyl sleeve / DIY zine].
Output: 2K square.
```

#### Template C: Color Palette Shift
```
Using the provided album art, adjust color palette to [PALETTE: e.g., warm sepia tones / muted earth colors /
Pacific Northwest greens and grays]. Preserve all compositional elements. Style: [AESTHETIC: e.g., analog photography /
indie music culture]. Output: 2K square.
```

#### Template D: Style Transfer
```
Using the provided album art (Image 1) and style reference (Image 2), apply the [ELEMENT: color palette /
texture / artistic treatment] from Image 2 to Image 1. CRITICAL: Preserve Image 1's identity and composition entirely.
Output: 2K.
```

#### Template E: Text Addition
```
Using the provided album art, add text: "[TEXT]".
Typography: [FONT STYLE: e.g., clean sans-serif / condensed gothic].
Placement: [LOCATION: e.g., bottom margin / top corner].
Style: [AESTHETIC: e.g., DIY poster / vintage vinyl label].
Preserve all original album art. Output: 2K square.
```

#### Template F: Full Guardrailed Enhancement
```
Using the provided album art, enhance with [STYLE].

PRESERVE:
- Artist identity and composition entirely
- Original creative intent

STYLE:
- [Style direction]
- [Texture/color details]

CONSTRAINTS:
- Avoid commercial/glossy aesthetics
- Authentic indie music culture
- KEXP values: discovery, community, earnest tone

Output: [RESOLUTION] [ASPECT RATIO].
```

---

## Sources & Further Reading

### Official Documentation
- [Gemini 3 Pro Image Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image)
- [Image Generation API Guide](https://ai.google.dev/gemini-api/docs/image-generation)
- [Thought Signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)

### Prompting Best Practices
- [Nano Banana Pro Prompting Tips (Google Blog)](https://blog.google/products/gemini/prompting-tips-nano-banana-pro/)
- [How to Prompt Gemini 2.5 Flash Image Generation](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)
- [The Ultimate Nano Banana Pro Prompting Guide](https://www.atlabs.ai/blog/the-ultimate-nano-banana-pro-prompting-guide-mastering-gemini-3-pro-image)

### Community Resources
- [Simon Willison: Nano Banana Pro Review](https://simonwillison.net/2025/Nov/20/nano-banana-pro/)
- [Laurent Picard: Testing Gemini 3 Pro Image](https://medium.com/google-cloud/testing-gemini-3-pro-image-f585236ae411)
- [Awesome Nano Banana Pro (GitHub)](https://github.com/ZeroLu/awesome-nanobanana-pro)

---

## Appendix: KEXP Cultural Values Reference

For full context on KEXP's cultural voice and values, see:
- `/Users/pooks/Dev/crate/packages/agent/src/prompts/templates/shared-culture.ts`
- `/Users/pooks/Dev/crate/packages/agent/src/prompts/system-prompt.ts`

### Key Cultural Pillars
1. **The Even Playing Field** - Local garage bands deserve same depth as major artists
2. **Discovery Over Data** - "Aha!" moments, not just information
3. **Earnest, Not Snobby** - Music nerds, not gatekeepers
4. **Grounded in Evidence** - Every insight traces to a source
5. **Echo the DJ Voice** - Warm, personal, knowledgeable

### Sonic Vocabulary Examples
- Instead of "pop" → "warm, shiny pop" / "sun-drenched indie pop"
- Instead of "rock" → "fuzz-drenched garage rock" / "angular post-punk"
- Instead of "electronic" → "glitchy IDM" / "skeletal techno"

### Voice Patterns
- Geographic anchoring: "London-based, Nigerian singer-songwriter..."
- Career context: "Sophomore album" / "First in three years"
- Thematic framing: "A meditation on the weight we place on relationships"
- Discovery narrative: "First KEXP spin — we're witnessing the beginning"

Apply these same principles to visual enhancement prompts.

---

**Last Updated**: 2025-12-18
**Maintained By**: Crate Research Team
**Model**: gemini-3-pro-image-preview (Nano Banana Pro)
