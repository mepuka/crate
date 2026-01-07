/**
 * Play Reference Utilities
 *
 * Utilities for extracting and formatting play references from research context.
 * Used to provide writer/polish agents with a compact lookup table of
 * plays that were discovered during the research phase.
 *
 * This solves the playIds population bug by giving agents direct access
 * to structured play data rather than requiring extraction from markdown.
 *
 * @module
 */

import type { ResearchContextType } from "./schemas.js"
import type { DayData, CategorizedPlay } from "./DayDataCollector.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Compact play reference for lookup table
 */
export interface PlayLookupEntry {
  readonly id: number
  readonly artist: string
  readonly song: string
  readonly album: string | null
}

/**
 * Categorized play IDs for easy reference in prompts
 */
export interface CategorizedPlayIds {
  readonly all: ReadonlyArray<number>
  readonly discoveries: ReadonlyArray<number>
  readonly freshReleases: ReadonlyArray<number>
  readonly rotationUpdates: ReadonlyArray<number>
  readonly themes: ReadonlyArray<number>
  readonly culturalMoments: ReadonlyArray<number>
  readonly notablePlays: ReadonlyArray<number>
  readonly graphConnections: ReadonlyArray<number>
}

// =============================================================================
// Extraction Functions
// =============================================================================

/**
 * Extract all play IDs referenced in research context
 *
 * Collects playIds from all finding types:
 * - discoveries, freshReleases, rotationUpdates (single playId)
 * - themes, culturalMoments (playIds arrays)
 * - notablePlays, graphConnections (source and target playIds)
 * - showSummaries (highlight playIds)
 */
export const extractReferencedPlayIds = (
  research: ResearchContextType
): Set<number> => {
  const playIds = new Set<number>()

  // Discoveries - single playId each
  for (const d of research.discoveries) {
    playIds.add(d.playId)
  }

  // Fresh releases - single playId each
  for (const r of research.freshReleases) {
    playIds.add(r.playId)
  }

  // Rotation updates - single playId each
  for (const r of research.rotationUpdates) {
    playIds.add(r.playId)
  }

  // Themes - array of playIds
  for (const t of research.themes) {
    for (const id of t.playIds) {
      playIds.add(id)
    }
  }

  // Cultural moments - array of playIds
  for (const c of research.culturalMoments) {
    for (const id of c.playIds) {
      playIds.add(id)
    }
  }

  // Notable plays - single playId each
  for (const p of research.notablePlays) {
    playIds.add(p.playId)
  }

  // Graph connections - source and target playIds
  for (const g of research.graphConnections) {
    playIds.add(g.sourcePlayId)
    for (const id of g.targetPlayIds) {
      playIds.add(id)
    }
  }

  // Show summaries - highlight playIds
  for (const s of research.showSummaries) {
    for (const id of s.highlightPlayIds) {
      playIds.add(id)
    }
  }

  return playIds
}

/**
 * Extract play IDs categorized by finding type
 *
 * Useful for schema population instructions:
 * - discoveries → should appear in discoveries array
 * - freshReleases → should appear in freshReleases and newMusicPlaylistIds
 * - etc.
 */
export const extractCategorizedPlayIds = (
  research: ResearchContextType
): CategorizedPlayIds => {
  const discoveries = research.discoveries.map(d => d.playId)
  const freshReleases = research.freshReleases.map(r => r.playId)
  const rotationUpdates = research.rotationUpdates.map(r => r.playId)

  const themes: number[] = []
  for (const t of research.themes) {
    themes.push(...t.playIds)
  }

  const culturalMoments: number[] = []
  for (const c of research.culturalMoments) {
    culturalMoments.push(...c.playIds)
  }

  const notablePlays = research.notablePlays.map(p => p.playId)

  const graphConnections: number[] = []
  for (const g of research.graphConnections) {
    graphConnections.push(g.sourcePlayId)
    graphConnections.push(...g.targetPlayIds)
  }

  // Combine all unique IDs
  const allSet = new Set([
    ...discoveries,
    ...freshReleases,
    ...rotationUpdates,
    ...themes,
    ...culturalMoments,
    ...notablePlays,
    ...graphConnections
  ])

  return {
    all: [...allSet],
    discoveries,
    freshReleases,
    rotationUpdates,
    themes: [...new Set(themes)],
    culturalMoments: [...new Set(culturalMoments)],
    notablePlays,
    graphConnections: [...new Set(graphConnections)]
  }
}

// =============================================================================
// Lookup Table Functions
// =============================================================================

/**
 * Build play lookup table from day data
 *
 * Creates a compact representation of plays that can be included
 * in prompts for resolution. Only includes plays that were
 * referenced during research.
 */
export const buildPlayLookupTable = (
  dayData: DayData,
  referencedIds: Set<number>
): ReadonlyArray<PlayLookupEntry> => {
  // Build a map for fast lookup
  const playMap = new Map<number, CategorizedPlay>()
  for (const cp of dayData.plays) {
    playMap.set(cp.play.id, cp)
  }

  // Extract only referenced plays
  const entries: PlayLookupEntry[] = []
  for (const id of referencedIds) {
    const cp = playMap.get(id)
    if (cp) {
      entries.push({
        id: cp.play.id,
        artist: cp.play.artist,
        song: cp.play.song,
        album: cp.play.album
      })
    }
  }

  // Sort by ID for consistent ordering
  return entries.sort((a, b) => a.id - b.id)
}

/**
 * Format play lookup table as compact text for prompts
 *
 * Uses pipe-delimited format for token efficiency:
 * ID|Artist|Song|Album
 */
export const formatPlayLookupTable = (
  entries: ReadonlyArray<PlayLookupEntry>
): string => {
  const lines = [
    `## Play Reference Table (${entries.length} plays)`,
    ``,
    `These are the plays discovered during research. Use their IDs when referencing plays.`,
    `Format: ID|Artist|Song|Album`,
    ``
  ]

  for (const entry of entries) {
    lines.push(`${entry.id}|${entry.artist}|${entry.song}|${entry.album ?? ""}`)
  }

  return lines.join("\n")
}

/**
 * Format categorized play IDs for schema population instructions
 *
 * Provides explicit lists of playIds that should appear in each
 * output array, making it easy for the LLM to populate correctly.
 */
export const formatPlayIdInstructions = (
  categorized: CategorizedPlayIds
): string => {
  const lines = [
    `## PlayId Population Guide`,
    ``,
    `Use these playIds when populating the output schema:`,
    ``
  ]

  if (categorized.discoveries.length > 0) {
    lines.push(`**Discoveries** (${categorized.discoveries.length}): ${categorized.discoveries.join(", ")}`)
  }

  if (categorized.freshReleases.length > 0) {
    lines.push(`**Fresh Releases** (${categorized.freshReleases.length}): ${categorized.freshReleases.join(", ")}`)
    lines.push(`→ These should appear in newMusicPlaylistIds`)
  }

  if (categorized.rotationUpdates.length > 0) {
    lines.push(`**Rotation Updates** (${categorized.rotationUpdates.length}): ${categorized.rotationUpdates.join(", ")}`)
  }

  if (categorized.notablePlays.length > 0) {
    lines.push(`**Notable Plays** (${categorized.notablePlays.length}): ${categorized.notablePlays.join(", ")}`)
    lines.push(`→ Select 5-10 of these for topPickIds`)
  }

  if (categorized.themes.length > 0) {
    lines.push(`**Theme-related** (${categorized.themes.length}): ${categorized.themes.join(", ")}`)
  }

  if (categorized.culturalMoments.length > 0) {
    lines.push(`**Cultural Moments** (${categorized.culturalMoments.length}): ${categorized.culturalMoments.join(", ")}`)
  }

  lines.push(``)
  lines.push(`**Total unique playIds**: ${categorized.all.length}`)
  lines.push(`→ ALL of these should appear in the playIds array`)
  lines.push(``)

  return lines.join("\n")
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that all required playIds are populated
 *
 * Returns a list of issues if any arrays are missing expected playIds.
 */
export const validatePlayIdPopulation = (
  output: {
    playIds?: readonly number[]
    topPickIds?: readonly number[]
    newMusicPlaylistIds?: readonly number[]
  },
  categorized: CategorizedPlayIds
): string[] => {
  const issues: string[] = []

  // Check playIds array contains all referenced plays
  const outputPlayIds = new Set(output.playIds ?? [])
  const missingFromAll = categorized.all.filter(id => !outputPlayIds.has(id))
  if (missingFromAll.length > 0) {
    issues.push(`playIds missing ${missingFromAll.length} referenced plays: ${missingFromAll.slice(0, 5).join(", ")}${missingFromAll.length > 5 ? "..." : ""}`)
  }

  // Check newMusicPlaylistIds contains fresh releases
  const outputNewMusic = new Set(output.newMusicPlaylistIds ?? [])
  const missingReleases = categorized.freshReleases.filter(id => !outputNewMusic.has(id))
  if (missingReleases.length > 0) {
    issues.push(`newMusicPlaylistIds missing ${missingReleases.length} fresh releases: ${missingReleases.join(", ")}`)
  }

  // Check topPickIds has reasonable count
  const topPickCount = output.topPickIds?.length ?? 0
  if (topPickCount === 0 && categorized.notablePlays.length > 0) {
    issues.push(`topPickIds is empty but ${categorized.notablePlays.length} notable plays were found`)
  } else if (topPickCount > 15) {
    issues.push(`topPickIds has ${topPickCount} entries (expected 5-10)`)
  }

  return issues
}
