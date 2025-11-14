import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatPlayTime, formatRelativeTime } from '@/lib/date-utils'
import { forwardRef } from 'react'
import { AlbumArt } from './AlbumArt'
import { Link } from '@tanstack/react-router'

const playCardVariants = cva(
  [
    "group relative z-10",
    "transition-colors duration-200 ease-out",
    "focus-within:outline-none focus-within:ring-1 focus-within:ring-primary/50",
    "cursor-pointer",
  ],
  {
    variants: {
      variant: {
        default: "",
        focused: "bg-primary/5 border-primary shadow-lg ring-2 ring-primary",
        dimmed: "opacity-60"
      },
      size: {
        compact: "p-2",
        default: "p-3",
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
        role="article"
        aria-label={`${play.song} by ${play.artist} played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`}
      >
        {/* Invisible link overlay for entire card */}
        <Link
          to="/play/$id"
          params={{ id: String(play.id) }}
          search={(prev: Record<string, unknown>) => prev}
          className="absolute inset-0 z-0"
          tabIndex={0}
          aria-label={`View ${play.song} by ${play.artist}`}
        />

        <div className="relative z-10 flex gap-3 py-2">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-1 py-0">
            {/* Title & Time */}
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-base font-bold text-foreground leading-tight truncate tracking-tight" title={play.song}>
                {play.song || 'Untitled'}
              </h3>
              {play.airdate && (
                <time
                  className="text-xs text-muted-foreground font-mono whitespace-nowrap shrink-0 ml-auto tabular-nums"
                  dateTime={play.airdate.toISOString()}
                >
                  {formatPlayTime(play.airdate)}
                </time>
              )}
            </div>

            {/* Artist */}
            <p className="text-sm text-foreground/85 truncate" title={play.artist}>
              {play.artist || 'Unknown Artist'}
            </p>

            {/* Album & Year */}
            {play.album && (
              <p className="text-xs text-muted-foreground/80 leading-tight truncate" title={play.album}>
                {play.album}
                {releaseYear && ` • ${releaseYear}`}
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
