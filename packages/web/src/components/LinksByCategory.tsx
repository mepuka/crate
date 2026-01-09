/**
 * LinksByCategory Component
 *
 * Displays all links for a play, grouped by category with expand/collapse.
 * Used in PlayDetailsPanel for full link display.
 *
 * Features:
 * - Groups links by category (YouTube, SoundCloud, KEXP, Generic categories)
 * - Shows category headers with icons and counts
 * - Renders platform-specific link items with thumbnails/icons
 * - Hover coordination via data-link-id
 * - Uses HashMap.toEntries for iteration
 *
 * Usage:
 * ```tsx
 * <LinksByCategory playId={123} />
 * ```
 */

import { useState, useMemo, useCallback } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Chunk } from "effect"
import { linksByCategoryAtom } from "@/atoms/link-atoms"
import type { ExtractedLink } from "@/lib/links/models"
import { ExternalLink, Music, Newspaper, Globe, Video } from "lucide-react"
import { cn } from "@/lib/utils"

export function LinksByCategory({ playId }: { playId: number }) {
  const byCategory = useAtomValue(linksByCategoryAtom(playId))
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  // Memoize the categories array to avoid recreating on every render
  const categories = useMemo(
    () => Array.from(HashMap.toEntries(byCategory)),
    [byCategory]
  )

  // Memoize hover handlers to stabilize references
  const handleHover = useCallback((id: string | null) => {
    setHoveredLinkId(id)
  }, [])

  if (HashMap.isEmpty(byCategory)) return null

  return (
    <div className="links-section space-y-5">
      <h3 className="text-lg font-semibold mb-4 text-muted-foreground/80" style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.01em' }}>
        Links
      </h3>
      {categories.map(([category, links]) => (
        <CategorySection
          key={category}
          category={category}
          links={links}
          hoveredLinkId={hoveredLinkId}
          onHover={handleHover}
        />
      ))}
    </div>
  )
}

/**
 * Category section with header and list of links
 */
interface CategorySectionProps {
  category: string
  links: Chunk.Chunk<ExtractedLink>
  hoveredLinkId: string | null
  onHover: (id: string | null) => void
}

function CategorySection({ category, links, hoveredLinkId, onHover }: CategorySectionProps) {
  const icon = getCategoryIcon(category)
  const count = Chunk.size(links)

  return (
    <div className="category-section mb-6">
      <div className="category-header flex items-center gap-2.5 mb-3 pb-2 border-b border-border/30">
        <div className="p-1 rounded-md bg-accent/8">{icon}</div>
        <span
          className="font-semibold text-sm text-foreground/80"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.01em' }}
        >
          {category}
        </span>
        <span
          className="text-muted-foreground/60 font-medium tabular-nums text-xs"
          style={{ letterSpacing: '0.05em' }}
        >
          {count}
        </span>
      </div>
      <div className="category-links space-y-2.5">
        {Chunk.toReadonlyArray(links).map((link) => (
          <LinkItem
            key={link.id}
            link={link}
            isHovered={hoveredLinkId === link.id}
            onHover={() => onHover(link.id)}
            onLeave={() => onHover(null)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Individual link item with platform-specific rendering
 */
interface LinkItemProps {
  link: ExtractedLink
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
}

function LinkItem({ link, isHovered, onHover, onLeave }: LinkItemProps) {
  // YouTube gets special full-width treatment
  const isYoutube = link._tag === "Youtube"

  return (
    <a
      href={link.normalizedUrl}
      data-link-id={link.id}
      className={cn(
        "link-item block rounded-lg transition-all duration-300 group",
        isYoutube ? (
          // YouTube: minimal wrapper, thumbnail does the work
          cn(
            "overflow-hidden",
            "hover:shadow-xl hover:shadow-red-500/20",
            isHovered && "link-active shadow-2xl shadow-red-500/30"
          )
        ) : (
          // Others: subtle card with hover state
          cn(
            "flex items-center gap-3 p-3",
            "border border-border/30 hover:border-accent/30",
            "bg-gradient-to-br from-card/30 to-card/20",
            "hover:from-accent/5 hover:to-accent/8",
            "hover:shadow-md hover:shadow-accent/10",
            isHovered && "link-active border-accent/50 shadow-lg shadow-accent/20"
          )
        )
      )}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      target="_blank"
      rel="noopener noreferrer"
    >
      {renderLinkContent(link)}
    </a>
  )
}

/**
 * Render link content based on type - REDESIGNED
 * Philosophy: Thumbnails dominate, minimal text, cohesive styling
 */
function renderLinkContent(link: ExtractedLink) {
  switch (link._tag) {
    case "Youtube":
      return (
        <div className="relative w-full overflow-hidden rounded-lg group">
          {/* Larger thumbnail for details view */}
          <img
            src={link.thumbnailUrl}
            alt="Music video preview"
            className="link-thumbnail w-full h-40 object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
          />
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Subtle play icon indicator - center */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 motion-safe:transition-colors">
              <svg className="w-8 h-8 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>

          {/* Video ID badge - bottom right corner */}
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
            <span className="text-xs font-mono text-white/80" style={{ fontSize: 'var(--font-time)' }}>
              {link.videoId}
            </span>
          </div>

          {/* External link icon - top right */}
          <ExternalLink className="absolute top-2 right-2 w-4 h-4 text-white/70 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
        </div>
      )
    case "SoundCloud":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 border border-accent/25 flex-shrink-0 group-hover:shadow-md group-hover:shadow-accent/20 motion-safe:transition-all">
            <Music className="w-6 h-6 text-accent/90 group-hover:text-accent motion-safe:transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-accent/90 group-hover:text-accent motion-safe:transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              SoundCloud
            </div>
            <div className="text-xs text-muted-foreground/60 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.domain}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-accent/50 flex-shrink-0 motion-safe:transition-all group-hover:text-accent motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
        </>
      )
    case "Kexp":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 border border-accent/25 flex-shrink-0 group-hover:shadow-md group-hover:shadow-accent/20 motion-safe:transition-all">
            <Newspaper className="w-6 h-6 text-accent/90 group-hover:text-accent motion-safe:transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-accent/90 group-hover:text-accent motion-safe:transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              {link.isBlog ? "KEXP Blog" : "KEXP.org"}
            </div>
            <div className="text-xs text-muted-foreground/60 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.path}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-accent/50 flex-shrink-0 motion-safe:transition-all group-hover:text-accent motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
        </>
      )
    case "Generic":
      return (
        <>
          <div className={cn(
            "flex items-center justify-center w-12 h-12 rounded-lg border flex-shrink-0 transition-all group-hover:shadow-md",
            getGenericBgColor(link.category)
          )}>
            {getGenericIcon(link.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate group-hover:text-accent transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              {link.domain}
            </div>
            <div className="text-xs text-muted-foreground/60 mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.category}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 transition-all group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
  }
}

/**
 * Get category icon for header - uses accent color consistently
 */
function getCategoryIcon(category: string) {
  const iconClass = "w-5 h-5 text-accent"

  switch (category) {
    case "Youtube":
      return <Video className={iconClass} />
    case "SoundCloud":
      return <Music className={iconClass} />
    case "Kexp":
      return <Newspaper className={iconClass} />
    case "Social":
      return <ExternalLink className={iconClass} />
    case "News":
      return <Newspaper className={iconClass} />
    case "Website":
      return <Globe className={iconClass} />
    default:
      return <ExternalLink className={iconClass} />
  }
}

/**
 * Get icon for generic link category - uses accent color
 */
function getGenericIcon(category: "Social" | "News" | "Website" | "Other") {
  const iconClass = "w-5 h-5 text-accent/90 group-hover:text-accent motion-safe:transition-colors"

  switch (category) {
    case "Social":
      return <ExternalLink className={iconClass} />
    case "News":
      return <Newspaper className={iconClass} />
    case "Website":
      return <Globe className={iconClass} />
    default:
      return <ExternalLink className={iconClass} />
  }
}

/**
 * Get background color for generic link category - uses accent color consistently
 */
function getGenericBgColor(_category: "Social" | "News" | "Website" | "Other") {
  return "bg-accent/10 border-accent/25 group-hover:shadow-accent/20"
}
