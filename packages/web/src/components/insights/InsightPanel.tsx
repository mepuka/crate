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
}

export const InsightPanel = ({
  playId,
  comment,
  releaseYear,
  rotationStatus,
  isLocal,
  airdate,
}: InsightPanelProps) => {
  // Reading the atom triggers the fetch automatically via TimelineRuntime.atom
  const result = useAtomValue(insightsAtom(playId));

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Living Liner Notes
        </h4>
        {Result.isWaiting(result) && (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
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
          />
        ),
      })}
    </div>
  );
};
