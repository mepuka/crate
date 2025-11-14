/**
 * FeaturedLinkPreview Component
 *
 * Minimalist preview for timeline PlayCard showing the featured link.
 *
 * Features:
 * - Shows YouTube thumbnails
 * - Shows SoundCloud badges
 * - Shows KEXP blog/site badges
 * - Shows generic link badges with category icons
 * - Adds data-link-id for hover coordination
 *
 * Usage:
 * ```tsx
 * <FeaturedLinkPreview playId={123} />
 * ```
 */

import { useAtomValue } from "@effect-atom/atom-react"
import { Option } from "effect"
import { featuredLinkAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
import { ExternalLink, Music, Newspaper, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

export function FeaturedLinkPreview({ playId }: { playId: number }) {
  const featuredLink = useAtomValue(featuredLinkAtom(playId))

  return Option.match(featuredLink, {
    onNone: () => null,
    onSome: (link) => (
      <div
        className="featured-preview mt-2"
        data-link-id={link.id}
      >
        {renderLinkPreview(link)}
      </div>
    )
  })
}

/**
 * Render platform-specific preview based on link type
 * Uses discriminated union matching on _tag
 */
function renderLinkPreview(link: ExtractedLink) {
  switch (link._tag) {
    case "Youtube":
      return <YoutubeThumbnail videoId={link.videoId} thumbnail={link.thumbnailUrl} />
    case "SoundCloud":
      return <SoundCloudPreview trackId={link.trackId} domain={link.domain} />
    case "Kexp":
      return <KexpBadge path={link.path} isBlog={link.isBlog} />
    case "Generic":
      return <GenericLinkBadge domain={link.domain} category={link.category} />
  }
}

/**
 * YouTube thumbnail preview
 */
interface YoutubeThumbnailProps {
  videoId: string
  thumbnail: string
}

function YoutubeThumbnail({ videoId, thumbnail }: YoutubeThumbnailProps) {
  return (
    <div className="youtube-preview flex items-center gap-3 p-2 rounded bg-accent/50 border border-primary/20">
      <img
        src={thumbnail}
        alt={`YouTube video ${videoId}`}
        className="w-20 h-14 object-cover rounded"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">YouTube Video</div>
        <div className="text-xs text-muted-foreground truncate">{videoId}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}

/**
 * SoundCloud preview badge
 */
interface SoundCloudPreviewProps {
  trackId: string
  domain: string
}

function SoundCloudPreview({ domain }: SoundCloudPreviewProps) {
  return (
    <div className="soundcloud-preview flex items-center gap-3 p-2 rounded bg-accent/50 border border-primary/20">
      <div className="flex items-center justify-center w-10 h-10 rounded bg-orange-500/20">
        <Music className="w-5 h-5 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">SoundCloud</div>
        <div className="text-xs text-muted-foreground truncate">{domain}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}

/**
 * KEXP badge (blog or main site)
 */
interface KexpBadgeProps {
  path: string
  isBlog: boolean
}

function KexpBadge({ path, isBlog }: KexpBadgeProps) {
  return (
    <div className="kexp-preview flex items-center gap-3 p-2 rounded bg-accent/50 border border-primary/20">
      <div className="flex items-center justify-center w-10 h-10 rounded bg-blue-500/20">
        <Newspaper className="w-5 h-5 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{isBlog ? "KEXP Blog" : "KEXP.org"}</div>
        <div className="text-xs text-muted-foreground truncate">{path}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}

/**
 * Generic link badge with category-based icon
 */
interface GenericLinkBadgeProps {
  domain: string
  category: "Social" | "News" | "Website" | "Other"
}

function GenericLinkBadge({ domain, category }: GenericLinkBadgeProps) {
  const icon = getCategoryIcon(category)
  const color = getCategoryColor(category)

  return (
    <div className="generic-preview flex items-center gap-3 p-2 rounded bg-accent/50 border border-primary/20">
      <div className={cn("flex items-center justify-center w-10 h-10 rounded", color.bg)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{domain}</div>
        <div className="text-xs text-muted-foreground">{category}</div>
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  )
}

/**
 * Get icon component for category
 */
function getCategoryIcon(category: string) {
  switch (category) {
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
 * Get background color for category
 */
function getCategoryColor(category: string) {
  switch (category) {
    case "Social":
      return { bg: "bg-purple-500/20" }
    case "News":
      return { bg: "bg-blue-500/20" }
    case "Website":
      return { bg: "bg-green-500/20" }
    default:
      return { bg: "bg-gray-500/20" }
  }
}
