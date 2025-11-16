import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'

interface AlbumArtProps {
  src: string | null
  alt: string
  size?: number
  className?: string
  isNewMusic?: boolean
}

// Generate organic gradient based on alt text hash
function generateOrganicGradient(seed: string): string {
  // Simple hash function
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }

  // Desaturated placeholder palettes - Phase 1.3
  // Low saturation (15%) so placeholders recede visually and don't compete with real album art
  const palettes = [
    // Blue-gray gradient
    ['hsl(240, 15%, 28%)', 'hsl(240, 15%, 32%)'],
    // Purple-gray gradient
    ['hsl(280, 15%, 28%)', 'hsl(280, 15%, 32%)'],
    // Teal-gray gradient
    ['hsl(160, 15%, 28%)', 'hsl(160, 15%, 32%)'],
    // Cyan-gray gradient
    ['hsl(200, 15%, 28%)', 'hsl(200, 15%, 32%)'],
    // Magenta-gray gradient
    ['hsl(320, 15%, 28%)', 'hsl(320, 15%, 32%)'],
    // Amber-gray gradient
    ['hsl(40, 15%, 28%)', 'hsl(40, 15%, 32%)'],
  ]

  const paletteIndex = Math.abs(hash) % palettes.length
  const palette = palettes[paletteIndex]

  // Random angle based on hash
  const angle = 135 + (Math.abs(hash >> 8) % 90)

  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`
}

export function AlbumArt({ src, alt, size = 120, className, isNewMusic = false }: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Generate consistent gradient for this album
  const gradient = useMemo(() => generateOrganicGradient(alt), [alt])

  return (
    <div
      className={cn("album-art relative rounded overflow-hidden shrink-0", className)}
      data-new-music={isNewMusic ? "new" : undefined}
      style={{
        width: size,
        height: size,
        background: gradient
      }}
    >
      {/* Subtle noise texture overlay */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px'
        }}
      />

      {/* Image */}
      {src && !error && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200 relative z-10",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
