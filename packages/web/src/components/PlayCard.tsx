import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatPlayTime, formatRelativeTime } from '@/lib/date-utils'
import { forwardRef } from 'react'
import { AlbumArt } from './AlbumArt'
import { toast } from 'sonner'

const playCardVariants = cva(
  [
    "group relative border-b border-border/40 bg-card",
    "transition-colors duration-150",
    "hover:bg-muted/30",
    "focus-within:bg-muted/40 focus-within:outline-none",
    "cursor-pointer",
  ],
  {
    variants: {
      variant: {
        default: "bg-card border-border",
        focused: "bg-primary/5 border-primary shadow-lg ring-2 ring-primary",
        dimmed: "opacity-60"
      },
      size: {
        compact: "p-2",
        default: "p-4",
        expanded: "p-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

interface PlayCardProps extends VariantProps<typeof playCardVariants> {
  play: Play
  isFocused?: boolean
  onVisible?: () => void
  className?: string
}

export const PlayCard = forwardRef<HTMLDivElement, PlayCardProps>(
  ({ play, variant, size, isFocused, className }, ref) => {
    const imageSize = size === 'compact' ? 80 : size === 'expanded' ? 160 : 120

    const handleCopyLink = () => {
      const url = `${window.location.origin}/play/${play.id}`
      navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
    }

    // Parse release year from airdate
    const releaseYear = play.airdate ? new Date(play.airdate).getFullYear() : null

    return (
      <div
        ref={ref}
        className={cn(
          playCardVariants({
            variant: isFocused ? 'focused' : variant,
            size
          }),
          className
        )}
        tabIndex={0}
        role="article"
        aria-label={`${play.song} by ${play.artist} played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`}
        onClick={handleCopyLink}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCopyLink()
          }
        }}
      >
        <div className="flex gap-3 py-3">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
            {/* Title & Time */}
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-medium text-foreground leading-snug truncate" title={play.song}>
                {play.song || 'Untitled'}
              </h3>
              {play.airdate && (
                <time
                  className="text-xs text-muted-foreground font-mono whitespace-nowrap shrink-0 tabular-nums"
                  dateTime={play.airdate.toISOString()}
                >
                  {formatPlayTime(play.airdate)}
                </time>
              )}
            </div>

            {/* Artist */}
            <p className="text-sm text-foreground/70 truncate" title={play.artist}>
              {play.artist || 'Unknown Artist'}
            </p>

            {/* Album & Year */}
            {play.album && (
              <p className="text-xs text-muted-foreground truncate" title={play.album}>
                {play.album}
                {releaseYear && `, ${releaseYear}`}
              </p>
            )}

            {/* Badges */}
            {size !== 'compact' && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {play.rotation_status && (
                  <span className="text-xs text-muted-foreground">{play.rotation_status}</span>
                )}
                {play.labels && play.labels.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate" title={play.labels.join(', ')}>
                    {play.labels.slice(0, 2).join(', ')}
                  </span>
                )}
                {play.is_local && (
                  <span className="text-xs text-muted-foreground">Local</span>
                )}
                {play.is_request && (
                  <span className="text-xs text-muted-foreground">Request</span>
                )}
                {play.is_live && (
                  <span className="text-xs text-muted-foreground">Live</span>
                )}
              </div>
            )}

            {/* Similarity score (for search results) */}
            {play.similarity > 0 && (
              <div className="text-xs text-muted-foreground">
                Similarity: {(play.similarity * 100).toFixed(1)}%
              </div>
            )}

            {/* Comment */}
            {play.comment && size === 'expanded' && (
              <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
                {play.comment}
              </p>
            )}
          </div>
        </div>

      </div>
    )
  }
)

PlayCard.displayName = 'PlayCard'
