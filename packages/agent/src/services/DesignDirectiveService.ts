/**
 * DesignDirectiveService
 *
 * Provides design school-informed directives for AI art direction.
 * Acts as a "culture-aware art director" that guides visual decisions
 * based on established design principles, era aesthetics, and KEXP values.
 *
 * Design Schools Referenced:
 * - Swiss International Style (grid, clarity, objectivity)
 * - Blue Note Records (Reid Miles - jazz typography and photography)
 * - Factory Records (Peter Saville - postmodern minimalism)
 * - 4AD (Vaughan Oliver - dreamlike, textural)
 * - SubPop/K Records (DIY, authentic, Pacific Northwest)
 * - Japanese Aesthetics (wabi-sabi, ma, kanso)
 *
 * KEXP Values: Authenticity > Polish, Documentary > Marketing, Music > Platform
 */

import { Effect, Context, Schema, Layer, Data } from "effect";

// ============================================================================
// Design School Reference Data
// ============================================================================

/**
 * Iconic record label aesthetics that define genre visual languages.
 */
export const LABEL_AESTHETICS = {
  "blue-note": {
    name: "Blue Note Records",
    designer: "Reid Miles",
    era: "1950s-1960s",
    characteristics: [
      "Bold sans-serif typography (Trade Gothic)",
      "Asymmetric layouts with dramatic negative space",
      "High-contrast black and white photography",
      "Single accent color (often blue or orange)",
      "Typography as visual element, not just label",
      "Francis Wolff's intimate musician portraits",
    ],
    colorPrinciple: "Two-color printing with strategic accent",
    typographyPrinciple: "Type as architecture - bold, angular, expressive",
    applyWhen: ["jazz", "bebop", "hard bop", "modal jazz", "Blue Note"],
  },

  "factory-records": {
    name: "Factory Records",
    designer: "Peter Saville",
    era: "1978-1992",
    characteristics: [
      "Minimal, austere compositions",
      "Classical art references (Fantin-Latour roses)",
      "Industrial textures and materials",
      "Anti-commercial - sometimes no text at all",
      "Catalog numbering system (FAC 1, FAC 2...)",
      "Appropriated imagery from art history",
    ],
    colorPrinciple: "Muted, somber palettes or stark monochromes",
    typographyPrinciple: "Futura bold or deliberately absent",
    applyWhen: ["post-punk", "new wave", "synth-pop", "Joy Division", "New Order", "industrial"],
  },

  "4ad": {
    name: "4AD Records",
    designer: "Vaughan Oliver / v23",
    era: "1980s-2000s",
    characteristics: [
      "Dreamlike, ethereal imagery",
      "Layered photographic collages",
      "Textural, almost tactile surfaces",
      "Painterly and abstract elements",
      "Unified visual language across releases",
      "Type integrated into image, not separate",
    ],
    colorPrinciple: "Rich, deep colors with atmospheric gradients",
    typographyPrinciple: "Organic, sometimes illegible, integrated into imagery",
    applyWhen: ["dream pop", "shoegaze", "ethereal", "Cocteau Twins", "Pixies", "ambient"],
  },

  "ecm": {
    name: "ECM Records",
    designer: "Barbara Wojirsch / Manfred Eicher",
    era: "1969-present",
    characteristics: [
      "Stark landscape photography",
      "Extreme negative space",
      "Contemplative, meditative mood",
      "Natural light and muted tones",
      "Uniform layout system",
      "Type always in same position",
    ],
    colorPrinciple: "Muted, natural, photographic - no artificial colors",
    typographyPrinciple: "Helvetica only, small, consistent placement",
    applyWhen: ["ECM jazz", "contemporary classical", "ambient jazz", "Nordic jazz"],
  },

  "subpop": {
    name: "Sub Pop Records",
    designer: "Art Chantry / various",
    era: "1988-present",
    characteristics: [
      "DIY aesthetic, hand-drawn elements",
      "Photocopied, distressed textures",
      "Raw, unpolished photography",
      "Humor and irreverence",
      "Pacific Northwest regional identity",
      "Loud, aggressive type treatments",
    ],
    colorPrinciple: "High contrast, limited color, often black and a spot color",
    typographyPrinciple: "Hand-lettered, distressed, or aggressively bold",
    applyWhen: ["grunge", "alternative rock", "Seattle", "Pacific Northwest", "indie rock 90s"],
  },

  "k-records": {
    name: "K Records",
    designer: "Various (DIY)",
    era: "1982-present",
    characteristics: [
      "Lo-fi, handmade aesthetic",
      "Childlike simplicity",
      "Anti-commercial, anti-slick",
      "Zine culture influence",
      "Personal, intimate scale",
      "Olympia, Washington identity",
    ],
    colorPrinciple: "Limited, often single color or black and white",
    typographyPrinciple: "Hand-written, typewriter, or simple sans-serif",
    applyWhen: ["lo-fi", "indie pop", "twee", "Olympia", "K Records", "beat happening"],
  },

  "warp": {
    name: "Warp Records",
    designer: "The Designers Republic",
    era: "1989-present",
    characteristics: [
      "Futuristic, techno-utopian imagery",
      "Sharp geometric forms",
      "Neon accent colors on dark backgrounds",
      "Anti-natural, synthetic aesthetic",
      "Information overload as design",
      "Corporate parody and critique",
    ],
    colorPrinciple: "Synthetic: neon cyan, magenta, yellow on black",
    typographyPrinciple: "Custom, geometric, sometimes illegible",
    applyWhen: ["IDM", "electronic", "techno", "Aphex Twin", "Autechre", "glitch"],
  },

  "motown": {
    name: "Motown Records",
    designer: "Various",
    era: "1959-1988",
    characteristics: [
      "Glamorous artist photography",
      "Aspirational, polished presentation",
      "Strong artist branding",
      "Warm, inviting colors",
      "Professional studio portraits",
      "Elegant serif typography",
    ],
    colorPrinciple: "Warm, rich colors - golds, deep reds, browns",
    typographyPrinciple: "Elegant serifs, script fonts, refined",
    applyWhen: ["soul", "R&B", "Motown", "classic soul", "northern soul"],
  },
} as const;

/**
 * Era-specific aesthetic frameworks for contextualizing album art.
 */
export const ERA_AESTHETICS = {
  "1960s-psychedelic": {
    name: "1960s Psychedelic",
    keyDesigners: ["Wes Wilson", "Victor Moscoso", "Stanley Mouse"],
    visualLanguage: [
      "Organic, flowing letterforms",
      "Vibrating color combinations",
      "Art Nouveau influences",
      "Hallucinogenic imagery",
      "Hand-lettered typography",
      "Concert poster influence",
    ],
    colorPrinciple: "High-saturation complementary colors that vibrate optically",
    mood: "Mind-expanding, countercultural, optimistic rebellion",
  },

  "1970s-prog": {
    name: "1970s Progressive Rock",
    keyDesigners: ["Roger Dean", "Hipgnosis", "Storm Thorgerson"],
    visualLanguage: [
      "Fantasy landscapes",
      "Surrealist imagery",
      "Airbrush techniques",
      "Gatefold album expansiveness",
      "Conceptual visual narratives",
      "Photo manipulation and collage",
    ],
    colorPrinciple: "Dreamlike palettes, soft gradients, otherworldly",
    mood: "Epic, cerebral, otherworldly, conceptual",
  },

  "1970s-punk": {
    name: "1970s Punk",
    keyDesigners: ["Jamie Reid", "Barney Bubbles", "Arturo Vega"],
    visualLanguage: [
      "Cut-and-paste ransom note aesthetic",
      "Photocopied degradation",
      "Confrontational imagery",
      "Anti-design as design",
      "Day-Glo colors and black",
      "Found typography, newspaper headlines",
    ],
    colorPrinciple: "Harsh, high contrast - safety orange, hot pink, black",
    mood: "Aggressive, anti-establishment, urgent, raw",
  },

  "1980s-new-wave": {
    name: "1980s New Wave / Post-Punk",
    keyDesigners: ["Peter Saville", "Neville Brody", "Malcolm Garrett"],
    visualLanguage: [
      "Geometric abstraction",
      "Futura and Helvetica Bold",
      "Art deco revival elements",
      "Minimalist compositions",
      "Neon accents on dark grounds",
      "Video art influence",
    ],
    colorPrinciple: "Electric: neon pink, cyan, purple against black or gray",
    mood: "Sleek, detached, futuristic, melancholic",
  },

  "1990s-grunge": {
    name: "1990s Grunge / Alternative",
    keyDesigners: ["Art Chantry", "Frank Kozik", "Chris Bilheimer"],
    visualLanguage: [
      "Distressed, worn textures",
      "Hand-drawn imperfection",
      "Ironic retro references",
      "Thrift store aesthetic",
      "Anti-corporate messaging",
      "Raw photography, often blurry",
    ],
    colorPrinciple: "Muted, dirty - mustard yellow, forest green, burnt orange",
    mood: "Authentic, cynical, anti-commercial, introspective",
  },

  "2000s-digital": {
    name: "2000s Digital / Minimalism",
    keyDesigners: ["Non-Format", "Julian House", "Scott Hansen (Tycho)"],
    visualLanguage: [
      "Clean digital gradients",
      "Vector graphics",
      "White space as primary element",
      "Geometric sans-serif type",
      "Photography processed digitally",
      "Web-influenced layouts",
    ],
    colorPrinciple: "Limited palettes, often monochromatic with single accent",
    mood: "Clinical, precise, aspirational, controlled",
  },

  "2010s-neo-vintage": {
    name: "2010s Neo-Vintage Revival",
    keyDesigners: ["Various indie artists", "Bandcamp generation"],
    visualLanguage: [
      "Analog nostalgia (film grain, tape hiss)",
      "Hand-lettered typography revival",
      "Polaroid and 35mm aesthetics",
      "Risograph and letterpress printing",
      "Craft and authenticity signifiers",
      "Local/regional identity emphasis",
    ],
    colorPrinciple: "Warm, faded - as if sun-bleached or aged",
    mood: "Nostalgic, authentic, personal, anti-digital",
  },
} as const;

/**
 * Japanese aesthetic principles aligned with KEXP's documentary philosophy.
 */
export const JAPANESE_AESTHETICS = {
  "wabi-sabi": {
    name: "Wabi-Sabi",
    principle: "Beauty in imperfection, transience, and incompleteness",
    application: [
      "Embrace grain, texture, and analog artifacts",
      "Avoid clinical digital perfection",
      "Value asymmetry over symmetry",
      "Let wear and age show through",
      "Prefer natural over synthetic colors",
    ],
    alignsWithKEXP: "Documentary over marketing, authenticity over polish",
  },

  "ma": {
    name: "Ma (negative space)",
    principle: "Meaningful emptiness, the pause that gives rhythm",
    application: [
      "Use whitespace as active compositional element",
      "Don't fill every corner with content",
      "Let the album art breathe",
      "Create visual silence around key elements",
      "Space between is as important as space occupied",
    ],
    alignsWithKEXP: "Progressive disclosure, music-first hierarchy",
  },

  "kanso": {
    name: "Kanso (simplicity)",
    principle: "Elimination of clutter and the non-essential",
    application: [
      "Remove decorative elements that don't serve the music",
      "One strong idea is better than many weak ones",
      "Typography hierarchy over decorative fonts",
      "Clear, unambiguous visual communication",
      "If it doesn't serve discovery, remove it",
    ],
    alignsWithKEXP: "Clarity over cleverness, function over decoration",
  },
} as const;

// ============================================================================
// Schema Definitions
// ============================================================================

/** Context for selecting appropriate design directives */
export const DesignContext = Schema.Struct({
  genres: Schema.Array(Schema.String),
  era: Schema.optional(Schema.String),
  mood: Schema.optional(Schema.String),
  temperature: Schema.Literal("warm", "cool", "neutral"),
  isLocal: Schema.optional(Schema.Boolean),
  labelHints: Schema.optional(Schema.Array(Schema.String)),
});
export type DesignContext = typeof DesignContext.Type;

/** Design directive output */
export const DesignDirective = Schema.Struct({
  /** Primary design school/label aesthetic to reference */
  primaryReference: Schema.String,

  /** Visual language rules to follow */
  visualLanguage: Schema.Array(Schema.String),

  /** Color principle for this context */
  colorPrinciple: Schema.String,

  /** Typography guidance */
  typographyGuidance: Schema.String,

  /** Mood to convey */
  targetMood: Schema.String,

  /** KEXP-specific constraints */
  kexpConstraints: Schema.Array(Schema.String),

  /** Things to explicitly avoid */
  avoid: Schema.Array(Schema.String),

  /** Era aesthetic if applicable */
  eraContext: Schema.optional(Schema.String),
});
export type DesignDirective = typeof DesignDirective.Type;

// ============================================================================
// Errors
// ============================================================================

export class DirectiveError extends Data.TaggedError("DirectiveError")<{
  readonly reason: string;
}> {}

// ============================================================================
// Service Interface
// ============================================================================

export interface DesignDirectiveServiceInterface {
  /**
   * Get design directives based on music context.
   * Matches genres, era, and mood to appropriate design schools.
   */
  readonly getDirective: (
    context: DesignContext
  ) => Effect.Effect<DesignDirective>;

  /**
   * Generate a system prompt addendum for AI art direction.
   * Integrates design school principles into the prompt.
   */
  readonly generatePromptAddendum: (
    directive: DesignDirective
  ) => Effect.Effect<string>;

  /**
   * Get all available label aesthetics for reference.
   */
  readonly getLabelAesthetics: () => Effect.Effect<typeof LABEL_AESTHETICS>;

  /**
   * Get all era aesthetics for reference.
   */
  readonly getEraAesthetics: () => Effect.Effect<typeof ERA_AESTHETICS>;
}

export class DesignDirectiveService extends Context.Tag("DesignDirectiveService")<
  DesignDirectiveService,
  DesignDirectiveServiceInterface
>() {}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Match genres to most appropriate label aesthetic.
 */
const matchLabelAesthetic = (genres: readonly string[]): keyof typeof LABEL_AESTHETICS | null => {
  const genresLower = genres.map((g) => g.toLowerCase());

  // Check each label's applyWhen conditions
  for (const [key, aesthetic] of Object.entries(LABEL_AESTHETICS)) {
    for (const trigger of aesthetic.applyWhen) {
      if (genresLower.some((g) => g.includes(trigger.toLowerCase()))) {
        return key as keyof typeof LABEL_AESTHETICS;
      }
    }
  }

  return null;
};

/**
 * Match era string to aesthetic framework.
 */
const matchEraAesthetic = (era: string | undefined): keyof typeof ERA_AESTHETICS | null => {
  if (!era) return null;

  const eraLower = era.toLowerCase();

  if (eraLower.includes("psych") || eraLower.includes("60s")) return "1960s-psychedelic";
  if (eraLower.includes("prog") || (eraLower.includes("70s") && !eraLower.includes("punk"))) return "1970s-prog";
  if (eraLower.includes("punk") && eraLower.includes("70s")) return "1970s-punk";
  if (eraLower.includes("new wave") || eraLower.includes("80s") || eraLower.includes("post-punk")) return "1980s-new-wave";
  if (eraLower.includes("grunge") || eraLower.includes("90s") || eraLower.includes("alternative")) return "1990s-grunge";
  if (eraLower.includes("2000") || eraLower.includes("minimal")) return "2000s-digital";
  if (eraLower.includes("2010") || eraLower.includes("vintage") || eraLower.includes("neo")) return "2010s-neo-vintage";

  return null;
};

/**
 * KEXP cultural constraints that always apply.
 */
const KEXP_CONSTRAINTS = [
  "Album art is sacred - enhance, never obscure or replace",
  "Equal visual respect for unknown and famous artists (even playing field)",
  "Documentary aesthetic over marketing aesthetic",
  "Embrace imperfection (wabi-sabi) - grain and texture are authentic",
  "Warm undertones preferred (KEXP orange anchor: #F58216)",
  "Music-first: artist name > track title > album > metadata",
  "Avoid generic AI aesthetics (purple gradients, Space Grotesk, clinical smoothness)",
  "Pacific Northwest vinyl den feeling",
];

/**
 * Create the service implementation.
 */
const makeDesignDirectiveService = (): DesignDirectiveServiceInterface => ({
  getDirective: (context) =>
    Effect.sync(() => {
      // Match label aesthetic
      const labelKey = matchLabelAesthetic(context.genres);
      const labelAesthetic = labelKey ? LABEL_AESTHETICS[labelKey] : null;

      // Match era aesthetic
      const eraKey = matchEraAesthetic(context.era);
      const eraAesthetic = eraKey ? ERA_AESTHETICS[eraKey] : null;

      // Build visual language from multiple sources
      const visualLanguage: string[] = [];

      if (labelAesthetic) {
        visualLanguage.push(...labelAesthetic.characteristics.slice(0, 3));
      }

      if (eraAesthetic) {
        visualLanguage.push(...eraAesthetic.visualLanguage.slice(0, 2));
      }

      // Add Japanese aesthetic principles
      visualLanguage.push(
        JAPANESE_AESTHETICS["wabi-sabi"].application[0],
        JAPANESE_AESTHETICS["ma"].application[0],
        JAPANESE_AESTHETICS["kanso"].application[0]
      );

      // Determine color principle
      let colorPrinciple =
        labelAesthetic?.colorPrinciple ??
        eraAesthetic?.colorPrinciple ??
        (context.temperature === "warm"
          ? "Warm palette with amber, gold, and earthy tones"
          : context.temperature === "cool"
            ? "Cool palette with blues, cyans, and silver tones"
            : "Balanced palette derived from album art");

      // Add KEXP warm anchor
      colorPrinciple += ". Anchor with KEXP warm orange (#F58216) as accent.";

      // Typography guidance
      const typographyGuidance =
        labelAesthetic?.typographyPrinciple ??
        "Clear hierarchy: artist name prominent, track secondary, metadata tertiary. IBM Plex Sans for body, avoid generic AI fonts.";

      // Target mood
      const targetMood =
        context.mood ??
        eraAesthetic?.mood ??
        "Authentic, inviting, music-first";

      // Things to avoid
      const avoid = [
        "Generic purple AI gradients",
        "Clinical digital perfection",
        "Marketing/promotional aesthetics",
        "Obscuring or distorting album art",
        "Tiered treatment favoring famous artists",
        "Space Grotesk (overused in AI artifacts)",
        "Flat, lifeless solid colors",
        "Overly saturated neon (unless genre-appropriate)",
      ];

      return {
        primaryReference: labelAesthetic?.name ?? "KEXP Documentary Style",
        visualLanguage,
        colorPrinciple,
        typographyGuidance,
        targetMood,
        kexpConstraints: KEXP_CONSTRAINTS,
        avoid,
        eraContext: eraAesthetic?.name,
      };
    }),

  generatePromptAddendum: (directive) =>
    Effect.sync(() => {
      return `
## DESIGN DIRECTION

**Reference Aesthetic:** ${directive.primaryReference}
${directive.eraContext ? `**Era Context:** ${directive.eraContext}` : ""}

### Visual Language
${directive.visualLanguage.map((v) => `- ${v}`).join("\n")}

### Color Principles
${directive.colorPrinciple}

### Typography
${directive.typographyGuidance}

### Target Mood
${directive.targetMood}

### KEXP Cultural Constraints
${directive.kexpConstraints.map((c) => `- ${c}`).join("\n")}

### AVOID
${directive.avoid.map((a) => `- ${a}`).join("\n")}

Remember: You are a culture-aware art director, not a generic AI. Make decisions that a knowledgeable music curator would respect.
`;
    }),

  getLabelAesthetics: () => Effect.succeed(LABEL_AESTHETICS),
  getEraAesthetics: () => Effect.succeed(ERA_AESTHETICS),
});

// ============================================================================
// Layers
// ============================================================================

export const DesignDirectiveServiceLive: Layer.Layer<DesignDirectiveService> =
  Layer.succeed(DesignDirectiveService, makeDesignDirectiveService());

// ============================================================================
// Convenience Accessors
// ============================================================================

export const getDesignDirective = (context: DesignContext) =>
  Effect.flatMap(DesignDirectiveService, (s) => s.getDirective(context));

export const generateDesignPromptAddendum = (directive: DesignDirective) =>
  Effect.flatMap(DesignDirectiveService, (s) => s.generatePromptAddendum(directive));
