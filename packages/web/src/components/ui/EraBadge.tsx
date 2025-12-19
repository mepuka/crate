import { cn, getEraInfo } from "@/lib/utils";

interface EraBadgeProps {
  year: number | null | undefined;
  className?: string;
  showYear?: boolean; // Show full year instead of just decade
}

/**
 * EraBadge - displays the release decade with era-appropriate colors
 *
 * Color mapping based on Temporal Design System:
 * - 2020s: Teal (modern, current)
 * - 2010s: Blue (contemporary)
 * - 2000s: Purple (recent past)
 * - 1990s: Orange (classic era)
 * - 1980s: Amber (vintage)
 * - 1970s and earlier: Gold (golden age)
 */
export function EraBadge({ year, className, showYear = false }: EraBadgeProps) {
  const eraInfo = getEraInfo(year);

  if (!eraInfo || !year) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border",
        eraInfo.bgClass,
        eraInfo.textClass,
        eraInfo.borderClass,
        className
      )}
    >
      {showYear ? year : eraInfo.label}
    </span>
  );
}

/**
 * Compact variant for inline use
 */
export function EraDot({ year, className }: { year: number | null | undefined; className?: string }) {
  const eraInfo = getEraInfo(year);

  if (!eraInfo) return null;

  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        eraInfo.bgClass.replace('/20', '/60'), // More opaque for dot
        className
      )}
      title={`${eraInfo.label} release`}
    />
  );
}
