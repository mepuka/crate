import { useAtom, useAtomSet } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { timelineAtom, appendPlaysAtom } from '@/atoms'
import { PlayCard, LoadingSpinner, DateDivider } from '@/components'
import { Button } from '@/components/ui/button'
import { isSameDay } from 'date-fns'
import { useState } from 'react'

export function Timeline() {
  // timelineAtom is Writable<TimelineState, TimelineState> - use useAtom to read AND write
  const [state, setState] = useAtom(timelineAtom)

  // appendPlaysAtom is a function atom that returns Exit - use useAtomSet with promiseExit mode
  const appendPlays = useAtomSet(appendPlaysAtom, { mode: "promiseExit" })

  // Track loading state for "Load More" button
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Handle loading more plays using Effect Atom patterns
  const handleLoadMore = async () => {
    if (!state.cursor || isLoadingMore) return

    setIsLoadingMore(true)

    // Call function atom - returns Exit<TimelineState, Error>
    const exit = await appendPlays(state.cursor)

    // Handle Exit result
    if (Exit.isSuccess(exit)) {
      // On success, write the new state to timelineAtom (which auto-persists to localStorage)
      setState(exit.value)
    } else {
      // On failure, log the error (could also update state.error if desired)
      console.error('Failed to load more plays:', exit.cause)
    }

    setIsLoadingMore(false)
  }

  // Show loading spinner during initial load
  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Show error message if error occurred
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="text-destructive text-lg font-medium">Error loading timeline</div>
        <div className="text-muted-foreground text-sm">{state.error}</div>
      </div>
    )
  }

  // Show empty state if no plays
  if (state.plays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="text-muted-foreground text-lg">No plays found</div>
        <div className="text-muted-foreground text-sm">Check that the API is running on http://localhost:8000</div>
      </div>
    )
  }

  // Group plays by date with date dividers
  const playsWithDividers: Array<{ type: 'divider'; date: Date } | { type: 'play'; play: typeof state.plays[0]; index: number }> = []
  let lastDate: Date | null = null

  state.plays.forEach((play, index) => {
    if (!play.airdate) {
      playsWithDividers.push({ type: 'play', play, index })
      return
    }

    const playDate = new Date(play.airdate)

    // Add date divider if date changed
    if (!lastDate || !isSameDay(lastDate, playDate)) {
      playsWithDividers.push({ type: 'divider', date: playDate })
      lastDate = playDate
    }

    playsWithDividers.push({ type: 'play', play, index })
  })

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">KEXP Timeline</h1>
        <p className="text-muted-foreground">
          Recent plays from KEXP 90.3 FM Seattle
        </p>
      </div>

      <div className="space-y-2">
        {playsWithDividers.map((item) => {
          if (item.type === 'divider') {
            return <DateDivider key={`divider-${item.date.toISOString()}`} date={item.date} />
          }

          return <PlayCard key={`play-${item.play.id}-${item.index}`} play={item.play} />
        })}
      </div>

      {/* Load More Button */}
      {state.hasMore && state.cursor && (
        <div className="flex justify-center mt-8 mb-4">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            size="lg"
          >
            {isLoadingMore ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* End of timeline message */}
      {!state.hasMore && state.plays.length > 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          End of timeline
        </div>
      )}
    </div>
  )
}
