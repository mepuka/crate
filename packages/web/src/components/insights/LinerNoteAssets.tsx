/**
 * LinerNoteAssets - Playful Visual Elements for Living Liner Notes
 *
 * A collection of tactile, record-store-inspired visual components that can be
 * generated with AI or rendered as stylized CSS/SVG elements.
 *
 * Design Philosophy:
 * - Each asset feels like something you'd find in a record crate
 * - Playful but not childish - authentic to music culture
 * - Can be AI-generated (via Nano Banana) or pure CSS fallback
 * - Break up the monotony of text-heavy liner notes
 *
 * Asset Types:
 * 1. VinylLabel - Circular record label with stats
 * 2. PolaroidMoment - Instant photo with handwritten caption
 * 3. CatalogCard - Library-style index card
 * 4. RecordStoreTag - Price tag / staff pick sticker
 * 5. BackstagePass - For concert insights
 * 6. CassetteSide - J-card style insert
 * 7. WaxSeal - Milestone badge
 * 8. TornPaper - Ripped paper snippet with quote
 */

import { cn } from "@/lib/utils";
import { Disc3, Heart, Star, MapPin, Calendar, Quote, Music } from "lucide-react";

// ============================================================================
// Shared Types
// ============================================================================

interface AssetPalette {
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
}

const defaultPalette: AssetPalette = {
  primary: "#1a1a1a",
  secondary: "#4a4a4a",
  accent: "#E8825B",
  paper: "#f5f0e6",
};

// ============================================================================
// 1. Vinyl Label - Circular record label with stats
// ============================================================================

interface VinylLabelProps {
  artistName: string;
  trackTitle: string;
  playCount: number;
  label?: string;
  catalogNumber?: string;
  side?: "A" | "B";
  palette?: Partial<AssetPalette>;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const VinylLabel = ({
  artistName,
  trackTitle,
  playCount,
  label = "KEXP",
  catalogNumber: _catalogNumber, // Reserved for future catalog display
  side = "A",
  palette: customPalette,
  size = "md",
  className,
}: VinylLabelProps) => {
  const palette = { ...defaultPalette, ...customPalette };
  const sizes = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64",
  };

  return (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center",
        "shadow-xl transition-transform hover:rotate-12 duration-500",
        sizes[size],
        className
      )}
      style={{
        background: `radial-gradient(circle at 50% 50%,
          ${palette.primary} 0%,
          ${palette.primary} 15%,
          ${palette.secondary} 15.5%,
          ${palette.secondary} 17%,
          ${palette.primary} 17.5%,
          ${palette.primary} 100%
        )`,
      }}
    >
      {/* Vinyl grooves effect */}
      <div
        className="absolute inset-[18%] rounded-full opacity-20"
        style={{
          background: `repeating-radial-gradient(
            circle at center,
            transparent 0px,
            transparent 2px,
            rgba(255,255,255,0.1) 2px,
            rgba(255,255,255,0.1) 3px
          )`,
        }}
      />

      {/* Center label */}
      <div
        className="absolute inset-[25%] rounded-full flex flex-col items-center justify-center p-2 text-center"
        style={{ backgroundColor: palette.accent }}
      >
        {/* Label name at top */}
        <span
          className="text-[8px] uppercase tracking-[0.3em] font-bold opacity-90"
          style={{ color: palette.paper }}
        >
          {label}
        </span>

        {/* Artist & Track */}
        <div className="mt-1 space-y-0.5">
          <p
            className="text-[10px] font-bold leading-tight truncate max-w-full"
            style={{ color: palette.paper }}
          >
            {artistName}
          </p>
          <p
            className="text-[8px] leading-tight truncate max-w-full opacity-80"
            style={{ color: palette.paper }}
          >
            {trackTitle}
          </p>
        </div>

        {/* Play count badge */}
        <div
          className="mt-1.5 px-2 py-0.5 rounded-full text-[7px] font-bold"
          style={{
            backgroundColor: palette.paper,
            color: palette.accent,
          }}
        >
          {playCount} PLAYS
        </div>

        {/* Side indicator */}
        <span
          className="absolute bottom-1 text-[7px] font-bold opacity-60"
          style={{ color: palette.paper }}
        >
          SIDE {side}
        </span>
      </div>

      {/* Center hole */}
      <div
        className="absolute w-3 h-3 rounded-full"
        style={{ backgroundColor: palette.primary }}
      />
    </div>
  );
};

// ============================================================================
// 2. Polaroid Moment - Instant photo with handwritten caption
// ============================================================================

interface PolaroidMomentProps {
  caption: string;
  date?: string;
  venue?: string;
  imageUrl?: string;
  gradient?: string;
  rotation?: number;
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const PolaroidMoment = ({
  caption,
  date,
  venue,
  imageUrl,
  gradient,
  rotation = -3,
  palette: customPalette,
  className,
}: PolaroidMomentProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  return (
    <div
      className={cn(
        "relative w-52 p-3 pb-12 shadow-xl",
        "transition-all duration-300 hover:scale-105 hover:shadow-2xl",
        className
      )}
      style={{
        backgroundColor: palette.paper,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      {/* Photo area */}
      <div
        className="aspect-square w-full overflow-hidden"
        style={{
          background: imageUrl
            ? `url(${imageUrl}) center/cover`
            : gradient || `linear-gradient(135deg, ${palette.accent}40, ${palette.secondary}60)`,
        }}
      >
        {/* Venue overlay if no image */}
        {!imageUrl && venue && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <MapPin className="w-6 h-6 mx-auto mb-2 text-white/60" />
              <p className="text-white/80 text-sm font-medium">{venue}</p>
            </div>
          </div>
        )}
      </div>

      {/* Handwritten caption area */}
      <div className="absolute bottom-2 left-3 right-3">
        <p
          className="text-sm leading-tight"
          style={{
            fontFamily: "'Caveat', 'Comic Sans MS', cursive",
            color: palette.primary,
          }}
        >
          {caption}
        </p>
        {date && (
          <p
            className="text-[10px] mt-1 opacity-60"
            style={{
              fontFamily: "'Caveat', cursive",
              color: palette.secondary,
            }}
          >
            {date}
          </p>
        )}
      </div>

      {/* Tape effect */}
      <div
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 opacity-40"
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,200,0.6), rgba(255,255,200,0.3))",
        }}
      />
    </div>
  );
};

// ============================================================================
// 3. Catalog Card - Library index card style
// ============================================================================

interface CatalogCardProps {
  title: string;
  artist: string;
  entries: Array<{ label: string; value: string }>;
  notes?: string;
  catalogId?: string;
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const CatalogCard = ({
  title,
  artist,
  entries,
  notes,
  catalogId,
  palette: customPalette,
  className,
}: CatalogCardProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  return (
    <div
      className={cn(
        "relative w-72 p-4 rounded-sm shadow-lg",
        "border-t-4",
        className
      )}
      style={{
        backgroundColor: palette.paper,
        borderTopColor: palette.accent,
      }}
    >
      {/* Index card lines */}
      <div
        className="absolute inset-x-4 top-14 bottom-4 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(
            transparent,
            transparent 19px,
            ${palette.secondary}20 19px,
            ${palette.secondary}20 20px
          )`,
        }}
      />

      {/* Red margin line */}
      <div
        className="absolute left-10 top-4 bottom-4 w-px"
        style={{ backgroundColor: `${palette.accent}40` }}
      />

      {/* Header */}
      <div className="relative pl-8 pb-2 border-b" style={{ borderColor: `${palette.secondary}30` }}>
        <h4
          className="text-sm font-bold uppercase tracking-wide truncate"
          style={{ color: palette.primary }}
        >
          {title}
        </h4>
        <p
          className="text-xs opacity-70"
          style={{ color: palette.secondary }}
        >
          {artist}
        </p>
      </div>

      {/* Entries */}
      <div className="relative pl-8 pt-3 space-y-1.5">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span
              className="font-medium uppercase tracking-wide opacity-60 shrink-0 w-16"
              style={{ color: palette.secondary }}
            >
              {entry.label}:
            </span>
            <span style={{ color: palette.primary }}>{entry.value}</span>
          </div>
        ))}
      </div>

      {/* Notes section */}
      {notes && (
        <div className="relative pl-8 pt-3 mt-2 border-t" style={{ borderColor: `${palette.secondary}20` }}>
          <p
            className="text-[11px] leading-relaxed italic"
            style={{ color: palette.secondary }}
          >
            {notes}
          </p>
        </div>
      )}

      {/* Catalog number */}
      {catalogId && (
        <div
          className="absolute top-2 right-2 text-[9px] font-mono opacity-40"
          style={{ color: palette.secondary }}
        >
          {catalogId}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. Record Store Tag - Staff pick / price tag sticker
// ============================================================================

interface RecordStoreTagProps {
  type: "staff-pick" | "local-artist" | "new-arrival" | "classic";
  message: string;
  staffName?: string;
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const RecordStoreTag = ({
  type,
  message,
  staffName,
  palette: customPalette,
  className,
}: RecordStoreTagProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  const typeConfig = {
    "staff-pick": { icon: Heart, label: "STAFF PICK", color: "#e63946" },
    "local-artist": { icon: MapPin, label: "LOCAL", color: "#2d6a4f" },
    "new-arrival": { icon: Star, label: "NEW!", color: palette.accent },
    "classic": { icon: Disc3, label: "CLASSIC", color: "#6c757d" },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-start p-3 max-w-[200px]",
        "rounded-sm shadow-md",
        "transform rotate-[-2deg] hover:rotate-0 transition-transform",
        className
      )}
      style={{ backgroundColor: "#fffbcc" }}
    >
      {/* Type badge */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded-sm mb-2"
        style={{ backgroundColor: config.color }}
      >
        <Icon className="w-3 h-3 text-white" />
        <span className="text-[9px] font-bold text-white tracking-wider">
          {config.label}
        </span>
      </div>

      {/* Message - handwritten style */}
      <p
        className="text-sm leading-snug"
        style={{
          fontFamily: "'Caveat', cursive",
          color: palette.primary,
        }}
      >
        {message}
      </p>

      {/* Staff signature */}
      {staffName && (
        <p
          className="mt-2 text-[10px] self-end"
          style={{
            fontFamily: "'Caveat', cursive",
            color: palette.secondary,
          }}
        >
          — {staffName}
        </p>
      )}

      {/* Tape corner effect */}
      <div
        className="absolute -top-1 -right-1 w-6 h-6 opacity-30"
        style={{
          background: "linear-gradient(135deg, transparent 50%, rgba(200,200,150,0.5) 50%)",
        }}
      />
    </div>
  );
};

// ============================================================================
// 5. Backstage Pass - Concert access badge
// ============================================================================

interface BackstagePassProps {
  artistName: string;
  venue: string;
  date: string;
  accessLevel?: "BACKSTAGE" | "VIP" | "ALL ACCESS";
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const BackstagePass = ({
  artistName,
  venue,
  date,
  accessLevel = "BACKSTAGE",
  palette: customPalette,
  className,
}: BackstagePassProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  return (
    <div
      className={cn(
        "relative w-40 rounded-lg overflow-hidden shadow-xl",
        "transform hover:scale-105 transition-transform",
        className
      )}
      style={{ backgroundColor: palette.primary }}
    >
      {/* Holographic stripe */}
      <div
        className="h-6"
        style={{
          background: `linear-gradient(90deg,
            ${palette.accent},
            #f0c674,
            #4ecdc4,
            ${palette.accent}
          )`,
        }}
      />

      {/* Content */}
      <div className="p-3 text-center">
        <span
          className="text-[10px] font-bold tracking-[0.2em] block"
          style={{ color: palette.paper }}
        >
          {accessLevel}
        </span>

        <h4
          className="mt-2 text-lg font-bold leading-tight"
          style={{ color: palette.paper }}
        >
          {artistName}
        </h4>

        <div className="mt-3 space-y-1">
          <p
            className="text-[10px] flex items-center justify-center gap-1"
            style={{ color: `${palette.paper}90` }}
          >
            <MapPin className="w-3 h-3" />
            {venue}
          </p>
          <p
            className="text-[10px] flex items-center justify-center gap-1"
            style={{ color: `${palette.paper}90` }}
          >
            <Calendar className="w-3 h-3" />
            {date}
          </p>
        </div>
      </div>

      {/* Perforated edge */}
      <div
        className="h-3"
        style={{
          backgroundImage: `radial-gradient(circle, ${palette.primary} 3px, transparent 3px)`,
          backgroundSize: "12px 12px",
          backgroundPosition: "0 -6px",
        }}
      />
    </div>
  );
};

// ============================================================================
// 6. Wax Seal - Milestone badge
// ============================================================================

interface WaxSealProps {
  milestone: string;
  value?: string | number;
  palette?: Partial<AssetPalette>;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const WaxSeal = ({
  milestone,
  value,
  palette: customPalette,
  size = "md",
  className,
}: WaxSealProps) => {
  const palette = { ...defaultPalette, ...customPalette };
  const sizes = { sm: "w-16 h-16", md: "w-24 h-24", lg: "w-32 h-32" };
  const fontSizes = { sm: "text-[8px]", md: "text-[10px]", lg: "text-xs" };
  const valueSizes = { sm: "text-sm", md: "text-xl", lg: "text-3xl" };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        "rounded-full shadow-lg",
        sizes[size],
        className
      )}
      style={{
        background: `radial-gradient(circle at 30% 30%,
          ${palette.accent}ff,
          ${palette.accent}cc 50%,
          ${palette.accent}aa 100%
        )`,
      }}
    >
      {/* Seal texture */}
      <div
        className="absolute inset-0 rounded-full opacity-30"
        style={{
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence baseFrequency='0.5' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="relative text-center z-10">
        {value && (
          <span
            className={cn("font-bold block", valueSizes[size])}
            style={{ color: palette.paper }}
          >
            {value}
          </span>
        )}
        <span
          className={cn("uppercase tracking-wider font-medium", fontSizes[size])}
          style={{ color: palette.paper }}
        >
          {milestone}
        </span>
      </div>

      {/* Scalloped edge */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        style={{ filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.3))" }}
      >
        <defs>
          <clipPath id="scallop">
            {Array.from({ length: 16 }).map((_, i) => {
              const angle = (i / 16) * Math.PI * 2;
              const x = 50 + Math.cos(angle) * 45;
              const y = 50 + Math.sin(angle) * 45;
              return (
                <circle key={i} cx={x} cy={y} r="8" />
              );
            })}
          </clipPath>
        </defs>
      </svg>
    </div>
  );
};

// ============================================================================
// 7. Torn Paper Quote - Ripped paper with quote
// ============================================================================

interface TornPaperQuoteProps {
  quote: string;
  attribution?: string;
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const TornPaperQuote = ({
  quote,
  attribution,
  palette: customPalette,
  className,
}: TornPaperQuoteProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  return (
    <div
      className={cn(
        "relative max-w-sm p-6 shadow-md",
        "transform rotate-[-1deg]",
        className
      )}
      style={{ backgroundColor: palette.paper }}
    >
      {/* Torn edge top */}
      <div
        className="absolute -top-2 left-0 right-0 h-4"
        style={{
          background: palette.paper,
          clipPath: "polygon(0 100%, 5% 60%, 10% 100%, 15% 50%, 20% 100%, 25% 70%, 30% 100%, 35% 40%, 40% 100%, 45% 60%, 50% 100%, 55% 50%, 60% 100%, 65% 70%, 70% 100%, 75% 40%, 80% 100%, 85% 60%, 90% 100%, 95% 50%, 100% 100%)",
        }}
      />

      {/* Quote mark */}
      <Quote
        className="absolute top-2 left-2 w-8 h-8 opacity-10"
        style={{ color: palette.accent }}
      />

      {/* Content */}
      <blockquote
        className="text-base italic leading-relaxed relative z-10"
        style={{
          fontFamily: "'Libre Baskerville', serif",
          color: palette.primary,
        }}
      >
        "{quote}"
      </blockquote>

      {attribution && (
        <p
          className="mt-3 text-sm text-right"
          style={{ color: palette.secondary }}
        >
          — {attribution}
        </p>
      )}

      {/* Torn edge bottom */}
      <div
        className="absolute -bottom-2 left-0 right-0 h-4"
        style={{
          background: palette.paper,
          clipPath: "polygon(0 0, 5% 40%, 10% 0, 15% 50%, 20% 0, 25% 30%, 30% 0, 35% 60%, 40% 0, 45% 40%, 50% 0, 55% 50%, 60% 0, 65% 30%, 70% 0, 75% 60%, 80% 0, 85% 40%, 90% 0, 95% 50%, 100% 0)",
        }}
      />
    </div>
  );
};

// ============================================================================
// 8. Mini Turntable - Spinning record visualization
// ============================================================================

interface MiniTurntableProps {
  isPlaying?: boolean;
  trackTitle: string;
  artistName: string;
  palette?: Partial<AssetPalette>;
  className?: string;
}

export const MiniTurntable = ({
  isPlaying = true,
  trackTitle,
  artistName,
  palette: customPalette,
  className,
}: MiniTurntableProps) => {
  const palette = { ...defaultPalette, ...customPalette };

  return (
    <div
      className={cn(
        "relative w-64 h-48 rounded-lg overflow-hidden shadow-xl",
        className
      )}
      style={{ backgroundColor: "#2a2a2a" }}
    >
      {/* Platter */}
      <div
        className={cn(
          "absolute left-4 top-4 w-36 h-36 rounded-full",
          isPlaying && "animate-spin"
        )}
        style={{
          background: `radial-gradient(circle,
            #111 0%,
            #111 20%,
            #333 20.5%,
            #333 21%,
            #111 21.5%,
            #111 100%
          )`,
          animationDuration: "2s",
        }}
      >
        {/* Label */}
        <div
          className="absolute inset-[28%] rounded-full flex items-center justify-center"
          style={{ backgroundColor: palette.accent }}
        >
          <Music className="w-4 h-4" style={{ color: palette.paper }} />
        </div>
      </div>

      {/* Tonearm */}
      <div className="absolute right-8 top-6 w-1 h-20 bg-gray-400 origin-top rotate-[-30deg] rounded-full">
        <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-gray-500 rounded-full" />
      </div>

      {/* Now Playing info */}
      <div className="absolute bottom-3 left-4 right-4">
        <div className="flex items-center gap-2">
          {isPlaying && (
            <div className="flex gap-0.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-green-400 rounded-full animate-pulse"
                  style={{
                    height: `${8 + i * 4}px`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          )}
          <div className="truncate">
            <p className="text-xs font-medium text-white truncate">{trackTitle}</p>
            <p className="text-[10px] text-gray-400 truncate">{artistName}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Prompt Templates for AI Generation
// ============================================================================

export const assetPromptTemplates = {
  vinylLabel: (artist: string, track: string, plays: number, palette: AssetPalette) => `
Create a realistic vinyl record label design.

SUBJECT:
- Circular record label (45 RPM single style)
- Artist: "${artist}"
- Track: "${track}"
- Play count: "${plays} plays on KEXP"

VISUAL STYLE:
- Vintage record label aesthetic (Capitol, Atlantic, Motown influence)
- Primary color: ${palette.accent}
- Texture: subtle paper grain
- Typography: bold sans-serif for label name, elegant serif for artist
- Include: catalog number, side indicator (A/B)

COMPOSITION:
- Perfectly circular
- Central spindle hole
- Concentric design elements
- Text arranged in traditional label layout

OUTPUT: Square image, 2K resolution
`,

  polaroidMoment: (venue: string, date: string, caption: string, palette: AssetPalette) => `
Create a Polaroid-style instant photograph.

SCENE:
- Concert venue: "${venue}"
- Atmosphere: intimate live music moment
- Lighting: warm stage lights, slight motion blur

POLAROID FRAME:
- Classic white Polaroid border
- Slightly yellowed/vintage paper tone
- Handwritten caption area at bottom

CAPTION (handwritten style):
"${caption}"
Date: ${date}

MOOD:
- Nostalgic, authentic
- Like a treasured photo from a memorable show
- Warm color temperature: ${palette.accent}

OUTPUT: Portrait aspect ratio, 2K resolution
`,

  catalogCard: (entries: string, notes: string) => `
Create a library catalog card design for a music archive.

CARD STYLE:
- Classic library index card (3x5 aspect ratio)
- Cream/ivory paper color
- Horizontal ruled lines (light blue)
- Red vertical margin line on left

CONTENT:
${entries}

NOTES SECTION:
"${notes}"

AESTHETIC:
- Typewriter font for entries
- Handwritten italic for notes
- Slight age/wear on edges
- Authentic archival feel

OUTPUT: Landscape aspect ratio, 2K resolution
`,

  waxSeal: (milestone: string, value: string, color: string) => `
Create a wax seal stamp design.

SEAL CONTENT:
- Central text: "${value}"
- Surrounding text: "${milestone}"

VISUAL STYLE:
- Realistic wax seal texture
- Color: ${color}
- Slightly irregular edges (hand-pressed look)
- Subtle shine/highlight
- Deep impression texture

COMPOSITION:
- Circular seal
- Scalloped or irregular outer edge
- Central embossed design

OUTPUT: Square image, transparent background preferred, 1K resolution
`,
};

// ============================================================================
// Export Component Collection
// ============================================================================

export const LinerNoteAssets = {
  VinylLabel,
  PolaroidMoment,
  CatalogCard,
  RecordStoreTag,
  BackstagePass,
  WaxSeal,
  TornPaperQuote,
  MiniTurntable,
  prompts: assetPromptTemplates,
};

export default LinerNoteAssets;
