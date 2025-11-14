import { Effect, Schema } from "effect"
import { Kexp } from "@crate/domain"

const { KexpProgram, KexpShow } = Kexp

// Cache keys
const CACHE_KEYS = {
  PROGRAMS: "kexp-cache:programs",
  SHOWS: "kexp-cache:shows"
} as const

// Cache TTL (time to live) in milliseconds
const CACHE_TTL = {
  PROGRAMS: 24 * 60 * 60 * 1000, // 24 hours
  SHOWS: 60 * 60 * 1000 // 1 hour
} as const

// Cache entry structure with timestamp
const CachedPrograms = Schema.Struct({
  data: Schema.Array(KexpProgram),
  timestamp: Schema.Number
})
type CachedPrograms = Schema.Schema.Type<typeof CachedPrograms>

const CachedShows = Schema.Struct({
  data: Schema.Array(KexpShow),
  timestamp: Schema.Number
})
type CachedShows = Schema.Schema.Type<typeof CachedShows>

// Type aliases for convenience
type KexpProgram = Schema.Schema.Type<typeof KexpProgram>
type KexpShow = Schema.Schema.Type<typeof KexpShow>

/**
 * Check if cached data is still valid based on TTL
 */
const isCacheValid = (timestamp: number, ttl: number): boolean => {
  return Date.now() - timestamp < ttl
}

/**
 * Save programs to localStorage with current timestamp
 */
export const savePrograms = (programs: readonly KexpProgram[]): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    const cacheEntry: CachedPrograms = {
      data: [...programs],
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEYS.PROGRAMS, JSON.stringify(cacheEntry))
  })

/**
 * Load programs from localStorage if cache is valid
 * Returns null if cache is expired or missing
 */
export const loadPrograms = (): Effect.Effect<readonly KexpProgram[] | null, never, never> =>
  Effect.sync(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.PROGRAMS)
      if (!cached) return null

      const parsed = JSON.parse(cached) as CachedPrograms

      // Check if cache is still valid
      if (!isCacheValid(parsed.timestamp, CACHE_TTL.PROGRAMS)) {
        // Clear expired cache
        localStorage.removeItem(CACHE_KEYS.PROGRAMS)
        return null
      }

      return parsed.data
    } catch {
      // If parsing fails, clear the corrupted cache
      localStorage.removeItem(CACHE_KEYS.PROGRAMS)
      return null
    }
  })

/**
 * Save shows to localStorage with current timestamp
 */
export const saveShows = (shows: readonly KexpShow[]): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    const cacheEntry: CachedShows = {
      data: [...shows],
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEYS.SHOWS, JSON.stringify(cacheEntry))
  })

/**
 * Load shows from localStorage if cache is valid
 * Returns null if cache is expired or missing
 */
export const loadShows = (): Effect.Effect<readonly KexpShow[] | null, never, never> =>
  Effect.sync(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.SHOWS)
      if (!cached) return null

      const parsed = JSON.parse(cached) as CachedShows

      // Check if cache is still valid
      if (!isCacheValid(parsed.timestamp, CACHE_TTL.SHOWS)) {
        // Clear expired cache
        localStorage.removeItem(CACHE_KEYS.SHOWS)
        return null
      }

      return parsed.data
    } catch {
      // If parsing fails, clear the corrupted cache
      localStorage.removeItem(CACHE_KEYS.SHOWS)
      return null
    }
  })

/**
 * Clear all cached data
 */
export const clearCache = (): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    localStorage.removeItem(CACHE_KEYS.PROGRAMS)
    localStorage.removeItem(CACHE_KEYS.SHOWS)
  })

/**
 * Get cache metadata for debugging/monitoring
 */
export const getCacheMetadata = (): Effect.Effect<
  {
    programs: { exists: boolean; timestamp: number | null; isValid: boolean }
    shows: { exists: boolean; timestamp: number | null; isValid: boolean }
  },
  never,
  never
> =>
  Effect.sync(() => {
    const getProgramsMetadata = () => {
      const cached = localStorage.getItem(CACHE_KEYS.PROGRAMS)
      if (!cached) return { exists: false, timestamp: null, isValid: false }

      try {
        const parsed = JSON.parse(cached) as CachedPrograms
        return {
          exists: true,
          timestamp: parsed.timestamp,
          isValid: isCacheValid(parsed.timestamp, CACHE_TTL.PROGRAMS)
        }
      } catch {
        return { exists: true, timestamp: null, isValid: false }
      }
    }

    const getShowsMetadata = () => {
      const cached = localStorage.getItem(CACHE_KEYS.SHOWS)
      if (!cached) return { exists: false, timestamp: null, isValid: false }

      try {
        const parsed = JSON.parse(cached) as CachedShows
        return {
          exists: true,
          timestamp: parsed.timestamp,
          isValid: isCacheValid(parsed.timestamp, CACHE_TTL.SHOWS)
        }
      } catch {
        return { exists: true, timestamp: null, isValid: false }
      }
    }

    return {
      programs: getProgramsMetadata(),
      shows: getShowsMetadata()
    }
  })
