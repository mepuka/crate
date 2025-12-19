/**
 * InlineLinerNote - Editorial Prose with Highlighted Artist Mentions
 *
 * Design Philosophy: "Editorial Record Sleeve"
 * - Flows inline within the card, no modal pop-outs
 * - Artist/band names highlighted with accent styling
 * - Typography inspired by gatefold vinyl liner notes
 * - Stats integrated as subtle margin annotations
 *
 * Aesthetic Reference:
 * - Criterion Collection booklet essays
 * - ECM Records sleeve notes
 * - Pitchfork long-form features
 * - The FADER magazine profiles
 */

import { useMemo, Fragment } from "react";
import { Insights } from "@crate/domain";
import { cn } from "@/lib/utils";
import { TrendingUp, Mic2, Home, Network, Quote } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface InlineLinerNoteProps {
  insight: Insights.Insight;
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  } | undefined;
  className?: string | undefined;
  /** Callback when an artist name is clicked */
  onArtistClick?: ((artistName: string, mbid?: string | null) => void) | undefined;
}

interface ParsedSegment {
  type: "text" | "artist";
  content: string;
  mbid?: string | null | undefined;
}

// ============================================================================
// Artist Name Parser
// ============================================================================

/**
 * Extract known artist names from insight data
 */
function extractKnownArtists(insight: Insights.Insight): Array<{ name: string; mbid?: string | null }> {
  const artists: Array<{ name: string; mbid?: string | null }> = [];

  // Primary artist from the insight
  if ("artist" in insight && insight.artist) {
    artists.push({ name: insight.artist.name, mbid: insight.artist.mbid });
  }

  // Related artist (DJRecommendation)
  if (insight._tag === "DJRecommendation" && insight.relatedArtist) {
    artists.push({ name: insight.relatedArtist.name, mbid: insight.relatedArtist.mbid });
  }

  // Connection artists
  if (insight._tag === "Connection") {
    artists.push({ name: insight.fromArtist.name, mbid: insight.fromArtist.mbid });
    artists.push({ name: insight.toArtist.name, mbid: insight.toArtist.mbid });
  }

  // Scene artists (LocalScene)
  if (insight._tag === "LocalScene" && insight.sceneArtists) {
    for (const artist of insight.sceneArtists) {
      artists.push({ name: artist.name, mbid: artist.mbid });
    }
  }

  return artists;
}

/**
 * Parse narrative text and identify artist mentions
 * Returns segments that can be rendered with highlighting
 */
function parseNarrativeForArtists(
  text: string,
  knownArtists: Array<{ name: string; mbid?: string | null }>
): ParsedSegment[] {
  if (!text || knownArtists.length === 0) {
    return [{ type: "text", content: text }];
  }

  // Build regex pattern for all known artist names (case-insensitive)
  // Sort by length descending to match longer names first (e.g., "Queens of the Stone Age" before "Queens")
  const sortedArtists = [...knownArtists].sort((a, b) => b.name.length - a.name.length);

  // Escape special regex characters in artist names
  const escapedNames = sortedArtists.map(a => ({
    ...a,
    pattern: a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }));

  // Create combined pattern
  const pattern = new RegExp(
    `(${escapedNames.map(a => a.pattern).join("|")})`,
    "gi"
  );

  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index)
      });
    }

    // Find the matching artist (case-insensitive)
    const matchedArtist = knownArtists.find(
      a => a.name.toLowerCase() === match![0].toLowerCase()
    );

    // Add the artist segment
    segments.push({
      type: "artist",
      content: match[0], // Preserve original case from text
      mbid: matchedArtist?.mbid
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex)
    });
  }

  return segments;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Highlighted artist name with interactive styling
 */
const ArtistMention = ({
  name,
  mbid,
  accentColor,
  onClick
}: {
  name: string;
  mbid?: string | null | undefined;
  accentColor: string;
  onClick?: ((name: string, mbid?: string | null) => void) | undefined;
}) => (
  <span
    className={cn(
      "relative inline font-semibold",
      "transition-all duration-200",
      onClick && "cursor-pointer hover:opacity-80"
    )}
    style={{
      color: accentColor,
      textDecorationLine: "underline",
      textDecorationStyle: "solid",
      textDecorationColor: `${accentColor}40`,
      textDecorationThickness: "2px",
      textUnderlineOffset: "3px",
    }}
    onClick={onClick ? () => onClick(name, mbid) : undefined}
    title={onClick ? `View ${name} on KEXP` : undefined}
  >
    {name}
  </span>
);

/**
 * Metadata badge - small inline stat
 */
const MetaBadge = ({
  label,
  value,
  accentColor
}: {
  label: string;
  value: string;
  accentColor: string;
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
      {label}
    </span>
    <span
      className="text-xs font-medium tabular-nums"
      style={{ color: accentColor }}
    >
      {value}
    </span>
  </span>
);

// ============================================================================
// Main Component
// ============================================================================

export const InlineLinerNote = ({
  insight,
  albumPalette,
  className,
  onArtistClick
}: InlineLinerNoteProps) => {
  // Default palette
  const palette = albumPalette ?? {
    dominant: "#E8825B",
    accent: "#4ECDC4",
    temperature: "warm" as const
  };

  // Extract narrative and metadata based on insight type
  const { narrative, title, metadata, quote, icon } = useMemo(() => {
    switch (insight._tag) {
      case "DiscoveryArc":
        return {
          narrative: insight.narrative,
          title: `${insight.artist.name}'s KEXP Journey`,
          metadata: [
            { label: "Plays", value: String(insight.totalPlays) },
            { label: "Debut", value: new Date(insight.firstPlay.date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
            { label: "Status", value: insight.currentStatus }
          ],
          icon: <TrendingUp className="w-4 h-4" />
        };

      case "DJRecommendation":
        return {
          narrative: insight.narrative,
          title: insight.emotionalContext ?? insight.recommendationType.replace(/_/g, " "),
          quote: insight.sourceQuote,
          icon: <Mic2 className="w-4 h-4" />
        };

      case "LocalScene":
        return {
          narrative: insight.narrative,
          title: `${insight.localContext} Scene`,
          metadata: insight.labelName
            ? [{ label: "Label", value: insight.labelName }]
            : undefined,
          icon: <Home className="w-4 h-4" />
        };

      case "Connection":
        return {
          narrative: insight.explanation,
          title: `${insight.fromArtist.name} → ${insight.toArtist.name}`,
          metadata: [
            { label: "Via", value: insight.connectionType.replace(/_/g, " ") }
          ],
          icon: <Network className="w-4 h-4" />
        };

      default:
        return { narrative: "", title: "" };
    }
  }, [insight]);

  // Parse narrative for artist mentions
  const knownArtists = useMemo(() => extractKnownArtists(insight), [insight]);
  const parsedSegments = useMemo(
    () => parseNarrativeForArtists(narrative, knownArtists),
    [narrative, knownArtists]
  );

  if (!narrative) return null;

  return (
    <article
      className={cn(
        "relative",
        "rounded-lg overflow-hidden",
        className
      )}
      style={{
        background: `linear-gradient(
          135deg,
          ${palette.dominant}08 0%,
          ${palette.dominant}04 50%,
          transparent 100%
        )`
      }}
    >
      {/* Subtle left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{
          background: `linear-gradient(
            to bottom,
            ${palette.accent}60 0%,
            ${palette.accent}20 100%
          )`
        }}
      />

      <div className="pl-5 pr-4 py-4 space-y-3">
        {/* Header: Icon + Title */}
        <header className="flex items-center gap-2">
          <span
            className="opacity-60"
            style={{ color: palette.accent }}
          >
            {icon}
          </span>
          <h4
            className="text-[11px] uppercase tracking-[0.15em] font-semibold"
            style={{ color: `${palette.dominant}cc` }}
          >
            {title}
          </h4>
        </header>

        {/* Pull Quote (if exists) */}
        {quote && (
          <blockquote
            className="relative pl-4 py-1 border-l-2 italic"
            style={{
              borderColor: `${palette.accent}40`,
              fontFamily: "'Libre Baskerville', Georgia, serif"
            }}
          >
            <Quote
              className="absolute -left-1 -top-1 w-3 h-3 opacity-30"
              style={{ color: palette.accent }}
            />
            <p className="text-sm text-foreground/70 leading-relaxed">
              "{quote.length > 150 ? quote.slice(0, 150) + "..." : quote}"
            </p>
          </blockquote>
        )}

        {/* Main Narrative with Artist Highlighting */}
        <div
          className="text-[14px] leading-[1.85] text-foreground/85"
          style={{ fontFamily: "'Libre Baskerville', Georgia, serif" }}
        >
          {parsedSegments.map((segment, i) => (
            <Fragment key={i}>
              {segment.type === "artist" ? (
                <ArtistMention
                  name={segment.content}
                  mbid={segment.mbid}
                  accentColor={palette.accent}
                  onClick={onArtistClick}
                />
              ) : (
                segment.content
              )}
            </Fragment>
          ))}
        </div>

        {/* Metadata Footer */}
        {metadata && metadata.length > 0 && (
          <footer className="flex flex-wrap gap-x-5 gap-y-1 pt-2 border-t border-foreground/5">
            {metadata.map((item, i) => (
              <MetaBadge
                key={i}
                label={item.label}
                value={item.value}
                accentColor={palette.dominant}
              />
            ))}
          </footer>
        )}
      </div>
    </article>
  );
};

export default InlineLinerNote;
