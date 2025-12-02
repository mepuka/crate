# Crate Research Agent Design

**Date:** 2025-12-02
**Status:** Draft - Pending Database Prerequisites

## Overview

A streaming research agent that processes KEXP plays and surfaces insights in real-time. The agent embodies the "crate digging" philosophy - discovery, curation, and musical connections.

## Architecture

### Execution Model

- **Trigger:** Cloud Run function receives new play via webhook
- **Processing:** Agent researches the play using tools
- **Output:** Typed insights posted back to Crate API
- **Display:** Insights stream to UI incrementally (log-style)
- **Persistence:** Insights accumulate over time, building knowledge

### Key Constraint

**Surface existing information, don't generate.** The LLM extracts, classifies, and connects - it doesn't create content.

## Context Architecture

The agent receives layered context:

```
┌─────────────────────────────────────────────────────────────┐
│  1. SYSTEM PROMPT (Static)                                  │
│     - Crate philosophy & values                             │
│     - KEXP culture primer                                   │
│     - Insight types & output schema                         │
│     - Tool descriptions                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. SHOW CONTEXT (Semi-dynamic)                             │
│     - Current show name & description                       │
│     - Host name(s) & bio snippets                           │
│     - Show tags (genre focus)                               │
│     - "This is a punk show" vs "This is an eclectic mix"    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. RECENT INSIGHTS (Rolling window)                        │
│     - Last N insights produced this session                 │
│     - Enables coherence: "We already noted X about Y"       │
│     - Prevents repetition, enables threading                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. PLAY DATA (Per-request)                                 │
│     - Full play metadata                                    │
│     - DJ comment                                            │
│     - Semantic predicate descriptions that match            │
└─────────────────────────────────────────────────────────────┘
```

## System Prompt Philosophy

### Crate Values

- **Discovery:** Surface hidden gems, B-sides, debut plays, overlooked artists
- **Curation:** Honor the DJ's role as tastemaker - why did they play this NOW?
- **Connections:** Trace lineage - covers, samples, collaborations, label mates, scenes

### KEXP Culture

- DJs are "pro-music people" - curators, not algorithms
- Show context matters - Sonic Reducer (punk) vs Morning Show (eclectic)
- Local artists (Pacific Northwest) get special emphasis
- DJ comments are gold - personal curatorial voice
- Rotation status indicates discovery arc (Heavy → Medium → Light → Library)

### Core Instruction

> "MBIDs are ground truth. When referencing any artist, recording, or release, always include the MBID if known. Use the `resolve_mbid` tool to look up MBIDs for entities mentioned in comments."

## MBID-First Data Model

All entity references anchor to MusicBrainz IDs:

```typescript
interface ArtistRef {
  name: string
  mbid?: string              // MusicBrainz Artist ID
}

interface RecordingRef {
  title: string
  mbid?: string              // MusicBrainz Recording ID
  artists: ArtistRef[]
}

interface ReleaseRef {
  title: string
  mbid?: string              // MusicBrainz Release ID
  releaseGroupMbid?: string
}

interface LabelRef {
  name: string
  mbid?: string              // MusicBrainz Label ID
}
```

## Insight Output Schema

### Base Insight

```typescript
interface BaseInsight {
  _tag: string
  playId: number
  // Source play's MBIDs for traceability
  sourceRecordingMbid?: string
  sourceArtistMbids: string[]
  sourceReleaseMbid?: string
  confidence: "high" | "medium" | "low"
  sourceType: "extraction" | "database" | "external"
}
```

### Extraction Insights (from DJ comment/play data)

```typescript
// Concert/show mention
interface ConcertInsight extends BaseInsight {
  _tag: "Concert"
  artist: ArtistRef
  venue?: string
  date?: string
  city?: string
  sourceQuote: string
}

// Cover song reference
interface CoverInsight extends BaseInsight {
  _tag: "Cover"
  original: RecordingRef
  sourceQuote: string
}

// Sample reference
interface SampleInsight extends BaseInsight {
  _tag: "Sample"
  sampled: RecordingRef
  direction: "samples" | "sampled_by"
  sourceQuote: string
}
```

### Database Insights (from Crate search)

```typescript
// Play history for entity
interface PlayHistoryInsight extends BaseInsight {
  _tag: "PlayHistory"
  entityMbid: string
  entityType: "recording" | "artist" | "release" | "release_group"
  totalPlays: number
  firstPlay?: { date: string; showName: string; playId: number }
  lastPlay?: { date: string; showName: string; playId: number }
  notableComments?: Array<{ playId: number; comment: string }>
}

// Artist/label connection
interface ConnectionInsight extends BaseInsight {
  _tag: "Connection"
  fromArtist: ArtistRef
  toArtist: ArtistRef
  connectionType: "labelmate" | "collaborator" | "member_of" | "same_release_group"
  viaLabel?: LabelRef        // For labelmate connections
  mbRelationshipType?: string
  explanation: string
}
```

### External Insights (from links/web)

```typescript
interface LinkInsight extends BaseInsight {
  _tag: "Link"
  relatedEntity?: ArtistRef | RecordingRef | ReleaseRef
  url: string
  title: string
  summary: string
  linkType: "bandcamp" | "wikipedia" | "discogs" | "article" | "video" | "social" | "other"
}
```

## Tool Interfaces

### MBID Resolution

```typescript
interface ResolveMbidTool {
  name: "resolve_mbid"
  description: "Look up MusicBrainz ID for an artist, recording, or release by name."
  parameters: {
    query: string
    entityType: "artist" | "recording" | "release" | "release_group" | "label"
    artistHint?: string
    releaseHint?: string
  }
  returns: Array<{
    mbid: string | null
    name: string
    disambiguation?: string
    score: number
  }>
}
```

### Database Search

```typescript
interface SearchPlaysTool {
  name: "search_plays"
  description: "Search KEXP play history. Use MBIDs when available."
  parameters: {
    artistMbid?: string
    recordingMbid?: string
    releaseMbid?: string
    releaseGroupMbid?: string
    labelMbid?: string       // NEW: Search by label
    query?: string
    limit?: number
    beforeDate?: string
    afterDate?: string
  }
  returns: {
    plays: PlayResult[]
    totalCount: number
  }
}
```

### Semantic Search

```typescript
interface SemanticSearchTool {
  name: "semantic_search"
  description: "Find plays with semantically similar DJ comments."
  parameters: {
    query: string
    limit?: number
  }
  returns: {
    plays: PlayResult[]
    scores: number[]
  }
}
```

### Link Fetching (Jina AI)

```typescript
interface FetchLinkTool {
  name: "fetch_link"
  description: "Fetch and summarize content from a URL via Jina AI."
  parameters: {
    url: string
    focusQuery?: string
  }
  returns: {
    title: string
    markdown: string         // Full markdown content from Jina
    summary: string          // AI-generated summary
    linkType: "bandcamp" | "wikipedia" | "discogs" | "article" | "video" | "social" | "other"
    extractedMbids?: {
      artists?: string[]
      releases?: string[]
    }
  }
}
```

### Previous Insights

```typescript
interface GetRecentInsightsTool {
  name: "get_recent_insights"
  description: "Get insights already produced. Use to maintain coherence."
  parameters: {
    artistMbid?: string
    recordingMbid?: string
    insightType?: string
    limit?: number
  }
  returns: {
    insights: Insight[]
  }
}
```

## Prerequisites - Database Migration

Before implementing the agent, the database needs:

### 1. Labels Table

KEXP plays include label information, but we need MBID-anchored labels:

```sql
CREATE TABLE labels (
  mbid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  disambiguation TEXT,
  country TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE play_labels (
  play_id INTEGER REFERENCES plays(id),
  label_mbid TEXT REFERENCES labels(mbid),
  PRIMARY KEY (play_id, label_mbid)
);
```

### 2. Link Content Table

Store Jina-fetched content for links found in DJ comments:

```sql
CREATE TABLE link_content (
  id INTEGER PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  markdown TEXT,             -- Full Jina markdown output
  summary TEXT,              -- AI-generated summary
  link_type TEXT,            -- bandcamp, wikipedia, etc.
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Extracted MBIDs if found
  extracted_artist_mbids TEXT,  -- JSON array
  extracted_release_mbids TEXT  -- JSON array
);

CREATE TABLE play_links (
  play_id INTEGER REFERENCES plays(id),
  link_id INTEGER REFERENCES link_content(id),
  PRIMARY KEY (play_id, link_id)
);
```

### 3. Sync Script Updates

- Extract links from DJ comments during sync
- Call Jina AI to fetch/convert link content
- Resolve label MBIDs via MusicBrainz API
- Store link content and label associations

## Implementation Phases

### Phase 1: Database Foundation (Current Priority)
- [ ] Add labels table with MBID support
- [ ] Add link_content table
- [ ] Update sync script to extract links from comments
- [ ] Integrate Jina AI for link fetching
- [ ] Backfill existing plays

### Phase 2: API Endpoints
- [ ] `/api/labels/{mbid}` - Label info
- [ ] `/api/plays/by-label/{mbid}` - Plays by label
- [ ] `/api/links/{play_id}` - Links for a play
- [ ] Update PlayResult schema to include labels + links

### Phase 3: Agent Implementation
- [ ] Set up @effect/ai integration
- [ ] Implement tool handlers
- [ ] Write system prompt
- [ ] Cloud Run function deployment
- [ ] Insight persistence endpoints

### Phase 4: UI Integration
- [ ] Insight display components
- [ ] Streaming insight feed
- [ ] Label browsing UI

## Open Questions

1. **Link extraction:** Regex for URLs in comments, or use NLP?
2. **Jina rate limits:** Batch during sync, or on-demand?
3. **Label disambiguation:** How to handle multiple labels per play?
4. **Insight deduplication:** How to prevent repeat insights across plays?

## References

- [Anthropic Prompt Engineering Guide](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Effect AI Documentation](https://effect.website/docs/ai/introduction/)
- [KEXP API](https://api.kexp.org/v2/)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Jina AI Reader](https://jina.ai/reader/)
