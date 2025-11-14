import { useAtomValue, Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { playAtom } from '@/atoms/timeline'
import { PlayCard } from './PlayCard'
import { TimelineErrorState } from './TimelineErrorState'
import { Skeleton } from '@/components/ui/skeleton'

interface TimelinePlayCardWrapperProps {
  playId: number
}

export function TimelinePlayCardWrapper({ playId }: TimelinePlayCardWrapperProps) {
  const play = useAtomValue(playAtom(playId))

  return Result.matchWithWaiting(play, {
    onWaiting: () => (
      <div className="border-b border-border/40 bg-card">
        <div className="flex gap-3 py-3">
          <Skeleton className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded" />
          <div className="flex-1 min-w-0 space-y-0.5 py-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-16 rounded shrink-0" />
            </div>
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-3 w-2/3 rounded" />
          </div>
        </div>
      </div>
    ),
    onError: (error) => (
      <TimelineErrorState error={error} />
    ),
    onDefect: (defect) => (
      <TimelineErrorState error={defect} />
    ),
    onSuccess: (success) => (
      Option.match(success.value, {
        onNone: () => (
          <div className="border-b border-border/40 bg-card py-3 text-center text-sm text-muted-foreground">
            Play #{playId} not found
          </div>
        ),
        onSome: (playData) => (
          <PlayCard play={playData} />
        ),
      })
    ),
  })
}

