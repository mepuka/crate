/**
 * Entity Header Component
 *
 * Displays entity information at the top of entity pages.
 * Shows: entity type badge, name, image (if available), and play count.
 */

import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import type { EntityMetadata } from "@/atoms/entity-metadata";
import { entityTypeLabels } from "@/atoms/entity-metadata";

interface EntityHeaderProps {
  metadata: EntityMetadata;
}

export function EntityHeader({ metadata }: EntityHeaderProps) {
  const typeLabel = entityTypeLabels[metadata.type];
  const isLoading = metadata.status === "loading";

  return (
    <header className="entity-header">
      {/* Back link */}
      <Link
        to="/"
        className="entity-back-link text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="mr-1">&larr;</span> Timeline
      </Link>

      {/* Entity info */}
      <div className="entity-info">
        {/* Entity image */}
        {isLoading ? (
          <Skeleton className="entity-image" />
        ) : metadata.imageUri ? (
          <img
            src={metadata.imageUri}
            alt=""
            className="entity-image"
            loading="eager"
          />
        ) : (
          <div className="entity-image entity-image-placeholder">
            <span className="text-2xl text-muted-foreground/40">
              {metadata.type === "artist" ? "A" : metadata.type === "recording" ? "R" : "💿"}
            </span>
          </div>
        )}

        {/* Entity details */}
        <div className="entity-details">
          <span className="entity-type-badge">{typeLabel}</span>
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-48 mb-1" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <h1 className="entity-name">{metadata.name || "Unknown"}</h1>
              <p className="entity-play-count">
                {metadata.playCount.toLocaleString()} plays on KEXP
              </p>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Loading skeleton for entity header
 */
export function EntityHeaderSkeleton() {
  return (
    <header className="entity-header">
      <Skeleton className="h-5 w-20" />
      <div className="entity-info">
        <Skeleton className="entity-image" />
        <div className="entity-details">
          <Skeleton className="h-4 w-12 mb-2" />
          <Skeleton className="h-6 w-48 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </header>
  );
}
