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
    <div className="links-section">
      <h3 className="text-lg font-semibold mb-3">Links</h3>
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
    <div className="category-section mb-4">
      <div className="category-header flex items-center gap-2 mb-2">
        {icon}
        <span className="font-medium">{category}</span>
        <span className="text-muted-foreground text-sm">({count})</span>
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
        "link-item flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors border border-transparent",
        isHovered && "link-active bg-accent border-primary/20"
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
          <img
            src={link.thumbnailUrl}
            alt="YouTube thumbnail"
            className="link-thumbnail w-20 h-14 object-cover rounded flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium">YouTube Video</div>
            <div className="text-sm text-muted-foreground truncate">{link.videoId}</div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </>
      )
    case "SoundCloud":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded bg-orange-500/20 flex-shrink-0">
            <Music className="w-6 h-6 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">SoundCloud</div>
            <div className="text-sm text-muted-foreground truncate">{link.domain}</div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </>
      )
    case "Kexp":
      return (
        <>
          <div className="flex items-center justify-center w-12 h-12 rounded bg-blue-500/20 flex-shrink-0">
            <Newspaper className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{link.isBlog ? "KEXP Blog" : "KEXP.org"}</div>
            <div className="text-sm text-muted-foreground truncate">{link.path}</div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </>
      )
    case "Generic":
      return (
        <>
          <div className={cn("flex items-center justify-center w-12 h-12 rounded flex-shrink-0", getGenericBgColor(link.category))}>
            {getGenericIcon(link.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{link.domain}</div>
            <div className="text-sm text-muted-foreground">{link.category}</div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
 * Get background color for generic link category
 */
function getGenericBgColor(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return "bg-purple-500/20"
    case "News":
      return "bg-blue-500/20"
    case "Website":
      return "bg-green-500/20"
    default:
      return "bg-gray-500/20"
  }
}
