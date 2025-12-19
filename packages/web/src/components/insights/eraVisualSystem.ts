/**
 * Era-Based Visual System
 *
 * Design Philosophy: "Time Leaves Its Mark"
 *
 * Music from different eras should FEEL different visually:
 * - 1960s-70s: Weathered, warm, analog, handmade imperfections
 * - 1980s: Bold colors, clean geometry, confident but showing age
 * - 1990s: Grunge texture, photocopied aesthetic, DIY
 * - 2000s: Digital precision with subtle wear
 * - 2010s: Minimal, clean, still fresh
 * - 2020s: Contemporary, pristine, immediate
 *
 * This system provides:
 * 1. Era detection from release year
 * 2. Weathering parameters (wear, fade, grain, yellowing)
 * 3. Typography guidance per era
 * 4. Texture and color treatment
 * 5. AI prompt enrichment for authentic generation
 */

// ============================================================================
// Types
// ============================================================================

export type Era =
  | "pre-vinyl"    // Before 1950 - 78rpm, shellac, sepia
  | "golden-age"   // 1950-1969 - Early vinyl, jazz age, warm mono
  | "classic-rock" // 1970-1979 - Gatefold era, analog warmth
  | "new-wave"     // 1980-1989 - Bold, geometric, neon
  | "grunge"       // 1990-1999 - DIY, photocopied, raw
  | "digital"      // 2000-2009 - Clean but aging
  | "streaming"    // 2010-2019 - Minimal, fresh
  | "contemporary";// 2020+ - Pristine, immediate

export interface EraVisualProfile {
  era: Era;
  yearRange: [number, number];
  displayName: string;

  // Weathering parameters (0-1 scale)
  weathering: {
    wear: number;        // Physical wear (scratches, edge damage)
    fade: number;        // Color fade/desaturation
    grain: number;       // Film/paper grain intensity
    yellowing: number;   // Paper/photo yellowing
    dust: number;        // Dust specks, debris
    crease: number;      // Fold marks, creases
  };

  // Typography guidance
  typography: {
    primary: string;     // Display font style
    secondary: string;   // Body font style
    weight: "light" | "normal" | "bold";
    tracking: "tight" | "normal" | "wide" | "ultra-wide";
    style: string;       // Additional style notes
  };

  // Color treatment
  colorTreatment: {
    saturation: number;  // 0-1, where 1 is full saturation
    warmth: number;      // -1 to 1, negative is cool, positive is warm
    contrast: number;    // 0.5 to 1.5, where 1 is normal
    tint: string;        // CSS color for overlay tint
  };

  // Texture guidance
  texture: {
    type: string;        // e.g., "vinyl grain", "xerox", "clean"
    intensity: number;   // 0-1
    description: string; // Detailed texture description
  };

  // Prompt additions for AI generation
  promptGuidance: string[];
}

// ============================================================================
// Era Profiles
// ============================================================================

export const ERA_PROFILES: Record<Era, EraVisualProfile> = {
  "pre-vinyl": {
    era: "pre-vinyl",
    yearRange: [1900, 1949],
    displayName: "Pre-Vinyl Era",
    weathering: {
      wear: 0.9,
      fade: 0.85,
      grain: 0.8,
      yellowing: 0.9,
      dust: 0.7,
      crease: 0.6
    },
    typography: {
      primary: "art-deco serif",
      secondary: "elegant script",
      weight: "normal",
      tracking: "wide",
      style: "Hand-lettered feel, ornate capitals, period advertising aesthetic"
    },
    colorTreatment: {
      saturation: 0.3,
      warmth: 0.8,
      contrast: 0.7,
      tint: "rgba(180, 140, 80, 0.15)"
    },
    texture: {
      type: "aged-paper",
      intensity: 0.9,
      description: "Heavy foxing, water stains, torn edges, sepia tone, cracked surface"
    },
    promptGuidance: [
      "Sepia-toned, heavily aged appearance",
      "Art deco typography influences",
      "Visible paper degradation, foxing, water damage",
      "Hand-tinted photograph aesthetic",
      "Cracked, brittle paper texture",
      "Period-appropriate printing limitations"
    ]
  },

  "golden-age": {
    era: "golden-age",
    yearRange: [1950, 1969],
    displayName: "Golden Age",
    weathering: {
      wear: 0.7,
      fade: 0.6,
      grain: 0.6,
      yellowing: 0.7,
      dust: 0.5,
      crease: 0.5
    },
    typography: {
      primary: "mid-century sans",
      secondary: "elegant serif",
      weight: "bold",
      tracking: "wide",
      style: "Blue Note/Verve influence, bold geometry, jazz aesthetic"
    },
    colorTreatment: {
      saturation: 0.6,
      warmth: 0.5,
      contrast: 0.9,
      tint: "rgba(200, 180, 120, 0.1)"
    },
    texture: {
      type: "vinyl-sleeve",
      intensity: 0.7,
      description: "Ring wear from vinyl, split seams, price sticker residue, shop stamps"
    },
    promptGuidance: [
      "Mid-century modern design influence",
      "Bold, confident typography (Reid Miles style)",
      "Visible vinyl ring wear on cover",
      "Slight color shift from age",
      "Period printing techniques (limited color separation)",
      "Jazz/Verve/Blue Note aesthetic touchstones"
    ]
  },

  "classic-rock": {
    era: "classic-rock",
    yearRange: [1970, 1979],
    displayName: "Classic Rock Era",
    weathering: {
      wear: 0.5,
      fade: 0.4,
      grain: 0.5,
      yellowing: 0.5,
      dust: 0.4,
      crease: 0.4
    },
    typography: {
      primary: "psychedelic display",
      secondary: "warm serif",
      weight: "bold",
      tracking: "normal",
      style: "Gatefold era, cosmic imagery, hand-drawn logos, Roger Dean influence"
    },
    colorTreatment: {
      saturation: 0.75,
      warmth: 0.4,
      contrast: 1.0,
      tint: "rgba(180, 150, 100, 0.08)"
    },
    texture: {
      type: "gatefold-paper",
      intensity: 0.5,
      description: "Textured cardboard, gatefold creases, slight warping, warm paper stock"
    },
    promptGuidance: [
      "Gatefold album era aesthetic",
      "Rich, saturated colors slightly faded",
      "Textured cardboard stock appearance",
      "Fold lines visible on gatefold spine",
      "Analog photography warmth",
      "Hipgnosis/Storm Thorgerson design influence"
    ]
  },

  "new-wave": {
    era: "new-wave",
    yearRange: [1980, 1989],
    displayName: "New Wave Era",
    weathering: {
      wear: 0.35,
      fade: 0.3,
      grain: 0.3,
      yellowing: 0.3,
      dust: 0.25,
      crease: 0.25
    },
    typography: {
      primary: "geometric sans",
      secondary: "technical mono",
      weight: "bold",
      tracking: "tight",
      style: "Peter Saville influence, clean geometry, neon accents, grid systems"
    },
    colorTreatment: {
      saturation: 0.85,
      warmth: 0.0,
      contrast: 1.1,
      tint: "rgba(100, 150, 200, 0.05)"
    },
    texture: {
      type: "80s-print",
      intensity: 0.35,
      description: "Clean but aged, slight color shift in prints, glossy paper showing wear"
    },
    promptGuidance: [
      "Clean geometric design, Factory Records influence",
      "Bold color blocks, neon accents",
      "Sharp typography, Helvetica/Futura dominance",
      "Slight color drift in CMYK prints",
      "Glossy finish showing age",
      "Peter Saville/Neville Brody design language"
    ]
  },

  "grunge": {
    era: "grunge",
    yearRange: [1990, 1999],
    displayName: "Grunge Era",
    weathering: {
      wear: 0.25,
      fade: 0.2,
      grain: 0.6,
      yellowing: 0.2,
      dust: 0.2,
      crease: 0.3
    },
    typography: {
      primary: "distressed sans",
      secondary: "typewriter",
      weight: "normal",
      tracking: "normal",
      style: "DIY photocopied aesthetic, ransom note, Emigre fonts, anti-design"
    },
    colorTreatment: {
      saturation: 0.7,
      warmth: -0.1,
      contrast: 1.2,
      tint: "rgba(50, 50, 50, 0.03)"
    },
    texture: {
      type: "xerox-zine",
      intensity: 0.5,
      description: "Photocopied grain, high contrast, DIY collage aesthetic, newsprint"
    },
    promptGuidance: [
      "DIY zine aesthetic, photocopied texture",
      "High contrast, blown-out highlights",
      "Collage elements, cut-and-paste",
      "Anti-corporate design stance",
      "Distressed, intentionally rough",
      "Sub Pop/Matador/Touch and Go visual language"
    ]
  },

  "digital": {
    era: "digital",
    yearRange: [2000, 2009],
    displayName: "Early Digital Era",
    weathering: {
      wear: 0.15,
      fade: 0.1,
      grain: 0.15,
      yellowing: 0.1,
      dust: 0.1,
      crease: 0.1
    },
    typography: {
      primary: "clean sans",
      secondary: "humanist sans",
      weight: "normal",
      tracking: "normal",
      style: "Early digital precision, Helvetica Neue, minimal but not stark"
    },
    colorTreatment: {
      saturation: 0.9,
      warmth: 0.1,
      contrast: 1.0,
      tint: "rgba(200, 200, 200, 0.02)"
    },
    texture: {
      type: "digital-print",
      intensity: 0.2,
      description: "Clean digital print, slight aging, occasional compression artifacts"
    },
    promptGuidance: [
      "Clean digital aesthetic showing light age",
      "Precise typography, early web influence",
      "Slight JPEG artifacts or print wear",
      "Transitional era between physical and digital",
      "Still feels tactile but cleaner",
      "Early photoshop effects showing age"
    ]
  },

  "streaming": {
    era: "streaming",
    yearRange: [2010, 2019],
    displayName: "Streaming Era",
    weathering: {
      wear: 0.05,
      fade: 0.05,
      grain: 0.05,
      yellowing: 0.02,
      dust: 0.02,
      crease: 0.02
    },
    typography: {
      primary: "geometric sans",
      secondary: "grotesque",
      weight: "light",
      tracking: "tight",
      style: "Ultra-minimal, lots of whitespace, Instagram aesthetic"
    },
    colorTreatment: {
      saturation: 0.95,
      warmth: 0.05,
      contrast: 1.0,
      tint: "transparent"
    },
    texture: {
      type: "minimal",
      intensity: 0.05,
      description: "Nearly pristine, minimal texture, digital-first design"
    },
    promptGuidance: [
      "Minimal, digital-first aesthetic",
      "Square format (streaming artwork)",
      "Bold, simple compositions",
      "Instagram/social media influence",
      "Clean but not sterile",
      "Very light aging only"
    ]
  },

  "contemporary": {
    era: "contemporary",
    yearRange: [2020, 2099],
    displayName: "Contemporary",
    weathering: {
      wear: 0,
      fade: 0,
      grain: 0,
      yellowing: 0,
      dust: 0,
      crease: 0
    },
    typography: {
      primary: "variable sans",
      secondary: "neo-grotesque",
      weight: "normal",
      tracking: "tight",
      style: "Fresh, immediate, experimental, fluid typography"
    },
    colorTreatment: {
      saturation: 1.0,
      warmth: 0,
      contrast: 1.0,
      tint: "transparent"
    },
    texture: {
      type: "pristine",
      intensity: 0,
      description: "Brand new, no wear, immediate, fresh off the press"
    },
    promptGuidance: [
      "Pristine, brand-new appearance",
      "No aging or weathering",
      "Contemporary design trends",
      "Bold experimental typography",
      "Vibrant, full-saturation colors",
      "Feels like it just dropped today"
    ]
  }
};

// ============================================================================
// Era Detection
// ============================================================================

/**
 * Detect era from release year
 */
export function detectEra(releaseYear: number | null | undefined): Era {
  if (!releaseYear) return "contemporary";

  for (const [era, profile] of Object.entries(ERA_PROFILES)) {
    const [start, end] = profile.yearRange;
    if (releaseYear >= start && releaseYear <= end) {
      return era as Era;
    }
  }

  return "contemporary";
}

/**
 * Get full visual profile for a release year
 */
export function getEraProfile(releaseYear: number | null | undefined): EraVisualProfile {
  const era = detectEra(releaseYear);
  return ERA_PROFILES[era];
}

/**
 * Calculate age-based intensity multiplier
 * Older = more weathered (closer to 1.0)
 */
export function calculateAgeIntensity(releaseYear: number | null | undefined): number {
  if (!releaseYear) return 0;

  const currentYear = new Date().getFullYear();
  const age = currentYear - releaseYear;

  // Scale: 0 years = 0, 50+ years = 1.0
  return Math.min(1, Math.max(0, age / 50));
}

// ============================================================================
// CSS Utilities
// ============================================================================

/**
 * Generate CSS filter string for era-based treatment
 */
export function getEraFilterCSS(profile: EraVisualProfile): string {
  const { colorTreatment } = profile;
  const filters: string[] = [];

  // Saturation
  if (colorTreatment.saturation !== 1) {
    filters.push(`saturate(${colorTreatment.saturation})`);
  }

  // Contrast
  if (colorTreatment.contrast !== 1) {
    filters.push(`contrast(${colorTreatment.contrast})`);
  }

  // Warmth via sepia (positive warmth) or hue-rotate (negative)
  if (colorTreatment.warmth > 0) {
    filters.push(`sepia(${colorTreatment.warmth * 0.3})`);
  } else if (colorTreatment.warmth < 0) {
    filters.push(`hue-rotate(${colorTreatment.warmth * 10}deg)`);
  }

  return filters.length > 0 ? filters.join(" ") : "none";
}

/**
 * Generate CSS classes for weathering effects
 */
export function getWeatheringClasses(profile: EraVisualProfile): string {
  const classes: string[] = [];
  const { weathering } = profile;

  if (weathering.grain > 0.3) classes.push("film-grain");
  if (weathering.grain > 0.6) classes.push("film-grain-heavy");

  return classes.join(" ");
}

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate era-specific additions to AI image prompts
 */
export function getEraPromptAdditions(
  releaseYear: number | null | undefined,
  _insightType?: string // Reserved for insight-specific era adjustments
): string {
  const profile = getEraProfile(releaseYear);
  const ageIntensity = calculateAgeIntensity(releaseYear);

  const promptParts = [
    `\n=== ERA CONTEXT: ${profile.displayName} (${releaseYear ?? "Unknown"}) ===`,
    `Age Intensity: ${Math.round(ageIntensity * 100)}% weathered`,
    "",
    "WEATHERING REQUIREMENTS:",
    `- Physical wear: ${Math.round(profile.weathering.wear * 100)}% (scratches, edge damage)`,
    `- Color fade: ${Math.round(profile.weathering.fade * 100)}% (desaturation from age)`,
    `- Film grain: ${Math.round(profile.weathering.grain * 100)}% intensity`,
    `- Paper yellowing: ${Math.round(profile.weathering.yellowing * 100)}%`,
    `- Dust/debris: ${Math.round(profile.weathering.dust * 100)}%`,
    `- Creases/folds: ${Math.round(profile.weathering.crease * 100)}%`,
    "",
    "TYPOGRAPHY GUIDANCE:",
    `- Primary: ${profile.typography.primary}`,
    `- Style: ${profile.typography.style}`,
    `- Weight: ${profile.typography.weight}, tracking: ${profile.typography.tracking}`,
    "",
    "TEXTURE:",
    `- Type: ${profile.texture.type}`,
    `- Description: ${profile.texture.description}`,
    "",
    "ERA-SPECIFIC GUIDANCE:",
    ...profile.promptGuidance.map(g => `- ${g}`),
    "",
    "COLOR TREATMENT:",
    `- Saturation: ${Math.round(profile.colorTreatment.saturation * 100)}%`,
    `- Warmth: ${profile.colorTreatment.warmth > 0 ? "warm" : profile.colorTreatment.warmth < 0 ? "cool" : "neutral"}`,
    `- Contrast: ${profile.colorTreatment.contrast}x`,
    profile.colorTreatment.tint !== "transparent" ? `- Tint overlay: ${profile.colorTreatment.tint}` : "",
    "",
    "CRITICAL: The visual MUST feel authentically from this era.",
    `A ${releaseYear ?? "recent"} release should look like a ${ageIntensity > 0.5 ? "well-loved vintage" : ageIntensity > 0.2 ? "gently aged" : "fresh"} artifact.`
  ].filter(Boolean);

  return promptParts.join("\n");
}

/**
 * Generate complete prompt with era context for liner note image
 */
export function generateEraAwarePrompt(
  narrative: string,
  title: string,
  releaseYear: number | null | undefined,
  palette?: { dominant: string; accent: string; temperature: "warm" | "cool" | "neutral" },
  style: "art-forward" | "editorial" | "archival" | "collage" = "art-forward"
): string {
  const profile = getEraProfile(releaseYear);

  // Base prompt with content
  const basePrompt = `Create a visual liner note in the style of a ${profile.displayName.toLowerCase()} album inner sleeve.

CONTENT:
Title: "${title}"
Text: "${narrative.slice(0, 300)}${narrative.length > 300 ? "..." : ""}"

PALETTE:
Primary: ${palette?.dominant ?? "#4A4A4A"}
Accent: ${palette?.accent ?? "#E8825B"}
Temperature: ${palette?.temperature ?? "warm"}

STYLE: ${style}
${style === "art-forward" ? "- Text overlaid on abstracted album art atmosphere" : ""}
${style === "editorial" ? "- Magazine pull-quote card aesthetic" : ""}
${style === "archival" ? "- Catalog card / found document aesthetic" : ""}
${style === "collage" ? "- Zine collage, mixed media cut-out aesthetic" : ""}
`;

  // Add era-specific guidance
  const eraAdditions = getEraPromptAdditions(releaseYear);

  return basePrompt + eraAdditions;
}

// ============================================================================
// Export for Components
// ============================================================================

export default {
  detectEra,
  getEraProfile,
  calculateAgeIntensity,
  getEraFilterCSS,
  getWeatheringClasses,
  getEraPromptAdditions,
  generateEraAwarePrompt,
  ERA_PROFILES
};
