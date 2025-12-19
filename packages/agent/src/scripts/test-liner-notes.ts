#!/usr/bin/env bun
/**
 * Test script for Era-Aware Liner Note Image Generation
 *
 * Tests the Nano Banana Pro model with era-specific prompts
 * for generating visual liner notes in different period styles.
 *
 * Run with:
 *   set -a && source .env && set +a && bun run src/scripts/test-liner-notes.ts
 *
 * Options:
 *   ERA=1975 bun run ... (test a specific year)
 *   STYLE=archival bun run ... (test a specific style: art-forward, editorial, archival, collage)
 */

import { Effect, Console, Layer, Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import * as GoogleClientModule from "@effect/ai-google/GoogleClient";
import * as fs from "node:fs";
import * as path from "node:path";

// Nano Banana Pro model
const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image-preview";

// ============================================================================
// Era Visual System (inline from web package for testing)
// ============================================================================

type Era = "pre-vinyl" | "golden-age" | "classic-rock" | "new-wave" | "grunge" | "digital" | "streaming" | "contemporary";

interface EraVisualProfile {
  era: Era;
  displayName: string;
  weathering: {
    wear: number;
    fade: number;
    grain: number;
    yellowing: number;
    dust: number;
    crease: number;
  };
  typography: {
    primary: string;
    style: string;
  };
  texture: {
    type: string;
    description: string;
  };
  promptGuidance: string[];
}

const ERA_PROFILES: Record<Era, EraVisualProfile> = {
  "pre-vinyl": {
    era: "pre-vinyl",
    displayName: "Pre-Vinyl Era",
    weathering: { wear: 0.9, fade: 0.85, grain: 0.8, yellowing: 0.9, dust: 0.7, crease: 0.6 },
    typography: { primary: "art-deco serif", style: "Hand-lettered, ornate capitals" },
    texture: { type: "aged-paper", description: "Heavy foxing, water stains, sepia tone" },
    promptGuidance: ["Sepia-toned, heavily aged", "Art deco typography", "Visible paper degradation"]
  },
  "golden-age": {
    era: "golden-age",
    displayName: "Golden Age (50s-60s)",
    weathering: { wear: 0.7, fade: 0.6, grain: 0.6, yellowing: 0.7, dust: 0.5, crease: 0.5 },
    typography: { primary: "mid-century sans", style: "Blue Note/Verve influence, bold geometry" },
    texture: { type: "vinyl-sleeve", description: "Ring wear, split seams, shop stamps" },
    promptGuidance: ["Mid-century modern design", "Bold typography (Reid Miles style)", "Visible vinyl ring wear"]
  },
  "classic-rock": {
    era: "classic-rock",
    displayName: "Classic Rock (70s)",
    weathering: { wear: 0.5, fade: 0.4, grain: 0.5, yellowing: 0.5, dust: 0.4, crease: 0.4 },
    typography: { primary: "psychedelic display", style: "Gatefold era, cosmic imagery" },
    texture: { type: "gatefold-paper", description: "Textured cardboard, gatefold creases" },
    promptGuidance: ["Gatefold album aesthetic", "Analog photography warmth", "Hipgnosis influence"]
  },
  "new-wave": {
    era: "new-wave",
    displayName: "New Wave (80s)",
    weathering: { wear: 0.35, fade: 0.3, grain: 0.3, yellowing: 0.3, dust: 0.25, crease: 0.25 },
    typography: { primary: "geometric sans", style: "Peter Saville influence, clean geometry" },
    texture: { type: "80s-print", description: "Clean but aged, glossy paper showing wear" },
    promptGuidance: ["Factory Records influence", "Bold color blocks, neon accents", "Sharp typography"]
  },
  "grunge": {
    era: "grunge",
    displayName: "Grunge Era (90s)",
    weathering: { wear: 0.25, fade: 0.2, grain: 0.6, yellowing: 0.2, dust: 0.2, crease: 0.3 },
    typography: { primary: "distressed sans", style: "DIY photocopied aesthetic, anti-design" },
    texture: { type: "xerox-zine", description: "Photocopied grain, DIY collage aesthetic" },
    promptGuidance: ["DIY zine aesthetic", "High contrast, blown-out", "Sub Pop visual language"]
  },
  "digital": {
    era: "digital",
    displayName: "Early Digital (00s)",
    weathering: { wear: 0.15, fade: 0.1, grain: 0.15, yellowing: 0.1, dust: 0.1, crease: 0.1 },
    typography: { primary: "clean sans", style: "Early digital precision, Helvetica Neue" },
    texture: { type: "digital-print", description: "Clean digital print, slight aging" },
    promptGuidance: ["Clean digital aesthetic with light age", "Transitional physical/digital era"]
  },
  "streaming": {
    era: "streaming",
    displayName: "Streaming Era (10s)",
    weathering: { wear: 0.05, fade: 0.05, grain: 0.05, yellowing: 0.02, dust: 0.02, crease: 0.02 },
    typography: { primary: "geometric sans", style: "Ultra-minimal, Instagram aesthetic" },
    texture: { type: "minimal", description: "Nearly pristine, digital-first design" },
    promptGuidance: ["Minimal, digital-first", "Square format (streaming artwork)", "Very light aging"]
  },
  "contemporary": {
    era: "contemporary",
    displayName: "Contemporary (20s)",
    weathering: { wear: 0, fade: 0, grain: 0, yellowing: 0, dust: 0, crease: 0 },
    typography: { primary: "variable sans", style: "Fresh, experimental, fluid typography" },
    texture: { type: "pristine", description: "Brand new, no wear" },
    promptGuidance: ["Pristine appearance", "Contemporary design trends", "Feels fresh"]
  }
};

function detectEra(year: number): Era {
  if (year < 1950) return "pre-vinyl";
  if (year < 1970) return "golden-age";
  if (year < 1980) return "classic-rock";
  if (year < 1990) return "new-wave";
  if (year < 2000) return "grunge";
  if (year < 2010) return "digital";
  if (year < 2020) return "streaming";
  return "contemporary";
}

// ============================================================================
// Prompt Generation
// ============================================================================

function generateLinerNotePrompt(
  narrative: string,
  title: string,
  releaseYear: number,
  style: "art-forward" | "editorial" | "archival" | "collage" = "art-forward"
): string {
  const era = detectEra(releaseYear);
  const profile = ERA_PROFILES[era];

  const styleDescriptions = {
    "art-forward": "Text overlaid on abstracted album art atmosphere, warm inner sleeve feel",
    "editorial": "Magazine pull-quote card, Pitchfork/FADER aesthetic, bold typography",
    "archival": "Catalog card / found document, library index card, vintage press clipping",
    "collage": "Zine collage, mixed media cut-out, punk DIY aesthetic, ransom note typography"
  };

  return `Create a visual liner note in the style of a ${profile.displayName.toLowerCase()} album inner sleeve.

=== CONTENT ===
Title: "${title}"
Narrative: "${narrative}"

=== STYLE: ${style.toUpperCase()} ===
${styleDescriptions[style]}

=== ERA: ${profile.displayName} (${releaseYear}) ===
WEATHERING REQUIREMENTS:
- Physical wear: ${Math.round(profile.weathering.wear * 100)}% (scratches, edge damage)
- Color fade: ${Math.round(profile.weathering.fade * 100)}% (desaturation from age)
- Film grain: ${Math.round(profile.weathering.grain * 100)}% intensity
- Paper yellowing: ${Math.round(profile.weathering.yellowing * 100)}%
- Dust/debris: ${Math.round(profile.weathering.dust * 100)}%
- Creases/folds: ${Math.round(profile.weathering.crease * 100)}%

TYPOGRAPHY: ${profile.typography.primary}
Style notes: ${profile.typography.style}

TEXTURE: ${profile.texture.type}
${profile.texture.description}

ERA-SPECIFIC GUIDANCE:
${profile.promptGuidance.map(g => `- ${g}`).join("\n")}

=== CRITICAL REQUIREMENTS ===
- The visual MUST feel authentically from ${releaseYear}
- All text must be legible with proper contrast
- NO generic AI aesthetic, NO purple gradients
- This should feel like a real vinyl inner sleeve from this era
- Include subtle imperfections appropriate for the era
- Text IS the design element, not decoration`;
}

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  title: string;
  narrative: string;
  releaseYear: number;
  style: "art-forward" | "editorial" | "archival" | "collage";
}

const TEST_CASES: TestCase[] = [
  {
    title: "Miles Davis's Kind of Blue Journey",
    narrative: "When Miles Davis stepped into Columbia's 30th Street Studio in March 1959, he brought a new vision of jazz - modal, spacious, revolutionary. This album would become the best-selling jazz record of all time.",
    releaseYear: 1959,
    style: "art-forward"
  },
  {
    title: "Pink Floyd's Dark Side Legacy",
    narrative: "The Dark Side of the Moon remained on the Billboard charts for over 900 weeks. Its conceptual ambition, innovative studio techniques, and Hipgnosis artwork created a template for the album as art object.",
    releaseYear: 1973,
    style: "editorial"
  },
  {
    title: "Joy Division Factory Connection",
    narrative: "Peter Saville's sleeve for Unknown Pleasures, depicting pulsar radio waves, became one of the most iconic album covers ever made. The stark black-and-white image perfectly captured the band's cold intensity.",
    releaseYear: 1979,
    style: "archival"
  },
  {
    title: "Nirvana's Nevermind Breaks Through",
    narrative: "In September 1991, Nirvana's Nevermind emerged from Seattle's underground scene to redefine mainstream rock. The album's combination of pop hooks and punk aggression made alternative music accessible to millions.",
    releaseYear: 1991,
    style: "collage"
  },
  {
    title: "The Hives's KEXP Journey",
    narrative: "Produced by Beastie Boys legend Mike D and Viagra Boys' Pelle Gunnerfeldt, with contributions from Josh Homme of Queens of the Stone Age, this album showcases The Hives at their most focused.",
    releaseYear: 2024,
    style: "editorial"
  }
];

// ============================================================================
// Main Program
// ============================================================================

// Get API key from environment
const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("❌ Missing GOOGLE_API_KEY or GOOGLE_AI_API_KEY");
  process.exit(1);
}

// Parse CLI options
const targetYear = process.env.ERA ? parseInt(process.env.ERA) : null;
const targetStyle = process.env.STYLE as TestCase["style"] | undefined;

// Filter test cases if options provided
let testCases = TEST_CASES;
if (targetYear) {
  testCases = [
    {
      title: `Test Generation for ${targetYear}`,
      narrative: "This is a test generation to verify era-specific styling and weathering effects for liner note imagery.",
      releaseYear: targetYear,
      style: targetStyle || "art-forward"
    }
  ];
} else if (targetStyle) {
  testCases = TEST_CASES.filter(tc => tc.style === targetStyle);
}

// Build the client layer
const GoogleClientLive = Layer.provide(
  GoogleClientModule.layer({
    apiKey: Redacted.make(apiKey),
    transformClient: HttpClient.retryTransient({ times: 3 }),
  }),
  FetchHttpClient.layer
);

// Output directory
const OUTPUT_DIR = "/tmp/liner-notes-test";

const program = Effect.gen(function* () {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  yield* Console.log(`\n🍌 Liner Note Generation Test`);
  yield* Console.log(`   Model: ${NANO_BANANA_PRO_MODEL}`);
  yield* Console.log(`   Output: ${OUTPUT_DIR}`);
  yield* Console.log(`   Test cases: ${testCases.length}\n`);

  const googleClient = yield* GoogleClientModule.GoogleClient;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const era = detectEra(testCase.releaseYear);
    const profile = ERA_PROFILES[era];

    yield* Console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    yield* Console.log(`📀 Test ${i + 1}/${testCases.length}: ${testCase.title}`);
    yield* Console.log(`   Year: ${testCase.releaseYear} | Era: ${profile.displayName}`);
    yield* Console.log(`   Style: ${testCase.style}`);
    yield* Console.log(`   Weathering: wear=${Math.round(profile.weathering.wear*100)}%, fade=${Math.round(profile.weathering.fade*100)}%, grain=${Math.round(profile.weathering.grain*100)}%`);
    yield* Console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Generate prompt
    const prompt = generateLinerNotePrompt(
      testCase.narrative,
      testCase.title,
      testCase.releaseYear,
      testCase.style
    );

    yield* Console.log(`\n📝 Prompt preview (first 500 chars):`);
    yield* Console.log(`   ${prompt.slice(0, 500).replace(/\n/g, "\n   ")}...`);

    // Build request
    const request = {
      model: NANO_BANANA_PRO_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    yield* Console.log(`\n📤 Generating...`);
    const startTime = Date.now();

    try {
      const response = yield* googleClient.generateContent(request as any);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      yield* Console.log(`📥 Response received in ${elapsed}s`);

      // Process response
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if ("text" in part && part.text) {
            yield* Console.log(`\n💬 Model notes: ${part.text.slice(0, 200)}...`);
          }
          if ("inlineData" in part && part.inlineData?.data) {
            yield* Console.log(`🖼️  Image generated!`);

            // Save image
            const buffer = Buffer.from(part.inlineData.data, "base64");
            const filename = path.join(
              OUTPUT_DIR,
              `liner-note-${testCase.releaseYear}-${testCase.style}-${Date.now()}.png`
            );
            fs.writeFileSync(filename, buffer);
            yield* Console.log(`💾 Saved: ${filename}`);

            // Try to open it
            yield* Effect.promise(() =>
              import("child_process").then(({ exec }) =>
                new Promise((resolve) => {
                  exec(`open "${filename}"`, () => resolve(undefined));
                })
              )
            );
          }
        }
      } else {
        yield* Console.log(`⚠️  No content in response`);
      }
    } catch (error) {
      yield* Console.error(`❌ Generation failed: ${error}`);
    }
  }

  yield* Console.log(`\n✅ All tests complete!`);
  yield* Console.log(`📁 Images saved to: ${OUTPUT_DIR}\n`);
});

// Run
Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(GoogleClientLive),
    Effect.catchAll((error) =>
      Console.error(`❌ Fatal error: ${JSON.stringify(error, null, 2)}`).pipe(
        Effect.zipRight(Effect.fail(error))
      )
    )
  )
).then(() => {
  console.log("\n🎉 Test run complete!");
  process.exit(0);
}).catch((error) => {
  console.error("\n💥 Test run failed:", error);
  process.exit(1);
});
