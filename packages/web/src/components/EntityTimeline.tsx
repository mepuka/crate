/**
 * Entity Timeline Component
 *
 * Virtualized timeline for entity pages, filtered by MBID.
 * Reuses the same virtualization and infinite scroll patterns
 * as the main VirtualizedTimeline.
 */

import { useAtomValue, useAtom, Result } from "@effect-atom/atom-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useMemo } from "react";
import {
  entityPlayIdsAtom,
  entityLoadingStateAtom,
  loadInitialEntityPageAtom,
  loadNextEntityPageAtom,
  entityLoadedCountAtom,
  type EntityFilter,
} from "@/atoms/entity-timeline";
import { playIdToBoundaryMapAtom } from "@/atoms/timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineSkeleton } from "./TimelineSkeleton";
import { TimelineEmptyState } from "./TimelineEmptyState";
import { TimelineErrorState } from "./TimelineErrorState";
import { TimelineItemWithMarker } from "./TimelineItemWithMarker";

/**
 * Estimated height for timeline items.
 */
const ESTIMATED_ITEM_HEIGHT = 100;

/**
 * How many items from the end should trigger load-more.
 */
const LOAD_MORE_THRESHOLD = 5;

interface EntityTimelineProps {
  filter: EntityFilter;
}

export function EntityTimeline({ filter }: EntityTimelineProps) {
  // Memoize atoms based on filter to avoid re-creating on each render
  const playIdsAtomInstance = useMemo(() => entityPlayIdsAtom(filter), [filter.type, filter.mbid]);
  const loadingStateAtomInstance = useMemo(() => entityLoadingStateAtom(filter), [filter.type, filter.mbid]);
  const loadedCountAtomInstance = useMemo(() => entityLoadedCountAtom(filter), [filter.type, filter.mbid]);
  const loadInitialAtomInstance = useMemo(() => loadInitialEntityPageAtom(filter), [filter.type, filter.mbid]);
  const loadNextAtomInstance = useMemo(() => loadNextEntityPageAtom(filter), [filter.type, filter.mbid]);

  // Atom values
  const playIds = useAtomValue(playIdsAtomInstance);
  const loadingState = useAtomValue(loadingStateAtomInstance);
  const loadedCount = useAtomValue(loadedCountAtomInstance);
  const boundaryMap = useAtomValue(playIdToBoundaryMapAtom);

  // Actions
  const [, loadInitial] = useAtom(loadInitialAtomInstance);
  const [, loadMore] = useAtom(loadNextAtomInstance);

  // Load initial page on mount or when filter changes
  useEffect(() => {
    loadInitial();
  }, [filter.type, filter.mbid]);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: playIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
  });

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  // Infinite scroll trigger
  useEffect(() => {
    if (!loadingState.hasMore || loadingState.isLoadingMore) {
      return;
    }

    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (!lastVirtualItem) {
      return;
    }

    if (playIds.length - lastVirtualItem.index <= LOAD_MORE_THRESHOLD) {
      loadMore();
    }
  }, [virtualItems, playIds.length, loadingState.hasMore, loadingState.isLoadingMore, loadMore]);

  // Handle initial loading
  if (loadingState.isLoadingInitial) {
    return <TimelineSkeleton count={8} />;
  }

  // Handle error
  if (loadingState.isError) {
    return <TimelineErrorState error={loadingState.error} />;
  }

  // Handle empty state
  if (playIds.length === 0) {
    return (
      <TimelineEmptyState
        message="No plays found"
        description="This entity hasn't been played on KEXP yet."
      />
    );
  }

  return (
    <div className="entity-timeline">
      {/* Stats line */}
      <div className="entity-timeline-stats text-xs text-muted-foreground mb-2">
        {loadedCount} plays loaded
        {loadingState.hasMore && " • scroll for more"}
      </div>

      {/* Scrollable timeline */}
      <div
        ref={parentRef}
        className="entity-timeline-scroll"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const playId = playIds[virtualItem.index];
            const boundary = Result.matchWithWaiting(boundaryMap, {
              onWaiting: () => undefined,
              onError: () => undefined,
              onDefect: () => undefined,
              onSuccess: (s) => s.value.get(playId),
            });

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <TimelineItemWithMarker playId={playId} showBoundary={boundary} />
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
            End of plays
          </div>
        )}
      </div>
    </div>
  );
}
