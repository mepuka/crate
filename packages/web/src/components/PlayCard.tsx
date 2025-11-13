import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { forwardRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlbumArt } from './AlbumArt'
import { toast } from 'sonner'

const playCardVariants = cva(
  [
    "group relative overflow-hidden rounded-lg border",
    "transition-all duration-200 ease-in-out",
    "hover:shadow-md hover:border-primary/50",
    "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2",
    "cursor-pointer"
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
        aria-label={`${play.song} by ${play.artist} played ${play.airdate ? formatDistanceToNow(new Date(play.airdate)) + ' ago' : ''}`}
        onClick={handleCopyLink}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCopyLink()
          }
        }}
      >
        <div className="flex gap-3 sm:gap-4">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Title & Time */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate" title={play.song}>
                {play.song || 'Untitled'}
              </h3>
              {play.airdate && (
                <time
                  className="text-xs sm:text-sm text-muted-foreground font-mono whitespace-nowrap shrink-0"
                  dateTime={play.airdate.toISOString()}
                >
                  {play.airdate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </time>
              )}
            </div>

            {/* Artist */}
            <p className="text-xs sm:text-sm text-foreground/90 truncate" title={play.artist}>
              {play.artist || 'Unknown Artist'}
            </p>

            {/* Album & Year */}
            {play.album && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate" title={play.album}>
                {play.album}
                {releaseYear && ` • ${releaseYear}`}
              </p>
            )}

            {/* Badges */}
            {size !== 'compact' && (
              <div className="flex flex-wrap gap-1 mt-1">
                {play.rotation_status && (
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {play.rotation_status}
                  </Badge>
                )}
                {play.labels && play.labels.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate" title={play.labels.join(', ')}>
                    {play.labels.slice(0, 2).join(', ')}
                  </span>
                )}
                {play.is_local && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-secondary text-secondary">
                    Local
                  </Badge>
                )}
                {play.is_request && (
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    ★ Request
                  </Badge>
                )}
                {play.is_live && (
                  <Badge variant="outline" className="text-xs px-2 py-0 border-accent text-accent">
                    ● Live
                  </Badge>
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

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
          <span className="text-xs text-primary font-medium bg-background/90 px-3 py-1 rounded-full">
            Click to copy link
          </span>
        </div>
      </div>
    )
  }
)

PlayCard.displayName = 'PlayCard'
