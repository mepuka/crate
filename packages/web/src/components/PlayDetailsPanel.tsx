/**
 * PlayDetailsPanel - Responsive panel for play details
 *
 * Shows detailed information about a selected play.
 * State is URL-synchronized via selectedPlayIdAtom (/?playId=123)
 *
 * Two variants:
 * - "sidebar": In-flow panel for tablet+ (side-by-side with timeline)
 * - "overlay": Fixed overlay for mobile (full-screen modal)
 */

import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react";
import { selectedPlayIdAtom } from "@/atoms/play-details";
import { playAtom } from "@/atoms/timeline";
import {
  artistMbidAtom,
  recordingMbidAtom,
  releaseGroupMbidAtom,
} from "@/atoms/timeline-url-sync";
import { Option } from "effect";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPlayTime } from "@/lib/date-utils";
import { AlbumArt } from "./AlbumArt";
import { X, User, Disc, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommentWithLinks } from "./CommentWithLinks";
import { LinksByCategory } from "./LinksByCategory";

interface PlayDetailsPanelProps {
  /**
   * Panel display variant:
   * - "sidebar": In-flow panel for tablet+ layouts
   * - "overlay": Fixed overlay for mobile layouts
   */
  variant?: "sidebar" | "overlay";
}

export function PlayDetailsPanel({ variant = "overlay" }: PlayDetailsPanelProps) {
  const [selectedId, setSelectedId] = useAtom(selectedPlayIdAtom);

  // Derived: is panel open?
  const isOpen = Option.isSome(selectedId);

  // Close handler - removes playId from URL
  const handleClose = () => setSelectedId(Option.none());

  // Sidebar variant - in-flow panel for tablet+
  if (variant === "sidebar") {
    return (
      <div
        className={cn(
          "h-full overflow-y-auto overflow-x-hidden",
          "transition-opacity duration-300 ease-out",
          isOpen ? "opacity-100" : "opacity-0"
        )}
      >
        {isOpen && (
          <div className="h-full p-4 lg:p-6">
            <div className="relative bg-background rounded-2xl shadow-xl p-4 lg:p-6 border border-primary/10 h-full overflow-y-auto">
              {/* Glassy backdrop layer */}
              <div className="timeline-backdrop" />
              <div className="timeline-backdrop-edge" />

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-20 rounded-lg p-2 bg-card/50 border border-border/50 transition-all hover:bg-primary/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label="Close panel"
              >
                <X className="h-4 w-4 text-foreground/70 hover:text-primary" />
              </button>

              {/* Content */}
              <div className="relative z-10">
                {Option.match(selectedId, {
                  onNone: () => null,
                  onSome: (playId) => (
                    <PlayDetailsContent
                      playId={playId}
                      closePanel={handleClose}
                      compact
                    />
                  ),
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Overlay variant - fixed modal for mobile
  return (
    <>
      {/* Backdrop scrim - darkens background when panel is open */}
      <div
        className={cn(
          "fixed inset-0 bg-background/80 backdrop-blur-sm z-40",
          "transition-opacity duration-200 ease-out",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel content */}
      <div
        className={cn(
          "fixed inset-0 overflow-y-auto overflow-x-hidden z-50",
          "transition-[opacity,transform] duration-200 ease-out",
          isOpen
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-8 pointer-events-none"
        )}
      >
        {isOpen && (
          <div className="min-h-full px-3 pt-8 pb-6 flex justify-center">
            <div className="relative bg-background rounded-2xl shadow-2xl p-4 border border-primary/10 w-full max-w-lg">
              {/* Glassy backdrop layer */}
              <div className="timeline-backdrop" />
              <div className="timeline-backdrop-edge" />

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-20 rounded-lg p-2 bg-card/50 border border-border/50 transition-all hover:bg-primary/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label="Close panel"
              >
                <X className="h-4 w-4 text-foreground/70 hover:text-primary" />
              </button>

              {/* Content */}
              <div className="relative z-10">
                {Option.match(selectedId, {
                  onNone: () => null,
                  onSome: (playId) => (
                    <PlayDetailsContent playId={playId} closePanel={handleClose} />
                  ),
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Hook to create filter handlers that set MBID atoms and close panel.
 * Uses effect-atom setters directly to update URL params.
 */
function useFilterHandlers(closePanel: () => void) {
  const [, setArtistMbid] = useAtom(artistMbidAtom);
  const [, setRecordingMbid] = useAtom(recordingMbidAtom);
  const [, setReleaseGroupMbid] = useAtom(releaseGroupMbidAtom);

  return {
    filterByArtist: (mbid: string) => {
      setArtistMbid(Option.some(mbid));
      closePanel();
    },
    filterByRecording: (mbid: string) => {
      setRecordingMbid(Option.some(mbid));
      closePanel();
    },
    filterByReleaseGroup: (mbid: string) => {
      setReleaseGroupMbid(Option.some(mbid));
      closePanel();
    },
  };
}

interface PlayDetailsContentProps {
  playId: number;
  closePanel: () => void;
  /** Compact mode for sidebar variant - smaller text sizes */
  compact?: boolean;
}

function PlayDetailsContent({ playId, closePanel, compact = false }: PlayDetailsContentProps) {
  const playResult = useAtomValue(playAtom(playId));
  const filters = useFilterHandlers(closePanel);

  return Result.matchWithWaiting(playResult, {
    onWaiting: () => (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="flex gap-3">
          <Skeleton className={cn("shrink-0", compact ? "h-32 w-32" : "h-40 w-40")} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </div>
    ),
    onError: (error) => (
      <div className="text-center py-8">
        <p className="text-destructive mb-2">Error loading play</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    ),
    onDefect: (_defect) => (
      <div className="text-center py-8">
        <p className="text-destructive">Unexpected error loading play</p>
      </div>
    ),
    onSuccess: (success) =>
      Option.match(success.value, {
        onNone: () => (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Play #{playId} not found</p>
          </div>
        ),
        onSome: (play) => {
          const releaseYear = play.release_date
            ? new Date(play.release_date).getFullYear()
            : null;

          const isNonTrackPlay = !play.song && !play.artist && play.comment;

          return (
            <div className={cn("space-y-6", compact && "space-y-4")}>
              {/* Album Art and Info - stacked in compact mode */}
              <div className={cn(
                "flex gap-4",
                compact ? "flex-col" : "flex-col sm:flex-row gap-6"
              )}>
                {/* Album Art */}
                <div className="relative shrink-0 group">
                  <AlbumArt
                    src={play.image_uri || play.thumbnail_uri}
                    alt={isNonTrackPlay ? "Special program segment" : `${play.album} by ${play.artist}`}
                    size={compact ? 200 : 400}
                    className={cn(
                      "rounded-xl shadow-xl shadow-primary/5 ring-1 ring-primary/10",
                      compact ? "w-full max-w-[200px]" : "w-full sm:w-64"
                    )}
                  />
                  {/* Subtle glow on hover */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>

                {/* Info */}
                <div className="flex-1 space-y-3">
                  {/* Title and Artist Info */}
                  <div className="space-y-1.5">
                    {isNonTrackPlay ? (
                      <>
                        <div
                          className="text-xs uppercase tracking-wider"
                          style={{
                            fontSize: 'var(--font-time)',
                            color: 'hsl(var(--foreground) / 0.5)'
                          }}
                        >
                          Special Program Segment
                        </div>
                        <h1
                          className={cn(
                            "font-bold leading-tight",
                            compact ? "text-xl" : "text-2xl sm:text-3xl"
                          )}
                          style={{
                            fontFamily: 'var(--font-family-display)',
                            letterSpacing: '-0.025em',
                            color: 'hsl(var(--foreground))'
                          }}
                        >
                          {play.comment}
                        </h1>
                      </>
                    ) : (
                      <>
                        <h1
                          className={cn(
                            "font-bold leading-tight",
                            compact ? "text-2xl" : "text-3xl sm:text-4xl"
                          )}
                          style={{
                            fontFamily: 'var(--font-family-display)',
                            letterSpacing: '-0.025em',
                            color: 'hsl(var(--foreground))'
                          }}
                        >
                          {play.song || "Untitled"}
                        </h1>
                        <h2
                          className={cn(
                            compact ? "text-base" : "text-lg sm:text-xl"
                          )}
                          style={{
                            fontFamily: 'var(--font-family-body)',
                            fontWeight: 'var(--weight-artist)',
                            color: 'hsl(var(--foreground) / 0.7)'
                          }}
                        >
                          {play.artist || "Unknown Artist"}
                        </h2>
                        {play.album && (
                          <p
                            className={cn(
                              compact ? "text-sm" : "text-base"
                            )}
                            style={{
                              fontFamily: 'var(--font-family-body)',
                              fontWeight: 'var(--weight-artist)',
                              color: 'hsl(var(--foreground) / 0.55)'
                            }}
                          >
                            {play.album}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Play Time */}
                  {play.airdate && (
                    <div className="pt-2">
                      <time
                        className="text-sm font-medium font-mono"
                        dateTime={play.airdate.toISOString()}
                        style={{
                          color: 'hsl(var(--primary))'
                        }}
                      >
                        {formatPlayTime(play.airdate)}
                      </time>
                    </div>
                  )}
                </div>
              </div>

              {/* Details Section */}
              <div className={cn(
                "space-y-4 border-t border-border/50 pt-4",
                compact && "space-y-3 pt-3"
              )}>
                <h3
                  className={cn(
                    "font-bold",
                    compact ? "text-base" : "text-lg"
                  )}
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  Details
                </h3>

                <dl className={cn(
                  "grid grid-cols-[auto_1fr] gap-x-4 gap-y-2",
                  compact ? "text-sm" : "text-sm"
                )}>
                  <dt
                    className="uppercase tracking-wider font-medium"
                    style={{
                      fontSize: 'var(--font-time)',
                      color: 'hsl(var(--foreground) / 0.5)'
                    }}
                  >
                    Play ID
                  </dt>
                  <dd className="font-mono text-accent font-medium">{play.id}</dd>

                  {!isNonTrackPlay && releaseYear && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Released
                      </dt>
                      <dd className="font-mono font-medium">{releaseYear}</dd>
                    </>
                  )}

                  {!isNonTrackPlay && play.rotation_status && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Rotation
                      </dt>
                      <dd className="font-medium">{play.rotation_status}</dd>
                    </>
                  )}

                  {!isNonTrackPlay && play.labels && play.labels.length > 0 && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Labels
                      </dt>
                      <dd className="font-medium">{play.labels.join(", ")}</dd>
                    </>
                  )}

                  {!isNonTrackPlay && play.is_local && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Origin
                      </dt>
                      <dd className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 font-medium text-xs">
                        Local
                      </dd>
                    </>
                  )}

                  {!isNonTrackPlay && play.is_request && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Type
                      </dt>
                      <dd className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 font-medium text-xs">
                        Listener Request
                      </dd>
                    </>
                  )}

                  {!isNonTrackPlay && play.is_live && (
                    <>
                      <dt
                        className="uppercase tracking-wider font-medium"
                        style={{
                          fontSize: 'var(--font-time)',
                          color: 'hsl(var(--foreground) / 0.5)'
                        }}
                      >
                        Performance
                      </dt>
                      <dd className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 font-medium text-xs">
                        Live
                      </dd>
                    </>
                  )}
                </dl>

                {!isNonTrackPlay && play.comment && (
                  <div className={cn(
                    "mt-4 pt-4 border-t border-border/50",
                    compact && "mt-3 pt-3"
                  )}>
                    <h4
                      className={cn(
                        "font-semibold mb-2",
                        compact ? "text-sm" : "text-base"
                      )}
                      style={{
                        fontFamily: 'var(--font-family-display)',
                        letterSpacing: '-0.01em',
                        color: 'hsl(var(--foreground) / 0.8)'
                      }}
                    >
                      DJ Comment
                    </h4>
                    <div className={cn(
                      "leading-relaxed",
                      compact ? "text-sm" : "text-base"
                    )}>
                      <CommentWithLinks playId={play.id} comment={play.comment} variant="details" />
                    </div>
                  </div>
                )}
              </div>

              {/* Links Section */}
              <div className={cn(
                "space-y-3 border-t border-border/30 pt-4 opacity-90",
                compact && "pt-3"
              )}>
                <LinksByCategory playId={play.id} />
              </div>

              {/* Explore KEXP Section - MBID Filter Buttons */}
              {!isNonTrackPlay && (play.artist_mbid?.length || play.release_group_mbid || play.recording_mbid) && (
                <div className={cn(
                  "space-y-3 border-t border-border/50 pt-4",
                  compact && "pt-3"
                )}>
                  <h3
                    className={cn(
                      "font-bold",
                      compact ? "text-base" : "text-lg"
                    )}
                    style={{
                      fontFamily: 'var(--font-family-display)',
                      letterSpacing: '-0.02em'
                    }}
                  >
                    Explore on KEXP
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {/* Artist filter button */}
                    {play.artist_mbid && play.artist_mbid.length > 0 && (
                      <button
                        onClick={() => filters.filterByArtist(play.artist_mbid![0])}
                        className="mbid-link inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/50 border border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all cursor-pointer text-xs"
                      >
                        <User className="h-3.5 w-3.5 text-primary/70" />
                        <span>All by {play.artist}</span>
                      </button>
                    )}

                    {/* Album filter button (release_group) */}
                    {play.release_group_mbid && play.album && (
                      <button
                        onClick={() => filters.filterByReleaseGroup(play.release_group_mbid!)}
                        className="mbid-link inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/50 border border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all cursor-pointer text-xs"
                      >
                        <Disc className="h-3.5 w-3.5 text-primary/70" />
                        <span>From {play.album}</span>
                      </button>
                    )}

                    {/* Recording filter button */}
                    {play.recording_mbid && (
                      <button
                        onClick={() => filters.filterByRecording(play.recording_mbid!)}
                        className="mbid-link inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/50 border border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all cursor-pointer text-xs"
                      >
                        <Music className="h-3.5 w-3.5 text-primary/70" />
                        <span>This track</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Analysis Section Placeholder */}
              <div className={cn(
                "space-y-3 border-t border-border/50 pt-4",
                compact && "pt-3"
              )}>
                <h3
                  className={cn(
                    "font-bold",
                    compact ? "text-base" : "text-lg"
                  )}
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    letterSpacing: '-0.02em',
                    color: 'hsl(var(--foreground) / 0.5)'
                  }}
                >
                  Analysis
                </h3>
                <p
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-family-body)',
                    color: 'hsl(var(--foreground) / 0.5)'
                  }}
                >
                  Detailed play analysis and recommendations will appear here.
                </p>
              </div>
            </div>
          );
        },
      }),
  });
}
