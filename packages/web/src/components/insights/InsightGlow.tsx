/**
 * InsightGlow Component
 *
 * A subtle visual indicator that hints at discoverable depth.
 * Design language: "Hidden Frequency" - like tuning into a secret signal.
 *
 * States:
 * - idle/empty/error: Invisible
 * - digging: Warm pulse emanating from corner, signal being found
 * - ready: Soft persistent glow, story waiting to be discovered
 */

import { notchStateAtom } from "@/atoms/insights";
import { cn } from "@/lib/utils";
import { useAtomValue } from "@effect-atom/atom-react";
import { memo } from "react";

interface InsightGlowProps {
  playId: number;
  className?: string;
}

/**
 * Corner glow indicator for album art
 * Shows when insights are available or being discovered
 */
export const InsightGlow = memo(({ playId, className }: InsightGlowProps) => {
  const state = useAtomValue(notchStateAtom(playId));

  // Only show for active states
  if (state === "idle" || state === "empty" || state === "error") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]",
        className
      )}
      aria-hidden="true"
    >
      {/* Corner glow - positioned at bottom-right */}
      <div
        className={cn(
          "absolute -bottom-2 -right-2 w-12 h-12",
          "rounded-full blur-xl",
          "transition-all duration-700 ease-out",
          state === "digging" && "insight-glow-digging",
          state === "ready" && "insight-glow-ready"
        )}
      />

      {/* Edge highlight - subtle line along right edge */}
      <div
        className={cn(
          "absolute right-0 top-1/4 bottom-1/4 w-[2px]",
          "rounded-full",
          "transition-all duration-500 ease-out",
          state === "digging" && "insight-edge-digging",
          state === "ready" && "insight-edge-ready"
        )}
      />
    </div>
  );
});

InsightGlow.displayName = "InsightGlow";

/**
 * Compact dot indicator for timeline cards
 * Shows a small glowing dot when insights exist
 */
export const InsightDot = memo(({ playId, className }: InsightGlowProps) => {
  const state = useAtomValue(notchStateAtom(playId));

  if (state === "idle" || state === "empty" || state === "error") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute top-1.5 right-1.5 z-20",
        "w-2 h-2 rounded-full",
        "transition-all duration-500 ease-out",
        state === "digging" && "insight-dot-digging",
        state === "ready" && "insight-dot-ready",
        className
      )}
      aria-label={state === "digging" ? "Discovering insights..." : "Insights available"}
      title={state === "digging" ? "Discovering insights..." : "Insights available"}
    />
  );
});

InsightDot.displayName = "InsightDot";

/**
 * Badge indicator with count
 * For when you want to show how many insights exist
 */
interface InsightBadgeProps extends InsightGlowProps {
  count?: number;
}

export const InsightBadge = memo(({ playId, count, className }: InsightBadgeProps) => {
  const state = useAtomValue(notchStateAtom(playId));

  if (state === "idle" || state === "empty" || state === "error") {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1",
        "px-1.5 py-0.5 rounded-full",
        "text-[9px] font-medium uppercase tracking-wider",
        "transition-all duration-300 ease-out",
        state === "digging" && [
          "bg-primary/10 text-primary/70",
          "animate-pulse"
        ],
        state === "ready" && [
          "bg-gradient-to-r from-primary/20 to-accent/15",
          "text-primary",
          "shadow-[0_0_8px_rgba(245,130,22,0.15)]"
        ],
        className
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        state === "digging" && "bg-primary/50 animate-pulse",
        state === "ready" && "bg-primary shadow-[0_0_4px_rgba(245,130,22,0.5)]"
      )} />
      {state === "digging" ? (
        <span>Digging</span>
      ) : count && count > 0 ? (
        <span>{count} note{count > 1 ? 's' : ''}</span>
      ) : (
        <span>Notes</span>
      )}
    </div>
  );
});

InsightBadge.displayName = "InsightBadge";
