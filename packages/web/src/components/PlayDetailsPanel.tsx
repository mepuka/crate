/**
 * PlayDetailsPanel - Side-by-side panel for play details
 *
 * Shows detailed information about a selected play in a sliding panel.
 * State is URL-synchronized via selectedPlayIdAtom (/?playId=123)
 *
 * Unlike Sheet overlay, this panel exists in the document flow allowing
 * both the timeline and panel to be scrolled independently.
 */

import { useAtom, useAtomValue, Result } from "@effect-atom/atom-react";
import { selectedPlayIdAtom } from "@/atoms/play-details";
import { playAtom } from "@/atoms/timeline";
import { Option } from "effect";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPlayTime } from "@/lib/date-utils";
import { AlbumArt } from "./AlbumArt";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommentWithLinks } from "./CommentWithLinks";
import { LinksByCategory } from "./LinksByCategory";

// Era calculation for release year - Temporal Design System
function getEraCategory(releaseYear: number | null): {
  category: 'modern' | 'contemporary' | 'recent' | 'classic' | 'vintage' | 'golden' | null
  label: string
} {
  if (!releaseYear) return { category: null, label: '' }

  const currentYear = new Date().getFullYear()
  const age = currentYear - releaseYear

  if (age <= 5) return { category: 'modern', label: '2020s' }
  if (age <= 15) return { category: 'contemporary', label: '2010s' }
  if (age <= 25) return { category: 'recent', label: '2000s' }
  if (age <= 35) return { category: 'classic', label: '1990s' }
  if (age <= 45) return { category: 'vintage', label: '1980s' }
  return { category: 'golden', label: `${Math.floor(releaseYear / 10) * 10}s` }
}

export function PlayDetailsPanel() {
  const [selectedId, setSelectedId] = useAtom(selectedPlayIdAtom);

  // Derived: is panel open?
  const isOpen = Option.isSome(selectedId);

  // Close handler - removes playId from URL
  const handleClose = () => setSelectedId(Option.none());

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-screen overflow-y-auto",
        "transition-all duration-300 ease-in-out",
        isOpen ? "w-full lg:w-2/3" : "w-0 opacity-0"
      )}
    >
      {isOpen && (
        <div className="h-full px-4 sm:px-6 lg:px-10 pt-20 pb-12">
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

            {/* Content */}
            <div className="relative z-10">
              {Option.match(selectedId, {
                onNone: () => null,
                onSome: (playId) => <PlayDetailsContent playId={playId} />,
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlayDetailsContentProps {
  playId: number;
}

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
        onSome: (play) => {
          const releaseYear = play.release_date
            ? new Date(play.release_date).getFullYear()
            : null;

          const isNonTrackPlay = !play.song && !play.artist && play.comment;

          // Calculate era for temporal design
          const era = getEraCategory(releaseYear);

          return (
            <div className="space-y-8">
              {/* Album Art and Info Side by Side */}
              <div className="flex flex-col sm:flex-row gap-8">
                {/* Album Art - Left */}
                <div className="relative shrink-0 group">
                  <AlbumArt
                    src={play.image_uri || play.thumbnail_uri}
                    alt={isNonTrackPlay ? "Special program segment" : `${play.album} by ${play.artist}`}
                    size={400}
                    className="w-full sm:w-80 rounded-2xl shadow-2xl shadow-primary/5 ring-1 ring-primary/10"
                  />
                  {/* Subtle glow on hover */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>

                {/* Info - Right */}
                <div className="flex-1 space-y-6">
                  {/* Title and Artist Info - Extreme size contrast */}
                  <div className="space-y-3">
                    {isNonTrackPlay ? (
                      <>
                        <div className="text-xs uppercase tracking-wider mb-2"
                          style={{
                            fontSize: 'var(--font-time)',
                            color: 'hsl(var(--foreground) / 0.5)'
                          }}
                        >
                          Special Program Segment
                        </div>
                        <h1
                          className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight"
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
                          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight"
                          style={{
                            fontFamily: 'var(--font-family-display)',
                            letterSpacing: '-0.025em',
                            color: 'hsl(var(--foreground))'
                          }}
                        >
                          {play.song || "Untitled"}
                        </h1>
                        <h2
                          className="text-xl sm:text-2xl lg:text-3xl"
                          style={{
                            fontFamily: 'var(--font-family-body)',
                            fontWeight: 'var(--weight-artist)',
                            color: 'hsl(var(--foreground) / 0.7)'
                          }}
                        >
                          {play.artist || "Unknown Artist"}
                        </h2>
                        {play.album && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <p
                              className="text-base sm:text-lg"
                              style={{
                                fontFamily: 'var(--font-family-body)',
                                fontWeight: 'var(--weight-artist)',
                                color: 'hsl(var(--foreground) / 0.55)'
                              }}
                            >
                              {play.album}
                            </p>
                            {releaseYear && era.category && (
                              <span className={cn("era-badge text-sm px-3 py-1.5", `era-${era.category}`)}>
                                {releaseYear} • {era.label}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Play Time - Temporal indicator in orange */}
                  {play.airdate && (
                    <div className="pt-4">
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
              <div className="space-y-5 border-t border-border/50 pt-6">
                <h3
                  className="text-xl font-bold"
                  style={{
                    fontFamily: 'var(--font-family-display)',
                    letterSpacing: '-0.02em'
                  }}
                >
                  Details
                </h3>

                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
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
                      <dd className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 text-green-500 font-medium text-xs">
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
                      <dd className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-500 font-medium text-xs">
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
                      <dd className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 text-red-500 font-medium text-xs">
                        Live
                      </dd>
                    </>
                  )}
                </dl>

                {!isNonTrackPlay && play.comment && (
                  <div className="mt-6 pt-6 border-t border-border/50">
                    <h4
                      className="font-semibold mb-3"
                      style={{
                        fontFamily: 'var(--font-family-display)',
                        fontSize: 'var(--font-artist)',
                        letterSpacing: '-0.01em',
                        color: 'hsl(var(--foreground) / 0.7)'
                      }}
                    >
                      DJ Comment
                    </h4>
                    <CommentWithLinks playId={play.id} comment={play.comment} variant="details" />
                  </div>
                )}
              </div>

              {/* Links Section */}
              <div className="space-y-5 border-t border-border/50 pt-6">
                <LinksByCategory playId={play.id} />
              </div>

              {/* Future Analysis Section Placeholder */}
              <div className="space-y-4 border-t border-border/50 pt-6">
                <h3
                  className="text-xl font-bold"
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

