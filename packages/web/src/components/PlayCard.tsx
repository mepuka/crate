import { Play } from '@/domain'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { formatSemanticTime, formatRelativeTime } from '@/lib/date-utils'
import { getNewMusicDataAttr, isNewMusic } from '@/lib/new-music-utils'
import { forwardRef, memo, useCallback, useMemo } from 'react'
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
        compact: "p-1.5",
        default: "p-2",
        expanded: "p-4"
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


export const PlayCard = memo(forwardRef<HTMLDivElement, PlayCardProps>(
  ({ play, variant, size, isFocused, className }, ref) => {
    // Smaller image sizes for compact design
    const imageSize = size === 'compact' ? 56 : size === 'expanded' ? 120 : 72
    const [_, setSelectedId] = useAtom(selectedPlayIdAtom)

    // Memoize computed values to avoid recalculating on every render
    const isNonTrackPlay = useMemo(
      () => !play.song && !play.artist && play.comment,
      [play.song, play.artist, play.comment]
    )

    const releaseYear = useMemo(
      () => play.release_date ? new Date(play.release_date).getFullYear() : null,
      [play.release_date]
    )

    const hasArt = useMemo(
      () => !!(play.thumbnail_uri || play.image_uri),
      [play.thumbnail_uri, play.image_uri]
    )

    const ageCategory = useMemo(
      () => getAgeCategory(play.airdate),
      [play.airdate]
    )

    const newMusicIndicator = useMemo(
      () => getNewMusicDataAttr(play),
      [play]
    )

    const isNewRelease = useMemo(
      () => isNewMusic(play),
      [play]
    )

    // Memoize handlers to prevent unnecessary re-renders of children
    const handleClick = useCallback(() => {
      setSelectedId(Option.some(play.id))
    }, [play.id, setSelectedId])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setSelectedId(Option.some(play.id))
      }
    }, [play.id, setSelectedId])

    return (
      <div
        ref={ref}
        className={cn(
          "play-card cursor-pointer",
          hasArt ? "has-art" : "is-placeholder",
          playCardVariants({
            variant: isFocused ? 'focused' : variant,
            size
          }),
          className
        )}
        data-age={ageCategory}
        data-new-music={newMusicIndicator}
        role="article" // The main card is an article
      >
        {/* Clickable overlay for entire card - z-index 0 to sit behind interactive children */}
        <div
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          className="absolute inset-0 z-0 cursor-pointer"
          aria-label={isNonTrackPlay
            ? `View details for ${play.comment} - Special program segment played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`
            : `View details for ${play.song} by ${play.artist} played ${play.airdate ? formatRelativeTime(play.airdate) : ''}`
          }
        />
        <div className="relative z-10 flex gap-2.5 py-1 pointer-events-none">
          {/* Album Art */}
          <AlbumArt
            src={play.thumbnail_uri || play.image_uri}
            alt={`${play.album} by ${play.artist}`}
            size={imageSize}
            isNewMusic={isNewRelease}
          />

          {/* Metadata */}
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 justify-center">
            {/* Title & Time */}
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="track-title text-foreground truncate text-sm leading-snug" title={isNonTrackPlay ? play.comment! : play.song}>
                {isNonTrackPlay ? play.comment : (play.song || 'Untitled')}
              </h3>
              {play.airdate && (
                <time
                  className="timestamp text-foreground/50 whitespace-nowrap shrink-0 text-[10px]"
                  dateTime={play.airdate.toISOString()}
                >
                  {formatSemanticTime(play.airdate)}
                </time>
              )}
            </div>

            {/* Artist */}
            {!isNonTrackPlay && (
              <p className="text-xs text-foreground/70 truncate leading-snug" title={play.artist}>
                {play.artist || 'Unknown Artist'}
              </p>
            )}
            {isNonTrackPlay && (
              <p className="text-xs text-muted-foreground/60 italic">
                Program Segment
              </p>
            )}

            {/* Album & Release Year - single line */}
            {!isNonTrackPlay && (play.album || releaseYear) && (
              <p className="text-[11px] text-muted-foreground/60 leading-tight truncate" title={play.album || undefined}>
                {play.album && releaseYear ? (
                  <>
                    {play.album}
                    <span className="mx-1">•</span>
                    <span className="font-mono">{releaseYear}</span>
                  </>
                ) : play.album ? (
                  play.album
                ) : releaseYear ? (
                  <span className="font-mono">{releaseYear}</span>
                ) : null}
              </p>
            )}

            {/* Compact badges - only show most important */}
            {!isNonTrackPlay && size === 'expanded' && (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {isNewRelease && (
                  <span className="new-music-badge text-[10px] py-0.5 px-1.5">New</span>
                )}
                {play.is_local && (
                  <span className="text-[10px] text-accent/80">Local</span>
                )}
                {play.is_request && (
                  <span className="text-[10px] text-accent/80">Request</span>
                )}
              </div>
            )}

            {/* New music indicator for default size */}
            {!isNonTrackPlay && size !== 'expanded' && isNewRelease && (
              <span className="new-music-badge text-[10px] py-0.5 px-1.5 w-fit">New</span>
            )}

            {/* Similarity score (for search results) */}
            {play.similarity > 0 && (
              <div className="text-[10px] text-muted-foreground/60">
                {(play.similarity * 100).toFixed(0)}% match
              </div>
            )}

            {/* Comment - only in expanded */}
            {play.comment && size === 'expanded' && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 italic line-clamp-2">
                {play.comment}
              </p>
            )}

            {/* Featured Link Preview - only in expanded */}
            {size === 'expanded' && (
              <FeaturedLinkPreview playId={play.id} />
            )}
          </div>
        </div>
      </div>
    )
  }
))

PlayCard.displayName = 'PlayCard'
