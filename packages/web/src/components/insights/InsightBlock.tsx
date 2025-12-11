import { Insights } from "@crate/domain";
import { Ticket, Repeat, AudioWaveform, Network, Link as LinkIcon, History, ExternalLink } from "lucide-react";

interface InsightBlockProps {
  insight: Insights.Insight;
}

export const InsightBlock = ({ insight }: InsightBlockProps) => {
  switch (insight._tag) {
    case "Concert":
      return (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
          <Ticket className="w-5 h-5 text-teal-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">
              Live at {insight.venue || "Unknown Venue"}
            </p>
            {insight.date && (
                <p className="text-xs text-muted-foreground">{new Date(insight.date).toLocaleDateString()}</p>
            )}
            <blockquote className="text-xs italic text-muted-foreground/80 mt-1 pl-2 border-l-2 border-primary/20">
              "{insight.sourceQuote}"
            </blockquote>
          </div>
        </div>
      );

    case "Cover":
      return (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
          <Repeat className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">
              Cover of <span className="font-semibold">{insight.original.title}</span>
            </p>
            <p className="text-xs text-muted-foreground">
                Original by {insight.original.artists.map(a => a.name).join(", ")}
            </p>
            <blockquote className="text-xs italic text-muted-foreground/80 mt-1 pl-2 border-l-2 border-primary/20">
              "{insight.sourceQuote}"
            </blockquote>
          </div>
        </div>
      );

    case "Sample":
      return (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
          <AudioWaveform className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">
              {insight.direction === "samples" ? "Samples" : "Sampled in"}{" "}
              <span className="font-semibold">{insight.sampled.title}</span>
            </p>
             <p className="text-xs text-muted-foreground">
                By {insight.sampled.artists.map(a => a.name).join(", ")}
            </p>
            <blockquote className="text-xs italic text-muted-foreground/80 mt-1 pl-2 border-l-2 border-primary/20">
              "{insight.sourceQuote}"
            </blockquote>
          </div>
        </div>
      );

    case "Connection":
       return (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
          <Network className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">
              Connected to {insight.toArtist.name}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {insight.connectionType.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted-foreground/90 pt-1">
              {insight.explanation}
            </p>
          </div>
        </div>
      );

    case "Link":
      return (
        <a 
            href={insight.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-md bg-card border border-border hover:border-primary/50 transition-colors group"
        >
          <div className="p-2 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
             <LinkIcon className="w-4 h-4 text-foreground/70" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium leading-none truncate group-hover:text-primary transition-colors">
                {insight.title}
                </p>
                <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {insight.summary}
            </p>
            <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                    {insight.linkType}
                </span>
            </div>
          </div>
        </a>
      );

    case "PlayHistory":
         return (
        <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
          <History className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none">
              Played {insight.totalPlays} times
            </p>
            {insight.lastPlay && (
                <p className="text-xs text-muted-foreground">
                    Last played on {new Date(insight.lastPlay.date).toLocaleDateString()}
                </p>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}
