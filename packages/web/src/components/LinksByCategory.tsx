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

import { useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { HashMap, Chunk } from "effect"
import { linksByCategoryAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
import { ExternalLink, Music, Newspaper, Globe, Video } from "lucide-react"
import { cn } from "@/lib/utils"

export function LinksByCategory({ playId }: { playId: number }) {
  const byCategory = useAtomValue(linksByCategoryAtom(playId))
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  if (HashMap.isEmpty(byCategory)) return null

  return (
    <div className="links-section space-y-6">
      <h3 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.02em' }}>
        Links
      </h3>
      {Array.from(HashMap.toEntries(byCategory)).map(([category, links]) => (
        <CategorySection
          key={category}
          category={category}
          links={links}
          hoveredLinkId={hoveredLinkId}
          onHover={setHoveredLinkId}
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
      <div className="category-header flex items-center gap-3 mb-3 pb-2 border-b border-border/50">
        <div className="p-1.5 rounded-lg bg-accent/10">{icon}</div>
        <span
          className="font-semibold text-base"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '-0.01em' }}
        >
          {category}
        </span>
        <span
          className="text-muted-foreground font-medium tabular-nums"
          style={{ fontSize: 'var(--font-time)', letterSpacing: '0.05em' }}
        >
          {count}
        </span>
      </div>
      <div className="category-links space-y-2">
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
  return (
    <a
      href={link.normalizedUrl}
      data-link-id={link.id}
      className={cn(
        "link-item flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
        "border border-border/50 hover:border-accent/40",
        "bg-gradient-to-br from-card/50 to-card/30",
        "hover:from-accent/5 hover:to-accent/10",
        "hover:shadow-lg hover:shadow-accent/10",
        "group",
        isHovered && "link-active border-accent/60 shadow-xl shadow-accent/20"
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
 * Render link content based on type (discriminated union matching)
 */
function renderLinkContent(link: ExtractedLink) {
  switch (link._tag) {
    case "Youtube":
      return (
        <>
          <div className="relative flex-shrink-0 overflow-hidden rounded-lg">
            <img
              src={link.thumbnailUrl}
              alt="YouTube thumbnail"
              className="link-thumbnail w-24 h-16 object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-red-600/30 to-transparent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-red-500 group-hover:text-red-400 transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              YouTube Video
            </div>
            <div className="text-xs text-muted-foreground/70 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.videoId}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
    case "SoundCloud":
      return (
        <>
          <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20 flex-shrink-0 group-hover:shadow-lg group-hover:shadow-orange-500/20 transition-all">
            <Music className="w-7 h-7 text-orange-500 group-hover:text-orange-400 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-orange-500 group-hover:text-orange-400 transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              SoundCloud
            </div>
            <div className="text-xs text-muted-foreground/70 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.domain}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
    case "Kexp":
      return (
        <>
          <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex-shrink-0 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
            <Newspaper className="w-7 h-7 text-blue-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-blue-500 group-hover:text-blue-400 transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              {link.isBlog ? "KEXP Blog" : "KEXP.org"}
            </div>
            <div className="text-xs text-muted-foreground/70 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.path}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
    case "Generic":
      return (
        <>
          <div className={cn(
            "flex items-center justify-center w-14 h-14 rounded-lg border flex-shrink-0 transition-all group-hover:shadow-lg",
            getGenericBgColor(link.category)
          )}>
            {getGenericIcon(link.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate group-hover:text-accent transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              {link.domain}
            </div>
            <div className="text-xs text-muted-foreground/70 mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.category}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
  }
}

/**
 * Get category icon for header
 */
function getCategoryIcon(category: string) {
  switch (category) {
    case "Youtube":
      return <Video className="w-5 h-5 text-red-500" />
    case "SoundCloud":
      return <Music className="w-5 h-5 text-orange-500" />
    case "Kexp":
      return <Newspaper className="w-5 h-5 text-blue-500" />
    case "Social":
      return <ExternalLink className="w-5 h-5 text-purple-500" />
    case "News":
      return <Newspaper className="w-5 h-5 text-blue-500" />
    case "Website":
      return <Globe className="w-5 h-5 text-green-500" />
    default:
      return <ExternalLink className="w-5 h-5 text-gray-500" />
  }
}

/**
 * Get icon for generic link category
 */
function getGenericIcon(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return <ExternalLink className="w-6 h-6 text-purple-500" />
    case "News":
      return <Newspaper className="w-6 h-6 text-blue-500" />
    case "Website":
      return <Globe className="w-6 h-6 text-green-500" />
    default:
      return <ExternalLink className="w-6 h-6 text-gray-500" />
  }
}

/**
 * Get background color for generic link category - enhanced gradients
 */
function getGenericBgColor(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return "bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/20 group-hover:shadow-purple-500/20"
    case "News":
      return "bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/20 group-hover:shadow-blue-500/20"
    case "Website":
      return "bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/20 group-hover:shadow-green-500/20"
    default:
      return "bg-gradient-to-br from-gray-500/20 to-gray-600/10 border-gray-500/20 group-hover:shadow-gray-500/20"
  }
}
