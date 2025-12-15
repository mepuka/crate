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
            className="flex items-start gap-3 p-3 rounded-md bg-accent/10 border border-accent/20 animate-insight-appear"
            style={{ animationDelay: "0ms" }}
        >
          <MessageSquareQuote className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none text-accent">DJ Comment</p>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {comment}
            </p>
          </div>
        </div>
      )}
      
      {insights.map((insight, i) => (
        <div
            key={`${insight._tag}-${i}`}
            className="animate-insight-appear"
            style={{ animationDelay: `${(i + (comment ? 1 : 0)) * 50}ms` }}
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
