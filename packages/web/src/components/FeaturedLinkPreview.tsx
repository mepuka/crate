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
 * YouTube thumbnail preview - Compact inline with subtle video indicator
 * Philosophy: Compact, inline badge with thumbnail - video icon as subtle indicator
 */
interface YoutubeThumbnailProps {
  videoId: string
  thumbnail: string
}

function YoutubeThumbnail({ thumbnail }: YoutubeThumbnailProps) {
  return (
    <div className="youtube-preview group inline-flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/5 border border-accent/20 transition-all duration-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-accent/15 hover:border-accent/30">
      {/* Compact thumbnail */}
      <div className="relative w-12 h-9 rounded overflow-hidden shrink-0">
        <img
          src={thumbnail}
          alt="Music video preview"
          className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
        />
        {/* Subtle play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <svg className="w-4 h-4 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>

      {/* Minimal text */}
      <span className="text-xs font-medium text-accent/80 group-hover:text-accent motion-safe:transition-colors">
        Video
      </span>

      <ExternalLink className="w-3 h-3 text-accent/50 group-hover:text-accent motion-safe:transition-all motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * SoundCloud preview badge - Minimal, uses accent color
 */
interface SoundCloudPreviewProps {
  trackId: string
  domain: string
}

function SoundCloudPreview(_props: SoundCloudPreviewProps) {
  return (
    <div className="soundcloud-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/20 transition-all duration-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-accent/15 hover:border-accent/30">
      <Music className="w-4 h-4 text-accent/90 group-hover:text-accent motion-safe:transition-colors" />
      <span className="text-xs font-medium text-accent/80 group-hover:text-accent motion-safe:transition-colors">
        SoundCloud
      </span>
      <ExternalLink className="w-3 h-3 text-accent/50 group-hover:text-accent motion-safe:transition-all motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * KEXP badge (blog or main site) - Uses accent color
 */
interface KexpBadgeProps {
  path: string
  isBlog: boolean
}

function KexpBadge({ isBlog }: KexpBadgeProps) {
  return (
    <div className="kexp-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/20 transition-all duration-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-accent/15 hover:border-accent/30">
      <Newspaper className="w-4 h-4 text-accent/90 group-hover:text-accent motion-safe:transition-colors" />
      <span className="text-xs font-medium text-accent/80 group-hover:text-accent motion-safe:transition-colors">
        {isBlog ? "Blog" : "KEXP"}
      </span>
      <ExternalLink className="w-3 h-3 text-accent/50 group-hover:text-accent motion-safe:transition-all motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * Generic link badge - Uses accent color consistently
 */
interface GenericLinkBadgeProps {
  domain: string
  category: "Social" | "News" | "Website" | "Other"
}

function GenericLinkBadge({ domain, category }: GenericLinkBadgeProps) {
  const icon = getCategoryIcon(category)

  return (
    <div className="generic-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/20 transition-all duration-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-accent/15 hover:border-accent/30">
      {icon}
      <span className="text-xs font-medium truncate max-w-[120px] text-accent/80 group-hover:text-accent motion-safe:transition-colors">
        {domain}
      </span>
      <ExternalLink className="w-3 h-3 text-accent/50 group-hover:text-accent motion-safe:transition-all motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * Get category icon - consistent styling
 */
function getCategoryIcon(category: "Social" | "News" | "Website" | "Other") {
  const iconClass = "w-4 h-4 text-accent/90 group-hover:text-accent motion-safe:transition-colors"

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
