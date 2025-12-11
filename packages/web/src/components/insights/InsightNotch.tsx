import { notchStateAtom } from "@/atoms/insights";
import { cn } from "@/lib/utils";
import { useAtomValue } from "@effect-atom/atom-react";
import { memo } from "react";

interface InsightNotchProps {
  playId: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const InsightNotch = memo(({ playId, className, onClick }: InsightNotchProps) => {
  const state = useAtomValue(notchStateAtom(playId));

  // Visual states
  // idle: Hidden or very faint
  // digging: Pulsing
  // ready: Full gradient
  // empty: Hidden
  // error: Hidden

  if (state === "idle" || state === "empty" || state === "error") {
    return null; 
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "absolute right-0 top-0 bottom-0 w-1.5 cursor-pointer transition-all duration-300 ease-out z-20",
        state === "digging" && "bg-primary/20 animate-pulse",
        state === "ready" && "bg-gradient-to-b from-teal-400 to-blue-500 shadow-[0_0_8px_rgba(45,212,191,0.5)]",
        className
      )}
      role="button"
      aria-label="View streaming insights"
      title={state === "digging" ? "Digging for insights..." : "Insights available"}
    />
  );
});

InsightNotch.displayName = "InsightNotch";
