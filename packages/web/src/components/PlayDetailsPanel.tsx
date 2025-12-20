/**
 * PlayDetailsPanel - Side-by-side panel for play details
 *
 * Shows detailed information about a selected play in a sliding panel.
 * State is URL-synchronized via selectedPlayIdAtom (/?playId=123)
 *
 * Now with dynamic album palette theming:
 * - Extracts colors from album art
 * - Applies glow effects and gradients
 * - Passes palette through to insight components
 */

import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react";
import { selectedPlayIdAtom } from "@/atoms/play-details";
import { playAtom } from "@/atoms/timeline";
import { streamingLinksForPlayAtom } from "@/atoms/streaming-links";
import { albumPaletteAtom, DEFAULT_PALETTE, type AlbumPalette } from "@/atoms/album-palette";
import { Option } from "effect";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSemanticTime } from "@/lib/date-utils";
import { AlbumArt } from "./AlbumArt";
import { StreamingLinks } from "./StreamingLinks";
import { X } from "lucide-react";
import { InsightPanel } from "./insights/InsightPanel";
import { LinksByCategory } from "./LinksByCategory";

export function PlayDetailsPanel() {
  const [selectedId, setSelectedId] = useAtom(selectedPlayIdAtom);

  // Derived: is panel open?
  const isOpen = Option.isSome(selectedId);

  // Close handler - removes playId from URL
  const handleClose = () => setSelectedId(Option.none());

  // Parent controls visibility, this just renders the content
  if (!isOpen) return null;

  return (
    <div className="h-full px-4 sm:px-6 pt-12 pb-12 overflow-y-auto">
      <div className="relative bg-background rounded-2xl shadow-2xl p-8 sm:p-10 border border-primary/10 min-h-full backdrop-blur-sm">
            {/* Glassy backdrop layer - same as timeline */}
            <div className="timeline-backdrop" />
            {/* Glassy border edge */}
            <div className="timeline-backdrop-edge" />

            {/* Close button - enhanced with radio glow */}
            <button
              onClick={handleClose}
              className="absolute top-6 right-6 z-20 rounded-lg p-2.5 bg-card/50 border border-border/50 transition-all hover:bg-primary/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Close panel"
            >
              <X className="h-5 w-5 text-foreground/70 hover:text-primary" />
            </button>

            {/* Content - with padding to clear close button */}
            <div className="relative z-10 pr-12">
              {Option.match(selectedId, {
                onNone: () => null,
                onSome: (playId) => <PlayDetailsContent playId={playId} />,
              })}
            </div>
      </div>
    </div>
  );
}

interface PlayDetailsContentProps {
  playId: number;
}

/**
 * Get a simplified palette for components (just dominant, accent, temperature)
 */
const getSimplePalette = (palette: AlbumPalette) => ({
  dominant: palette.dominant,
  accent: palette.accent,
  temperature: palette.temperature,
});

function PlayDetailsContent({ playId }: PlayDetailsContentProps) {
  const playResult = useAtomValue(playAtom(playId));

  return Result.matchWithWaiting(playResult, {
    onWaiting: () => (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-40 w-40 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </div>
    ),
    onError: (error) => (
      <div className="text-center py-12">
        <p className="text-destructive mb-2">Error loading play</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    ),
    onDefect: (_defect) => (
      <div className="text-center py-12">
        <p className="text-destructive">Unexpected error loading play</p>
      </div>
    ),
    onSuccess: (success) =>
      Option.match(success.value, {
        onNone: () => (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Play #{playId} not found</p>
          </div>
        ),
        onSome: (play) => (
          <PlayDetailsInner play={play} />
        ),
      }),
  });
}

/**
 * Inner component that has access to play data for palette extraction
 */
function PlayDetailsInner({ play }: { play: {
  id: number;
  song?: string | null;
  artist?: string | null;
  album?: string | null;
  comment?: string | null;
  image_uri?: string | null;
  thumbnail_uri?: string | null;
  release_date?: Date | null;
  airdate?: Date;
  is_live?: boolean;
  is_request?: boolean;
  is_local?: boolean;
  rotation_status?: string | null;
  labels?: readonly string[] | null;
}}) {
  // Get album palette from image
  const imageUrl = play.image_uri || play.thumbnail_uri || null;
  const paletteResult = useAtomValue(albumPaletteAtom(imageUrl));

  // Get streaming links (Spotify, Apple Music, etc.)
  const streamingLinksResult = useAtomValue(streamingLinksForPlayAtom(play.id));

  // Extract palette with fallback
  const palette = Result.matchWithWaiting(paletteResult, {
    onWaiting: () => DEFAULT_PALETTE,
    onSuccess: (s) => s.value,
    onError: () => DEFAULT_PALETTE,
    onDefect: () => DEFAULT_PALETTE,
  });

  const releaseYear = play.release_date
    ? new Date(play.release_date).getFullYear()
    : null;

  const isNonTrackPlay = !play.song && !play.artist && play.comment;

  return (
    <div className="space-y-6">
      {/* Ambient glow from album colors */}
      <div
        className="absolute inset-0 rounded-2xl opacity-40 pointer-events-none transition-opacity duration-700"
        style={{
          background: palette.gradientCss,
        }}
      />

      {/* Album Art and Track Info - Side by Side */}
      <div className="flex flex-col sm:flex-row gap-6 relative">
        {/* Album Art - Left with glow */}
        <div className="relative shrink-0">
          {/* Glow effect behind album art */}
          <div
            className="absolute -inset-4 rounded-2xl blur-2xl opacity-30 transition-all duration-500"
            style={{ backgroundColor: palette.glowColor }}
          />
          <AlbumArt
            src={imageUrl}
            alt={isNonTrackPlay ? "Special program segment" : `${play.album} by ${play.artist}`}
            size={400}
            className="w-full sm:w-56 rounded-xl shadow-xl ring-1 ring-white/10 relative"
          />
        </div>

        {/* Track Info Only - Right */}
        <div className="flex-1 space-y-3">
          {isNonTrackPlay ? (
            <>
              <div className="text-xs uppercase tracking-wider text-muted-foreground/60">
                Program Segment
              </div>
              <h1
                className="text-2xl sm:text-3xl font-bold leading-tight break-words"
                style={{
                  fontFamily: 'var(--font-family-display)',
                  letterSpacing: '-0.02em',
                  wordBreak: 'break-word'
                }}
              >
                {play.comment}
              </h1>
            </>
          ) : (
            <>
              {/* Song Title - with palette accent on hover */}
              <h1
                className="text-2xl sm:text-3xl font-bold leading-tight break-words transition-colors"
                style={{
                  fontFamily: 'var(--font-family-display)',
                  letterSpacing: '-0.02em',
                  wordBreak: 'break-word'
                }}
              >
                {play.song || "Untitled"}
              </h1>
              {/* Artist - subtle palette tint */}
              <h2
                className="text-lg transition-colors"
                style={{
                  fontFamily: 'var(--font-family-body)',
                  color: `${palette.dominant}cc`
                }}
              >
                {play.artist || "Unknown Artist"}
              </h2>
              {/* Album • Year • Label */}
              {(play.album || releaseYear || (play.labels && play.labels.length > 0)) && (
                <p className="text-sm text-muted-foreground">
                  {[
                    play.album,
                    releaseYear,
                    play.labels?.join(", ")
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          )}

          {/* Time + Status Badges - themed with palette */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {play.airdate && (
              <time
                className="text-sm font-medium transition-colors"
                dateTime={play.airdate.toISOString()}
                style={{ color: palette.accent }}
              >
                {formatSemanticTime(play.airdate)}
              </time>
            )}
            {!isNonTrackPlay && play.is_live && (
              <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-xs font-medium">
                Live
              </span>
            )}
            {!isNonTrackPlay && play.is_request && (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-xs font-medium">
                Request
              </span>
            )}
            {!isNonTrackPlay && play.is_local && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${palette.accent}20`,
                  color: palette.accent
                }}
              >
                Local Artist
              </span>
            )}
            {!isNonTrackPlay && play.rotation_status && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${palette.dominant}15`,
                  color: palette.dominant
                }}
              >
                {play.rotation_status}
              </span>
            )}
            {/* Streaming Links - subtle inline icons */}
            {!isNonTrackPlay && (
              <StreamingLinks
                links={Result.matchWithWaiting(streamingLinksResult, {
                  onWaiting: () => [],
                  onSuccess: (s) => Option.match(s.value, {
                    onNone: () => [],
                    onSome: (response) => response.links,
                  }),
                  onError: () => [],
                  onDefect: () => [],
                })}
                isLoading={Result.isWaiting(streamingLinksResult)}
                className="ml-auto"
              />
            )}
          </div>
        </div>
      </div>

      {/* Living Liner Notes (Insights & Comments) - with palette */}
      {!isNonTrackPlay && (
        <InsightPanel
          playId={play.id}
          comment={play.comment}
          releaseYear={releaseYear}
          rotationStatus={play.rotation_status}
          isLocal={play.is_local}
          airdate={play.airdate}
          albumPalette={getSimplePalette(palette)}
        />
      )}

      {/* External Links */}
      <div className="opacity-80">
        <LinksByCategory playId={play.id} />
      </div>

      {/* Footer - Play ID with subtle palette accent */}
      <div
        className="pt-4 flex items-center justify-end"
        style={{ borderTop: `1px solid ${palette.dominant}15` }}
      >
        <span className="text-xs text-muted-foreground/40 font-mono">
          #{play.id}
        </span>
      </div>
    </div>
  );
}

