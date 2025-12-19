/**
 * InsightPanel Component
 *
 * Displays living liner notes (insights) for a play.
 * Uses Effect Atom pattern - the insightsAtom automatically fetches
 * when read via useAtomValue.
 */

import { useAtomValue, Result } from "@effect-atom/atom-react";
import { insightsAtom } from "@/atoms/insights";
import { InsightStream } from "./InsightStream";
import { Loader2 } from "lucide-react";
import { Insights } from "@crate/domain";

interface InsightPanelProps {
  playId: number;
  comment?: string | null | undefined;
  // Context for empty state (passed to InsightStream)
  releaseYear?: number | null | undefined;
  rotationStatus?: string | null | undefined;
  isLocal?: boolean | undefined;
  airdate?: Date | undefined;
  // Album palette for dynamic theming
  albumPalette?: {
    dominant: string;
    accent: string;
    temperature: "warm" | "cool" | "neutral";
  } | undefined;
}

export const InsightPanel = ({
  playId,
  comment,
  releaseYear,
  rotationStatus,
  isLocal,
  airdate,
  albumPalette,
}: InsightPanelProps) => {
  // Reading the atom triggers the fetch automatically via TimelineRuntime.atom
  const result = useAtomValue(insightsAtom(playId));

  // Default palette if none provided
  const palette = albumPalette ?? {
    dominant: "#E8825B",
    accent: "#4ECDC4",
    temperature: "warm" as const,
  };

  return (
    <div
      className="mt-4 pt-4 transition-colors duration-500"
      style={{ borderTop: `1px solid ${palette.dominant}20` }}
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <h4
          className="text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors"
          style={{ color: `${palette.dominant}90` }}
        >
          Living Liner Notes
        </h4>
        {Result.isWaiting(result) && (
          <Loader2
            className="w-3 h-3 animate-spin transition-colors"
            style={{ color: palette.accent }}
          />
        )}
      </div>

      {Result.matchWithWaiting(result, {
        onWaiting: () => (
          <InsightStream
            insights={[]}
            comment={comment ?? null}
            releaseYear={releaseYear}
            rotationStatus={rotationStatus}
            isLocal={isLocal}
            airdate={airdate}
            albumPalette={albumPalette}
          />
        ),
        onSuccess: (success) => (
          <InsightStream
            insights={success.value as Insights.Insight[]}
            comment={comment ?? null}
            releaseYear={releaseYear}
            rotationStatus={rotationStatus}
            isLocal={isLocal}
            airdate={airdate}
            albumPalette={albumPalette}
          />
        ),
        onError: () => (
          <InsightStream
            insights={[]}
            comment={comment ?? null}
            releaseYear={releaseYear}
            rotationStatus={rotationStatus}
            isLocal={isLocal}
            airdate={airdate}
            albumPalette={albumPalette}
          />
        ),
        onDefect: () => (
          <InsightStream
            insights={[]}
            comment={comment ?? null}
            releaseYear={releaseYear}
            rotationStatus={rotationStatus}
            isLocal={isLocal}
            airdate={airdate}
            albumPalette={albumPalette}
          />
        ),
      })}
    </div>
  );
};
