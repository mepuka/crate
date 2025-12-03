# Crate Research Agent - Prompt Engineering Guide

**Date:** 2025-12-03
**Status:** Living Document
**Audience:** Developers maintaining the Crate Research Agent

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The KEXP Philosophy](#the-kexp-philosophy)
3. [Crate Design Principles](#crate-design-principles)
4. [Claude 4.x Prompting Best Practices](#claude-4x-prompting-best-practices)
5. [Current Architecture](#current-architecture)
6. [Insight Type Reference](#insight-type-reference)
7. [Research Flow Patterns](#research-flow-patterns)
8. [Hallucination Prevention](#hallucination-prevention)
9. [Prompt Section Recommendations](#prompt-section-recommendations)
10. [Tool Design Patterns](#tool-design-patterns)
11. [Edge Cases](#edge-cases)
12. [Testing & Validation](#testing--validation)
13. [Implementation Alignment](#implementation-alignment)

---

## Executive Summary

This guide synthesizes learnings from four sources:

| Source | What It Provides |
|--------|-----------------|
| `KEXP_CRATE_PHILOSOPHY.md` | KEXP culture, DJ patterns, show profiles, language conventions |
| `CRATE_UI_UX_RESEARCH.md` | Discovery psychology, progressive disclosure, ethical engagement |
| Anthropic Documentation | Claude 4.x best practices, constraint language, tool use patterns |
| Codebase Analysis | Actual implementation patterns, architecture, gaps vs. design |

### Priority Issues Identified

| Priority | Issue | Impact |
|----------|-------|--------|
| **CRITICAL** | MBID workflow contradiction | Model may skip tool calls, fabricate MBIDs |
| **HIGH** | Aggressive constraint language | Counter to Claude 4.x best practices |
| **HIGH** | Missing reflection phase | No processing between tool calls and output |
| **MEDIUM** | Insufficient zero-insight guidance | Model unsure when 0 insights is correct |
| **MEDIUM** | Cover/Sample triggers allow hallucination | "use your knowledge" enables fabrication |

### Guiding Principles

1. **Claude 4.x Prefers Principles Over Rules** — Explain *why*, not just *what*
2. **RAG is Most Effective for Hallucination Prevention** — Tools are ground truth
3. **Interleaved Reflection Improves Quality** — Think between tool calls and output
4. **The Two-Phase Loop Works** — `generateText` for research, `generateObject` for output
5. **KEXP's Value is Human Curation** — We amplify, never replace

---

## The KEXP Philosophy

> "KEXP's mission is to enrich your life by championing music and discovery."

Understanding KEXP is essential to building an agent that serves its community authentically.

### Core Identity: Pro-Music People

KEXP isn't a radio station—it's a **community of music enthusiasts**. As DJ Larry Mizell Jr. says:

> "We're not a bunch of radio pros. We're a bunch of pro-music people."

This distinction shapes everything:
- DJs have **100% programming freedom** (rare in radio)
- Choices are made for **musical merit**, not popularity metrics
- The community includes listeners, artists, and DJs as equals

### What Makes KEXP Different from Algorithms

| Algorithm-Driven | KEXP Human Curation |
|-----------------|---------------------|
| Serves songs based on listening data | DJ chooses songs for a reason *right now* |
| Optimizes for engagement metrics | Optimizes for artistic merit and context |
| Creates "filter bubbles" | Creates "even playing field" for all artists |
| Passive consumption | Active discovery and exploration |

As Kevin Cole (Chief Content Officer) explains:

> "DJs have the freedom and responsibility to curate their own shows... they are able to respond to events in real time, creating the soundtrack to the world as it is unfolding."

### The Even Playing Field

A crucial KEXP value: **all artists deserve the same respect**.

> "Imagine all the stations supporting artists, and then the artists listening to these community stations... when an artist hears their band next to the Violent Femmes... next to Radiohead... you, the emerging artist, have been given the respect of being on an even playing field."

**For the agent:** A local band's debut single deserves the same analytical depth as a Radiohead track. If anything, the unknown artist needs help *more* to tell their story.

### DJ Commentary Patterns

DJ comments are **gold**—they contain the curatorial voice that makes KEXP special. The agent should recognize these patterns:

**Historical Context**
```
"That was [Artist] from their 1994 debut..."
"Recorded at Bad Animals studio..."
"Their first album in 10 years..."
```

**Personal Connection**
```
"I first saw this band in 2010 at a tiny club..."
"Morgan recommended this track to me..."
"This one always gets me..."
```

**Musical Connections**
```
"If you're into that, check out [Other Artist]..."
"You might recognize the influence of..."
"They toured with [Other Band] last year..."
```

**Discovery Signals**
```
"Brand new from..." / "Just released yesterday..."
"KEXP debut" / "First time on air"
"World premiere" / "Exclusive"
```

**Local Pride**
```
"Seattle's own..." / "Pacific Northwest band..."
"They're playing at [Local Venue] next week..."
"Local heroes..."
```

**Concert/Event Mentions**
```
"Catch them at [Venue] on [Date]..."
"Tickets on sale now..."
"[Tour Name] kicks off..."
```

### Rotation System

KEXP tracks discovery through rotation status:

| Status | Meaning | Agent Behavior |
|--------|---------|----------------|
| **Heavy Rotation** | Top priority new releases, played frequently | Peak discovery moment—highlight newness |
| **Medium Rotation** | Solid new releases, regular play | Standard new music treatment |
| **Light Rotation** | Niche releases, specialty shows | Genre-specific context may be relevant |
| **R/N (Recent/New)** | Recently added, being evaluated | Note as "new addition" |
| **Library** | No longer in rotation, DJ specifically chose it | Deliberate curatorial choice—explore why |

**Insight:** A Library pull during morning show means the DJ went out of their way to select it. Worth noting.

### Show Personality Reference

Different shows have different characters. The agent should calibrate:

| Show | Character | Typical Insights |
|------|-----------|------------------|
| **Morning Show** (John Richards) | Uplifting, cathartic, community-oriented | Emotional resonance, community stories |
| **Midday Show** (Cheryl Waters) | Eclectic, live sessions, emerging artists | Live session context, breakthrough moments |
| **Afternoon Show** (Larry Mizell Jr.) | Diverse, rhythmic, hip-hop influenced | Genre connections, beat-driven context |
| **Sonic Reducer** | Punk rock, raw energy | Scene connections, DIY culture |
| **Expansions** | Electronic, ambient, transcendent | Sonic journeys, producer credits |
| **Audioasis** | 100% local Pacific Northwest | Local scene, venue connections |
| **El Sonido** | Latin alternative, bilingual | Cultural context, cross-border connections |
| **Wo' Pop** | Global music, world sounds | Geographic and cultural context |

### KEXP Language Conventions

**DO use:**
- "we/our" to refer to KEXP community
- Direct, conversational tone
- Specific details over generic statements
- Enthusiastic but genuine praise ("How good is that bassline?!")
- Discovery language ("brand new", "KEXP debut", "first spin")

**AVOID:**
- Marketing speak or hype
- Generic biographical summaries ("The Beatles were a band from Liverpool...")
- Condescending explanations
- Overly formal "radio voice"
- Empty superlatives without substance

---

## Crate Design Principles

From the UI/UX research, these principles guide how insights should be crafted:

### 1. Curiosity-Driven Design

> "Tease, don't overwhelm."

Present information in a way that sparks questions and invites exploration:
- Lead with the most interesting fact
- Use partial information to create "information gaps"
- Make users want to learn more

**Good:** "First KEXP play since 2019—and they've just announced a Seattle show"
**Bad:** "Artist bio: Formed in 2010, released 5 albums, tours regularly"

### 2. Explorer, Not Consumer

> "We don't tell people what to listen to; we illuminate what they are already hearing."

The agent doesn't recommend—it reveals:
- Surface connections the listener might not know
- Provide context for what's already playing
- Enable discovery, don't direct it

### 3. Progressive Disclosure

```
Glance → Scan → Read → Deep Dive
```

Insights should work at multiple levels:
- **Glance:** Insight type and main entity visible immediately
- **Scan:** Key fact in first sentence
- **Read:** Full context available
- **Deep Dive:** Links to more information

### 4. Serendipity with Context

Create "aha!" moments without being random:
- Every insight should answer: *"Why does this matter right now?"*
- Connections should feel meaningful, not arbitrary
- Surprises should relate to the current listening context

### 5. Ethical Engagement

From the research: avoid "doomscrolling" patterns:
- Quality over quantity (0-3 insights per play)
- Natural stopping points (no endless feed of insights)
- Respect user attention (don't spam with obvious observations)

---

## Claude 4.x Prompting Best Practices

Based on official Anthropic documentation and Claude 4.5 system prompt analysis.

### The Paradigm Shift: Claude 4.x

Claude 4.x (especially Sonnet 4.5) represents a fundamental shift in how the model responds to constraints:

| Old Pattern | New Pattern |
|-------------|-------------|
| "MUST" | "should" |
| "NEVER" | "avoid" or contextual guidance |
| "CRITICAL" / "VERY IMPORTANT" | Normal emphasis with reasoning |
| Hard rules | Principles with explanations |

**Why this matters:** Claude 4.5 is a **reasoning partner**, not an obedient executor. It evaluates whether following literal commands serves the user's apparent goal. If those conflict, context wins.

### Principle 1: Explain the "Why"

For every instruction, provide motivation:

**Don't:**
```
NEVER fabricate MBIDs - use real UUIDs from search results or null
```

**Do:**
```
Use MBIDs from search results, or null if not found.

Why this matters: Fabricated MBIDs break downstream processing. Our data model
requires real MusicBrainz identifiers for cross-system linking. An insight with
null MBID is valid and preferable to one with a fake ID.
```

### Principle 2: Positive Framing

Specify what to do, not what to avoid:

**Don't:**
```
Don't use markdown formatting
```

**Do:**
```
Your response should be composed of smoothly flowing prose paragraphs
```

### Principle 3: Interleaved Reflection

Claude 4.x benefits from explicit thinking phases between tool calls:

```
After receiving tool results, carefully reflect on their quality and determine
optimal next steps before proceeding. Use your thinking to plan and iterate
based on this new information, then take the best next action.
```

Anthropic's guidance: Budget ~16k tokens for reasoning and run in interleaved mode where tool calls, results, and reflection appear in sequence.

### Principle 4: Parallel Tool Execution

Claude 4.x excels at parallel tool calling:

```
If you intend to call multiple tools and there are no dependencies between
the calls, make all independent tool calls in parallel for optimal performance.
```

### Principle 5: Minimal Viable Tool Sets

From Anthropic's context engineering article:

> "One of the most common failure modes is bloated tool sets that cover too much functionality or lead to ambiguous decision points about which tool to use."

**Best Practice:** If a human engineer can't definitively say which tool to use in a situation, an AI agent can't be expected to do better.

### Principle 6: Few-Shot Examples Work

Empirical data shows Claude improves significantly with examples:
- 3-5 diverse, relevant examples per task type
- Format as messages, not string concatenation in system prompts
- Diminishing returns after ~5 examples

### Principle 7: Allow Uncertainty

Explicitly give Claude permission to admit uncertainty:

```
If you're uncertain about any information, explicitly state your uncertainty
rather than providing potentially incorrect information. Producing 0 insights
is often the correct answer.
```

### Principle 8: Quote Before Analyze

For tasks involving extraction (like parsing DJ comments):

```
Step 1: Extract the exact quote from the DJ comment
Step 2: Use only that quote as evidence for your insight
```

This forces citation and makes hallucination visible.

### Avoid Common Pitfalls

| Pitfall | Why It Fails | Alternative |
|---------|--------------|-------------|
| "MUST", "ALWAYS", "NEVER" (caps) | Triggers defensive behavior | Lowercase with reasoning |
| "You WILL be penalized for..." | Sounds punitive | "This matters because..." |
| "use your knowledge" | Enables hallucination | "extract from tool results" |
| Edge-case overspecification | Bloats prompts | Keep minimal, handle in code |

---

## Current Architecture

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│ MusicAgent (LLM Control Layer)                 │
│ - Two-phase loop (research + output)           │
│ - Chat history management (@effect/ai)         │
│ - Insight decoding & posting                   │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ Toolkit & Handlers (Tool Execution Layer)      │
│ - 5 tools (search, semantic, mbid, link, insights)
│ - Error-tolerant handlers (catch & return empty) │
│ - Service bridge layer                         │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ Services (Business Logic Layer)                │
│ - HTTP clients for FAISS, MusicBrainz, Jina   │
│ - InsightSession for session state            │
│ - PromptBuilder with asset injection          │
└─────────────────────────────────────────────────┘
```

### The Two-Phase Agent Loop

**Why split phases?**
- `generateObject` overrides `toolChoice` to force the schema tool
- Phase 1 forces tool usage for research
- Phase 2 gets structured output
- Chat history accumulates both phases for final context

```typescript
// Phase 1: Research (generateText with forced tool calls)
const response = yield* chat.generateText({
  prompt: [],
  toolkit,
  toolChoice: state.iteration === 0
    ? { mode: "required", oneOf: ["get_recent_insights", "search_plays", ...] }
    : "auto"
})

// Phase 2: Output (generateObject for structured insights)
const response = yield* chat.generateObject({
  prompt: [{ role: "user", content: "Based on your research above..." }],
  toolkit,
  schema: InsightsResponseEncoded,
  objectName: "insights"
})
```

### Tool Handlers Never Fail

Critical design principle: Tools degrade gracefully.

```typescript
// Error → empty response with _error field instead of failure
Effect.catchAll((error) =>
  Effect.succeed({
    results: [],
    _error: error.message,  // Include for debugging
  })
)
```

**Pattern:** Error → empty results with `_error` field, never propagated failures.

### Context Injection Layers

The prompt is assembled from layers:

1. **Static System Prompt** — Core identity, philosophy, KEXP culture
2. **Show Context** — Current show name, host, tags, description
3. **Time Context** — Current date/time for temporal reasoning
4. **Recent Insights** — Session history to avoid repetition
5. **Play Data** — Track, artist, labels, DJ comment

---

## Insight Type Reference

### Base Fields (All Insights)

```typescript
interface BaseInsight {
  playId: number
  sourceRecordingMbid: string | null
  sourceArtistMbids: string[]
  sourceReleaseMbid: string | null
  confidence: "high" | "medium" | "low"
  sourceType: "extraction" | "database" | "external"
}
```

### ConcertInsight

**Trigger:** DJ comment mentions venue, date, tour, "catch them at...", "playing at...", tickets.

**Required Evidence:**
- Explicit venue name OR explicit date
- Action language ("catch them", "tickets", "playing at")

**Example Triggers:**
- ✅ "Catch them at the Paramount March 15th"
- ✅ "Tickets on sale for their fall tour"
- ✅ "Part of the Capitol Hill Block Party lineup"
- ❌ "They're playing soon" (too vague)

**Fields:**
```typescript
{
  _tag: "Concert",
  artist: ArtistRef,
  venue: string | null,
  date: string | null,      // ISO date resolved from relative reference
  time: string | null,      // "8:00 PM"
  city: string | null,
  ticketUrl: string | null,
  tourName: string | null,
  sourceQuote: string       // REQUIRED: exact DJ text
}
```

### CoverInsight

**Trigger:** Track is a cover version, DJ explicitly mentions "cover of", "originally by", "their take on".

**Required Evidence:**
- DJ comment explicitly mentions it's a cover
- Recording title includes "(Cover)" or similar
- **DO NOT infer from training knowledge**

**Example Triggers:**
- ✅ "Their stunning cover of the Bowie classic"
- ✅ "Originally by Nina Simone in 1965"
- ❌ "Friday I'm in Love" by Phoebe Bridgers (known cover, but DJ didn't mention it)

**Fields:**
```typescript
{
  _tag: "Cover",
  original: RecordingRef,   // Original song/artist
  sourceQuote: string       // REQUIRED: must contain "cover", "originally", etc.
}
```

### SampleInsight

**Trigger:** Track samples another work, or is itself sampled. DJ explicitly mentions "samples", "built on", "you might recognize".

**Required Evidence:**
- DJ comment mentions sampling relationship
- **DO NOT infer samples from memory**

**Fields:**
```typescript
{
  _tag: "Sample",
  sampled: RecordingRef,
  direction: "samples" | "sampled_by",
  sourceQuote: string       // REQUIRED: must contain "sample" or equivalent
}
```

### PlayHistoryInsight

**Trigger:** Significant milestones—first play, anniversary, round numbers, rarity, notable gap.

**Example Triggers:**
- First time this artist played on KEXP (debut!)
- 100th, 500th, 1000th play of a recording
- First play in 5+ years (rare selection)
- Play date anniversary

**Fields:**
```typescript
{
  _tag: "PlayHistory",
  entityMbid: string,
  entityType: "recording" | "artist" | "release" | "release_group",
  totalPlays: number,
  firstPlay: PlayReference | null,
  lastPlay: PlayReference | null,
  notableComments: NotableComment[] | null
}
```

### ConnectionInsight

**Trigger:** Artist relationship discovered via DJ comment or database—labelmate, collaborator, band member, same scene.

**Example Triggers:**
- "Featuring [Artist] on vocals"
- Artists share a label (especially small/indie labels)
- Band members' other projects
- DJ explicitly draws connection: "fans of X will love Y"

**Fields:**
```typescript
{
  _tag: "Connection",
  fromArtist: ArtistRef,
  toArtist: ArtistRef,
  connectionType: "labelmate" | "collaborator" | "member_of" | "same_release_group",
  viaLabel: LabelRef | null,
  mbRelationshipType: string | null,
  explanation: string
}
```

### LinkInsight

**Trigger:** DJ comment contains a URL, or fetched content provides meaningful enrichment.

**Fields:**
```typescript
{
  _tag: "Link",
  relatedEntity: ArtistRef | RecordingRef | ReleaseRef | null,
  url: string,
  title: string,
  summary: string,
  linkType: "bandcamp" | "wikipedia" | "discogs" | "article" | "video" | "social" | "other"
}
```

---

## Research Flow Patterns

### The Gather → Reflect → Produce Pattern

Every research session follows this flow:

```
┌─────────────────────────────────────────┐
│ PHASE 1: GATHER                        │
│ - Call get_recent_insights() first     │
│ - Call search_plays() for MBIDs        │
│ - Parse DJ comment for triggers        │
│ - Call additional tools as needed      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ PHASE 2: REFLECT                       │
│ - What did I find?                     │
│ - Is this genuinely interesting?       │
│ - Is this a discovery moment or        │
│   routine rotation?                    │
│ - Would this create an "aha!" moment?  │
│ - Have I already covered this?         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ PHASE 3: PRODUCE                       │
│ - Generate only insights with evidence │
│ - If nothing passes filters, produce 0 │
│ - That's often the correct answer      │
└─────────────────────────────────────────┘
```

### Flow 1: New Artist with DJ Comment

```
Input: Unknown artist, rich DJ comment mentioning concert

GATHER:
1. search_plays("Artist Name") → Check KEXP history, get MBIDs
2. get_recent_insights() → Check for duplicates

REFLECT:
- Is this a KEXP debut? (no prior plays)
- Does comment mention concert details?
- Is it a local artist?

PRODUCE:
- If debut: PlayHistoryInsight (first play!)
- If concert mentioned: ConcertInsight with extracted details
- If local: Emphasize in insight text
```

### Flow 2: Superstar Artist, No Comment

```
Input: Well-known artist, no DJ comment

GATHER:
1. search_plays(artist_mbid) → Get play history
2. get_recent_insights() → Check for duplicates

REFLECT:
- We've played them 500 times
- No comment = no curatorial voice to honor
- Nothing new to say

PRODUCE:
- 0 insights (THIS IS CORRECT!)
```

### Flow 3: Cover/Sample in Comment

```
Input: DJ says "This is their take on the Nina Simone classic"

GATHER:
1. search_plays("current artist") → Get artist MBID
2. search_plays("Nina Simone") → Get original artist MBID
3. get_recent_insights() → Check for duplicates

REFLECT:
- Explicit cover reference in comment ✓
- Can identify original artist via search
- Quote: "their take on the Nina Simone classic"

PRODUCE:
- CoverInsight with:
  - sourceQuote: "their take on the Nina Simone classic"
  - original: { name: "Nina Simone", mbid: from search }
  - confidence: high (explicit mention)
```

### Flow 4: URL in Comment

```
Input: DJ comment contains Bandcamp URL

GATHER:
1. fetch_link(url) → Get content summary
2. search_plays(artist) → Get MBIDs
3. get_recent_insights() → Check for duplicates

REFLECT:
- Bandcamp link to purchase album
- Relevant for fans who want to support artist
- Not redundant with existing insights

PRODUCE:
- LinkInsight with linkType: "bandcamp"
```

### Flow 5: When 0 Insights is Correct

Producing no insights is often the right answer:

| Scenario | Analysis | Output |
|----------|----------|--------|
| Radiohead play, no DJ comment | Nothing new to say about 500+ play artist | 0 insights ✓ |
| Artist we covered 3 plays ago | Would be redundant | 0 insights ✓ |
| Medium rotation, comment is just "New from [Artist]" | No specific triggers | 0 insights ✓ |
| Library pull with no comment | DJ chose it for a reason, but can't illuminate why | 0 insights ✓ |
| Generic play with obvious facts only | Not interesting enough | 0 insights ✓ |

**Remember:** A play with no insights is fine. Quality > quantity.

---

## Hallucination Prevention

### The Core Principle

> **RAG (tool results) is the most effective hallucination mitigation.**

The model should treat tool results as ground truth. Its own knowledge is supplementary at best.

### Six Prevention Techniques

From Anthropic's official hallucination reduction guide:

**1. Allow "I Don't Know" Responses**
```
If you're uncertain about any information, explicitly state your uncertainty
rather than providing potentially incorrect information.
```

**2. Use Direct Quotes for Factual Grounding**
```
Step 1: Extract the exact word-for-word quote from the DJ comment
Step 2: Use only that quote to support your insight
```

**3. Require Citations**
For extraction insights, `sourceQuote` is REQUIRED and must contain evidence.

**4. Restrict External Knowledge**
```
Only use information from tool results and DJ comments. Do not use your
general knowledge for artist facts, cover relationships, or sample sources.
```

**5. Validate MBIDs**
- All MBIDs must come from search results
- If search returns no results, use `null`
- **NEVER fabricate UUID strings**

**6. Produce 0 When Unsure**
Better to produce no insights than hallucinated ones.

### Dangerous Patterns to Avoid

| Pattern | Risk | Mitigation |
|---------|------|------------|
| "use your knowledge" | Fabrication | Remove from prompt entirely |
| "you might recognize" | False positives | Require explicit evidence |
| "if you know this is a cover" | Memory errors | Only if DJ says "cover of" |
| Inventing UUIDs | Data corruption | Only use search results or null |

### The sourceQuote Requirement

For extraction insights (Concert, Cover, Sample):

```
If producing CoverInsight:
- sourceQuote MUST contain words like "cover", "originally", "version of", "their take on"
- If DJ didn't say these words, don't produce the insight
```

This makes hallucination visible and enables human review.

---

## Prompt Section Recommendations

### Recommendation 1: Fix MBID Workflow (CRITICAL)

Replace conflicting instructions with a clear decision tree:

```markdown
## MBID Resolution Workflow

Follow this decision tree for every play:

1. **Does the play data include MBIDs?**
   - Yes → Use them directly
   - No → Continue to step 2

2. **Call search_plays with the artist name**
   - Found results → Use MBIDs from search results
   - No results → Continue to step 3

3. **Is this entity mentioned in DJ comment (not the main artist)?**
   - Yes → Call resolve_mbid to look up
   - No → Continue to step 4

4. **No MBID available**
   - Use null for MBID fields
   - An insight with null MBID is valid
   - Never fabricate UUID strings

Why this matters: MBIDs enable cross-system linking. Fabricated MBIDs break
downstream processing and create data integrity issues.
```

### Recommendation 2: Add Reflection Phase (HIGH)

Add explicit reflection guidance:

```markdown
## Research Process

Your analysis follows three phases:

### Phase 1: GATHER
Call tools to collect evidence:
- get_recent_insights() → Avoid duplicates
- search_plays() → Get MBIDs and history
- Additional tools as needed

### Phase 2: REFLECT
Before producing any insight, ask:
- What's genuinely interesting about this play?
- Is this a discovery moment or routine rotation?
- Would this insight create an "aha!" moment for the listener?
- Have I already covered this in recent insights?

### Phase 3: PRODUCE
Generate insights only when:
- You have concrete evidence from tools
- The insight adds value (not obvious/generic)
- It hasn't been covered recently

If nothing passes these filters, produce 0 insights. That's the correct answer.
```

### Recommendation 3: Soften Constraint Language (HIGH)

**Before:**
```
1. **ALWAYS USE TOOLS FIRST (IN THIS ORDER).** For every play, before producing ANY insight, you MUST:
```

**After:**
```
1. **Research before writing.** For every play, start by gathering evidence:
   - Check recent insights to maintain coherence
   - Search play history to get MBIDs and context
   - Use additional tools as the DJ comment suggests

   Why this order? Recent insights prevent duplicates. Search provides MBIDs.
   Only after gathering evidence should you decide what insights (if any) to produce.
```

### Recommendation 4: Remove "Use Your Knowledge" (MEDIUM)

**Before:**
```
- Recording title matches known cover (use your knowledge)
- You recognize a known sample (use your knowledge)
```

**After:**
```
- DJ comment explicitly mentions "cover of", "originally by", "their version of"
- Recording title includes "(Cover)" or "... Cover"
- DJ comment mentions "samples", "built on", "borrowed from" with specific reference

Do NOT infer covers or samples from your training knowledge. Only produce
these insights when there's explicit textual evidence in the play data or
DJ comment.
```

### Recommendation 5: Add Tool Usage Examples (MEDIUM)

```markdown
### search_plays

Search KEXP play history. **This is your primary source for MBIDs.**

**Example: Find artist's first KEXP play**
```json
{
  "query": "Khruangbin",
  "limit": 1,
  "sort": "oldest"
}
```

**Example: Check if recording is a debut**
```json
{
  "query": "Artist Name",
  "recording_mbid": "abc-123-...",
  "limit": 1
}
```
→ If 0 results with recording filter, this specific recording is new to KEXP

**Example: Get play count for milestones**
```json
{
  "query": "Artist Name"
}
```
→ Check total_count in response for milestone detection
```

### Revised CONSTRAINTS Section

```markdown
### Research Guidelines

Your analysis should follow these principles:

**1. Research before writing**

For every play, start by gathering evidence:
- Check recent insights to maintain session coherence
- Search play history to get MBIDs and context
- Use additional tools as the DJ comment suggests

Why this order? Recent insights prevent duplicates. Search provides the MBIDs
you need. Only after gathering evidence should you decide what insights to produce.

**2. Tools are ground truth**

Use MBIDs and data from tool results, not from memory. When search_plays returns
no results, use null for MBID fields. An insight with null MBID is valid and
preferable to a fabricated one.

Why this matters: Fabricated MBIDs break downstream processing. Our data model
requires real MusicBrainz identifiers for cross-system linking.

**3. Extract, don't generate**

Your role is to surface existing information—from DJ comments, play history,
and external links. Never fabricate facts, dates, venues, or relationships.

Why this matters: Users trust insights to be accurate. A single hallucination
undermines that trust.

**4. Quality over quantity**

Produce 0-3 insights per play. If tools return no useful data and the DJ comment
has no triggers, produce nothing. A play with zero insights is often correct.

Why this matters: Generic or repetitive insights feel like spam. Users value
quality over volume.

**5. Honor the DJ's voice**

DJ commentary is primary source material. You illuminate and contextualize their
choices—you never replace or override their voice.

Why this matters: KEXP's value is human curation. We amplify that curation, not
compete with it.
```

---

## Tool Design Patterns

### Tool Response Handling

Tools return data ready for insight generation:

```typescript
interface SearchPlaysResult {
  plays: Array<{
    id: number
    artist: string
    artist_mbid: string | null  // Ready to use
    recording_mbid: string | null
    release_mbid: string | null
  }>
  total_count: number  // Ready for PlayHistoryInsight.totalPlays
}
```

### Error States

Tools return clear degraded responses:

```typescript
// When search finds nothing
{
  plays: [],
  total_count: 0,
  _error: "No plays found for this artist"  // Debugging aid
}
```

### Tool Chaining Patterns

```
Pattern: First Play Check
1. search_plays(query=artist, sort=oldest, limit=1)
2. If results[0].id === current_play_id → KEXP debut!

Pattern: Cover Verification
1. search_plays(query=original_artist) → Get MBID
2. Use MBID in CoverInsight.original

Pattern: Milestone Detection
1. search_plays(query=artist)
2. Check total_count for round numbers (100, 500, 1000)
```

### Implementation Gaps to Note

| Design | Actual | Status |
|--------|--------|--------|
| Label filtering (`label_mbid`) | Query-only | Phase 1 prerequisite |
| Link content markdown + AI summary | Plain text extraction | Partial |
| Insight type filtering | Entity type filtering | Different approach |

---

## Edge Cases

### Artist Name Collision

**Problem:** Common name matches multiple artists (e.g., "Genesis" the band vs genesis the producer)

**Solution:**
- Use disambiguation info from search results
- Prefer results with higher play counts on KEXP
- If ambiguous, skip insight rather than guess

### DJ Comment in Non-English

**Problem:** El Sonido and specialty shows may have non-English comments

**Solution:**
- Still parse for URLs, dates, venue names (often translatable)
- Note uncertainty with lower confidence
- Don't attempt translation

### Pre-Release/Exclusive Plays

**Problem:** Play arrives before official release, no MBIDs exist yet

**Solution:**
- Note the exclusivity ("World premiere", "Pre-release")
- Use null for MBIDs
- Still produce insights about the discovery moment

### Compilation/Various Artists

**Problem:** Play from compilation, multiple artists to track

**Solution:**
- Focus on the specific track's artist
- Note compilation context if interesting
- Don't try to insight every artist on the compilation

### Live Performance Recording

**Problem:** Live version may have different MBID than studio version

**Solution:**
- Use recording_mbid from play data (should be specific to live version)
- Note "live version" context if relevant
- Connect to studio version if search finds it

### Duplicate Play in Feed

**Problem:** Same track played twice in quick succession (encore, request)

**Solution:**
- Check recent insights before producing
- Second play might warrant different insight (e.g., "Played twice tonight")
- Don't repeat same insight

---

## Testing & Validation

### Test Scenario 1: MBID Resolution

```yaml
Input:
  artist: "Obongjayar"
  artist_mbid: null
  comment: "New single from this incredible UK artist"

Expected behavior:
  1. Call search_plays("Obongjayar")
  2. Use returned artist_mbid in insights
  3. Do NOT fabricate MBID if search fails

Validation:
  - All MBIDs in output match search results OR are null
  - No UUID-like strings that weren't returned by tools
```

### Test Scenario 2: Zero Insights Appropriate

```yaml
Input:
  artist: "Radiohead"
  artist_mbid: "a74b1b7f-..."
  comment: null

Expected behavior:
  1. Search shows 500+ plays
  2. No DJ comment to parse
  3. Produce 0 insights

Validation:
  - insights array is empty []
  - No generic "Radiohead is a band" output
```

### Test Scenario 3: Concert Extraction

```yaml
Input:
  artist: "Fleet Foxes"
  comment: "Catch them at the Paramount Theatre March 15th, tickets on sale now"

Expected behavior:
  1. Extract venue: "the Paramount Theatre"
  2. Extract date: "March 15th" → resolve to ISO date
  3. Include sourceQuote with exact text

Validation:
  - ConcertInsight.venue matches extracted venue
  - ConcertInsight.date is valid ISO date
  - ConcertInsight.sourceQuote contains "Paramount"
```

### Test Scenario 4: Cover Without Evidence

```yaml
Input:
  artist: "Phoebe Bridgers"
  track: "Friday I'm in Love"  # Known Cure cover
  comment: "Great track"

Expected behavior:
  1. Do NOT produce CoverInsight
  2. DJ didn't mention it's a cover
  3. "Use your knowledge" is disabled

Validation:
  - No CoverInsight produced
  - Model doesn't hallucinate original artist
```

### Validation Checklist

For every agent output:

- [ ] All MBIDs are either from search results or null
- [ ] sourceQuote fields contain actual DJ text
- [ ] Dates are properly resolved to ISO format
- [ ] No insights duplicate recent insights
- [ ] Confidence levels match evidence quality
- [ ] 0 insights is acceptable output

---

## Implementation Alignment

### What's Well-Aligned

| Aspect | Status |
|--------|--------|
| Tool handler error resilience | ✓ Tools never fail, return empty with `_error` |
| Two-phase loop reasoning | ✓ Clearly implemented |
| MBID-first data model | ✓ Reflected in all insight schemas |
| Layer composition | ✓ Clean Config → Infra → Services → Handlers |
| Service pattern consistency | ✓ All services follow Context.Tag pattern |
| Schema JSON compatibility | ✓ Intentional constraints documented |

### Known Gaps

| Design | Implementation | Priority |
|--------|---------------|----------|
| Label search (`labelMbid`) | Query-only (no label filter) | Phase 1 |
| Link type classification | Plain text extraction | Low |
| Insight type filtering | Entity type filtering | Different approach |
| MBID extraction from links | Not implemented | Low |

### Architectural Strengths

1. **Graceful Degradation** — Tools never fail; return empty with error context
2. **Composition over Inheritance** — Layers compose vertically; easy to swap
3. **Effect-Native Patterns** — Consistent Context.Tag, Effect.Service, Layer.merge
4. **Tracing-First** — All operations annotated for observability
5. **Testability** — Clear Live/Test separation in layers

---

## Key Quotes Reference

**KEXP Mission:**
> "KEXP's mission is to enrich your life by championing music and discovery."

**Pro-Music People:**
> "We're not a bunch of radio pros. We're a bunch of pro-music people." — Larry Mizell Jr.

**Curator Freedom:**
> "DJs have the freedom and responsibility to curate their own shows... creating the soundtrack to the world as it is unfolding." — Kevin Cole

**Even Playing Field:**
> "When an artist hears their band next to the Violent Femmes... next to Radiohead... you, the emerging artist, have been given the respect of being on an even playing field."

**Community:**
> "KEXP is... a repository for the feelings of an entire city."

**Discovery:**
> "Music discovery at any age." — John Richards

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-03 | Initial version from comprehensive review | Research Agent |
| 2025-12-03 | Expanded with KEXP philosophy, Claude 4.x best practices, architecture analysis | Claude |

---

*This document should be updated as the agent evolves and new patterns emerge.*
