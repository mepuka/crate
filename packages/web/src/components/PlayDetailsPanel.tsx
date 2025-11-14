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
import { formatPlayTime, formatRelativeTime } from "@/lib/date-utils";
import { AlbumArt } from "./AlbumArt";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
        <div className="h-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="relative bg-background rounded-lg shadow-xl p-6 border border-white/10 min-h-full">
            {/* Glassy backdrop layer - same as timeline */}
            <div className="timeline-backdrop" />
            {/* Glassy border edge */}
            <div className="timeline-backdrop-edge" />
            
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-20 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close panel"
            >
              <X className="h-6 w-6" />
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
          const releaseYear = play.airdate
            ? new Date(play.airdate).getFullYear()
            : null;

          return (
            <div className="space-y-6">
              {/* Title */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                  {play.song || "Untitled"}
                </h1>
              </div>

              {/* Album Art & Primary Info */}
              <div className="flex gap-6">
                <AlbumArt
                  src={play.thumbnail_uri || play.image_uri}
                  alt={`${play.album} by ${play.artist}`}
                  size={200}
                  className="shrink-0"
                />
                <div className="flex-1 space-y-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {play.artist || "Unknown Artist"}
                    </h2>
                    {play.album && (
                      <p className="text-lg text-muted-foreground">
                        {play.album}
                        {releaseYear && ` • ${releaseYear}`}
                      </p>
                    )}
                  </div>

                  {play.airdate && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Played {formatRelativeTime(play.airdate)}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {formatPlayTime(play.airdate)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Details Section */}
              <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-lg font-semibold">Details</h3>

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Play ID</dt>
                  <dd className="font-mono">{play.id}</dd>

                  {play.rotation_status && (
                    <>
                      <dt className="text-muted-foreground">Rotation</dt>
                      <dd>{play.rotation_status}</dd>
                    </>
                  )}

                  {play.labels && play.labels.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">Labels</dt>
                      <dd>{play.labels.join(", ")}</dd>
                    </>
                  )}

                  {play.is_local && (
                    <>
                      <dt className="text-muted-foreground">Origin</dt>
                      <dd>Local</dd>
                    </>
                  )}

                  {play.is_request && (
                    <>
                      <dt className="text-muted-foreground">Type</dt>
                      <dd>Listener Request</dd>
                    </>
                  )}

                  {play.is_live && (
                    <>
                      <dt className="text-muted-foreground">Performance</dt>
                      <dd>Live</dd>
                    </>
                  )}
                </dl>

                {play.comment && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Comment
                    </h4>
                    <p className="text-sm italic">{play.comment}</p>
                  </div>
                )}
              </div>

              {/* Future Analysis Section Placeholder */}
              <div className="space-y-4 border-t border-border pt-4">
                <h3 className="text-lg font-semibold text-muted-foreground">
                  Analysis
                </h3>
                <p className="text-sm text-muted-foreground">
                  Detailed play analysis and recommendations will appear here.
                </p>
              </div>
            </div>
          );
        },
      }),
  });
}

