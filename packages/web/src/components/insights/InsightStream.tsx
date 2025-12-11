import { Insights } from "@crate/domain";
import { InsightBlock } from "./InsightBlock";
import { MessageSquareQuote } from "lucide-react";

interface InsightStreamProps {
  insights: Insights.Insight[];
  comment?: string | null;
}

export const InsightStream = ({ insights, comment }: InsightStreamProps) => {
  return (
    <div className="space-y-3 pt-2">
      {comment && (
        <div 
            className="flex items-start gap-3 p-3 rounded-md bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards"
            style={{ animationDelay: "0ms" }}
        >
          <MessageSquareQuote className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none text-primary">DJ Comment</p>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {comment}
            </p>
          </div>
        </div>
      )}
      
      {insights.map((insight, i) => (
        <div 
            key={`${insight._tag}-${i}`}
            className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards"
            style={{ animationDelay: `${(i + (comment ? 1 : 0)) * 100}ms` }}
        >
            <InsightBlock insight={insight} />
        </div>
      ))}
      
      {insights.length === 0 && !comment && (
          <div className="p-8 text-center text-sm text-muted-foreground italic bg-muted/20 rounded-lg border border-border/50 border-dashed">
              No streaming insights available for this track.
          </div>
      )}
    </div>
  );
};
