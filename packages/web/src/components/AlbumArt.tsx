import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Music } from 'lucide-react'

interface AlbumArtProps {
  src: string | null
  alt: string
  size?: number
  className?: string
}

export function AlbumArt({ src, alt, size = 120, className }: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const imageSrc = src || '/placeholder-album.png'

  return (
    <div
      className={cn("relative rounded overflow-hidden bg-muted shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Music className="w-8 h-8 text-muted-foreground/30" />
        </div>
      )}

      {/* Image */}
      {!error && (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
