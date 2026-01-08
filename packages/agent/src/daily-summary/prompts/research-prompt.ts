/**
 * Summary Research Agent - System Prompt
 *
 * Phase 1 of the Daily Summary pipeline.
 *
 * This prompt guides deep research into a day's broadcasts to surface:
 * - Discoveries (first plays, first artists)
 * - Fresh releases (recent releases, rotation changes)
 * - Themes (patterns across shows)
 * - Cultural moments (from DJ comments)
 * - Notable plays (rare, live, requests, connections)
 *
 * The research phase has full tool access for graph exploration,
 * play history analysis, and semantic search.
 *
 * @module
 */

import type { DayData, ShowGroup, CategorizedPlay, DayStats } from "../DayDataCollector.js"

// =============================================================================
// Timezone Constants
// =============================================================================

/**
 * KEXP's timezone for display purposes.
 *
 * Timezone Strategy:
 * - KEXP API stores airdates in UTC
 * - Internal date bounds and comparisons use UTC for consistency with the API
 * - Display times in prompts use Pacific timezone because:
 *   1. DJs and listeners think in Pacific time
 *   2. Show schedules are published in Pacific time
 *   3. "Morning show" vs "evening show" only makes sense in local time
 */
const KEXP_TIMEZONE = "America/Los_Angeles"

/**
 * Format a Date to Pacific timezone for display in prompts.
 *
 * @param date - UTC Date from the API
 * @param options - Optional Intl.DateTimeFormatOptions
 * @returns Formatted time string in Pacific timezone
 */
const formatPacificTime = (
  date: Date,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: KEXP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }
  return date.toLocaleTimeString("en-US", { ...defaultOptions, ...options })
}

// =============================================================================
// Static Prompt Sections
// =============================================================================

export const RESEARCH_IDENTITY = `You are the **Daily Summary Research Agent** for Crate.

Your mission is to deeply analyze a day of KEXP broadcasts and surface the stories, patterns, and discoveries that make each day unique. You are doing research for a summary that will help listeners understand what made this particular day special.

You have access to:
- Complete play data for the day (pre-collected, including artist_mbid, recording_mbid, release_mbid)
- Graph queries to explore artist connections, label relationships, and musical lineages (explore_graph, graph_connections, explore_neighborhood, etc.)
- Semantic search to find related plays across 2.2M+ history (semantic_search, hybrid_search) - use for TEXT queries
- Search plays filtered by MBID (search_plays) - use with artist_mbid/recording_mbid from the day data to find play history

IMPORTANT: search_plays does NOT accept text names - only MBIDs. Use semantic_search for text queries first.

Your output will feed into a Writer Agent that synthesizes your findings into an engaging daily summary. Research thoroughly - the writer depends on your discoveries.`

export const RESEARCH_PHILOSOPHY = `## Research Philosophy

1. **Discoveries First**: What music is KEXP introducing today? First plays, first artists, new releases - these are the headlines.

2. **DJ Voice is Truth**: DJ comments are your primary source for cultural moments. Birthdays, anniversaries, deaths, themes - DJs mention these. Extract and verify.

3. **Cross-Show Patterns**: Look for themes that emerge across different shows. A genre trending? Multiple DJs playing the same artist? Seattle sound having a moment?

4. **Graph Deep Dives**: Use artist connections to surface interesting relationships. Two artists from the same hometown? Same producer? Same label? These connections enrich the story.

5. **Notable Plays**: Requests, live performances, deep cuts, rare spins - flag what stands out beyond new music.

6. **Stats That Tell Stories**: Numbers become interesting when they reveal patterns. "12 local artists" means more as "Local Tuesday continues with 12 Seattle acts across 3 shows."`

export const RESEARCH_PROCESS = `## Research Process

Work through these phases:

### Phase 1: Discoveries Analysis
Use semantic_search or hybrid_search for text queries, then search_plays with returned MBIDs:
- First-ever plays on KEXP - use semantic_search to find the recording, then use the recording_mbid with search_plays to check history
- First-time artists - use the artist_mbid from the day data with search_plays to check their history
- Check rotation_status for promoted tracks (already in the day data)
- NOTE: search_plays requires MBIDs (artist_mbid, recording_mbid, release_mbid), NOT text names

### Phase 2: Cultural Extraction
Mine DJ comments for:
- Artist birthdays/deaths/anniversaries
- Album anniversaries
- Music events/news references
- Theme days (e.g., "Women in Music Wednesday")
- Dedications or special moments

### Phase 3: Theme Detection
Look across shows for:
- Genre clusters (multiple shows playing similar styles)
- Artist repetition (same artist across different shows)
- Label moments (multiple artists from same label)
- Geographic patterns (Seattle scene, UK invasion, etc.)

### Phase 4: Connection Discovery
Use graph tools to find:
- Band member connections between played artists
- Producer/label shared relationships
- Sample chains linking tracks
- Tour history (artists who toured together)

### Phase 5: Notable Play Identification
Flag plays that stand out:
- Listener requests (is_request flag)
- Live performances (is_live flag)
- Local artists with interesting context
- Rare plays (hasn't been played in years)
- Deep cuts vs hits`

export const RESEARCH_OUTPUT = `## Output Format

Your research findings should be structured for handoff to the Writer Agent.

For each finding category, provide:

**Discoveries**:
- Play ID + artist/song
- Discovery type (first_play, first_artist, first_album)
- Significance (why does this matter?)
- Related context from graph exploration

**Fresh Releases**:
- Play ID + release info
- Release date and type (single/album/EP)
- Is it local? Any label info?
- Context (artist background, why notable)

**Rotation Updates**:
- Play ID + rotation status
- How many times played today?
- Is this a notable promotion?

**Themes**:
- Theme name and description
- Which shows exhibited this theme?
- Representative play IDs
- Cross-show narrative angle

**Cultural Moments**:
- Type (birthday, anniversary, death, event, theme_day)
- Subject and description
- Source (which DJ comment, which show)
- Related play IDs

**Notable Plays**:
- Play ID + reason for notability
- Category (rare, request, live, deep_cut, connection, dj_pick)
- DJ comment if relevant
- Graph connections if discovered

**Graph Connections**:
- Source play → Target plays
- Connection type
- Narrative potential

**Narrative Angles**:
- 3-5 potential headline angles
- Story threads the writer could pursue
- The "throughline" of the day`

// =============================================================================
// Dynamic Prompt Builders
// =============================================================================

/**
 * Build the user message containing day data for research
 */
export const buildDayDataMessage = (dayData: DayData): string => {
  const parts: string[] = []

  parts.push(`# KEXP Daily Summary Research: ${dayData.date}`)
  parts.push("")

  // Stats overview
  parts.push(`## Day Statistics`)
  parts.push(`- Total plays: ${dayData.stats.totalPlays}`)
  parts.push(`- Unique artists: ${dayData.stats.uniqueArtists}`)
  parts.push(`- Unique albums: ${dayData.stats.uniqueAlbums}`)
  parts.push(`- Shows: ${dayData.stats.showCount}`)
  parts.push(`- Local artists: ${dayData.stats.localArtistCount}`)
  parts.push(`- Live performances: ${dayData.stats.livePerformanceCount}`)
  parts.push(`- Listener requests: ${dayData.stats.requestCount}`)
  parts.push(`- Plays in rotation: ${dayData.stats.rotationPlays}`)
  parts.push(`- Plays with DJ comments: ${dayData.stats.playsWithComments}`)
  parts.push("")

  // Show breakdown
  // Note: Show times are formatted in Pacific timezone for readability
  // (DJs and listeners think in Pacific time, even though API uses UTC)
  parts.push(`## Shows (${dayData.showGroups.length} total)`)
  for (const show of dayData.showGroups) {
    const timeRange = `${formatPacificTime(show.startTime)} - ${formatPacificTime(show.endTime)} PT`
    parts.push(`\n### Show ${show.showId} (${timeRange})`)
    parts.push(`- ${show.plays.length} plays`)
    if (show.localCount > 0) parts.push(`- ${show.localCount} local artists`)
    if (show.rotationCount > 0) parts.push(`- ${show.rotationCount} rotation plays`)
    if (show.requestCount > 0) parts.push(`- ${show.requestCount} requests`)
    if (show.comments.length > 0) {
      parts.push(`- DJ Comments (${show.comments.length}):`)
      // Include first 3 comments as samples
      for (const comment of show.comments.slice(0, 3)) {
        parts.push(`  > "${comment.slice(0, 200)}${comment.length > 200 ? '...' : ''}"`)
      }
    }
  }
  parts.push("")

  // Rotation plays (likely new/promoted)
  if (dayData.rotationPlays.length > 0) {
    parts.push(`## Rotation Plays (${dayData.rotationPlays.length})`)
    parts.push("These plays have rotation_status set - likely promoted tracks:")
    for (const cp of dayData.rotationPlays.slice(0, 20)) {
      const play = cp.play
      parts.push(`- [${play.id}] ${play.artist} - "${play.song}" (${play.rotation_status})`)
    }
    if (dayData.rotationPlays.length > 20) {
      parts.push(`... and ${dayData.rotationPlays.length - 20} more rotation plays`)
    }
    parts.push("")
  }

  // Local artists
  if (dayData.localPlays.length > 0) {
    parts.push(`## Local Artists (${dayData.localPlays.length} plays)`)
    for (const cp of dayData.localPlays.slice(0, 15)) {
      const play = cp.play
      parts.push(`- [${play.id}] ${play.artist} - "${play.song}"`)
    }
    if (dayData.localPlays.length > 15) {
      parts.push(`... and ${dayData.localPlays.length - 15} more local plays`)
    }
    parts.push("")
  }

  // Live performances
  if (dayData.livePlays.length > 0) {
    parts.push(`## Live Performances (${dayData.livePlays.length})`)
    for (const cp of dayData.livePlays) {
      const play = cp.play
      const comment = cp.comment ? ` - "${cp.comment.slice(0, 100)}"` : ""
      parts.push(`- [${play.id}] ${play.artist} - "${play.song}"${comment}`)
    }
    parts.push("")
  }

  // Requests
  if (dayData.requestPlays.length > 0) {
    parts.push(`## Listener Requests (${dayData.requestPlays.length})`)
    for (const cp of dayData.requestPlays.slice(0, 10)) {
      const play = cp.play
      parts.push(`- [${play.id}] ${play.artist} - "${play.song}"`)
    }
    if (dayData.requestPlays.length > 10) {
      parts.push(`... and ${dayData.requestPlays.length - 10} more requests`)
    }
    parts.push("")
  }

  // Recent releases (based on release_date)
  const recentReleases = dayData.plays.filter(cp => cp.isRecentRelease)
  if (recentReleases.length > 0) {
    parts.push(`## Recent Releases (released within 30 days) - ${recentReleases.length} plays`)
    for (const cp of recentReleases.slice(0, 20)) {
      const play = cp.play
      const releaseDate = play.release_date?.toISOString().split('T')[0] ?? 'unknown'
      parts.push(`- [${play.id}] ${play.artist} - "${play.song}" (released: ${releaseDate})`)
    }
    if (recentReleases.length > 20) {
      parts.push(`... and ${recentReleases.length - 20} more recent releases`)
    }
    parts.push("")
  }

  // DJ Comments for cultural extraction (limited to 50 most substantive)
  if (dayData.playsWithComments.length > 0) {
    // Sort by comment length (longer comments are usually more substantive)
    // Filter out trivial comments (< 30 chars) and limit to 50
    const substantiveComments = dayData.playsWithComments
      .filter(cp => cp.comment && cp.comment.length >= 30)
      .sort((a, b) => (b.comment?.length ?? 0) - (a.comment?.length ?? 0))
      .slice(0, 50)

    parts.push(`## DJ Comments (${substantiveComments.length} substantive, ${dayData.playsWithComments.length} total)`)
    parts.push("Mine these for cultural moments, dedications, and themes:")
    parts.push("(Sorted by length - longest/most detailed first)")
    for (const cp of substantiveComments) {
      const play = cp.play
      parts.push(`\n[${play.id}] ${play.artist} - "${play.song}"`)
      parts.push(`> ${cp.comment}`)
    }
    if (dayData.playsWithComments.length > substantiveComments.length) {
      parts.push(`\n(${dayData.playsWithComments.length - substantiveComments.length} shorter comments omitted)`)
    }
    parts.push("")
  }

  // Play list - detailed for "interesting" plays, ID-only for others
  // This reduces token usage while maintaining research capability
  const interestingPlays = dayData.plays.filter(cp =>
    cp.isLocal || cp.isLive || cp.isRequest || cp.hasRotation || cp.isRecentRelease
  )
  const regularPlays = dayData.plays.filter(cp =>
    !cp.isLocal && !cp.isLive && !cp.isRequest && !cp.hasRotation && !cp.isRecentRelease
  )

  parts.push(`## Notable Plays (${interestingPlays.length} with special flags)`)
  parts.push("These plays have notable characteristics (local, live, request, rotation, new):")
  parts.push("Format: id|artist|song|album|artist_mbid|[flags]")
  parts.push("```")
  for (const cp of interestingPlays) {
    const play = cp.play
    const flags: string[] = []
    if (cp.isLocal) flags.push("LOCAL")
    if (cp.isLive) flags.push("LIVE")
    if (cp.isRequest) flags.push("REQ")
    if (cp.hasRotation) flags.push(`ROT:${play.rotation_status}`)
    if (cp.isRecentRelease) flags.push("NEW")
    const artistMbid = play.artist_mbid[0] ?? ""
    parts.push(`${play.id}|${play.artist}|${play.song}|${play.album ?? ""}|${artistMbid}|[${flags.join(",")}]`)
  }
  parts.push("```")
  parts.push("")

  // Regular plays - include artist MBID for direct graph lookups
  if (regularPlays.length > 0) {
    parts.push(`## Regular Plays (${regularPlays.length} without special flags)`)
    parts.push("Format: id|artist|song|artist_mbid - use MBID for graph_connections/analyze_influence:")
    parts.push("```")
    for (const cp of regularPlays) {
      const play = cp.play
      const artistMbid = play.artist_mbid[0] ?? ""
      parts.push(`${play.id}|${play.artist}|${play.song}|${artistMbid}`)
    }
    parts.push("```")
  }

  return parts.join("\n")
}

/**
 * Build the complete system prompt for research
 */
export const buildResearchSystemPrompt = (): string => {
  return [
    RESEARCH_IDENTITY,
    "",
    RESEARCH_PHILOSOPHY,
    "",
    RESEARCH_PROCESS,
    "",
    RESEARCH_OUTPUT
  ].join("\n")
}
