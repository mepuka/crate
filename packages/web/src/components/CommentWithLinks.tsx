/**
 * CommentWithLinks Component
 *
 * Parses comment text and highlights links with hover coordination.
 *
 * Features:
 * - Parses comment into text and link segments
 * - Highlights links with hover states
 * - Adds data-link-id for cross-component hover coordination
 * - Supports timeline and details variants
 *
 * Usage:
 * ```tsx
 * <CommentWithLinks playId={123} comment="Check out https://youtube.com/..." />
 * ```
 */

import { useState } from "react"
import { useAtomValue } from "@effect-atom/atom-react"
import { Chunk } from "effect"
import { playLinksAtom } from "@/atoms/link-atoms"
import { ExtractedLink } from "@/lib/links/models"
import { cn } from "@/lib/utils"

interface CommentWithLinksProps {
  playId: number
  comment: string
  variant?: "timeline" | "details"
}

export function CommentWithLinks({
  playId,
  comment,
  variant = "details"
}: CommentWithLinksProps) {
  const playLinks = useAtomValue(playLinksAtom(playId))
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)

  // Parse comment into text and link segments
  const segments = parseCommentSegments(comment, playLinks.links)

  return (
    <div className={cn("comment-text", variant === "timeline" && "text-sm")}>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <a
            key={i}
            href={segment.link!.normalizedUrl}
            data-link-id={segment.link!.id}
            className={cn(
              "link-highlight underline decoration-primary/50 hover:decoration-primary transition-colors",
              hoveredLinkId === segment.link!.id && "link-active bg-primary/10 decoration-primary"
            )}
            onMouseEnter={() => setHoveredLinkId(segment.link!.id)}
            onMouseLeave={() => setHoveredLinkId(null)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {segment.content}
          </a>
        )
      )}
    </div>
  )
}

/**
 * Parse comment into alternating text and link segments
 *
 * Algorithm:
 * 1. Sort links by position.start to process in order
 * 2. Walk through comment text, alternating between text and links
 * 3. Add text segment before each link
 * 4. Add link segment
 * 5. Add remaining text after last link
 *
 * Returns array of segments with type discriminator for rendering
 */
function parseCommentSegments(
  comment: string,
  links: Chunk.Chunk<ExtractedLink>
): Array<{ type: "text" | "link"; content: string; link?: ExtractedLink }> {
  if (Chunk.isEmpty(links)) {
    return [{ type: "text", content: comment }]
  }

  const segments: Array<{ type: "text" | "link"; content: string; link?: ExtractedLink }> = []
  const sortedLinks = [...Chunk.toReadonlyArray(links)].sort((a, b) => a.position.start - b.position.start)

  let lastIndex = 0

  for (const link of sortedLinks) {
    // Add text before link
    if (link.position.start > lastIndex) {
      segments.push({
        type: "text",
        content: comment.slice(lastIndex, link.position.start)
      })
    }

    // Add link
    segments.push({
      type: "link",
      content: link.url,
      link
    })

    lastIndex = link.position.end
  }

  // Add remaining text
  if (lastIndex < comment.length) {
    segments.push({
      type: "text",
      content: comment.slice(lastIndex)
    })
  }

  return segments
}
