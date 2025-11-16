import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatPlayTime, formatRelativeTime } from '@/lib/date-utils'
import { forwardRef } from 'react'
import { AlbumArt } from './AlbumArt'
import { useAtom } from '@effect-atom/atom-react'
import { selectedPlayIdAtom } from '@/atoms/play-details'
import { Option } from 'effect'
import { FeaturedLinkPreview } from './FeaturedLinkPreview'

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

// Age calculation for recency indicators - Phase 2.3
function getAgeCategory(airdate: Date | null): 'recent' | 'older' | 'old' {
  if (!airdate) return 'old'
  const minutesAgo = (Date.now() - airdate.getTime()) / 60000
  if (minutesAgo < 30) return 'recent'
  if (minutesAgo < 180) return 'older'
  return 'old'
}


export const PlayCard = forwardRef<HTMLDivElement, PlayCardProps>(
  ({ play, variant, size, isFocused, className }, ref) => {
    const imageSize = size === 'compact' ? 80 : size === 'expanded' ? 160 : 120
    const [_, setSelectedId] = useAtom(selectedPlayIdAtom)

    // Check if this is a non-track play (special segment/show)
    const isNonTrackPlay = !play.song && !play.artist && play.comment

    // Parse release year from release_date
    const releaseYear = play.release_date ? new Date(play.release_date).getFullYear() : null

    // Determine if card has album art or is a placeholder
    const hasArt = !!(play.thumbnail_uri || play.image_uri)

    // Calculate age category for recency indicators
    const ageCategory = getAgeCategory(play.airdate)

    // Handle click to open play details panel
    const handleClick = () => {
      setSelectedId(Option.some(play.id))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setSelectedId(Option.some(play.id))
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "play-card",
          hasArt ? "has-art" : "is-placeholder",
          playCardVariants({
            variant: isFocused ? 'focused' : variant,
            size
          }),
          className
        )}
        data-age={ageCategory}
        role="article"
        aria-label={isNonTrackPlay
          ? `${play.comment} - Special program segment played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`
          : `${play.song} by ${play.artist} played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`
        }
      >
        {/* Clickable overlay for entire card */}
        <div
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          className="absolute inset-0 z-20 cursor-pointer"
          aria-label={isNonTrackPlay
            ? `View details for ${play.comment}`
            : `View details for ${play.song} by ${play.artist}`
          }
        />

        <div className="relative z-10 flex gap-3 py-2 pointer-events-none min-h-[146px]">
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
              <h3 className="track-title text-foreground truncate" title={isNonTrackPlay ? play.comment! : play.song}>
                {isNonTrackPlay ? play.comment : (play.song || 'Untitled')}
              </h3>
              {play.airdate && (
                <time
                  className="timestamp text-foreground whitespace-nowrap shrink-0 ml-auto font-mono"
                  dateTime={play.airdate.toISOString()}
                >
                  {formatPlayTime(play.airdate)}
                </time>
              )}
            </div>

            {/* Artist or special content indicator */}
            {!isNonTrackPlay && (
              <p className="artist-name text-foreground truncate" title={play.artist}>
                {play.artist || 'Unknown Artist'}
              </p>
            )}
            {isNonTrackPlay && (
              <p className="artist-name text-muted-foreground/80 text-xs italic">
                Special Program Segment
              </p>
            )}

            {/* Album & Release Year */}
            {!isNonTrackPlay && (play.album || releaseYear) && (
              <p className="text-xs text-muted-foreground/80 leading-tight truncate" title={play.album || undefined}>
                {play.album && releaseYear ? (
                  <>
                    {play.album}
                    <span className="text-muted-foreground/60"> • </span>
                    <span className="text-muted-foreground/70 font-mono">{releaseYear}</span>
                  </>
                ) : play.album ? (
                  play.album
                ) : releaseYear ? (
                  <span className="text-muted-foreground/70 font-mono">{releaseYear}</span>
                ) : null}
              </p>
            )}

            {/* Badges */}
            {!isNonTrackPlay && size !== 'compact' && (
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

            {/* Featured Link Preview */}
            {size !== 'compact' && (
              <FeaturedLinkPreview playId={play.id} />
            )}
          </div>
        </div>
      </div>
    )
  }
)

PlayCard.displayName = 'PlayCard'
