/**
 * TimelineItemWithMarker
 *
 * Wrapper component that conditionally renders a show transition marker
 * before a play card based on show boundaries.
 * Memoized to prevent unnecessary re-renders when parent updates.
 */

import { memo } from 'react'
import { TimelinePlayCardWrapper } from './TimelinePlayCardWrapper'
import { ShowTransitionMarker } from './ShowTransitionMarker'
import type { ShowBoundary } from '@/atoms/kexp-atoms'

interface TimelineItemWithMarkerProps {
  playId: number
  showBoundary?: ShowBoundary
}

export const TimelineItemWithMarker = memo(function TimelineItemWithMarker({ playId, showBoundary }: TimelineItemWithMarkerProps) {
  return (
    <>
      {showBoundary && (
        <ShowTransitionMarker
          timestamp={showBoundary.timestamp}
          programName={showBoundary.programName}
          hostNames={showBoundary.hostNames}
          showId={showBoundary.showId}
        />
      )}
      <TimelinePlayCardWrapper playId={playId} />
    </>
  )
})
