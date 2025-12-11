import { useEffect, useContext } from "react";
import { useAtom, Result, RegistryContext, Registry } from "@effect-atom/atom-react";
import { insightsAtom, fetchInsightsAction } from "@/atoms/insights";
import { Effect } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { InsightStream } from "./InsightStream";
import { Loader2 } from "lucide-react";

interface InsightPanelProps {
  playId: number;
  comment?: string | null;
}

export const InsightPanel = ({ playId, comment }: InsightPanelProps) => {
  const [result] = useAtom(insightsAtom(playId));
  const registry = useContext(RegistryContext);

  useEffect(() => {
    // Manually run the fetch action, providing necessary services
    // 1. AtomRegistry (from React Context)
    // 2. HttpClient (from FetchHttpClient layer)
    const program = fetchInsightsAction(playId).pipe(
      Effect.provideService(Registry.AtomRegistry, registry),
      Effect.provide(FetchHttpClient.layer)
    );
    
    Effect.runPromise(program);
  }, [playId, registry]);

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
             />
        ),
        onSuccess: (success) => (
            <InsightStream insights={success.value} comment={comment ?? null} />
        ),
        onError: () => (
            <InsightStream insights={[]} comment={comment ?? null} />
        ),
        onDefect: () => (
             <InsightStream insights={[]} comment={comment ?? null} />
        )
      })}
    </div>
  );
};
