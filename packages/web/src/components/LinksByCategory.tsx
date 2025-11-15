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
          {/* Full-width thumbnail with overlay */}
          <img
            src={link.thumbnailUrl}
            alt="YouTube video"
            className="link-thumbnail w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Gradient overlay for text contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Minimal text overlay - bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span className="text-xs font-medium text-white/90 uppercase tracking-wider">YouTube</span>
              </div>
              <div className="text-xs text-white/60 font-mono truncate" style={{ fontSize: 'var(--font-time)' }}>
                {link.videoId}
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-white/70 flex-shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      )
    case "SoundCloud":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500/15 to-orange-600/8 border border-orange-500/25 flex-shrink-0 group-hover:shadow-md group-hover:shadow-orange-500/20 transition-all">
            <Music className="w-6 h-6 text-orange-500/90 group-hover:text-orange-400 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-orange-500/90 group-hover:text-orange-400 transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              SoundCloud
            </div>
            <div className="text-xs text-muted-foreground/60 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.domain}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-orange-500/50 flex-shrink-0 transition-all group-hover:text-orange-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </>
      )
    case "Kexp":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/15 to-blue-600/8 border border-blue-500/25 flex-shrink-0 group-hover:shadow-md group-hover:shadow-blue-500/20 transition-all">
            <Newspaper className="w-6 h-6 text-blue-500/90 group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-blue-500/90 group-hover:text-blue-400 transition-colors" style={{ fontFamily: 'var(--font-family-body)' }}>
              {link.isBlog ? "KEXP Blog" : "KEXP.org"}
            </div>
            <div className="text-xs text-muted-foreground/60 truncate mt-0.5" style={{ fontSize: 'var(--font-time)' }}>
              {link.path}
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-blue-500/50 flex-shrink-0 transition-all group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
 * Get icon for generic link category - REFINED
 */
function getGenericIcon(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return <ExternalLink className="w-5 h-5 text-purple-500/90 group-hover:text-purple-400 transition-colors" />
    case "News":
      return <Newspaper className="w-5 h-5 text-blue-500/90 group-hover:text-blue-400 transition-colors" />
    case "Website":
      return <Globe className="w-5 h-5 text-green-500/90 group-hover:text-green-400 transition-colors" />
    default:
      return <ExternalLink className="w-5 h-5 text-gray-500/90 group-hover:text-accent transition-colors" />
  }
}

/**
 * Get background color for generic link category - REFINED with subtle gradients
 */
function getGenericBgColor(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return "bg-gradient-to-br from-purple-500/15 to-purple-600/8 border-purple-500/25 group-hover:shadow-purple-500/20"
    case "News":
      return "bg-gradient-to-br from-blue-500/15 to-blue-600/8 border-blue-500/25 group-hover:shadow-blue-500/20"
    case "Website":
      return "bg-gradient-to-br from-green-500/15 to-green-600/8 border-green-500/25 group-hover:shadow-green-500/20"
    default:
      return "bg-gradient-to-br from-gray-500/15 to-gray-600/8 border-gray-500/25 group-hover:shadow-gray-500/20"
  }
}
