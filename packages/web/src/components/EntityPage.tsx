/**
 * Entity Page Component
 *
 * Main layout for entity pages (artist, recording, release, release_group).
 * Combines EntityHeader and EntityTimeline.
 */

import { useEffect, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useAtomValue, useAtom } from "@effect-atom/atom-react";
import { EntityHeader } from "./EntityHeader";
import { EntityTimeline } from "./EntityTimeline";
import {
  entityMetadataAtom,
  loadEntityMetadataAtom,
} from "@/atoms/entity-metadata";
import type { EntityType, EntityFilter } from "@/atoms/entity-timeline";
import { isPanelOpenAtom } from "@/atoms/play-details";
import { cn } from "@/lib/utils";

interface EntityPageProps {
  type: EntityType;
}

export function EntityPage({ type }: EntityPageProps) {
  // Get mbid from route params
  // Route pattern is /{type}/$mbid
  const params = useParams({ strict: false });
  const mbid = params.mbid as string;

  // Create filter object
  const filter: EntityFilter = useMemo(
    () => ({ type, mbid }),
    [type, mbid]
  );

  // Memoize atom instances
  const metadataAtomInstance = useMemo(() => entityMetadataAtom(filter), [filter.type, filter.mbid]);
  const loadMetadataAtomInstance = useMemo(() => loadEntityMetadataAtom(filter), [filter.type, filter.mbid]);

  // Atom values
  const metadata = useAtomValue(metadataAtomInstance);
  const isPanelOpen = useAtomValue(isPanelOpenAtom);

  // Actions
  const [, loadMetadata] = useAtom(loadMetadataAtomInstance);

  // Load metadata on mount
  useEffect(() => {
    loadMetadata();
  }, [filter.type, filter.mbid]);

  return (
    <div
      className={cn(
        "entity-page relative z-10 h-screen flex flex-col",
        "transition-all duration-300 ease-out",
        isPanelOpen
          ? "fixed top-0 left-0 w-full lg:w-[420px] xl:w-[480px] min-w-[380px]"
          : "mx-auto w-full max-w-2xl"
      )}
    >
      {/* Header section */}
      <div className="flex-none px-3 sm:px-4 pt-3 pb-2">
        <div className="timeline-container rounded-xl p-3 sm:p-4">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div className="relative z-10">
            <EntityHeader metadata={metadata} />
          </div>
        </div>
      </div>

      {/* Timeline section - takes remaining height */}
      <div className="flex-1 min-h-0 px-3 sm:px-4 pb-3">
        <div className="timeline-container h-full rounded-xl overflow-hidden">
          <div className="timeline-backdrop" />
          <div className="timeline-backdrop-edge" />
          <div className="relative z-10 h-full overflow-auto px-3 sm:px-4 py-4">
            <EntityTimeline filter={filter} />
          </div>
        </div>
      </div>
    </div>
  );
}
