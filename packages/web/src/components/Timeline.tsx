import { useAtomValue, useAtomMount, Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { useEffect } from 'react'
import {
  latestItemAtom,
  playIdsAtom,
  newestPlayAtom,
  playIdToBoundaryMapAtom,
} from '@/atoms/timeline'
import { isPanelOpenAtom } from '@/atoms/play-details'
import { DevAtomDisplay } from './DevAtomDisplay'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineSkeleton } from './TimelineSkeleton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineErrorState } from './TimelineErrorState'
import { TimelineItemWithMarker } from './TimelineItemWithMarker'
import { FPSIndicator } from './FPSIndicator'
import { cn } from '@/lib/utils'

export function Timeline() {
  // Mount the background fetching service
  useAtomMount(latestItemAtom);

  // Get reactive play IDs - automatically updates when KVS changes
  const playIds = useAtomValue(playIdsAtom);
  const newestPlay = useAtomValue(newestPlayAtom);
  const boundaryMap = useAtomValue(playIdToBoundaryMapAtom);

  // Check if play details panel is open
  const isPanelOpen = useAtomValue(isPanelOpenAtom);

  // Performance optimization: Reduce expensive effects during scroll
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>

    const handleScroll = () => {
      // Add scrolling class immediately
      document.body.classList.add('scrolling')

      // Remove class after scroll stops (debounced)
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        document.body.classList.remove('scrolling')
      }, 150)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [])

  return (
    <div className={cn(
      "relative z-10 transition-all duration-300 ease-in-out min-h-screen",
      isPanelOpen ? "w-full lg:w-1/3" : "w-full"
    )}>
      <DevAtomDisplay />
      <FPSIndicator />
      <div className="px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-4xl mx-auto">
        <div className="timeline-container bg-background rounded-lg shadow-xl p-6 border border-white/10">
          {/* Glassy backdrop layer - extends to blur nearby album art */}
          <div className="timeline-backdrop" />
          {/* Glassy border edge */}
          <div className="timeline-backdrop-edge" />
          {/* SVG mask for rounded corners */}
          <svg
            className="timeline-svg-mask"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <mask id="timelineGlassMask">
              <rect
                width="100%"
                height="100%"
                fill="white"
                rx="8"
                ry="8"
              />
            </mask>
          </svg>
          {/* Content layer - positioned above backdrop */}
          <div className="relative z-10">
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
          <div className="text-sm text-muted-foreground">
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
            </div>
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
                      {success.value.map((id) => {
                        const boundary = Result.matchWithWaiting(boundaryMap, {
                          onWaiting: () => undefined,
                          onError: () => undefined,
                          onDefect: () => undefined,
                          onSuccess: (s) => s.value.get(id)
                        });
                        return (
                          <TimelineItemWithMarker
                            key={id}
                            playId={id}
                            showBoundary={boundary}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              ),
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
