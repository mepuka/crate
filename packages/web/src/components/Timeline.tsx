import { useAtomValue, useAtomMount, Result } from '@effect-atom/atom-react'
import { Chunk, Option } from 'effect'
import {
  latestItemAtom,
  playIdsAtom,
  playsChunkAtom,
  playsSortedByAirdateDescAtom,
  newestPlayAtom,
  oldestPlayAtom,
} from '@/atoms/timeline'
import { DevAtomDisplay } from './DevAtomDisplay'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineSkeleton } from './TimelineSkeleton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineErrorState } from './TimelineErrorState'
import { TimelinePlayCardWrapper } from './TimelinePlayCardWrapper'
import { SearchWorkerTest } from './SearchWorkerTest'

export function Timeline() {
  // Mount the background fetching service
  useAtomMount(latestItemAtom);

  // Get reactive play IDs - automatically updates when KVS changes
  const playIds = useAtomValue(playIdsAtom);

  // Demo: Get derived atoms using timeline utilities
  const playsChunk = useAtomValue(playsChunkAtom);
  const sortedPlays = useAtomValue(playsSortedByAirdateDescAtom);
  const newestPlay = useAtomValue(newestPlayAtom);
  const oldestPlay = useAtomValue(oldestPlayAtom);

  return (
    <>
      <SearchWorkerTest />
      <DevAtomDisplay />
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-1">
            Timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            KEXP play history
          </p>
        </div>

        {/* Demo Section: Derived Atoms using Timeline Utilities */}
        <div className="mb-8 border-b border-border/50 pb-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wide">
            Debug Info
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex">
              <dt className="text-muted-foreground w-32">Chunk Size:</dt>
              <dd className="text-foreground font-mono">
                {Result.matchWithWaiting(playsChunk, {
                  onWaiting: () => <Skeleton className="inline-block h-4 w-8" />,
                  onError: () => <span className="text-destructive">Error</span>,
                  onDefect: () => <span className="text-destructive">Defect</span>,
                  onSuccess: (s) => Chunk.size(s.value),
                })}
              </dd>
            </div>
            <div className="flex">
              <dt className="text-muted-foreground w-32">Sorted Size:</dt>
              <dd className="text-foreground font-mono">
                {Result.matchWithWaiting(sortedPlays, {
                  onWaiting: () => <Skeleton className="inline-block h-4 w-8" />,
                  onError: () => <span className="text-destructive">Error</span>,
                  onDefect: () => <span className="text-destructive">Defect</span>,
                  onSuccess: (s) => Chunk.size(s.value),
                })}
              </dd>
            </div>
            <div className="flex">
              <dt className="text-muted-foreground w-32">Newest:</dt>
              <dd className="text-foreground">
                {Result.matchWithWaiting(newestPlay, {
                  onWaiting: () => <Skeleton className="inline-block h-4 w-32" />,
                  onError: () => <span className="text-destructive">Error</span>,
                  onDefect: () => <span className="text-destructive">Defect</span>,
                  onSuccess: (s) =>
                    Option.match(s.value, {
                      onNone: () => <span className="text-muted-foreground">—</span>,
                      onSome: (play) => `${play.artist} — ${play.song}`,
                    }),
                })}
              </dd>
            </div>
            <div className="flex">
              <dt className="text-muted-foreground w-32">Oldest:</dt>
              <dd className="text-foreground">
                {Result.matchWithWaiting(oldestPlay, {
                  onWaiting: () => <Skeleton className="inline-block h-4 w-32" />,
                  onError: () => <span className="text-destructive">Error</span>,
                  onDefect: () => <span className="text-destructive">Defect</span>,
                  onSuccess: (s) =>
                    Option.match(s.value, {
                      onNone: () => <span className="text-muted-foreground">—</span>,
                      onSome: (play) => `${play.artist} — ${play.song}`,
                    }),
                })}
              </dd>
            </div>
          </dl>
        </div>

        {Result.matchWithWaiting(playIds, {
          onWaiting: () => (
            <div className="space-y-4">
              <TimelineSkeleton count={5} />
            </div>
          ),
          onError: (error) => (
            <TimelineErrorState error={error} />
          ),
          onDefect: (defect) => (
            <TimelineErrorState error={defect} />
          ),
          onSuccess: (success) => (
            <>
              {success.value.length > 0 && (
                <div className="mb-4 text-xs text-muted-foreground">
                  {success.value.length} play{success.value.length !== 1 ? 's' : ''}
                </div>
              )}
              {success.value.length === 0 ? (
                <TimelineEmptyState
                  message="Waiting for plays"
                  description="Waiting for plays from the background service. New plays will appear here automatically."
                />
              ) : (
                <div className="space-y-1">
                  {success.value.map((id) => (
                    <TimelinePlayCardWrapper key={id} playId={id} />
                  ))}
                </div>
              )}
            </>
          ),
        })}
      </div>
    </>
  )
}
