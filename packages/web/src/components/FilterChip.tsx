/**
 * FilterChip Component
 *
 * Displays active filter state as a minimal chip above the timeline.
 * Shows entity name, play count, and X button to clear filter.
 * Matches the "Late Night Radio Broadcast" aesthetic.
 */

import { useAtomValue, useAtom } from "@effect-atom/atom-react";
import { Option } from "effect";
import {
  activeFilterAtom,
  artistMbidAtom,
  recordingMbidAtom,
  releaseMbidAtom,
  releaseGroupMbidAtom,
  type EntityFilter,
} from "@/atoms/timeline-url-sync";
import {
  entityMetadataAtom,
  loadEntityMetadataAtom,
  entityTypeLabels,
} from "@/atoms/entity-metadata";
import { useEffect } from "react";

/**
 * Clear all MBID filter atoms to remove the filter.
 */
function useClearFilter() {
  const [, setArtist] = useAtom(artistMbidAtom);
  const [, setRecording] = useAtom(recordingMbidAtom);
  const [, setRelease] = useAtom(releaseMbidAtom);
  const [, setReleaseGroup] = useAtom(releaseGroupMbidAtom);

  return () => {
    setArtist(Option.none());
    setRecording(Option.none());
    setRelease(Option.none());
    setReleaseGroup(Option.none());
  };
}

export function FilterChip() {
  const filter = useAtomValue(activeFilterAtom);

  // Don't render if no filter is active
  if (!filter) return null;

  return <FilterChipContent filter={filter} />;
}

/**
 * Inner component that renders when filter is active.
 * Separated to allow conditional hooks based on filter presence.
 */
function FilterChipContent({ filter }: { filter: EntityFilter }) {
  const metadata = useAtomValue(entityMetadataAtom(filter));
  const [, loadMetadata] = useAtom(loadEntityMetadataAtom(filter));
  const clearFilter = useClearFilter();

  // Load metadata when filter becomes active
  useEffect(() => {
    if (metadata.status === "idle") {
      loadMetadata();
    }
  }, [filter.type, filter.mbid, metadata.status, loadMetadata]);

  const typeLabel = entityTypeLabels[filter.type];
  const isLoading = metadata.status === "loading";

  return (
    <div className="filter-chip-wrapper">
      <div className="filter-chip">
        {/* Type badge */}
        <span className="filter-chip-type">{typeLabel}</span>

        {/* Separator */}
        <span className="filter-chip-separator" />

        {/* Name (or loading indicator) */}
        {isLoading ? (
          <span className="filter-chip-name animate-pulse">Loading...</span>
        ) : (
          <span className="filter-chip-name">
            {metadata.name || "Unknown"}
          </span>
        )}

        {/* Play count */}
        {!isLoading && metadata.playCount > 0 && (
          <>
            <span className="filter-chip-dot" />
            <span className="filter-chip-count">
              {metadata.playCount.toLocaleString()} plays
            </span>
          </>
        )}

        {/* Clear button */}
        <button
          onClick={clearFilter}
          className="filter-chip-clear"
          aria-label="Clear filter"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
