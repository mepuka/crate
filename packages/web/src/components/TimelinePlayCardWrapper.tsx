import { useAtomValue, Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { memo } from 'react'
import { playAtom } from '@/atoms/timeline'
import { PlayCard } from './PlayCard'
import { PlayCardSkeleton } from './PlayCardSkeleton'
import { TimelineErrorState } from './TimelineErrorState'

interface TimelinePlayCardWrapperProps {
  playId: number
}

export const TimelinePlayCardWrapper = memo(function TimelinePlayCardWrapper({ playId }: TimelinePlayCardWrapperProps) {
  const play = useAtomValue(playAtom(playId))

  return Result.matchWithWaiting(play, {
    onWaiting: () => (
      <PlayCardSkeleton />
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
})
