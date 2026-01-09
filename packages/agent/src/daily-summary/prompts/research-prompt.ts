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

import type {
  DayData,
  DayDataArtifacts
} from "../DayDataCollector.js"

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

// =============================================================================
// Research Quality Enhancement - Aggressive Exploration
// =============================================================================

export const RESEARCH_MANDATE = `## Research Mandate: Exhaustive Exploration

**YOU MUST BE AGGRESSIVE WITH TOOLS.** Passive research produces shallow summaries.

### Non-Negotiable Rules:

1. **NEVER stop at one search.** If context_search finds an artist, search for their label, producer, hometown.

2. **EVERY interesting finding deserves a follow-up.** DJ comment mentions a birthday? Search for other birthdays this week.

3. **READ ALL ARTIFACTS.** Use context_read to fully read the comments artifact - do not skim.

4. **GRAPH EXPLORATION IS MANDATORY.** For every notable artist, call explore_graph with labelmates, collaborators, band_members.

5. **MINIMUM TOOL USAGE before concluding:**
   - At least 3 context_search calls with different patterns
   - At least 2 context_read calls (full artifact reads)
   - At least 2 graph exploration calls
   - At least 1 semantic_search for historical context

If you have not met these minimums, YOU ARE NOT DONE.`

export const MULTI_PASS_WORKFLOW = `## Research Workflow (Multi-Pass Required)

**Pass 1: SCAN** (Iterations 1-3)
- context_list() to see all available artifacts
- context_search with obvious patterns: artist names, "birthday", "debut", "Seattle", "LOCAL"
- Read the show index to identify interesting shows

**Pass 2: DIG** (Iterations 4-8)
For each finding from Pass 1:
- context_read the full artifact sections (plays, comments)
- semantic_search for historical context on interesting artists
- explore_graph for connections (labelmates, collaborators, band_members)

**Pass 3: CONNECT** (Iterations 9-15)
Look for cross-finding patterns:
- Did multiple shows play the same artist?
- Are there connections between discoveries?
- Do graph connections reveal shared labels or collaborators?

**Pass 4: VALIDATE** (Iterations 16-20+)
Return to earlier findings with new context:
- Reread comments with new knowledge
- Verify first-play claims with search_plays
- Cross-reference discoveries across artifacts

**YOU ARE NOT DONE until you have explored thoroughly.**`

export const TOOL_DECISION_MATRIX = `## Tool Decision Matrix

| You Have | You Want | Use This Tool | Then Do This |
|----------|----------|---------------|--------------|
| Artist name | KEXP history | semantic_search | Take artist_mbid, call search_plays |
| artist_mbid | All plays | search_plays | Count plays, note first/last dates |
| recording_mbid | Is first play? | search_plays | If total_count=0, confirmed debut |
| DJ comment text | Full context | context_read | Read comments artifact with line range |
| Artist name | Connections | explore_graph | Try labelmates, collaborators, band_members |
| Pattern hunch | Evidence | context_search | Search all artifacts for the pattern |
| Notable play | Deep context | analyze_influence | Get genre, era, style analysis |
| Show curiosity | Full play list | context_read | Read plays artifact, filter by show ID |`

export const SUCCESS_CRITERIA = `## What Great Research Looks Like

A thorough research session produces:

**Minimum Targets:**
- 5-10 validated discoveries (first plays, debut artists, first albums)
- 3-5 cultural moments from DJ comments (birthdays, anniversaries, dedications)
- 2-3 cross-show themes with evidence (genre trends, artist repetition)
- 10+ graph connections for notable artists
- Clear narrative angles for the writer

**Quality Indicators:**
- You used 30+ tool calls across multiple categories
- You read comments artifact at least twice (beginning and end)
- You explored graph connections for 3+ artists
- You verified at least 2 "first play" claims with search_plays

If you have fewer findings, GO BACK AND DIG DEEPER. The writer depends on your thoroughness.`

// =============================================================================
// Output Format
// =============================================================================

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

// =============================================================================
// Artifact-Based Prompt Builders (Dynamic Context Discovery)
// =============================================================================

/**
 * Build a compact index-based message for artifact-driven research.
 *
 * Instead of embedding all plays inline (4.5-9.5K tokens), this outputs:
 * - Day stats (~100 tokens)
 * - Show index (~50 tokens/show)
 * - Notable plays inline (~150 tokens)
 * - Artifact references (~50 tokens)
 * - Context tool instructions (~200 tokens)
 *
 * Total: ~500-800 tokens vs 4.5-9.5K inline
 *
 * The research agent uses context_list, context_read, context_search
 * to retrieve specific data on demand.
 */
export const buildDayDataIndexMessage = (artifacts: DayDataArtifacts): string => {
  const parts: string[] = []

  parts.push(`# KEXP Daily Research: ${artifacts.date}`)
  parts.push("")

  // Stats overview (compact)
  parts.push(`## Day Overview`)
  const s = artifacts.stats
  parts.push(`| Metric | Count |`)
  parts.push(`|--------|-------|`)
  parts.push(`| Total plays | ${s.totalPlays} |`)
  parts.push(`| Unique artists | ${s.uniqueArtists} |`)
  parts.push(`| Shows | ${s.showCount} |`)
  parts.push(`| Local artists | ${s.localArtistCount} |`)
  parts.push(`| Live performances | ${s.livePerformanceCount} |`)
  parts.push(`| Requests | ${s.requestCount} |`)
  parts.push(`| Rotation plays | ${s.rotationPlays} |`)
  parts.push(`| DJ comments | ${s.playsWithComments} |`)
  parts.push("")

  // Show index (compact)
  parts.push(`## Shows (${artifacts.showIndex.length} total)`)
  parts.push("| Time | Plays | Local | Rotation | Req | Comments | Live |")
  parts.push("|------|-------|-------|----------|-----|----------|------|")
  for (const show of artifacts.showIndex) {
    const live = show.hasLive ? "✓" : ""
    parts.push(`| ${show.timeRange} | ${show.playCount} | ${show.localCount} | ${show.rotationCount} | ${show.requestCount} | ${show.commentCount} | ${live} |`)
  }
  parts.push("")

  // Notable plays inline (already compact)
  if (artifacts.notablePlays.length > 0) {
    parts.push(`## Notable Plays (${artifacts.notablePlays.length})`)
    parts.push("These have special flags - research priority:")
    parts.push("```")
    for (const np of artifacts.notablePlays.slice(0, 30)) {
      const flags = np.flags.join(",")
      parts.push(`${np.id}|${np.artist}|${np.song}|[${flags}]`)
    }
    if (artifacts.notablePlays.length > 30) {
      parts.push(`... and ${artifacts.notablePlays.length - 30} more (use context tools)`)
    }
    parts.push("```")
    parts.push("")
  }

  // Artifact references
  parts.push(`## Available Context (Artifact Store)`)
  parts.push("Full data stored as artifacts. Use context tools to retrieve:")
  parts.push("")
  const refs = artifacts.artifactRefs
  parts.push(`- **All Plays**: \`${refs.allPlays.id}\` - ${refs.allPlays.summary}`)
  parts.push(`- **DJ Comments**: \`${refs.comments.id}\` - ${refs.comments.summary}`)
  parts.push(`- **Rotation Plays**: \`${refs.rotationPlays.id}\` - ${refs.rotationPlays.summary}`)
  parts.push(`- **Recent Releases**: \`${refs.recentReleases.id}\` - ${refs.recentReleases.summary}`)
  parts.push("")

  // Context tool usage guide
  parts.push(`## Context Discovery Tools`)
  parts.push(`
Use these tools to retrieve detailed data on demand:

**List artifacts**: \`context_list(tags=["${artifacts.date}"])\`
Returns all artifacts for this day with summaries.

**Read artifact**: \`context_read(artifact_id="${refs.allPlays.id}")\`
Retrieves artifact content. Use \`from_line\`/\`line_limit\` for pagination. **Case-insensitive search.**

**Search artifacts**: \`context_search(pattern="Fleet Foxes")\`
Finds plays matching pattern across all artifacts. **Patterns are case-insensitive.**

**Tail artifact**: \`context_tail(artifact_id="${refs.allPlays.id}", lines=50)\`
Gets last N lines (useful for chronological data).

${MULTI_PASS_WORKFLOW}
`)

  return parts.join("\n")
}

/**
 * Build the complete system prompt for research
 *
 * Includes both the standard research guidance and the aggressive
 * exploration mandate for deeper, more thorough analysis.
 */
export const buildResearchSystemPrompt = (): string => {
  return [
    RESEARCH_IDENTITY,
    "",
    RESEARCH_MANDATE,
    "",
    RESEARCH_PHILOSOPHY,
    "",
    RESEARCH_PROCESS,
    "",
    TOOL_DECISION_MATRIX,
    "",
    SUCCESS_CRITERIA,
    "",
    RESEARCH_OUTPUT
  ].join("\n")
}
