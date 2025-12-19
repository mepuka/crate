import { cn, getEraInfo } from "@/lib/utils";
import { EraBadge } from "@/components/ui/EraBadge";
import { Calendar, MapPin, Disc } from "lucide-react";

interface TrackContextCardProps {
  releaseYear?: number | null | undefined;
  releaseDate?: string | null | undefined;
  rotationStatus?: string | null | undefined;
  isLocal?: boolean | undefined;
  airdate: Date;
  className?: string | undefined;
}

/**
 * TrackContextCard - Shows track context when no AI insights exist
 *
 * Rather than showing a stark "no insights" message, this card
 * displays available metadata in an engaging way:
 * - Era badge (decade from release year)
 * - When this play aired
 * - Rotation status (if in current rotation)
 * - Local artist indicator
 *
 * Follows the "knowing friend" philosophy - always have something
 * interesting to share, even if AI analysis hasn't run yet.
 */
export function TrackContextCard({
  releaseYear,
  rotationStatus,
  isLocal,
  airdate,
  className,
}: TrackContextCardProps) {
  const eraInfo = releaseYear ? getEraInfo(releaseYear) : null;

  // Format airdate nicely
  const playDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(airdate);

  // Check if we have anything interesting to show
  const hasContext = eraInfo || rotationStatus || isLocal;

  if (!hasContext) {
    // Truly nothing to show - minimal placeholder
    return (
      <div className={cn(
        "text-center py-6 text-sm text-muted-foreground/60",
        className
      )}>
        <Disc className="w-5 h-5 mx-auto mb-2 opacity-40" />
        <p>Played on KEXP</p>
        <p className="text-xs mt-1">{playDate}</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "space-y-3 py-2",
      className
    )}>
      {/* Context Pills Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Era Badge */}
        {releaseYear && <EraBadge year={releaseYear} />}

        {/* Rotation Status */}
        {rotationStatus && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-accent/15 text-accent border border-accent/20">
            <Disc className="w-3 h-3" />
            {formatRotation(rotationStatus)}
          </span>
        )}

        {/* Local Artist */}
        {isLocal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            <MapPin className="w-3 h-3" />
            Seattle Local
          </span>
        )}
      </div>

      {/* Contextual Note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground/70">
        <Calendar className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          {eraInfo ? (
            <>A {eraInfo.label} release, played {formatRelativeDate(airdate)}</>
          ) : (
            <>Played {formatRelativeDate(airdate)}</>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Format rotation status for display
 */
function formatRotation(status: string): string {
  // Common KEXP rotation statuses
  const rotationLabels: Record<string, string> = {
    'Heavy': 'Heavy Rotation',
    'Light': 'Light Rotation',
    'Medium': 'Medium Rotation',
  };
  return rotationLabels[status] || status;
}

/**
 * Format date relative to now in a friendly way
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  // For older dates, show the actual date
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}
