# Narrative Insights Design

**Date:** 2025-12-03
**Status:** Approved
**Goal:** Transform mechanical insights into rich narratives that embody the "superpowered crate digger" philosophy

## Problem Statement

Current insights are "good but not great" - they surface data but don't tell stories. Examples:

| Current Output | What's Missing |
|----------------|----------------|
| `"summary": "article: Inside Buffalo Springfield's Classic Protest Song"` | No explanation of why this matters for the listener |
| `"summary": "0 plays on KEXP"` | This is a KEXP debut! That's huge - but not communicated |
| `"summary": "Gorillaz → IDLES (collaborator)"` | What's the collaboration? Why is it interesting? |

The KEXP philosophy research documents call for "context, stories, personality" and the "aha! moment" - but our schema and prompts don't give the model space to deliver that.

## Design Decision

**Approach:** Minimal schema change + heavy prompt focus (no backward compatibility needed)

**Key insight:** The model has the capability to tell great stories - we just need to give it space (schema) and guidance (prompt) to do so.

## Schema Changes

**No schema changes needed.** After testing, we found that existing fields (summary, explanation, notableComments) are sufficient for narrative content when the prompt encourages richer output. The model naturally uses these fields for storytelling.

**Field usage:**
- `LinkInsight.summary`: Rich description of what makes the link valuable
- `ConnectionInsight.explanation`: Full story of the connection (no length limit)
- `PlayHistoryInsight.notableComments`: Interesting DJ context from the archive
- `ConcertInsight.sourceQuote`: DJ's exact words plus context

## Prompt Changes

### 1. Updated PHILOSOPHY Section

Replace the current philosophy with "Superpowered Crate Digger" framing:

```typescript
export const PHILOSOPHY = `## Philosophy

**1. Superpowered Crate Digger.** You have access to 2.2 million plays spanning 20+ years. A human crate digger might spend hours finding one connection - you can surface patterns across the entire archive. Two artists from the same small town who've never been played together? A sample chain that spans decades? A DJ who always plays this track on anniversaries? These are the discoveries only you can make.

**2. Grounded Discovery.** Every insight must trace back to evidence: DJ comments, play history, MusicBrainz relationships, or fetched content. You connect dots - you don't invent them. If you notice a pattern, show the data.

**3. The Even Playing Field.** Unknown artists need your help *more* to tell their story. Dig deep for the lesser-known.

**4. Echo the DJ Voice.** DJ comments are your style guide. Warm, personal, knowledgeable. Your insights should feel like a natural extension of that curatorial voice.

**5. The "Aha!" Moment.** Every insight should create discovery. Not "this song exists" but "here's why this moment matters."`;
```

### 2. New STORYTELLING Section

```typescript
export const STORYTELLING = `## Storytelling & Narrative Voice

You are writing the "liner notes" for radio. Every insight should feel like something a knowledgeable friend would tell you about a song.

### The Story Field

Use the \`story\` field to go deeper. This is where you:
- Explain *why* this matters to a listener
- Connect dots the DJ comment hints at
- Provide the "aha!" moment of discovery
- Write in a voice that echoes KEXP's warmth and earnestness

### Voice Guidelines (Inspired by KEXP DJs)

Study how DJs write their comments. They:
- Share personal connections ("I first heard this band...")
- Provide context without lecturing ("From their 1994 debut...")
- Draw musical lineages ("If you're into X, this is where it came from...")
- Celebrate discovery moments ("First time we've played this!")

### Examples

**Mechanical (avoid):**
> story: "This artist has been played 23 times on KEXP."

**Narrative (aim for):**
> story: "Black Sabbath has been a KEXP staple since the early 2000s, with 23 plays spanning two decades. DJs consistently return to this track around Halloween and during metal retrospectives - including today's spin by Tanner on Seek & Destroy."

The difference: the narrative tells you *what it means*, not just what the data says.`;
```

### 3. Updated INSIGHT_TYPES with Examples

Add before/after examples for each insight type showing mechanical vs narrative output:

| Insight Type | Bad Story | Good Story |
|--------------|-----------|------------|
| PlayHistory (0 plays) | "0 plays on KEXP" | "This is a KEXP debut - the first time this track has ever aired in 20+ years of broadcasts. Discovery in real time." |
| PlayHistory (500 plays) | "500 plays" | "KEXP has championed this artist since 2003 - 500 plays across two decades. Today's spin continues a tradition started by Kevin Cole." |
| Connection (labelmate) | "Both on Sub Pop" | "Both artists came up through Sub Pop's 90s Seattle roster. This is the first time they've been played back-to-back since 2015." |
| Link (article) | "article: Song History" | "Rolling Stone traces how this became the anthem of a generation. Written in 15 minutes after witnessing the Sunset Strip riots, it's been played 847 times on KEXP since 2001." |

## Future: Self-Improvement Loop

Two sub-agents to refine style over time:

### Sub-Agent 1: DJ Comment Style Surveyor
- Samples DJ comments across shows/DJs
- Extracts patterns: vocabulary, phrasing, what makes comments feel "KEXP"
- Outputs style guide refinements

### Sub-Agent 2: Content Research Agent
- Crawls links from link enrichment
- Visits KEXP blog posts, artist interviews, reviews
- Extracts exemplar passages demonstrating the voice we want

### Feedback Loop

```
[Link Enrichment] → [Content DB] → [Style Research Agent]
                                          ↓
[DJ Comments DB] → [Comment Style Surveyor] → [Style Guide]
                                          ↓
                              [Updated System Prompt]
                                          ↓
                              [Richer Insight Output]
```

## Implementation Tasks

1. **Prompt**: Replace `PHILOSOPHY` section with superpowered crate digger framing ✅
2. **Prompt**: Add new `STORYTELLING` section after `TONE` ✅
3. **Prompt**: Update `INSIGHT_TYPES` to encourage rich narrative fields ✅
4. **Prompt**: Add `STORYTELLING` to `buildSystemPrompt()` section order ✅
5. **Test**: Run enrichment on a few plays and evaluate narrative quality ✅

## Success Criteria

- Existing fields (summary, explanation) contain rich narratives ✅
- Stories explain *why* data matters, not just what the data is ✅
- Voice echoes KEXP DJ warmth and discovery excitement ✅
- Connections include the interesting detail, not just the relationship type ✅

## Results

After testing, the prompt changes produced significantly richer output:

**Before:**
- `explanation: "Gorillaz → IDLES (collaborator)"`

**After:**
- `explanation: "Austra's Katie Stelmanis cites Madonna's Ray of Light album as a key influence on her new album Chin Up Buttercup, using the same vintage synthesizers (Juno-106 and Korg MS-20) that William Orbit used in the original 1998 production"`

The model naturally uses existing fields for narrative depth when prompted correctly. No schema changes were needed.
