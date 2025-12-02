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
import { formatSemanticTime } from "@/lib/date-utils";
import { AlbumArt } from "./AlbumArt";
import { X, User, Disc, Music } from "lucide-react";
import { CommentWithLinks } from "./CommentWithLinks";
import { LinksByCategory } from "./LinksByCategory";
import { Link } from "@tanstack/react-router";

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

          return (
            <div className="space-y-6">
              {/* Album Art and Track Info - Side by Side */}
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Album Art - Left */}
                <div className="relative shrink-0">
                  <AlbumArt
                    src={play.image_uri || play.thumbnail_uri}
                    alt={isNonTrackPlay ? "Special program segment" : `${play.album} by ${play.artist}`}
                    size={400}
                    className="w-full sm:w-56 rounded-xl shadow-xl ring-1 ring-white/10"
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
                      {/* Song Title */}
                      <h1
                        className="text-2xl sm:text-3xl font-bold leading-tight break-words"
                        style={{
                          fontFamily: 'var(--font-family-display)',
                          letterSpacing: '-0.02em',
                          wordBreak: 'break-word'
                        }}
                      >
                        {play.song || "Untitled"}
                      </h1>
                      {/* Artist */}
                      <h2
                        className="text-lg text-foreground/70"
                        style={{ fontFamily: 'var(--font-family-body)' }}
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

                  {/* Time + Status Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {play.airdate && (
                      <time
                        className="text-sm text-primary font-medium"
                        dateTime={play.airdate.toISOString()}
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
                      <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-xs font-medium">
                        Local
                      </span>
                    )}
                    {!isNonTrackPlay && play.rotation_status && (
                      <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium">
                        {play.rotation_status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* DJ Comment - Below the header section */}
              {!isNonTrackPlay && play.comment && (
                <div
                  className="text-base leading-relaxed text-foreground/90 italic border-l-2 border-primary/30 pl-4"
                >
                  <CommentWithLinks playId={play.id} comment={play.comment} variant="details" />
                </div>
              )}

              {/* Explore KEXP - Action buttons */}
              {!isNonTrackPlay && (play.artist_mbid?.length || play.release_group_mbid || play.recording_mbid) && (
                <div className="flex flex-wrap gap-2">
                  {play.artist_mbid && play.artist_mbid.length > 0 && (
                    <Link
                      to="/artist/$mbid"
                      params={{ mbid: play.artist_mbid[0] }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/50 border border-border/30 hover:bg-primary/10 hover:border-primary/30 transition-all text-sm"
                    >
                      <User className="h-3.5 w-3.5 text-primary/70" />
                      <span>More by {play.artist}</span>
                    </Link>
                  )}
                  {play.release_group_mbid && play.album && (
                    <Link
                      to="/album/$mbid"
                      params={{ mbid: play.release_group_mbid }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/50 border border-border/30 hover:bg-primary/10 hover:border-primary/30 transition-all text-sm"
                    >
                      <Disc className="h-3.5 w-3.5 text-primary/70" />
                      <span>From this album</span>
                    </Link>
                  )}
                  {play.recording_mbid && (
                    <Link
                      to="/recording/$mbid"
                      params={{ mbid: play.recording_mbid }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/50 border border-border/30 hover:bg-primary/10 hover:border-primary/30 transition-all text-sm"
                    >
                      <Music className="h-3.5 w-3.5 text-primary/70" />
                      <span>This track</span>
                    </Link>
                  )}
                </div>
              )}

              {/* External Links */}
              <div className="opacity-80">
                <LinksByCategory playId={play.id} />
              </div>

              {/* Footer - Analysis placeholder + Play ID */}
              <div className="pt-4 border-t border-border/20 flex items-center justify-between">
                <p className="text-xs text-muted-foreground/50">
                  Analysis coming soon
                </p>
                <span className="text-xs text-muted-foreground/40 font-mono">
                  #{play.id}
                </span>
              </div>
            </div>
          );
        },
      }),
  });
}

