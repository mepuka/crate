/**
 * ShowTransitionMarker
 *
 * Visual marker indicating a show transition in the timeline.
 * Displays a subtle gradient line with program name and host information.
 */

import { formatPlayTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'

interface ShowTransitionMarkerProps {
  timestamp: Date | string
  programName?: string | undefined
  hostNames?: readonly string[] | undefined
  showId: number
  className?: string
}

export function ShowTransitionMarker({
  timestamp,
  programName,
  hostNames,
  showId,
  className
}: ShowTransitionMarkerProps) {
  const timestampDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const formattedTime = formatPlayTime(timestampDate)
  const hostList = hostNames?.join(', ')

  return (
    <div
      data-show-id={showId}
      className={cn(
        'relative flex items-center gap-3 py-3 my-2',
        'border-t border-border/50',
        className
      )}
      role="separator"
      aria-label={`Show transition: ${programName || 'Unknown Show'}`}
    >
      {/* Gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Badge with show info */}
      <div className="flex items-center gap-2 text-xs">
        <time
          className="text-muted-foreground font-mono tabular-nums"
          dateTime={timestampDate.toISOString()}
        >
          {formattedTime}
        </time>

        {programName && (
          <>
            <span className="text-muted-foreground/50">•</span>
            <span className="text-foreground/90 font-medium">
              {programName}
            </span>
          </>
        )}

        {hostList && (
          <>
            <span className="text-muted-foreground/50">•</span>
            <span className="text-muted-foreground truncate" title={hostList}>
              {hostList}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
