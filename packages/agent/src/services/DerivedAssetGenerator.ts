/**
 * DerivedAssetGenerator
 *
 * Generates actual visual asset files from ArtCurationService output.
 * Creates SVG files for glows, gradients, and textures that can be
 * viewed directly or used as overlays in the frontend.
 *
 * Key principle: These assets COMPLEMENT the album art, never replace it.
 */

import { Effect, Context, Layer, Data } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CurationResult, ColorPalette } from "./ArtCurationService.js";

// ============================================================================
// Types
// ============================================================================

export interface GeneratedAsset {
  readonly type: "glow" | "gradient" | "texture";
  readonly filename: string;
  readonly path: string;
  readonly svg: string;
}

export interface GeneratedAssetBundle {
  readonly outputDir: string;
  readonly glow: GeneratedAsset;
  readonly gradient: GeneratedAsset;
  readonly texture: GeneratedAsset | null;
  readonly htmlPreview: string;
}

// ============================================================================
// Errors
// ============================================================================

export class AssetGenerationError extends Data.TaggedError("AssetGenerationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Color Parsing Utilities
// ============================================================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a color string to RGB values.
 * Handles:
 * - 3-digit hex (#RGB)
 * - 6-digit hex (#RRGGBB)
 * - 8-digit hex with alpha (#RRGGBBAA) - alpha ignored
 * - rgb(r, g, b) format
 * - rgba(r, g, b, a) format - alpha ignored
 * Returns fallback color on parse failure.
 */
const parseColorToRgb = (color: string, fallback: RGB = { r: 128, g: 128, b: 128 }): RGB => {
  const trimmed = color.trim();

  // Handle hex colors
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);

    // 3-digit hex (#RGB -> #RRGGBB)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return { r, g, b };
      }
    }

    // 6-digit or 8-digit hex (#RRGGBB or #RRGGBBAA)
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return { r, g, b };
      }
    }
  }

  // Handle rgb/rgba format
  const rgbMatch = trimmed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return {
        r: Math.max(0, Math.min(255, r)),
        g: Math.max(0, Math.min(255, g)),
        b: Math.max(0, Math.min(255, b)),
      };
    }
  }

  // Return fallback on parse failure
  return fallback;
};

// ============================================================================
// SVG Generators
// ============================================================================

/**
 * Generate a radial glow SVG overlay.
 * Creates a soft, ambient glow effect centered on the image.
 */
const generateGlowSvg = (glowColor: string, size: number = 500): string => {
  // Parse color to RGB with robust handling
  const { r, g, b } = parseColorToRgb(glowColor);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:rgb(${r},${g},${b});stop-opacity:0.6"/>
      <stop offset="40%" style="stop-color:rgb(${r},${g},${b});stop-opacity:0.3"/>
      <stop offset="70%" style="stop-color:rgb(${r},${g},${b});stop-opacity:0.1"/>
      <stop offset="100%" style="stop-color:rgb(${r},${g},${b});stop-opacity:0"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="20"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow)" filter="url(#blur)"/>
</svg>`;
};

/**
 * Generate a gradient background SVG.
 * Parses CSS gradient syntax and creates equivalent SVG.
 */
const generateGradientSvg = (
  gradientCss: string,
  palette: ColorPalette,
  size: number = 500
): string => {
  // Parse the gradient type and colors from CSS
  const isRadial = gradientCss.includes("radial-gradient");

  // Use palette colors as fallback
  const colors = palette.colors.length >= 2
    ? palette.colors.slice(0, 4)
    : [palette.dominant, "#000000"];

  if (isRadial) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg-gradient" cx="50%" cy="50%" r="70%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.8"/>
      <stop offset="50%" style="stop-color:${colors[1] || colors[0]};stop-opacity:0.5"/>
      <stop offset="100%" style="stop-color:${colors[2] || "#000000"};stop-opacity:0.9"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
</svg>`;
  } else {
    // Linear gradient (default to diagonal)
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.9"/>
      <stop offset="50%" style="stop-color:${colors[1] || colors[0]};stop-opacity:0.7"/>
      <stop offset="100%" style="stop-color:${colors[2] || "#000000"};stop-opacity:0.9"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg-gradient)"/>
</svg>`;
  }
};

/**
 * Generate a texture overlay SVG.
 * Creates grain, noise, or paper textures.
 */
const generateTextureSvg = (
  textureType: "grain" | "noise" | "paper" | "none",
  size: number = 500
): string | null => {
  if (textureType === "none") {
    return null;
  }

  const baseFrequency = textureType === "grain" ? 0.7 : textureType === "noise" ? 1.2 : 0.4;
  const numOctaves = textureType === "paper" ? 4 : 2;
  const opacity = textureType === "grain" ? 0.15 : textureType === "noise" ? 0.1 : 0.08;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="texture" x="0" y="0" width="100%" height="100%">
      <feTurbulence
        type="${textureType === "paper" ? "fractalNoise" : "turbulence"}"
        baseFrequency="${baseFrequency}"
        numOctaves="${numOctaves}"
        seed="${Math.floor(Math.random() * 1000)}"
        result="noise"
      />
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="linear" slope="${opacity * 2}" intercept="0"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="100%" height="100%" filter="url(#texture)" opacity="${opacity}"/>
</svg>`;
};

/**
 * Generate an HTML preview page showing all assets.
 */
const generateHtmlPreview = (
  bundle: Omit<GeneratedAssetBundle, "htmlPreview">,
  curationResult: CurationResult,
  imageUrl: string
): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Art Curation Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #fff;
      padding: 2rem;
    }
    h1 { margin-bottom: 1rem; color: #888; font-weight: 400; }
    h2 { margin: 2rem 0 1rem; color: #666; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
    .asset-card {
      background: #222;
      border-radius: 12px;
      overflow: hidden;
    }
    .asset-card img {
      width: 100%;
      height: 300px;
      object-fit: cover;
    }
    .asset-card .label {
      padding: 1rem;
      font-size: 0.85rem;
      color: #888;
    }
    .composite {
      position: relative;
      width: 500px;
      height: 500px;
      margin: 2rem auto;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .composite .layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    .composite .album { z-index: 1; object-fit: cover; }
    .composite .glow-layer { z-index: 0; mix-blend-mode: screen; }
    .composite .texture-layer { z-index: 2; mix-blend-mode: overlay; pointer-events: none; }
    .analysis {
      max-width: 800px;
      margin: 3rem auto;
      background: #222;
      padding: 2rem;
      border-radius: 12px;
    }
    .analysis p { margin: 0.5rem 0; line-height: 1.6; }
    .analysis .label { color: #666; font-size: 0.8rem; }
    .palette {
      display: flex;
      gap: 0.5rem;
      margin: 1rem 0;
    }
    .palette .swatch {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.1);
    }
  </style>
</head>
<body>
  <h1>Art Curation Preview</h1>

  <h2>Composite View</h2>
  <div class="composite">
    <img class="layer glow-layer" src="${bundle.glow.filename}" alt="Glow">
    <img class="layer album" src="${imageUrl}" alt="Album Art">
    ${bundle.texture ? `<img class="layer texture-layer" src="${bundle.texture.filename}" alt="Texture">` : ""}
  </div>

  <h2>Individual Assets</h2>
  <div class="grid">
    <div class="asset-card">
      <img src="${bundle.glow.filename}" alt="Glow">
      <div class="label">Glow Overlay (${curationResult.derivedAssets.glowColor})</div>
    </div>
    <div class="asset-card">
      <img src="${bundle.gradient.filename}" alt="Gradient">
      <div class="label">Background Gradient</div>
    </div>
    ${bundle.texture ? `
    <div class="asset-card">
      <img src="${bundle.texture.filename}" alt="Texture">
      <div class="label">Texture Overlay (${curationResult.derivedAssets.textureRecommendation})</div>
    </div>
    ` : ""}
    <div class="asset-card">
      <img src="${imageUrl}" alt="Original">
      <div class="label">Original Album Art</div>
    </div>
  </div>

  <div class="analysis">
    <h2>Creative Analysis</h2>
    <p><span class="label">Description:</span> ${curationResult.analysis.creativeDescription}</p>
    <p><span class="label">Mood:</span> ${curationResult.analysis.moodAtmosphere}</p>
    <p><span class="label">Era:</span> ${curationResult.analysis.eraAesthetic}</p>
    <p><span class="label">Elements:</span> ${curationResult.analysis.interestingElements.join(", ")}</p>

    <h2>Color Palette</h2>
    <div class="palette">
      ${curationResult.palette.colors.map(c => `<div class="swatch" style="background:${c}" title="${c}"></div>`).join("")}
    </div>
    <p><span class="label">Temperature:</span> ${curationResult.palette.temperature}</p>

    <h2>Derived Assets</h2>
    <p><span class="label">Glow Color:</span> ${curationResult.derivedAssets.glowColor}</p>
    <p><span class="label">Gradient CSS:</span> <code>${curationResult.derivedAssets.gradientCss}</code></p>
    <p><span class="label">Texture:</span> ${curationResult.derivedAssets.textureRecommendation}</p>
    <p><span class="label">Reasoning:</span> ${curationResult.derivedAssets.reasoning}</p>
  </div>
</body>
</html>`;
};

// ============================================================================
// Service Interface
// ============================================================================

export interface DerivedAssetGeneratorInterface {
  /**
   * Generate all derived assets from a curation result.
   * Creates SVG files for glow, gradient, and texture overlays.
   */
  readonly generate: (
    curationResult: CurationResult,
    outputDir: string,
    imageUrl: string,
    baseName?: string
  ) => Effect.Effect<GeneratedAssetBundle, AssetGenerationError>;
}

export class DerivedAssetGenerator extends Context.Tag("DerivedAssetGenerator")<
  DerivedAssetGenerator,
  DerivedAssetGeneratorInterface
>() {}

// ============================================================================
// Implementation
// ============================================================================

const makeDerivedAssetGenerator = (): DerivedAssetGeneratorInterface => ({
  generate: (curationResult, outputDir, imageUrl, baseName = "art") =>
    Effect.gen(function* () {
      // Ensure output directory exists
      yield* Effect.tryPromise({
        try: () => fs.mkdir(outputDir, { recursive: true }),
        catch: (e) =>
          new AssetGenerationError({
            reason: `Failed to create output directory: ${outputDir}`,
            cause: e,
          }),
      });

      const { palette, derivedAssets } = curationResult;

      // Generate glow SVG
      const glowSvg = generateGlowSvg(derivedAssets.glowColor);
      const glowFilename = `${baseName}-glow.svg`;
      const glowPath = path.join(outputDir, glowFilename);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(glowPath, glowSvg, "utf-8"),
        catch: (e) =>
          new AssetGenerationError({
            reason: `Failed to write glow SVG`,
            cause: e,
          }),
      });

      const glowAsset: GeneratedAsset = {
        type: "glow",
        filename: glowFilename,
        path: glowPath,
        svg: glowSvg,
      };

      // Generate gradient SVG
      const gradientSvg = generateGradientSvg(derivedAssets.gradientCss, palette);
      const gradientFilename = `${baseName}-gradient.svg`;
      const gradientPath = path.join(outputDir, gradientFilename);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(gradientPath, gradientSvg, "utf-8"),
        catch: (e) =>
          new AssetGenerationError({
            reason: `Failed to write gradient SVG`,
            cause: e,
          }),
      });

      const gradientAsset: GeneratedAsset = {
        type: "gradient",
        filename: gradientFilename,
        path: gradientPath,
        svg: gradientSvg,
      };

      // Generate texture SVG (may be null)
      const textureSvg = generateTextureSvg(derivedAssets.textureRecommendation);
      let textureAsset: GeneratedAsset | null = null;

      if (textureSvg) {
        const textureFilename = `${baseName}-texture.svg`;
        const texturePath = path.join(outputDir, textureFilename);

        yield* Effect.tryPromise({
          try: () => fs.writeFile(texturePath, textureSvg, "utf-8"),
          catch: (e) =>
            new AssetGenerationError({
              reason: `Failed to write texture SVG`,
              cause: e,
            }),
        });

        textureAsset = {
          type: "texture",
          filename: textureFilename,
          path: texturePath,
          svg: textureSvg,
        };
      }

      // Generate HTML preview
      const bundleWithoutPreview = {
        outputDir,
        glow: glowAsset,
        gradient: gradientAsset,
        texture: textureAsset,
      };

      const htmlPreview = generateHtmlPreview(bundleWithoutPreview, curationResult, imageUrl);
      const previewPath = path.join(outputDir, `${baseName}-preview.html`);

      yield* Effect.tryPromise({
        try: () => fs.writeFile(previewPath, htmlPreview, "utf-8"),
        catch: (e) =>
          new AssetGenerationError({
            reason: `Failed to write HTML preview`,
            cause: e,
          }),
      });

      yield* Effect.logInfo(
        `Generated assets in ${outputDir}: glow, gradient${textureAsset ? ", texture" : ""}, preview`
      );

      return {
        ...bundleWithoutPreview,
        htmlPreview: previewPath,
      };
    }),
});

// ============================================================================
// Layers
// ============================================================================

export const DerivedAssetGeneratorLive: Layer.Layer<DerivedAssetGenerator> = Layer.succeed(
  DerivedAssetGenerator,
  makeDerivedAssetGenerator()
);

// ============================================================================
// Convenience Accessors
// ============================================================================

/**
 * Generate derived assets (requires DerivedAssetGenerator in context).
 */
export const generateAssets = (
  curationResult: CurationResult,
  outputDir: string,
  imageUrl: string,
  baseName?: string
) =>
  Effect.flatMap(DerivedAssetGenerator, (gen) =>
    gen.generate(curationResult, outputDir, imageUrl, baseName)
  );
