/**
 * GeneratedLinerNoteCard - AI-Generated Visual Liner Notes
 *
 * Design Concept: "The Inner Sleeve Experience"
 *
 * Imagine opening a vinyl gatefold and seeing beautifully printed liner notes
 * on the inner sleeve - photography, texture, and typeset prose combined.
 *
 * This component:
 * 1. Takes album art and insight narrative
 * 2. Generates a visual "liner note" image via Nano Banana
 * 3. Displays it inline with proper loading states
 *
 * Generation Approaches:
 *
 * APPROACH A: "Art-Forward" (Recommended)
 * - Use album art as base, overlay text zone at bottom
 * - Text appears printed/embossed on the image
 * - Maintains visual connection to the actual album
 *
 * APPROACH B: "Editorial Magazine"
 * - Generate abstract/textured background that matches album palette
 * - Large typography becomes the visual element
 * - More like a FADER or Pitchfork pull quote card
 *
 * APPROACH C: "Archival Document"
 * - Generate aged paper texture with typewriter/letterpress text
 * - Feels like a found document, press clipping, or catalog card
 * - Vintage/authentic/DIY aesthetic
 *
 * APPROACH D: "Collage/Zine"
 * - Generate mixed-media collage incorporating album imagery
 * - Cut-out text, layered textures, punk zine aesthetic
 * - High energy, less refined, more authentic
 */

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Loader2, ImageOff, Sparkles, Calendar } from "lucide-react";
import {
  getEraProfile,
  getEraFilterCSS,
  getWeatheringClasses,
  generateEraAwarePrompt
} from "./eraVisualSystem";

// ============================================================================
// Types
// ============================================================================

interface GeneratedLinerNoteCardProps {
  /** The narrative text to render on the image */
  narrative: string;
  /** Title/headline for the liner note */
  title: string;
  /** Release year for era-based styling */
  releaseYear?: number | null;
  /** Album art URL to use as base/reference */
  albumArtUrl?: string;
  /** Color palette extracted from album */
  palette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  /** Artist names to emphasize in the text */
  highlightedNames?: string[];
  /** Visual style to request */
  style?: "art-forward" | "editorial" | "archival" | "collage";
  /** Callback to trigger generation - receives the full prompt */
  onGenerate?: (prompt: string) => Promise<string | null>;
  /** Pre-generated image URL */
  generatedImageUrl?: string;
  className?: string;
}

// ============================================================================
// Prompt Templates for Nano Banana
// ============================================================================

/**
 * Generate prompt for Nano Banana Pro based on style
 */
export function generateLinerNoteImagePrompt(
  narrative: string,
  title: string,
  style: GeneratedLinerNoteCardProps["style"] = "art-forward",
  palette?: GeneratedLinerNoteCardProps["palette"],
  highlightedNames?: string[]
): string {
  // Truncate narrative for prompt (Nano Banana has limits)
  const shortNarrative = narrative.length > 200
    ? narrative.slice(0, 200) + "..."
    : narrative;

  // Base constraints for all styles
  const baseConstraints = `
TEXT REQUIREMENTS:
- All text MUST be fully legible with 4.5:1 contrast ratio
- Title: "${title}" - rendered prominently
- Body text: "${shortNarrative}"
${highlightedNames?.length ? `- Emphasized names: ${highlightedNames.join(", ")}` : ""}

COLOR PALETTE:
- Primary: ${palette?.dominant ?? "#4A4A4A"}
- Accent: ${palette?.accent ?? "#E8825B"}
- Temperature: ${palette?.temperature ?? "warm"}

CONSTRAINTS:
- Text IS the design, not decoration
- No generic AI aesthetic
- No purple gradients
- Authentic, editorial quality`;

  const stylePrompts: Record<NonNullable<typeof style>, string> = {
    "art-forward": `
Create a visual liner note that integrates with album artwork.

STYLE: Art-Forward Inner Sleeve
- Text appears at bottom third of image, on a subtle overlay
- Background: soft focus/blur of album art colors and textures
- Typography: Classic serif (Baskerville/Garamond style), warm tones
- Feel: Like opening a gatefold and reading the printed inner sleeve
- Texture: Slight paper grain, warm color cast

LAYOUT:
- Top 2/3: Abstract, blurred representation of album art mood
- Bottom 1/3: Text zone with slight transparency
- Subtle vignette edges

${baseConstraints}`,

    "editorial": `
Create a magazine-style pull quote card.

STYLE: Editorial Magazine
- Bold, oversized typography as the visual element
- Minimal background: solid color or subtle gradient from palette
- Typography: Mix of display sans-serif and elegant serif
- Feel: Pitchfork review card, The FADER feature
- Clean, modern, confident

LAYOUT:
- Large pull quote taking center stage
- Title as small label above or below
- Generous whitespace
- Single accent color pop

${baseConstraints}`,

    "archival": `
Create an aged document/catalog card aesthetic.

STYLE: Archival Document
- Aged cream/sepia paper texture
- Typewriter or letterpress typography
- Feel: Found document, library card, press clipping
- Worn edges, slight foxing, authentic wear
- Mid-century catalog aesthetic

LAYOUT:
- Header with catalog-style numbering
- Body text in readable columns
- Handwritten-style annotations optional
- Stamp or seal embellishment

${baseConstraints}`,

    "collage": `
Create a mixed-media zine collage.

STYLE: Zine/Collage
- Cut-out text, layered elements
- Mixed textures: newspaper, photographs, tape
- Punk/DIY aesthetic, high energy
- Imperfect, hand-made feeling
- Xerox/risograph texture

LAYOUT:
- Asymmetric, dynamic composition
- Text at angles, overlapping
- Varied type sizes and weights
- Raw, authentic, not polished

${baseConstraints}`
  };

  return stylePrompts[style];
}

// ============================================================================
// Component
// ============================================================================

export const GeneratedLinerNoteCard = ({
  narrative,
  title,
  releaseYear,
  albumArtUrl: _albumArtUrl, // Reserved for future album-based generation
  palette,
  highlightedNames: _highlightedNames, // Reserved for future text emphasis
  style = "art-forward",
  onGenerate,
  generatedImageUrl,
  className
}: GeneratedLinerNoteCardProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(generatedImageUrl ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get era profile for styling
  const eraProfile = useMemo(() => getEraProfile(releaseYear), [releaseYear]);
  const filterCSS = useMemo(() => getEraFilterCSS(eraProfile), [eraProfile]);
  const weatheringClasses = useMemo(() => getWeatheringClasses(eraProfile), [eraProfile]);

  // Default colors
  const colors = palette ?? {
    dominant: "#E8825B",
    accent: "#4ECDC4",
    temperature: "warm" as const
  };

  // Generate the full prompt with era context
  const fullPrompt = useMemo(
    () => generateEraAwarePrompt(narrative, title, releaseYear, palette, style),
    [narrative, title, releaseYear, palette, style]
  );

  // Handle generation
  const handleGenerate = async () => {
    if (!onGenerate) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Pass the full era-aware prompt to the generator
      const url = await onGenerate(fullPrompt);
      if (url) {
        setImageUrl(url);
      } else {
        setError("Generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  // If we have a generated image, show it with era-appropriate treatment
  if (imageUrl) {
    return (
      <div
        className={cn(
          "relative rounded-xl overflow-hidden",
          "shadow-lg shadow-black/20",
          weatheringClasses,
          className
        )}
      >
        {/* Era-treated image */}
        <img
          src={imageUrl}
          alt={`Visual liner note: ${title}`}
          className="w-full h-auto"
          style={{ filter: filterCSS }}
        />

        {/* Era-specific overlay texture */}
        {eraProfile.weathering.grain > 0.3 && (
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              opacity: eraProfile.weathering.grain * 0.4
            }}
          />
        )}

        {/* Yellowing overlay for vintage eras */}
        {eraProfile.weathering.yellowing > 0.3 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: eraProfile.colorTreatment.tint,
              mixBlendMode: "multiply"
            }}
          />
        )}

        {/* Era badge and attribution */}
        <div
          className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between"
          style={{
            background: `linear-gradient(to top, ${colors.dominant}90, transparent)`
          }}
        >
          <span className="text-[9px] uppercase tracking-widest text-white/60">
            AI-Generated · {eraProfile.displayName}
          </span>
          {releaseYear && (
            <span className="flex items-center gap-1 text-[9px] text-white/50">
              <Calendar className="w-3 h-3" />
              {releaseYear}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Placeholder / generation trigger state with era preview
  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden",
        "border border-dashed border-foreground/20",
        "bg-gradient-to-br from-foreground/5 to-transparent",
        className
      )}
      style={{
        // Apply subtle era tint even to placeholder
        background: eraProfile.weathering.yellowing > 0.3
          ? `linear-gradient(135deg, ${eraProfile.colorTreatment.tint}, transparent)`
          : undefined
      }}
    >
      {/* Preview of what will be generated */}
      <div className="aspect-[4/3] p-6 flex flex-col justify-between">
        {/* Header: Era + Title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-full"
              style={{
                background: `${colors.accent}20`,
                color: colors.accent
              }}
            >
              {eraProfile.displayName}
            </span>
            {releaseYear && (
              <span className="text-[9px] text-muted-foreground/50 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {releaseYear}
              </span>
            )}
          </div>
          <span
            className="block text-[11px] uppercase tracking-[0.2em] font-medium"
            style={{ color: `${colors.dominant}cc` }}
          >
            {title}
          </span>
        </div>

        {/* Narrative preview (truncated) with era-appropriate styling */}
        <p
          className="text-sm leading-relaxed text-foreground/50 line-clamp-4"
          style={{
            fontFamily: eraProfile.typography.primary.includes("serif")
              ? "'Libre Baskerville', Georgia, serif"
              : "'IBM Plex Sans', sans-serif",
            filter: filterCSS !== "none" ? filterCSS : undefined
          }}
        >
          {narrative}
        </p>

        {/* Generation controls with era context */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                {style}
              </span>
              <span className="text-[9px] text-muted-foreground/30">·</span>
              <span className="text-[9px] text-muted-foreground/40">
                {Math.round(eraProfile.weathering.wear * 100)}% wear
              </span>
            </div>

            {onGenerate && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full",
                  "text-xs font-medium",
                  "bg-foreground/10 hover:bg-foreground/20",
                  "transition-colors",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" style={{ color: colors.accent }} />
                    Generate Visual
                  </>
                )}
              </button>
            )}
          </div>

          {/* Era texture preview indicator */}
          <div className="text-[8px] text-muted-foreground/30 truncate">
            Texture: {eraProfile.texture.type} · {eraProfile.typography.style.slice(0, 40)}...
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs mt-2">
            <ImageOff className="w-3 h-3" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Brainstorm: Integration with Existing Services
// ============================================================================

/**
 * HOW THIS WOULD INTEGRATE:
 *
 * 1. AlbumArtEnhancementService already has Nano Banana / Gemini integration
 *
 * 2. New method: generateLinerNoteImage()
 *    - Takes: insight, albumArtUrl, palette
 *    - Calls Nano Banana with our prompt template
 *    - Returns: generated image URL
 *
 * 3. Caching layer:
 *    - Store generated images by insight ID + style
 *    - Avoid regenerating for same content
 *
 * 4. UI Flow:
 *    - InlineLinerNote shows text-based version by default
 *    - "Generate Visual" button triggers AI generation
 *    - Generated image replaces/supplements text version
 *
 * 5. Batch generation option:
 *    - Generate all liner note visuals for a playlist
 *    - Create "visual booklet" experience
 *
 * STYLE RECOMMENDATIONS BY INSIGHT TYPE:
 *
 * - DiscoveryArc → "art-forward" (hero treatment, album connection)
 * - DJRecommendation → "editorial" (quote-forward, magazine feel)
 * - LocalScene → "archival" (catalog card, geographic document)
 * - Connection → "collage" (connecting artists visually)
 */

export default GeneratedLinerNoteCard;
