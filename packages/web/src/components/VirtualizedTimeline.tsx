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

import { useAtomValue, useAtom, useAtomMount, Result } from '@effect-atom/atom-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Option } from 'effect'
import {
  loadInitialTimelinePageAtom,
  loadNextTimelinePageAtom,
  resetTimelineInfiniteStateAtom,
  allLoadedPlayIdsAtom,
  timelineLoadingStateAtom,
  loadedPlayCountAtom,
  filterNeedsReloadAtom,
  activeFilterAtom,
} from '@/atoms/timeline-infinite'
import { latestItemAtom, newestPlayAtom, playIdToBoundaryMapAtom } from '@/atoms/timeline'
import { Skeleton } from '@/components/ui/skeleton'
import { TimelineSkeleton } from './TimelineSkeleton'
import { TimelineEmptyState } from './TimelineEmptyState'
import { TimelineErrorState } from './TimelineErrorState'
import { TimelineItemWithMarker } from './TimelineItemWithMarker'
import { FilterChip } from './FilterChip'
import { cn } from '@/lib/utils'
import { useTimelineKeyboardNav } from '@/hooks/useTimelineKeyboardNav'

/**
 * Estimated height for timeline items.
 * TanStack Virtual recommends estimating the largest possible size.
 *
 * Timeline items are variable height:
 * - Compact: ~90px (smaller cards now)
 * - With show marker: ~140px
 *
 * We estimate 100px for tighter layout.
 */
const ESTIMATED_ITEM_HEIGHT = 100;

/**
 * How many items from the end should trigger load-more.
 */
const LOAD_MORE_THRESHOLD = 5;

export function VirtualizedTimeline() {
  // Mount the background fetching service for live updates
  useAtomMount(latestItemAtom);

  // Atoms
  const playIds = useAtomValue(allLoadedPlayIdsAtom);
  const loadingState = useAtomValue(timelineLoadingStateAtom);
  const loadedCount = useAtomValue(loadedPlayCountAtom);
  const newestPlay = useAtomValue(newestPlayAtom);
  const boundaryMap = useAtomValue(playIdToBoundaryMapAtom);
  const filterNeedsReload = useAtomValue(filterNeedsReloadAtom);
  const activeFilter = useAtomValue(activeFilterAtom);

  // Actions
  const [, loadInitial] = useAtom(loadInitialTimelinePageAtom);
  const [, loadMore] = useAtom(loadNextTimelinePageAtom);
  const [, resetTimeline] = useAtom(resetTimelineInfiniteStateAtom);

  // Transition state for filter changes
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation hook
  const {
    focusedPlayId,
    focusCard,
  } = useTimelineKeyboardNav({
    containerRef: parentRef,
    enabled: !loadingState.isLoadingInitial && playIds.length > 0,
    onSelect: useCallback((playId: number) => {
      // TODO: Open play detail panel when implemented
      console.log('Selected play:', playId);
    }, []),
  });

  // Load initial page on mount
  useEffect(() => {
    loadInitial();
  }, []);

  // Handle filter changes with fade transition
  useEffect(() => {
    if (filterNeedsReload) {
      // Start fade-out transition
      setIsTransitioning(true);

      // After fade-out completes, reset and reload
      const fadeOutTimer = setTimeout(() => {
        resetTimeline();
        loadInitial();

        // After data starts loading, fade back in
        // The loading state will handle showing skeleton during load
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 150); // Match CSS transition duration

      return () => clearTimeout(fadeOutTimer);
    }
  }, [filterNeedsReload, resetTimeline, loadInitial]);

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
    // Don't load more if: no more pages, already loading, or in error state
    if (!loadingState.hasMore || loadingState.isLoadingMore || loadingState.isError) {
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
  }, [virtualItems, playIds.length, loadingState.hasMore, loadingState.isLoadingMore, loadingState.isError, loadMore]);

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

  // Shared layout wrapper for loading/error/empty states
  // Timeline fills its container - parent controls width in split view
  const StateWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="relative z-10 h-full flex flex-col w-full">
      <div className="flex-none px-3 sm:px-4 pt-3 pb-2">
        <div className="timeline-container rounded-xl p-3 sm:p-4">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div className="relative z-10">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              Timeline
            </h1>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-3 sm:px-4 pb-3">
        <div className="timeline-container h-full rounded-xl overflow-hidden">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div className="relative z-10 h-full overflow-auto px-3 sm:px-4 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  // Handle initial loading
  if (loadingState.isLoadingInitial) {
    return (
      <StateWrapper>
        <TimelineSkeleton count={8} />
      </StateWrapper>
    );
  }

  // Handle error
  if (loadingState.isError) {
    return (
      <StateWrapper>
        <TimelineErrorState error={loadingState.error} />
      </StateWrapper>
    );
  }

  // Handle empty state
  if (playIds.length === 0) {
    return (
      <StateWrapper>
        <TimelineEmptyState
          message="No plays found"
          description="Try adjusting your filters or check back later."
        />
      </StateWrapper>
    );
  }

  return (
    <div className="relative z-10 h-full flex flex-col w-full">

      {/* Filter chip - shows when filter is active */}
      <FilterChip />

      {/* Compact header */}
      <div className="flex-none px-3 sm:px-4 pt-3 pb-2">
        <div className="timeline-container rounded-xl p-3 sm:p-4">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div className="relative z-10 flex items-baseline justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-3">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                {activeFilter ? 'Filtered' : 'Timeline'}
              </h1>
              <span className="text-xs text-muted-foreground/70">
                {loadedCount} plays
                {loadingState.hasMore && ' • scroll for more'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-[50%]">
              {Result.matchWithWaiting(newestPlay, {
                onWaiting: () => <Skeleton className="inline-block h-3 w-24" />,
                onError: () => null,
                onDefect: () => null,
                onSuccess: (s) =>
                  Option.match(s.value, {
                    onNone: () => null,
                    onSome: (play) => (
                      <span className="text-foreground/80">
                        <span className="text-muted-foreground/60">Now: </span>
                        {play.artist} — {play.song}
                      </span>
                    ),
                  }),
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable timeline area - takes remaining height */}
      <div className="flex-1 min-h-0 px-3 sm:px-4 pb-3">
        <div className="timeline-container h-full rounded-xl overflow-hidden">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div
            ref={parentRef}
            className={cn(
              "relative z-10 h-full overflow-auto px-3 sm:px-4 py-2",
              "scroll-snap-container", // Phase 1: Scroll-snap for better UX
              isTransitioning ? "timeline-transitioning" : "timeline-visible"
            )}
            style={{ contain: 'strict' }}
            role="list"
            aria-label={`Radio play timeline with ${playIds.length} plays`}
            aria-live="polite"
            aria-busy={loadingState.isLoadingMore}
            tabIndex={0} // Make container focusable for keyboard nav
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
                  const isFocused = focusedPlayId === playId;

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      data-play-id={playId}
                      ref={virtualizer.measureElement}
                      role="listitem"
                      tabIndex={isFocused ? 0 : -1}
                      aria-selected={isFocused}
                      className={cn(
                        "timeline-item", // For scroll-snap
                        "outline-none", // Focus handled by CSS
                        isFocused && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg"
                      )}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      onFocus={() => focusCard(playId)}
                    >
                      <TimelineItemWithMarker
                        playId={playId}
                        showBoundary={boundary}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Loading more indicator */}
              {loadingState.isLoadingMore && (
                <div className="py-3 text-center">
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              )}

              {/* End of timeline indicator */}
              {!loadingState.hasMore && playIds.length > 0 && (
                <div className="py-3 text-center text-xs text-muted-foreground/60">
                  End of timeline
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
