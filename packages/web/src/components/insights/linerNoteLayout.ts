/**
 * Liner Note Layout Algorithm
 *
 * Algorithmically determines optimal layout flow for liner notes based on:
 * - Content type and importance
 * - Visual balance (avoid monotony, create rhythm)
 * - Design principles (art-first, illuminate don't generate)
 *
 * Philosophy: "The Art Speaks First"
 * All layouts should enhance the original artwork and narrative,
 * never overshadow or replace the authentic musical content.
 */

import type { Insights } from "@crate/domain";

// ============================================================================
// Types
// ============================================================================

export type LayoutSize = "full" | "wide" | "half" | "third" | "quarter";
export type ContentType = "hero" | "narrative" | "data" | "asset" | "quote";

export interface LayoutItem {
  id: string;
  type: ContentType;
  size: LayoutSize;
  priority: number; // 1-10, higher = more important
  cssClass: string;
}

export interface LayoutConfig {
  columns: 2 | 3;
  rhythm: "tight" | "balanced" | "spacious";
  heroPosition: "first" | "distributed";
}

export interface AlbumContext {
  palette: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  };
  era?: "vintage" | "classic" | "modern" | "contemporary";
  style?: "minimal" | "bold" | "organic" | "geometric";
}

// ============================================================================
// Design Guardrails
// ============================================================================

/**
 * Design Guardrails - Principles that ensure we illuminate, not generate
 *
 * These rules enforce the "Art Speaks First" philosophy:
 * 1. Authentic content always takes precedence
 * 2. Generated assets complement, never compete with the music
 * 3. Typography honors the album's era and aesthetic
 * 4. Color palettes are extracted, not invented
 */
export const DESIGN_GUARDRAILS = {
  // Maximum ratio of generated assets to authentic content
  maxAssetRatio: 0.4, // Assets should never exceed 40% of layout

  // Minimum spacing between similar content types (prevents monotony)
  minTypeSeparation: 2,

  // Hero content rules
  hero: {
    maxPerLayout: 1, // Only one hero item per layout
    mustBeAuthentic: true, // Hero must be real insight, not generated
    minTextLength: 100, // Hero content must have substantial text
  },

  // Typography rules by era
  typographyByEra: {
    vintage: { serif: true, weight: "light", spacing: "wide" },
    classic: { serif: true, weight: "normal", spacing: "normal" },
    modern: { serif: false, weight: "medium", spacing: "tight" },
    contemporary: { serif: false, weight: "bold", spacing: "tight" },
  },

  // Color contrast requirements (WCAG AA)
  minContrastRatio: 4.5,

  // Content authenticity markers
  authenticContentTypes: ["DiscoveryArc", "DJRecommendation", "Connection", "LocalScene"] as const,
} as const;

// ============================================================================
// Layout Algorithm
// ============================================================================

/**
 * Determine content type and priority from insight
 */
export function classifyInsight(insight: Insights.Insight): { type: ContentType; priority: number } {
  switch (insight._tag) {
    case "DiscoveryArc":
      return { type: "narrative", priority: 9 };
    case "DJRecommendation":
      return { type: "quote", priority: 8 };
    case "LocalScene":
      return { type: "narrative", priority: 7 };
    case "Connection":
      return insight.explanation && insight.explanation.length > 50
        ? { type: "narrative", priority: 6 }
        : { type: "data", priority: 4 };
    case "PlayHistory":
      return { type: "data", priority: 5 };
    case "Concert":
      return { type: "data", priority: 4 };
    default:
      return { type: "data", priority: 3 };
  }
}

/**
 * Assign optimal size based on content type and visual balance
 */
export function assignSize(
  type: ContentType,
  priority: number,
  position: number,
  _totalItems: number, // Reserved for future density calculations
  config: LayoutConfig
): LayoutSize {
  // Hero content is always full-width
  if (type === "hero") return "full";

  // First narrative item gets prominent placement
  if (type === "narrative" && priority >= 7 && position === 0) return "full";

  // High-priority narratives get wide treatment
  if (type === "narrative" && priority >= 6) {
    return config.columns === 3 ? "wide" : "full";
  }

  // Quotes get medium treatment
  if (type === "quote") return "half";

  // Data items are compact
  if (type === "data") return config.columns === 3 ? "third" : "half";

  // Assets vary for visual interest
  if (type === "asset") {
    // Alternate between sizes for rhythm
    const sizes: LayoutSize[] = ["third", "quarter", "half"];
    return sizes[position % sizes.length];
  }

  return "half";
}

/**
 * Calculate optimal row distribution for visual balance
 *
 * Uses a bin-packing algorithm to fill rows evenly:
 * - Full = 3 units
 * - Wide = 2 units
 * - Half = 1.5 units (rounds to 2 on 2-col, 1 on 3-col)
 * - Third = 1 unit
 * - Quarter = 0.5 units (pairs up)
 */
export function optimizeRowDistribution(items: LayoutItem[], columns: 2 | 3): LayoutItem[][] {
  const rows: LayoutItem[][] = [];
  let currentRow: LayoutItem[] = [];
  let currentUnits = 0;
  const maxUnits = columns;

  const sizeToUnits: Record<LayoutSize, number> = {
    full: 3,
    wide: 2,
    half: columns === 3 ? 1 : 1.5,
    third: 1,
    quarter: 0.5,
  };

  for (const item of items) {
    const units = sizeToUnits[item.size];

    // Full-width items always start new row
    if (item.size === "full") {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
        currentUnits = 0;
      }
      rows.push([item]);
      continue;
    }

    // Check if item fits in current row
    if (currentUnits + units <= maxUnits) {
      currentRow.push(item);
      currentUnits += units;

      // Row is full
      if (currentUnits >= maxUnits) {
        rows.push(currentRow);
        currentRow = [];
        currentUnits = 0;
      }
    } else {
      // Start new row
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [item];
      currentUnits = units;
    }
  }

  // Don't forget last row
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Apply visual rhythm adjustments to prevent monotony
 */
export function applyRhythmAdjustments(items: LayoutItem[]): LayoutItem[] {
  const adjusted = [...items];
  let lastType: ContentType | null = null;
  let sameTypeStreak = 0;

  for (let i = 0; i < adjusted.length; i++) {
    const item = adjusted[i];

    // Track streaks of same content type
    if (item.type === lastType) {
      sameTypeStreak++;
    } else {
      sameTypeStreak = 0;
    }

    // Break up monotony by varying sizes
    if (sameTypeStreak >= DESIGN_GUARDRAILS.minTypeSeparation) {
      // Alternate sizes within same-type runs
      if (item.size === "half") {
        adjusted[i] = { ...item, size: "third" };
      } else if (item.size === "third") {
        adjusted[i] = { ...item, size: "half" };
      }
    }

    lastType = item.type;
  }

  return adjusted;
}

/**
 * Validate layout against design guardrails
 */
export function validateLayout(items: LayoutItem[]): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check asset ratio
  const assetCount = items.filter((i) => i.type === "asset").length;
  const assetRatio = assetCount / items.length;
  if (assetRatio > DESIGN_GUARDRAILS.maxAssetRatio) {
    warnings.push(
      `Asset ratio ${(assetRatio * 100).toFixed(0)}% exceeds maximum ${DESIGN_GUARDRAILS.maxAssetRatio * 100}%`
    );
  }

  // Check hero count
  const heroCount = items.filter((i) => i.type === "hero").length;
  if (heroCount > DESIGN_GUARDRAILS.hero.maxPerLayout) {
    warnings.push(`Multiple hero items (${heroCount}) may compete for attention`);
  }

  // Check for consecutive same-type items
  let consecutiveCount = 1;
  for (let i = 1; i < items.length; i++) {
    if (items[i].type === items[i - 1].type) {
      consecutiveCount++;
      if (consecutiveCount > DESIGN_GUARDRAILS.minTypeSeparation + 1) {
        warnings.push(`${consecutiveCount} consecutive ${items[i].type} items may feel monotonous`);
      }
    } else {
      consecutiveCount = 1;
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Get CSS class for layout size
 */
export function getSizeClass(size: LayoutSize): string {
  const classes: Record<LayoutSize, string> = {
    full: "gallery-full",
    wide: "gallery-wide",
    half: "gallery-half",
    third: "gallery-third",
    quarter: "gallery-quarter",
  };
  return classes[size];
}

/**
 * Get typography classes based on album era
 */
export function getEraTypography(era: AlbumContext["era"]): string {
  if (!era) return "font-serif";

  const { typographyByEra } = DESIGN_GUARDRAILS;
  const config = typographyByEra[era];

  const classes: string[] = [];

  if (config.serif) {
    classes.push("font-serif");
  } else {
    classes.push("font-body");
  }

  switch (config.weight) {
    case "light":
      classes.push("font-light");
      break;
    case "medium":
      classes.push("font-medium");
      break;
    case "bold":
      classes.push("font-semibold");
      break;
    default:
      classes.push("font-normal");
  }

  switch (config.spacing) {
    case "wide":
      classes.push("tracking-wide");
      break;
    case "tight":
      classes.push("tracking-tight");
      break;
  }

  return classes.join(" ");
}

/**
 * Main layout computation function
 *
 * Takes insights and context, returns optimized layout items
 */
export function computeLayout(
  insights: Insights.Insight[],
  assets: Array<{ id: string; priority?: number }>,
  config: LayoutConfig = { columns: 2, rhythm: "balanced", heroPosition: "first" }
): LayoutItem[] {
  const items: LayoutItem[] = [];

  // 1. Classify and prioritize insights
  const classifiedInsights = insights.map((insight, i) => {
    const { type, priority } = classifyInsight(insight);
    return {
      id: `insight-${insight._tag}-${i}`,
      insightType: insight._tag,
      type,
      priority,
      original: insight,
    };
  });

  // 2. Sort by priority (highest first)
  classifiedInsights.sort((a, b) => b.priority - a.priority);

  // 3. Assign hero status to top narrative
  const heroCandidate = classifiedInsights.find(
    (i) => i.type === "narrative" && i.priority >= DESIGN_GUARDRAILS.hero.minTextLength / 10
  );

  // 4. Build layout items
  let position = 0;
  for (const classified of classifiedInsights) {
    const isHero = classified === heroCandidate && config.heroPosition === "first" && position === 0;

    const size = assignSize(
      isHero ? "hero" : classified.type,
      classified.priority,
      position,
      classifiedInsights.length + assets.length,
      config
    );

    items.push({
      id: classified.id,
      type: isHero ? "hero" : classified.type,
      size,
      priority: classified.priority,
      cssClass: getSizeClass(size),
    });

    position++;
  }

  // 5. Interleave assets (respecting max ratio)
  const maxAssets = Math.floor(items.length * DESIGN_GUARDRAILS.maxAssetRatio);
  const assetsToInclude = assets.slice(0, maxAssets);

  // Insert assets at regular intervals
  if (assetsToInclude.length > 0) {
    const interval = Math.max(2, Math.floor(items.length / assetsToInclude.length));

    for (let i = 0; i < assetsToInclude.length; i++) {
      const asset = assetsToInclude[i];
      const insertPosition = Math.min((i + 1) * interval, items.length);
      const size = assignSize("asset", asset.priority ?? 3, i, items.length, config);

      items.splice(insertPosition, 0, {
        id: asset.id,
        type: "asset",
        size,
        priority: asset.priority ?? 3,
        cssClass: getSizeClass(size),
      });
    }
  }

  // 6. Apply rhythm adjustments
  const rhythmAdjusted = applyRhythmAdjustments(items);

  // 7. Validate and warn
  const { warnings } = validateLayout(rhythmAdjusted);
  if (warnings.length > 0 && process.env.NODE_ENV === "development") {
    console.warn("[LinerNoteLayout] Design guardrail warnings:", warnings);
  }

  return rhythmAdjusted;
}

// ============================================================================
// AI Generation Prompt Guardrails
// ============================================================================

/**
 * Generate AI prompt with built-in guardrails
 *
 * Ensures generated imagery stays true to the album's visual identity
 */
export function generateGuardedPrompt(
  context: AlbumContext,
  contentType: ContentType,
  text: string
): string {
  const { palette, era, style: _style } = context; // style reserved for future enhancement

  // Base style guidance - always reference the album
  const baseGuidance = [
    "Create imagery that enhances and complements existing album artwork.",
    "Do not generate new characters, band members, or subjects not in the original art.",
    "Typography should feel archival and authentic, like vintage liner notes.",
    "Colors must come from the album's existing palette, not invented.",
  ];

  // Era-specific guidance
  const eraGuidance: Record<string, string> = {
    vintage: "1960s-70s aesthetic: warm film tones, analog textures, hand-lettered feel",
    classic: "1980s-90s aesthetic: clean typography, bold colors, confident layouts",
    modern: "2000s-2010s aesthetic: minimal design, digital precision, white space",
    contemporary: "2020s aesthetic: fluid gradients, experimental type, bold contrast",
  };

  // Content-type specific guidance
  const contentGuidance: Record<ContentType, string> = {
    hero: "Full-bleed layout, narrative text overlay, magazine editorial quality",
    narrative: "Prose-forward design, classic book typography, generous margins",
    data: "Catalog-style layout, tabular information, archival reference feel",
    asset: "Small accent piece, decorative ephemera, record store artifact",
    quote: "Pull-quote treatment, elegant attribution, subtle background texture",
  };

  // Color guidance - MUST use palette colors
  const colorGuidance = [
    `Primary color: ${palette.dominant} (use for dominant elements)`,
    `Accent color: ${palette.accent} (use for highlights and emphasis)`,
    `Temperature: ${palette.temperature} (overall color feeling)`,
    "CRITICAL: Only use colors from the album's palette, no invented colors",
  ];

  // Typography guidance based on era
  const typoConfig = era ? DESIGN_GUARDRAILS.typographyByEra[era] : DESIGN_GUARDRAILS.typographyByEra.classic;
  const typographyGuidance = [
    typoConfig.serif
      ? "Use classic serif typeface (Baskerville, Garamond, Caslon style)"
      : "Use clean sans-serif typeface (Helvetica, Futura, Grotesk style)",
    `Font weight: ${typoConfig.weight}`,
    `Letter spacing: ${typoConfig.spacing}`,
    "Ensure 4.5:1 contrast ratio for all text (WCAG AA)",
  ];

  // Assemble prompt
  const promptSections = [
    "=== DESIGN GUARDRAILS ===",
    ...baseGuidance,
    "",
    "=== ERA REFERENCE ===",
    era ? eraGuidance[era] : eraGuidance.classic,
    "",
    "=== CONTENT TYPE ===",
    contentGuidance[contentType],
    "",
    "=== COLOR PALETTE (MANDATORY) ===",
    ...colorGuidance,
    "",
    "=== TYPOGRAPHY ===",
    ...typographyGuidance,
    "",
    "=== CONTENT TEXT ===",
    text.slice(0, 500), // Limit text length
  ];

  return promptSections.join("\n");
}
