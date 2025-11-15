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
 * YouTube thumbnail preview - REDESIGNED
 * Philosophy: Thumbnail is the star, minimal text overlay
 */
interface YoutubeThumbnailProps {
  videoId: string
  thumbnail: string
}

function YoutubeThumbnail({ videoId, thumbnail }: YoutubeThumbnailProps) {
  return (
    <div className="youtube-preview group relative overflow-hidden rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20">
      {/* Full-bleed thumbnail */}
      <img
        src={thumbnail}
        alt={`YouTube video ${videoId}`}
        className="w-full h-20 object-cover transition-transform duration-300 group-hover:scale-105"
      />

      {/* Minimal overlay with just icon - appears on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

      {/* Small YouTube icon badge - bottom right */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-600/90 backdrop-blur-sm">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
        <ExternalLink className="w-2.5 h-2.5 text-white opacity-70" />
      </div>
    </div>
  )
}

/**
 * SoundCloud preview badge - REDESIGNED
 * Philosophy: Minimal, icon-focused, subtle
 */
interface SoundCloudPreviewProps {
  trackId: string
  domain: string
}

function SoundCloudPreview({ domain }: SoundCloudPreviewProps) {
  return (
    <div className="soundcloud-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 transition-all duration-300 hover:shadow-md hover:shadow-orange-500/15 hover:border-orange-500/30">
      <Music className="w-4 h-4 text-orange-500/90 group-hover:text-orange-400 transition-colors" />
      <span className="text-xs font-medium text-orange-500/80 group-hover:text-orange-400 transition-colors">
        SoundCloud
      </span>
      <ExternalLink className="w-3 h-3 text-orange-500/50 group-hover:text-orange-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * KEXP badge (blog or main site) - REDESIGNED
 * Philosophy: Minimal, icon-focused, subtle
 */
interface KexpBadgeProps {
  path: string
  isBlog: boolean
}

function KexpBadge({ path, isBlog }: KexpBadgeProps) {
  return (
    <div className="kexp-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 transition-all duration-300 hover:shadow-md hover:shadow-blue-500/15 hover:border-blue-500/30">
      <Newspaper className="w-4 h-4 text-blue-500/90 group-hover:text-blue-400 transition-colors" />
      <span className="text-xs font-medium text-blue-500/80 group-hover:text-blue-400 transition-colors">
        {isBlog ? "Blog" : "KEXP"}
      </span>
      <ExternalLink className="w-3 h-3 text-blue-500/50 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * Generic link badge - REDESIGNED
 * Philosophy: Minimal, icon-focused, subtle
 */
interface GenericLinkBadgeProps {
  domain: string
  category: "Social" | "News" | "Website" | "Other"
}

function GenericLinkBadge({ domain, category }: GenericLinkBadgeProps) {
  const { icon, colorClass, hoverColorClass, shadowClass } = getCategoryStyle(category)

  return (
    <div className={cn(
      "generic-preview group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300",
      colorClass,
      hoverColorClass,
      shadowClass
    )}>
      {icon}
      <span className="text-xs font-medium truncate max-w-[120px] group-hover:text-accent transition-colors">
        {domain}
      </span>
      <ExternalLink className="w-3 h-3 opacity-50 group-hover:opacity-80 group-hover:text-accent transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </div>
  )
}

/**
 * Get category styling - REDESIGNED for cohesive, subtle look
 */
function getCategoryStyle(category: "Social" | "News" | "Website" | "Other") {
  switch (category) {
    case "Social":
      return {
        icon: <ExternalLink className="w-4 h-4 text-purple-500/90 group-hover:text-purple-400 transition-colors" />,
        colorClass: "bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20",
        hoverColorClass: "hover:border-purple-500/30",
        shadowClass: "hover:shadow-md hover:shadow-purple-500/15"
      }
    case "News":
      return {
        icon: <Newspaper className="w-4 h-4 text-blue-500/90 group-hover:text-blue-400 transition-colors" />,
        colorClass: "bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20",
        hoverColorClass: "hover:border-blue-500/30",
        shadowClass: "hover:shadow-md hover:shadow-blue-500/15"
      }
    case "Website":
      return {
        icon: <Globe className="w-4 h-4 text-green-500/90 group-hover:text-green-400 transition-colors" />,
        colorClass: "bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20",
        hoverColorClass: "hover:border-green-500/30",
        shadowClass: "hover:shadow-md hover:shadow-green-500/15"
      }
    default:
      return {
        icon: <ExternalLink className="w-4 h-4 text-gray-500/90 group-hover:text-accent transition-colors" />,
        colorClass: "bg-gradient-to-br from-gray-500/10 to-gray-600/5 border border-gray-500/20",
        hoverColorClass: "hover:border-accent/30",
        shadowClass: "hover:shadow-md hover:shadow-gray-500/15"
      }
  }
}
