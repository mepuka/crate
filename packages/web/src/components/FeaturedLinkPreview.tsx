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
import { Music, Newspaper, Globe } from "lucide-react"

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
    <div className="youtube-preview group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/[0.03] border border-accent/10 transition-all duration-200 motion-safe:hover:bg-accent/[0.06] motion-safe:hover:border-accent/20">
      {/* Very compact high-res thumbnail */}
      <div className="relative w-8 h-6 rounded overflow-hidden shrink-0">
        <img
          src={thumbnail}
          alt="Music video preview"
          className="w-full h-full object-cover"
        />
        {/* Very subtle play indicator */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
          <svg className="w-2.5 h-2.5 text-white drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>

      {/* Minimal text */}
      <span className="text-[10px] font-medium text-muted-foreground/60 group-hover:text-accent/80 motion-safe:transition-colors uppercase tracking-wide">
        Video
      </span>
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
    <div className="soundcloud-preview group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/[0.03] border border-accent/10 transition-all duration-200 motion-safe:hover:bg-accent/[0.06] motion-safe:hover:border-accent/20">
      <Music className="w-3 h-3 text-muted-foreground/50 group-hover:text-accent/80 motion-safe:transition-colors" />
      <span className="text-[10px] font-medium text-muted-foreground/60 group-hover:text-accent/80 motion-safe:transition-colors uppercase tracking-wide">
        Audio
      </span>
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
    <div className="kexp-preview group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/[0.03] border border-accent/10 transition-all duration-200 motion-safe:hover:bg-accent/[0.06] motion-safe:hover:border-accent/20">
      <Newspaper className="w-3 h-3 text-muted-foreground/50 group-hover:text-accent/80 motion-safe:transition-colors" />
      <span className="text-[10px] font-medium text-muted-foreground/60 group-hover:text-accent/80 motion-safe:transition-colors uppercase tracking-wide">
        {isBlog ? "Blog" : "Link"}
      </span>
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

function GenericLinkBadge({ domain }: GenericLinkBadgeProps) {
  return (
    <div className="generic-preview group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/[0.03] border border-accent/10 transition-all duration-200 motion-safe:hover:bg-accent/[0.06] motion-safe:hover:border-accent/20">
      <Globe className="w-3 h-3 text-muted-foreground/50 group-hover:text-accent/80 motion-safe:transition-colors" />
      <span className="text-[10px] font-medium truncate max-w-[80px] text-muted-foreground/60 group-hover:text-accent/80 motion-safe:transition-colors">
        {domain}
      </span>
    </div>
  )
}

