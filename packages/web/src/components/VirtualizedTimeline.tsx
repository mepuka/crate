/**
 * Virtualized Timeline Component
 *
 * Uses TanStack Virtual for efficient rendering of large timelines.
 * Integrates with Effect Atom infinite scroll state.
 *
 * Features:
 * - Virtual scrolling with dynamic item heights
 * - Infinite scroll with cursor-based pagination
 * - URL-driven navigation (percentage, time-range, anchor)
 * - Automatic load-more with intersection observer
 */

import { useAtomValue, useAtom, Result } from '@effect-atom/atom-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import { Option } from 'effect'
import {
  loadInitialTimelinePageAtom,
  loadNextTimelinePageAtom,
  allLoadedPlayIdsAtom,
  timelineLoadingStateAtom,
  loadedPlayCountAtom,
} from '@/atoms/timeline-infinite'
import { newestPlayAtom, playIdToBoundaryMapAtom } from '@/atoms/timeline'
import { isPanelOpenAtom } from '@/atoms/play-details'
import { DevAtomDisplay } from './DevAtomDisplay'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineSkeleton } from './TimelineSkeleton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineErrorState } from './TimelineErrorState'
import { TimelineItemWithMarker } from './TimelineItemWithMarker'
import { FPSIndicator } from './FPSIndicator'
import { cn } from '@/lib/utils'

/**
 * Estimated height for timeline items.
 * TanStack Virtual recommends estimating the largest possible size.
 *
 * Timeline items are variable height:
 * - Compact: ~80px (no show marker, no links)
 * - With show marker: ~180px
 * - With links: ~120-200px
 *
 * We estimate 200px to be safe.
 */
const ESTIMATED_ITEM_HEIGHT = 200;

/**
 * How many items from the end should trigger load-more.
 */
const LOAD_MORE_THRESHOLD = 5;

export function VirtualizedTimeline() {
  // Atoms
  const playIds = useAtomValue(allLoadedPlayIdsAtom);
  const loadingState = useAtomValue(timelineLoadingStateAtom);
  const loadedCount = useAtomValue(loadedPlayCountAtom);
  const newestPlay = useAtomValue(newestPlayAtom);
  const boundaryMap = useAtomValue(playIdToBoundaryMapAtom);
  const isPanelOpen = useAtomValue(isPanelOpenAtom);

  // Actions
  const [, loadInitial] = useAtom(loadInitialTimelinePageAtom);
  const [, loadMore] = useAtom(loadNextTimelinePageAtom);

  // Load initial page on mount
  useEffect(() => {
    loadInitial();
  }, []);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: playIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5, // Render 5 items above and below viewport
  });

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadingState.hasMore || loadingState.isLoadingMore) {
      return;
    }

    // Check if we're near the end
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (!lastVirtualItem) {
      return;
    }

    // Trigger load-more when within threshold
    if (playIds.length - lastVirtualItem.index <= LOAD_MORE_THRESHOLD) {
      loadMore();
    }
  }, [virtualItems, playIds.length, loadingState.hasMore, loadingState.isLoadingMore, loadMore]);

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

    const parent = parentRef.current;
    if (parent) {
      parent.addEventListener('scroll', handleScroll, { passive: true })
    }

    return () => {
      if (parent) {
        parent.removeEventListener('scroll', handleScroll)
      }
      clearTimeout(scrollTimeout)
    }
  }, [])

  // Handle initial loading
  if (loadingState.isLoadingInitial) {
    return (
      <div className={cn(
        "relative z-10 transition-all duration-300 ease-in-out min-h-screen",
        isPanelOpen ? "w-full lg:w-1/3" : "w-full"
      )}>
        <DevAtomDisplay />
        <FPSIndicator />
        <div className="px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-4xl mx-auto">
          <div className="timeline-container bg-background rounded-lg shadow-xl p-6 border border-white/10">
            <div className="relative z-10">
              <div className="mb-8 sm:mb-10">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-1">
                  Timeline
                </h1>
                <p className="text-sm text-muted-foreground">
                  KEXP play history
                </p>
              </div>
              <div className="space-y-4">
                <TimelineSkeleton count={5} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle error
  if (loadingState.isError) {
    return (
      <div className={cn(
        "relative z-10 transition-all duration-300 ease-in-out min-h-screen",
        isPanelOpen ? "w-full lg:w-1/3" : "w-full"
      )}>
        <DevAtomDisplay />
        <FPSIndicator />
        <div className="px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-4xl mx-auto">
          <div className="timeline-container bg-background rounded-lg shadow-xl p-6 border border-white/10">
            <div className="relative z-10">
              <TimelineErrorState error={loadingState.error} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle empty state
  if (playIds.length === 0) {
    return (
      <div className={cn(
        "relative z-10 transition-all duration-300 ease-in-out min-h-screen",
        isPanelOpen ? "w-full lg:w-1/3" : "w-full"
      )}>
        <DevAtomDisplay />
        <FPSIndicator />
        <div className="px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-4xl mx-auto">
          <div className="timeline-container bg-background rounded-lg shadow-xl p-6 border border-white/10">
            <div className="relative z-10">
              <TimelineEmptyState
                message="No plays found"
                description="Try adjusting your filters or check back later."
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative z-10 transition-all duration-300 ease-in-out min-h-screen",
      isPanelOpen ? "w-full lg:w-1/3" : "w-full"
    )}>
      <DevAtomDisplay />
      <FPSIndicator />
      <div className="px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-4xl mx-auto">
        <div className="timeline-container bg-background rounded-lg shadow-xl p-6 border border-white/10">
          {/* Glassy backdrop layer */}
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
          {/* Content layer */}
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

            {/* Play count */}
            {playIds.length > 0 && (
              <div className="mb-4 text-xs text-muted-foreground">
                {loadedCount} play{loadedCount !== 1 ? 's' : ''}
                {loadingState.hasMore && ' • scroll for more'}
              </div>
            )}

            {/* Virtual scroll container */}
            <div
              ref={parentRef}
              className="overflow-auto"
              style={{
                height: 'calc(100vh - 400px)', // Responsive to viewport, accounting for header/padding
                minHeight: '400px', // Minimum height for usability
                maxHeight: '800px', // Maximum height to prevent excessive scrolling area
                contain: 'strict',
              }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const playId = playIds[virtualItem.index];
                  const boundary = Result.matchWithWaiting(boundaryMap, {
                    onWaiting: () => undefined,
                    onError: () => undefined,
                    onDefect: () => undefined,
                    onSuccess: (s) => s.value.get(playId)
                  });

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <TimelineItemWithMarker
                        playId={playId}
                        showBoundary={boundary}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Loading more indicator */}
            {loadingState.isLoadingMore && (
              <div className="mt-4 text-center">
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {/* End of timeline indicator */}
            {!loadingState.hasMore && playIds.length > 0 && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                You've reached the beginning of the timeline
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
