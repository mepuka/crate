import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'

interface AlbumArtProps {
  src: string | null
  alt: string
  size?: number
  className?: string
}

// Generate organic gradient based on alt text hash
function generateOrganicGradient(seed: string): string {
  // Simple hash function
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }

  // Color palettes that fit the dark theme
  const palettes = [
    // Deep purples to blues
    ['hsl(260, 60%, 35%)', 'hsl(220, 70%, 45%)'],
    // Warm oranges to reds
    ['hsl(20, 85%, 45%)', 'hsl(340, 75%, 50%)'],
    // Teals to greens
    ['hsl(180, 60%, 40%)', 'hsl(160, 65%, 45%)'],
    // Deep blues to purples
    ['hsl(230, 65%, 40%)', 'hsl(270, 60%, 45%)'],
    // Warm pinks to purples
    ['hsl(330, 70%, 45%)', 'hsl(280, 65%, 50%)'],
    // Amber to orange
    ['hsl(35, 80%, 45%)', 'hsl(15, 85%, 50%)'],
  ]

  const paletteIndex = Math.abs(hash) % palettes.length
  const palette = palettes[paletteIndex]

  // Random angle based on hash
  const angle = 135 + (Math.abs(hash >> 8) % 90)

  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]})`
}

export function AlbumArt({ src, alt, size = 120, className }: AlbumArtProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Generate consistent gradient for this album
  const gradient = useMemo(() => generateOrganicGradient(alt), [alt])

  return (
    <div
      className={cn("relative rounded overflow-hidden shrink-0", className)}
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
            "w-full h-full object-cover transition-all duration-200 relative z-10",
            "group-hover:scale-105",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
