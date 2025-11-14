import { useAtomValue, useAtomMount, Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import {
  latestItemAtom,
  playIdsAtom,
  newestPlayAtom,
} from '@/atoms/timeline'
import { DevAtomDisplay } from './DevAtomDisplay'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineSkeleton } from './TimelineSkeleton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineErrorState } from './TimelineErrorState'
import { TimelinePlayCardWrapper } from './TimelinePlayCardWrapper'

export function Timeline() {
  // Mount the background fetching service
  useAtomMount(latestItemAtom);

  // Get reactive play IDs - automatically updates when KVS changes
  const playIds = useAtomValue(playIdsAtom);
  const newestPlay = useAtomValue(newestPlayAtom);

  return (
    <>
      <DevAtomDisplay />
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <div className="bg-background rounded-lg shadow-xl p-6">
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-1">
            Timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            KEXP play history
          </p>
        </div>

        {/* Latest Play */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            Latest:{' '}
            {Result.matchWithWaiting(newestPlay, {
              onWaiting: () => <Skeleton className="inline-block h-4 w-32" />,
              onError: () => <span className="text-destructive">Error</span>,
              onDefect: () => <span className="text-destructive">Defect</span>,
              onSuccess: (s) =>
                Option.match(s.value, {
                  onNone: () => <span>—</span>,
                  onSome: (play) => <span className="text-foreground">{play.artist} — {play.song}</span>,
                }),
            })}
          </p>
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
      </div>
    </>
  )
}
