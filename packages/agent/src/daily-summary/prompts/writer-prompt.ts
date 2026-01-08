/**
 * Summary Writer Agent - System Prompt
 *
 * Phase 2 of the Daily Summary pipeline.
 *
 * This prompt guides narrative synthesis from research findings.
 * The writer has no tool access - it works purely from the
 * research context provided by the ResearchAgent.
 *
 * The output is a polished daily summary with:
 * - Headline capturing the day's essence
 * - Opening narrative (2-3 paragraphs)
 * - Highlights (5-8 standout moments)
 * - Structured sections for explorers
 * - All referenced play IDs for playability
 *
 * @module
 */

import type { ResearchContextType } from "../schemas.js"
import type {
  PlayLookupEntry,
  CategorizedPlayIds
} from "../play-reference.js"
import {
  formatPlayLookupTable,
  formatPlayIdInstructions
} from "../play-reference.js"

// =============================================================================
// Static Prompt Sections
// =============================================================================

export const WRITER_IDENTITY = `You are the **Daily Summary Writer** for Crate.

Your mission is to transform research findings into an engaging, narrative-first daily summary of KEXP broadcasts. You write for two audiences simultaneously:

1. **Casual Readers**: Want the headlines, the story, the "what made today special" in 2 minutes
2. **Music Explorers**: Want depth, context, lists they can dig into, songs they can play

You have no tool access. Your source material is the comprehensive research already conducted. Your job is pure storytelling and synthesis.`

export const WRITER_PHILOSOPHY = `## Writing Philosophy

1. **Headline First**: Your headline captures the soul of the day in 6-8 words. It should make someone want to read more. Not a summary - a hook.

2. **Narrative as Navigation**: The opening paragraphs are a map. They orient the reader to what happened and why it matters. This is not a list - it's a story.

3. **Specific > Generic**: "Seattle bands dominated Tuesday's airwaves with 12 local acts across 3 shows" beats "It was a good day for local music."

4. **Every Play is Playable**: Include play IDs for everything you mention. The reader should be able to click and listen.

5. **DJ Voice**: Channel the warmth and knowledge of KEXP DJs. You're not a press release. You're a music-loving friend sharing what they heard.

6. **Discovery Focus**: New music is the lead. What did KEXP introduce today? What debuts, premieres, or firsts happened?`

export const WRITER_STRUCTURE = `## Summary Structure

### Headline
6-8 words capturing the day's essence. Examples:
- "Seattle's Sound Took Over Tuesday"
- "First Plays and Fresh Discoveries Defined the Day"
- "A Celebration of Women in Music"
- "Deep Cuts and Rare Spins Made Wednesday Special"

### Opening Narrative (2-3 paragraphs)
Tell the story of the day. What was the throughline? What made it unique?

Paragraph 1: The hook - lead with the most compelling angle
Paragraph 2: The context - fill in what happened across shows
Paragraph 3: The invitation - what should readers explore?

### Highlights (5-8 items)
Standout moments with short, punchy descriptions. Each highlight:
- Links to a specific play
- Has a category (discovery, theme, cultural, connection, rare, local)
- One sentence that makes you want to hear it

### Structured Sections

**Discoveries** (new to KEXP):
- First plays, first artists, first albums
- Brief blurbs explaining significance

**Fresh Releases** (recently released):
- New singles, albums, EPs
- Release dates and context

**Rotation Updates**:
- What's being promoted
- Play counts and context

**Themes**:
- Patterns that emerged across shows
- Representative plays

**Cultural Moments**:
- Birthdays, anniversaries, dedications
- DJ-driven moments

### Play References
End with curated lists:
- **Top Picks**: 5-10 must-hear plays
- **New Music Playlist**: All new music for those building playlists

Include ALL play IDs referenced anywhere in the summary in the playIds array.`

export const WRITER_TONE = `## Tone Guidelines

**DO:**
- Write with warmth and enthusiasm
- Use specific details ("played at 3:47pm" > "played this afternoon")
- Draw connections the research surfaced
- Celebrate discoveries, especially for lesser-known artists
- Use active voice
- Keep paragraphs short for readability

**DON'T:**
- Use marketing speak ("amazing", "incredible", "must-hear")
- Make unsupported claims
- Editorialize beyond what the research supports
- Use passive voice when active works
- Write walls of text
- Forget play IDs - every mentioned play needs one

**Voice Examples:**

✅ "DJ Cheryl Waters kicked off the morning with a Seattle triple-play, spinning three local acts in her first hour alone."

❌ "The morning show featured several amazing local artists."

✅ "Death Cab for Cutie's 'Soul Meets Body' made its first appearance since 2019 - a rare spin that had longtime listeners reaching for their headphones."

❌ "A popular song was played that hadn't been played in a while."`

// =============================================================================
// Dynamic Prompt Builders
// =============================================================================

/**
 * Options for building the research context message
 */
export interface ResearchContextOptions {
  /** Compact play lookup table for ID resolution */
  readonly playLookup?: ReadonlyArray<PlayLookupEntry>
  /** Categorized play IDs for schema population */
  readonly categorizedIds?: CategorizedPlayIds
}

/**
 * Build the user message containing research context for writing
 *
 * Optionally includes a play lookup table for explicit ID resolution,
 * solving the playIds population bug.
 */
export const buildResearchContextMessage = (
  research: ResearchContextType,
  options?: ResearchContextOptions
): string => {
  const parts: string[] = []

  parts.push(`# Research Context for ${research.date}`)
  parts.push("")
  parts.push(`Use this research to write the daily summary. Every finding below came from tool-assisted research.`)
  parts.push("")

  // Stats
  parts.push(`## Day Statistics`)
  parts.push(`- Total plays: ${research.totalPlays}`)
  parts.push(`- Unique artists: ${research.uniqueArtists}`)
  parts.push(`- Unique albums: ${research.uniqueAlbums}`)
  parts.push(`- Local artists: ${research.localArtistCount}`)
  parts.push(`- Live performances: ${research.livePerformanceCount}`)
  parts.push(`- Listener requests: ${research.requestCount}`)
  parts.push("")

  // Discoveries
  if (research.discoveries.length > 0) {
    parts.push(`## Discoveries (${research.discoveries.length})`)
    for (const d of research.discoveries) {
      parts.push(`\n### [${d.playId}] ${d.artist} - "${d.song}"`)
      parts.push(`Type: ${d.discoveryType}`)
      parts.push(`Significance: ${d.significance}`)
      if (d.relatedContext) parts.push(`Context: ${d.relatedContext}`)
    }
    parts.push("")
  }

  // Fresh Releases
  if (research.freshReleases.length > 0) {
    parts.push(`## Fresh Releases (${research.freshReleases.length})`)
    for (const r of research.freshReleases) {
      parts.push(`\n### [${r.playId}] ${r.artist} - "${r.song}"`)
      if (r.album) parts.push(`Album: ${r.album}`)
      if (r.releaseDate) parts.push(`Released: ${r.releaseDate}`)
      parts.push(`Type: ${r.releaseType}`)
      if (r.isLocal) parts.push(`Local Artist: Yes`)
      if (r.labelInfo) parts.push(`Label: ${r.labelInfo}`)
      if (r.context) parts.push(`Context: ${r.context}`)
    }
    parts.push("")
  }

  // Rotation Updates
  if (research.rotationUpdates.length > 0) {
    parts.push(`## Rotation Updates (${research.rotationUpdates.length})`)
    for (const r of research.rotationUpdates) {
      parts.push(`- [${r.playId}] ${r.artist} - "${r.song}" (${r.rotationStatus}, ${r.playCountToday}x today)`)
      if (r.significance) parts.push(`  ${r.significance}`)
    }
    parts.push("")
  }

  // Themes
  if (research.themes.length > 0) {
    parts.push(`## Themes (${research.themes.length})`)
    for (const t of research.themes) {
      parts.push(`\n### ${t.theme}`)
      parts.push(t.description)
      parts.push(`Shows: ${t.showIds.join(", ")}`)
      parts.push(`Play IDs: ${t.playIds.join(", ")}`)
      if (t.crossShowConnections) parts.push(`Cross-show: ${t.crossShowConnections}`)
      if (t.suggestedNarrative) parts.push(`Narrative angle: ${t.suggestedNarrative}`)
    }
    parts.push("")
  }

  // Cultural Moments
  if (research.culturalMoments.length > 0) {
    parts.push(`## Cultural Moments (${research.culturalMoments.length})`)
    for (const c of research.culturalMoments) {
      parts.push(`\n### ${c.type.toUpperCase()}: ${c.subject}`)
      parts.push(c.description)
      parts.push(`Significance: ${c.significance}`)
      if (c.djComment) parts.push(`DJ Comment: "${c.djComment}"`)
      parts.push(`Play IDs: ${c.playIds.join(", ")}`)
    }
    parts.push("")
  }

  // Notable Plays
  if (research.notablePlays.length > 0) {
    parts.push(`## Notable Plays (${research.notablePlays.length})`)
    for (const p of research.notablePlays) {
      parts.push(`\n### [${p.playId}] ${p.artist} - "${p.song}"`)
      parts.push(`Category: ${p.category}`)
      parts.push(`Reason: ${p.reason}`)
      if (p.djComment) parts.push(`DJ Comment: "${p.djComment}"`)
      if (p.graphConnections) parts.push(`Connections: ${p.graphConnections}`)
      if (p.showContext) parts.push(`Show: ${p.showContext}`)
    }
    parts.push("")
  }

  // Graph Connections
  if (research.graphConnections.length > 0) {
    parts.push(`## Graph Connections (${research.graphConnections.length})`)
    for (const g of research.graphConnections) {
      parts.push(`\n### ${g.connectionType}`)
      parts.push(`Source: [${g.sourcePlayId}]`)
      parts.push(`Targets: ${g.targetPlayIds.map(id => `[${id}]`).join(", ")}`)
      parts.push(g.description)
      if (g.narrative) parts.push(`Narrative: ${g.narrative}`)
    }
    parts.push("")
  }

  // Show Summaries
  if (research.showSummaries.length > 0) {
    parts.push(`## Show Summaries (${research.showSummaries.length})`)
    for (const s of research.showSummaries) {
      parts.push(`\n### Show ${s.showId} (${s.startTime} - ${s.endTime})`)
      parts.push(`Plays: ${s.playCount}`)
      if (s.themes.length > 0) parts.push(`Themes: ${s.themes.join(", ")}`)
      if (s.notableComments.length > 0) {
        parts.push(`Notable comments:`)
        for (const c of s.notableComments) {
          parts.push(`- "${c.slice(0, 150)}${c.length > 150 ? '...' : ''}"`)
        }
      }
    }
    parts.push("")
  }

  // Research Notes
  parts.push(`## Research Notes`)
  parts.push(research.researchNotes)
  parts.push("")

  // Suggested Headlines
  if (research.suggestedHeadlines.length > 0) {
    parts.push(`## Suggested Headlines (from research phase)`)
    for (const h of research.suggestedHeadlines) {
      parts.push(`- ${h}`)
    }
    parts.push("")
  }

  // Narrative Angles
  if (research.narrativeAngles.length > 0) {
    parts.push(`## Narrative Angles (from research phase)`)
    for (const a of research.narrativeAngles) {
      parts.push(`- ${a}`)
    }
    parts.push("")
  }

  // Play Reference Table (if provided)
  // This gives the writer explicit access to play IDs for resolution
  if (options?.playLookup && options.playLookup.length > 0) {
    parts.push("")
    parts.push(formatPlayLookupTable(options.playLookup))
    parts.push("")
  }

  // Play ID Population Guide (if provided)
  // This tells the writer exactly which IDs to include in each array
  if (options?.categorizedIds) {
    parts.push("")
    parts.push(formatPlayIdInstructions(options.categorizedIds))
    parts.push("")
  }

  return parts.join("\n")
}

/**
 * Build a compact research index message for artifact-based workflow
 *
 * Similar to buildResearchContextMessage but more compact.
 * When using artifact-based research, the full research findings can be
 * stored as artifacts and the writer receives this compact index.
 *
 * Token savings: ~5.5-10.5K → ~2-3K
 */
export const buildResearchIndexMessage = (
  research: ResearchContextType,
  options?: ResearchContextOptions
): string => {
  const parts: string[] = []

  parts.push(`# Research Summary for ${research.date}`)
  parts.push("")

  // Compact stats table
  parts.push(`## Day Stats`)
  parts.push(`| Total | Artists | Albums | Local | Live | Requests |`)
  parts.push(`|-------|---------|--------|-------|------|----------|`)
  parts.push(`| ${research.totalPlays} | ${research.uniqueArtists} | ${research.uniqueAlbums} | ${research.localArtistCount} | ${research.livePerformanceCount} | ${research.requestCount} |`)
  parts.push("")

  // Compact discoveries list
  if (research.discoveries.length > 0) {
    parts.push(`## Discoveries (${research.discoveries.length})`)
    for (const d of research.discoveries) {
      parts.push(`- [${d.playId}] ${d.artist} - "${d.song}" (${d.discoveryType}): ${d.significance.slice(0, 100)}`)
    }
    parts.push("")
  }

  // Compact fresh releases
  if (research.freshReleases.length > 0) {
    parts.push(`## Fresh Releases (${research.freshReleases.length})`)
    for (const r of research.freshReleases) {
      const local = r.isLocal ? " [LOCAL]" : ""
      parts.push(`- [${r.playId}] ${r.artist} - "${r.song}" (${r.releaseType}${local})`)
    }
    parts.push("")
  }

  // Compact rotation
  if (research.rotationUpdates.length > 0) {
    parts.push(`## Rotation (${research.rotationUpdates.length})`)
    for (const r of research.rotationUpdates.slice(0, 10)) {
      parts.push(`- [${r.playId}] ${r.artist} - "${r.song}" (${r.rotationStatus}, ${r.playCountToday}x)`)
    }
    if (research.rotationUpdates.length > 10) {
      parts.push(`... and ${research.rotationUpdates.length - 10} more`)
    }
    parts.push("")
  }

  // Themes - summary only
  if (research.themes.length > 0) {
    parts.push(`## Themes (${research.themes.length})`)
    for (const t of research.themes) {
      parts.push(`- **${t.theme}**: ${t.description.slice(0, 100)}... (plays: ${t.playIds.join(",")})`)
    }
    parts.push("")
  }

  // Cultural moments - summary only
  if (research.culturalMoments.length > 0) {
    parts.push(`## Cultural Moments (${research.culturalMoments.length})`)
    for (const c of research.culturalMoments) {
      parts.push(`- **${c.type}**: ${c.subject} - ${c.significance.slice(0, 80)}`)
    }
    parts.push("")
  }

  // Notable plays - compact
  if (research.notablePlays.length > 0) {
    parts.push(`## Notable Plays (${research.notablePlays.length})`)
    for (const p of research.notablePlays.slice(0, 10)) {
      parts.push(`- [${p.playId}] ${p.artist} - "${p.song}" (${p.category}): ${p.reason.slice(0, 60)}`)
    }
    if (research.notablePlays.length > 10) {
      parts.push(`... and ${research.notablePlays.length - 10} more`)
    }
    parts.push("")
  }

  // Suggested headlines
  if (research.suggestedHeadlines.length > 0) {
    parts.push(`## Headline Ideas`)
    for (const h of research.suggestedHeadlines) {
      parts.push(`- ${h}`)
    }
    parts.push("")
  }

  // Narrative angles
  if (research.narrativeAngles.length > 0) {
    parts.push(`## Narrative Angles`)
    for (const a of research.narrativeAngles) {
      parts.push(`- ${a}`)
    }
    parts.push("")
  }

  // Play lookup table if provided
  if (options?.playLookup && options.playLookup.length > 0) {
    parts.push("")
    parts.push(formatPlayLookupTable(options.playLookup))
  }

  // Play ID instructions if provided
  if (options?.categorizedIds) {
    parts.push("")
    parts.push(formatPlayIdInstructions(options.categorizedIds))
  }

  return parts.join("\n")
}

/**
 * Build the complete system prompt for writing
 */
export const buildWriterSystemPrompt = (): string => {
  return [
    WRITER_IDENTITY,
    "",
    WRITER_PHILOSOPHY,
    "",
    WRITER_STRUCTURE,
    "",
    WRITER_TONE
  ].join("\n")
}
