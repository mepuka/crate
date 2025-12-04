# MusicBrainz Relationship Ontology

This document comprehensively describes MusicBrainz relationships - the typed connections between entities that enable music discovery, attribution, and exploration.

## Overview

MusicBrainz relationships are **directed, typed connections** between entities. Each relationship has:
- **Type** - What kind of connection (e.g., "member of band", "samples", "composer")
- **Direction** - Which entity is the subject and which is the object
- **Attributes** - Additional details (instruments played, date ranges, vocal type)
- **Dates** - Begin/end dates for time-bounded relationships

**78 relationship type combinations** exist across the 13 core entity types.

---

## Artist Relationships

### Artist-Artist

These relationships connect artists to each other - band membership, collaborations, personal connections.

#### Musical Relationships

**member of band**
- **Direction:** Person → Group
- **Meaning:** This person is/was a member of this group
- **Attributes:** Instruments, vocals, date range (begin/end)
- **Example:** Paul McCartney (person) → The Beatles (group)
- **Use case:** Find all bands an artist was in, find all members of a band

**subgroup**
- **Direction:** Subgroup → Parent Group
- **Meaning:** This group is a subset/spinoff of a larger group
- **Example:** Wings (subgroup) → The Beatles (parent - Paul McCartney's later band)

**collaboration**
- **Direction:** Artist A ↔ Artist B
- **Meaning:** Short-term project or temporary partnership (not a formal group membership)
- **Example:** Lou Reed ↔ John Cale (various collaborative projects)
- **Note:** Use this when standard artist credits don't capture the relationship

**supporting musician**
- **Direction:** Supporting Musician → Primary Artist
- **Meaning:** Long-term backing musician (touring band, session player)
- **Attributes:** Instruments, vocals
- **Example:** E Street Band members → Bruce Springsteen

**tribute**
- **Direction:** Tribute Act → Original Artist
- **Meaning:** This artist primarily performs covers of another artist
- **Example:** Björn Again → ABBA

**artist rename**
- **Direction:** Old Name → New Name
- **Meaning:** Artist changed their name and started a new project
- **Example:** Prince → The Artist Formerly Known as Prince

**is person**
- **Direction:** Character/Alias → Real Person
- **Meaning:** Links a stage name, character, or alias to the real person
- **Example:** Ziggy Stardust (character) → David Bowie (person)
- **Example:** Marshmello (alias) → Christopher Comstock (person)

**voice actor**
- **Direction:** Real Person → Character
- **Meaning:** This person voices this fictional character
- **Example:** Hatsune Miku voice samples → Saki Fujita (voice provider)

**teacher**
- **Direction:** Teacher → Student
- **Meaning:** Educational relationship between musicians
- **Example:** Nadia Boulanger → Aaron Copland

**founder**
- **Direction:** Person → Group
- **Meaning:** This person founded or co-founded this group
- **Example:** Trent Reznor → Nine Inch Nails

#### Leadership Roles

**artistic director**
- **Direction:** Person → Group
- **Meaning:** Serves as artistic director (typically for orchestras, ensembles)
- **Attributes:** Date range

**conductor position**
- **Direction:** Person → Orchestra/Ensemble
- **Meaning:** Serves as conductor
- **Attributes:** Position type (principal, assistant, guest, emeritus)

**composer-in-residence**
- **Direction:** Composer → Orchestra/Institution
- **Meaning:** Official composer position with orchestra or institution

**artist-in-residence**
- **Direction:** Artist → Institution
- **Meaning:** Official artist residency position

#### Personal Relationships

**Note:** MusicBrainz discourages adding personal relationships unless they provide musical context.

**parent** / **sibling** / **married** / **romantically involved**
- These exist but should only be added when relevant to the music
- Example: The Everly Brothers (siblings, musically relevant)
- Counter-example: Don't add "married" just because two artists dated

---

### Artist-Recording

These relationships document **who did what** on a recording. This is where detailed credits live.

#### Performance Credits

**performer**
- **Direction:** Artist → Recording
- **Meaning:** Artist performed on this recording (generic - prefer more specific types)
- **Attributes:** Instruments, vocals
- **Note:** Prefer specific subtypes (instrument, vocal, etc.)

**instrument**
- **Direction:** Artist → Recording
- **Meaning:** Artist played specific instrument(s)
- **Attributes:** Instrument type (guitar, bass, drums, piano, synthesizer, etc.)
- **Example:** Jimi Hendrix → "Purple Haze" [instruments: electric guitar]
- **Use case:** Find all recordings where an artist played a specific instrument

**vocal**
- **Direction:** Artist → Recording
- **Meaning:** Artist provided vocals
- **Attributes:** Vocal type
  - lead vocals
  - background vocals
  - choir vocals
  - spoken vocals
  - Other vocals
- **Example:** Freddie Mercury → "Bohemian Rhapsody" [vocal: lead vocals]

**performing orchestra**
- **Direction:** Orchestra → Recording
- **Meaning:** Orchestra performed on this recording
- **Example:** London Symphony Orchestra → Various classical recordings

**conductor**
- **Direction:** Conductor → Recording
- **Meaning:** Conducted the orchestra/band/choir for this recording
- **Example:** Leonard Bernstein → New York Philharmonic recordings

**chorus master**
- **Direction:** Chorus Master → Recording
- **Meaning:** Led the choir on this recording

**concertmaster**
- **Direction:** Concertmaster → Recording
- **Meaning:** Served as concertmaster (lead violinist) for orchestra

**audio director**
- **Direction:** Audio Director → Recording
- **Meaning:** Creative lead for audio dramas, audiobooks, radio plays

#### Arrangement Credits

**arranger**
- **Direction:** Arranger → Recording
- **Meaning:** Arranged the composition for performance (generic - prefer specific types)
- **Note:** Prefer subtypes when possible

**instrument arranger**
- **Direction:** Arranger → Recording
- **Meaning:** Arranged specific instrumental parts
- **Attributes:** Instruments arranged

**orchestrator**
- **Direction:** Orchestrator → Recording
- **Meaning:** Orchestrated the recording (wrote orchestral parts)
- **Example:** Common in film scores where composer writes melody, orchestrator writes parts

**vocal arranger**
- **Direction:** Arranger → Recording
- **Meaning:** Arranged vocal harmonies and parts

#### Production Credits

**producer**
- **Direction:** Producer → Recording
- **Meaning:** Responsible for creative and practical aspects of recording production
- **Example:** George Martin → The Beatles recordings
- **Note:** This is one of the most important credits - producers shape the sound

**engineer** (generic - prefer subtypes)
- **Direction:** Engineer → Recording
- **Meaning:** Engineering role (generic)

**audio engineer**
- **Direction:** Engineer → Recording
- **Meaning:** Managed sound-generating equipment during recording

**recording engineer**
- **Direction:** Engineer → Recording
- **Meaning:** Operated recording equipment, captured performance to tape/disk
- **Example:** Geoff Emerick → "Sgt. Pepper's Lonely Hearts Club Band"

**mix engineer** / **mixer**
- **Direction:** Mixer → Recording
- **Meaning:** Created final mix for release
- **Example:** Bob Clearmountain → Bruce Springsteen mixes

**mastering engineer** (deprecated for recording-level, use release-level)
- **Direction:** Mastering Engineer → Recording
- **Meaning:** Mastered the recording
- **Note:** Better to add mastering credits at release level

**balance engineer**
- **Direction:** Balance Engineer → Recording
- **Meaning:** Engineered the recording balance

**sound engineer**
- **Direction:** Sound Engineer → Recording
- **Meaning:** Ensures sounds reach microphones sounding pleasant

**field recordist**
- **Direction:** Field Recordist → Recording
- **Meaning:** Recorded field recordings (nature sounds, ambient audio)

**programmer**
- **Direction:** Programmer → Recording
- **Meaning:** Programmed electronic instruments, drum machines, synthesizers
- **Example:** Common in electronic music production

**editor**
- **Direction:** Editor → Recording
- **Meaning:** Edited audio (connected segments, redistributed material)

#### Remix & Compilation Credits

**remixer**
- **Direction:** Remixer → Recording (the remix)
- **Meaning:** Created this remix
- **Example:** Fatboy Slim → "Brimful of Asha (Norman Cook Remix)"

**compiler**
- **Direction:** Compiler → Recording (compilation recording)
- **Meaning:** Selected tracks and sequence for a compilation

**mix-DJ**
- **Direction:** DJ → Recording (DJ mix)
- **Meaning:** Created this DJ mix
- **Example:** Paul Oakenfold → "Tranceport"

**samples from artist**
- **Direction:** Recording (sampling) → Artist (sampled)
- **Meaning:** This recording contains samples from this artist's work
- **Note:** More specific than recording-recording "samples" relationship

#### Non-Musical Credits

**legal representation** - Legal representation
**phonographic copyright** - Phonographic copyright holder (℗)
**video copyright** - Video copyright holder (©)
**booking** - Booking agent
**publishing** - Publisher
**dedication** - Recording is dedicated to this person

#### Visual/Video Credits

**video appearance** - Appears in music video
**video director** - Directed music video
**animation** - Animated music video
**artwork** / **design** / **graphic design** / **illustration** - Visual design
**photography** - Photography credits
**choreographer** - Choreographed dance/movement
**cinematographer** - Shot video/film

---

### Artist-Work

These relationships connect artists to **compositions** - who wrote what.

**composer**
- **Direction:** Composer → Work
- **Meaning:** Wrote the music
- **Example:** Ludwig van Beethoven → "Symphony No. 9"
- **Note:** For popular music, often combined with lyricist

**lyricist**
- **Direction:** Lyricist → Work
- **Meaning:** Wrote the lyrics/words
- **Example:** Bernie Taupin → "Rocket Man" (Elton John composed music)

**writer**
- **Direction:** Writer → Work
- **Meaning:** Wrote both music and lyrics
- **Example:** Bob Dylan → "Like a Rolling Stone"
- **Note:** Use this for singer-songwriters who write complete songs

**librettist**
- **Direction:** Librettist → Work
- **Meaning:** Wrote the libretto (text for opera/musical theater)

**arranger**
- **Direction:** Arranger → Work
- **Meaning:** Arranged the composition
- **Note:** Work-level arrangement (conceptual) vs. Recording-level (specific performance)

**orchestrator**
- **Direction:** Orchestrator → Work
- **Meaning:** Orchestrated the composition

**translator**
- **Direction:** Translator → Work
- **Meaning:** Translated lyrics into another language

**revised by**
- **Direction:** Work → Reviser
- **Meaning:** This person revised/updated the work

---

### Artist-Release

These relationships apply to entire releases.

**producer** - Produced the entire release
**engineer** - Engineered the release
**mastering** - Mastered the release (applies to all tracks)
**design** - Designed album art/packaging
**photography** - Album photography
**graphic design** - Graphic design for packaging
**illustration** - Illustrations for packaging
**art direction** - Art direction for release
**liner notes** - Wrote liner notes
**legal representation** - Legal representation for release
**publishing** - Publisher of release
**phonographic copyright** - Phonographic copyright holder (℗)
**copyright** - Copyright holder (©)

**Note:** Many credits from Artist-Recording also exist at Release level. Use recording-level credits when they vary by track. Use release-level when they apply to the entire release.

---

### Artist-Release Group

**Rare.** Most credits go on Release or Recording.

---

### Artist-Label

**signed to**
- **Direction:** Artist → Label
- **Meaning:** Artist has/had a contract with this label
- **Attributes:** Date range

**label founder**
- **Direction:** Person → Label
- **Meaning:** Founded this label
- **Example:** Berry Gordy → Motown Records

**distributed by**
- **Direction:** Label → Distributor
- **Meaning:** This label is distributed by this distributor

---

### Artist-Event

**performer**
- **Direction:** Artist → Event
- **Meaning:** Performed at this event
- **Attributes:** Instruments, vocals
- **Example:** Radiohead → Glastonbury Festival 2003

**main performer**
- **Direction:** Artist → Event
- **Meaning:** Headlining performer

**supporting performer**
- **Direction:** Artist → Event
- **Meaning:** Opening act or supporting performer

**composer**
- **Direction:** Composer → Event (premiere)
- **Meaning:** Composed work premiered at this event

---

### Artist-Place

**residence**
- **Direction:** Artist → Place
- **Meaning:** Artist lives/lived here

**born in** / **died in**
- **Direction:** Artist → Place
- **Meaning:** Birth/death location

---

### Artist-Area

**area**
- **Direction:** Artist → Area
- **Meaning:** Artist is associated with this geographic area
- **Attributes:** Begin/end dates

---

## Recording Relationships

### Recording-Work

**This is the critical relationship for identifying covers.**

**performance of**
- **Direction:** Recording → Work
- **Meaning:** This recording is a performance of this composition
- **Example:** Johnny Cash's "Hurt" (Recording) → "Hurt" by Trent Reznor (Work)
- **Use case:** Find all cover versions
  1. Look up Recording → find "performance of" Work
  2. Look up Work → find all Recordings "performance of" that Work
  3. Result = all versions/covers of the song

**Key insight:** Multiple Recordings linking to the same Work = different versions of the same composition.

```
Work: "Hallelujah" (Leonard Cohen)
  ├─ Recording: Leonard Cohen - "Hallelujah" (1984)
  ├─ Recording: Jeff Buckley - "Hallelujah" (1994)  ← COVER
  ├─ Recording: Rufus Wainwright - "Hallelujah" (2001)  ← COVER
  └─ Recording: k.d. lang - "Hallelujah" (2005)  ← COVER
```

All recordings share the same Work through "performance of" relationship.

---

### Recording-Recording

These relationships connect recordings to each other - samples, remixes, versions.

**samples material**
- **Direction:** Sampling Recording → Sampled Recording
- **Meaning:** This recording contains samples from another recording
- **Example:** "Gangsta's Paradise" (Coolio) → "Pastime Paradise" (Stevie Wonder)
- **Use case:** Trace sample chains, find what was sampled, find who sampled this
- **Attributes:** Can include specific details about what was sampled

**remix of**
- **Direction:** Remix → Original Recording
- **Meaning:** This is a remix of another recording
- **Example:** "Brimful of Asha (Norman Cook Remix)" → "Brimful of Asha" (original)
- **Note:** Remixes are separate Recordings

**compilation**
- **Direction:** Compilation Recording → Source Recordings
- **Meaning:** This recording compiles parts of multiple other recordings
- **Example:** Continuous DJ mixes that blend multiple tracks

**DJ-mix**
- **Direction:** DJ Mix → Source Recordings
- **Meaning:** This DJ mix includes these source recordings
- **Example:** Paul Oakenfold mix → all tracks in the mix

**mash-up**
- **Direction:** Mash-up → Source Recordings (2+)
- **Meaning:** This recording is a mash-up of two or more recordings
- **Example:** "A Stroke of Genie-us" (mash-up) → "Genie in a Bottle" + "Hard to Explain"

**instrumental**
- **Direction:** Instrumental Version → Vocal Version
- **Meaning:** This is an instrumental version (vocals removed)
- **Example:** Backing tracks, karaoke versions

**a cappella**
- **Direction:** A Cappella Version → Full Version
- **Meaning:** This is an a cappella version (only vocals)

**karaoke**
- **Direction:** Karaoke Version → Original
- **Meaning:** This is a karaoke version (main vocals removed)

**edit**
- **Direction:** Edit → Original
- **Meaning:** This is an edited version (radio edit, clean version, shortened)
- **Example:** "Stairway to Heaven (radio edit)" → "Stairway to Heaven" (full version)

**music video**
- **Direction:** Music Video (Recording with video) → Audio-Only Recording
- **Meaning:** This is the music video version
- **Note:** Music videos are separate Recording entities if audio differs

**commentary**
- **Direction:** Commentary Recording → Main Recording
- **Meaning:** This recording contains commentary about another recording
- **Example:** Director's commentary tracks

**remaster** (deprecated)
- **Direction:** Remastered Recording → Original Recording
- **Meaning:** This is a remastered version
- **Note:** Remasters are typically separate Recordings

---

### Recording-Release

**first track release** (deprecated)
- Links recording to its first commercial release
- Now tracked via Release dates

---

### Recording-Series

**part of series**
- **Direction:** Recording → Series
- **Meaning:** This recording is part of a series
- **Example:** Singles from "Now That's What I Call Music" series

---

## Release Relationships

### Release-Release

**transliterated version** / **translated version**
- **Direction:** Translated Release → Original Release
- **Meaning:** Same release but title and track titles translated or transliterated
- **Example:** Japanese pressing with romanized titles → original Japanese titles

**remaster**
- **Direction:** Remaster → Original Release
- **Meaning:** This is a remastered version of another release
- **Example:** "The Beatles - Sgt. Pepper (2009 remaster)" → "Sgt. Pepper (1967 original)"
- **Use case:** Connect remasters to originals, find all remasters

**replaced by**
- **Direction:** Withdrawn Release → Replacement Release
- **Meaning:** This release was withdrawn and replaced by another
- **Example:** Recalled albums, re-releases with corrected track listings

**supporting release**
- **Direction:** Single → Album
- **Meaning:** This single was released to support/promote this album
- **Example:** "Smells Like Teen Spirit" (single) → "Nevermind" (album)

**part of set** (deprecated)
- Multi-disc releases should be entered as one Release with multiple Mediums

---

### Release-Release Group

Every Release belongs to exactly one Release Group (automatic relationship).

---

### Release-Series

**part of series**
- **Direction:** Release → Series
- **Meaning:** This release is part of a series
- **Example:** Releases in "Now That's What I Call Music" series

---

## Release Group Relationships

### Release Group-Release Group

**remaster**
- **Direction:** Remastered RG → Original RG
- **Meaning:** This release group is a remastered version
- **Note:** Less common than Release-Release remaster relationship

---

### Release Group-Series

**part of series**
- **Direction:** Release Group → Series
- **Meaning:** This album is part of a series
- **Example:** Artist's numbered album series

---

## Work Relationships

### Work-Work

**part of**
- **Direction:** Part → Whole
- **Meaning:** This work is part of a larger work
- **Example:** "Ode to Joy" (movement) → "Symphony No. 9" (full symphony)
- **Example:** "One" (song) → "Sgt. Pepper's Lonely Hearts Club Band" (concept album)

**parts** (inverse of "part of")
- **Direction:** Whole → Parts
- **Meaning:** This work consists of these parts

**based on**
- **Direction:** Derivative → Original
- **Meaning:** This work is based on another work
- **Example:** "Weird Al" Yankovic parody → original song
- **Example:** Orchestral arrangement → original piano piece

**arrangement of**
- **Direction:** Arrangement → Original
- **Meaning:** This is an arrangement of another work
- **Example:** String quartet arrangement → orchestral work

**medley of**
- **Direction:** Medley → Source Works
- **Meaning:** This work is a medley combining multiple works
- **Example:** "Stars on 45" medley → individual Beatles songs

**translated version**
- **Direction:** Translation → Original
- **Meaning:** This is a translated version (different language lyrics)
- **Example:** "99 Luftballons" (German) → "99 Red Balloons" (English)

**version**
- **Direction:** Version → Original
- **Meaning:** This is a different version of the work
- **Example:** Alternate lyrics, significantly changed structure

**samples**
- **Direction:** Sampling Work → Sampled Work
- **Meaning:** This composition samples another composition
- **Note:** Usually accompanied by Recording-Recording samples relationship

---

### Work-Series

**part of series**
- **Direction:** Work → Series
- **Meaning:** This work is part of a series
- **Example:** Song cycle, numbered symphonies

---

## Label Relationships

### Label-Label

**label rename**
- **Direction:** Old Name → New Name
- **Meaning:** Label changed its name

**imprint**
- **Direction:** Imprint → Parent Label
- **Meaning:** This is an imprint of a parent label
- **Example:** Def Jam (imprint) → Universal Music Group (parent)

**distributed by**
- **Direction:** Label → Distributor
- **Meaning:** This label's releases are distributed by this distributor

**ownership**
- **Direction:** Subsidiary Label → Parent Company
- **Meaning:** This label is owned by this company

---

### Label-Release

**published by**
- **Direction:** Release → Label
- **Meaning:** This release was published by this label
- **Note:** This is one of the most common relationships - nearly every Release has a Label

---

### Label-Series

**part of series**
- **Direction:** Label → Series
- **Meaning:** This label is part of a series (catalog series)

---

## Event Relationships

### Event-Event

**part of**
- **Direction:** Individual Event → Series
- **Meaning:** This event is part of an event series
- **Example:** Coachella 2024 (event) → Coachella Festival (series)

---

### Event-Place

**held at**
- **Direction:** Event → Place
- **Meaning:** This event was held at this venue
- **Example:** Woodstock Festival → Bethel, NY

---

### Event-Series

**part of series**
- **Direction:** Event → Series
- **Meaning:** This event is part of a series
- **Example:** Bonnaroo 2023 → Bonnaroo Music Festival (annual series)

---

## Place Relationships

### Place-Place

**part of**
- **Direction:** Place → Larger Place
- **Meaning:** This place is inside/part of another place
- **Example:** Madison Square Garden → New York City

---

## Series Relationships

### Series-Series

**part of**
- **Direction:** Sub-series → Parent Series
- **Meaning:** This series is part of a larger series

---

## URL Relationships

Nearly every entity type can have URL relationships:

**official homepage**
**wikipedia**
**discogs**
**allmusic**
**bandcamp**
**soundcloud**
**spotify**
**youtube**
**streaming music** (Apple Music, etc.)
**social network** (Twitter, Instagram, Facebook)
**purchase for download** (iTunes, Amazon)
**crowdfunding** (Kickstarter, Patreon)
**other databases** (Last.fm, Genius, etc.)

**Direction:** Entity → URL

**Use case:** Find official sources, external IDs, social media profiles

---

## Relationship Attributes

Many relationships support additional attributes:

### Temporal Attributes

**begin date** / **end date**
- When the relationship started/ended
- Can be partial (year only, year-month)
- Example: "member of band" from 1965-1970

**ended**
- Boolean flag indicating relationship has ended
- Distinct from "end date" (can mark ended without specific date)

### Instrument Attributes

Relationships like "performer", "instrument" support specific instrument types:
- Guitar (electric, acoustic, bass, classical, etc.)
- Drums (drum kit, percussion, specific drums)
- Keyboards (piano, organ, synthesizer, specific models)
- Brass (trumpet, trombone, saxophone, etc.)
- Strings (violin, cello, etc.)
- Voice types (soprano, alto, tenor, bass)

### Vocal Attributes

Relationships like "vocal" support vocal types:
- Lead vocals
- Background vocals / Backing vocals
- Choir vocals
- Spoken vocals
- Other vocals

### Other Attributes

**additional** - "Additional" credit (e.g., "additional guitar")
**guest** - Guest performer (not regular member)
**solo** - Solo performance
**live** - Live performance

---

## Using Relationships for Music Discovery

### Finding Covers

1. Start with a Recording
2. Find its "performance of" relationship → get Work
3. Find all Recordings "performance of" that Work
4. Result: All cover versions

**Example query flow:**
```
Recording: "All Along the Watchtower" by Jimi Hendrix
  → performance of → Work: "All Along the Watchtower" (Bob Dylan)
    → Find all Recordings:
      - Bob Dylan - "All Along the Watchtower" (original)
      - Jimi Hendrix - "All Along the Watchtower" (cover)
      - Dave Matthews Band - "All Along the Watchtower" (cover)
      - ... 100+ other covers
```

---

### Finding Samples

**Forward direction (who did this song sample?):**
```
Recording: "Gangsta's Paradise" (Coolio)
  → samples material → Recording: "Pastime Paradise" (Stevie Wonder)
```

**Reverse direction (who sampled this song?):**
```
Recording: "Amen Break" (The Winstons)
  ← sampled by ← 1000+ hip-hop and jungle tracks
```

---

### Finding Band Members & Collaborations

**Current/former members:**
```
Artist: The Beatles (group)
  ← member of band ← Paul McCartney
  ← member of band ← John Lennon
  ← member of band ← George Harrison
  ← member of band ← Ringo Starr
```

**Other projects:**
```
Artist: Paul McCartney
  → member of band → The Beatles (1960-1970)
  → member of band → Wings (1971-1981)
```

---

### Finding Producer/Engineer Connections

**Find all recordings produced by Rick Rubin:**
```
Artist: Rick Rubin
  → producer → [thousands of recordings]
    - Beastie Boys, Red Hot Chili Peppers, Johnny Cash, etc.
```

**Find producer of a recording:**
```
Recording: "Blood Sugar Sex Magik" tracks
  ← producer ← Rick Rubin
```

---

### Finding Labelmates

**Artists on Sub Pop Records:**
```
Label: Sub Pop Records
  → signed to ← Nirvana
  → signed to ← Soundgarden
  → signed to ← Mudhoney
  → signed to ← Fleet Foxes
  ... many others
```

**Note:** This requires querying the MB API or database. `search_plays` cannot filter by label in most systems.

---

## Best Practices for AI Agents

### 1. Understand Relationship Direction

Relationships have direction. When querying:
- "Performance of" goes Recording → Work
- "Member of band" goes Person → Group
- "Samples material" goes Sampling Recording → Sampled Recording

**Always check which direction you're querying.**

### 2. Use Specific Relationship Types

Prefer specific types over generic:
- Use "instrument" with attributes, not generic "performer"
- Use "mix engineer" not generic "engineer"
- Use "lyricist" + "composer" not just "writer" (when both are known)

### 3. Check Relationship Attributes

Don't just look at relationship type - check attributes:
- **Instruments played** - Was this a guitar or bass performance?
- **Vocal type** - Lead or backing vocals?
- **Date range** - Was this person a member in 1965 or 1975?

### 4. Follow Relationship Chains

Some discoveries require multiple hops:
- Recording → Work → other Recordings (find covers)
- Recording → samples → Recording → samples → Recording (sample chains)
- Artist → member of → Group → member of ← other Artists (bandmates)

### 5. Combine Multiple Relationship Types

Rich insights come from combining relationships:
- Artist A and Artist B were both members of Group C (labelmates through shared band)
- Recording X samples Recording Y, which samples Recording Z (sample genealogy)
- Work W has 50+ Recordings (highly covered song)

### 6. Respect Relationship Semantics

Don't confuse similar relationships:
- "Composer" (Work-level) vs "Producer" (Recording-level) - different roles
- "Remix of" (Recording-Recording) vs "Based on" (Work-Work) - different abstractions
- "Collaboration" (temporary project) vs "Member of" (formal membership)

### 7. Handle Missing Relationships Gracefully

Not all relationships are documented:
- Older recordings may lack detailed credits
- Some artists don't have complete relationship data
- Use `null` or "unknown" rather than guessing

---

## Agent-Synthesized Relationship Types

The following relationship types are **computed by the agent** from MusicBrainz data. They don't correspond to direct MB relationship types but are derived from relationship chains for convenience.

### cover

- **Query Type:** `covers`
- **Source:** Recording → Work → Recording chain
- **Meaning:** Another recording of the same composition
- **MB Basis:** Recording "performance of" Work relationship
- **Example:** Johnny Cash's "Hurt" → (Work) → Nine Inch Nails' "Hurt"
- **Via Fields:** `via_mbid` = Work MBID, `via_name` = Work title

### labelmate

- **Query Type:** `labelmates`
- **Source:** Artist → Label → Artist chain
- **Meaning:** Artists who share a record label
- **MB Basis:** Artist "signed to" Label relationship
- **Example:** Fleet Foxes ↔ Sub Pop ↔ Nirvana
- **Via Fields:** `via_mbid` = Label MBID, `via_name` = Label name

### collaborator

- **Query Type:** `collaborators`
- **Source:** Artist → Band → Artist chain
- **Meaning:** Artists who shared band membership
- **MB Basis:** Artist "member of band" relationship
- **Example:** Neil Young ↔ Buffalo Springfield ↔ Stephen Stills
- **Via Fields:** `via_mbid` = Band MBID, `via_name` = Band name

---

## Query Direction Conventions

The `band_members` and `member_of` queries access the same MB relationship ("member of band") but in opposite directions:

| Query Type | Direction | Input | Output | Example |
|-----------|-----------|-------|--------|---------|
| `band_members` | Band → Members | Band MBID | Person artists | "Who was in Nirvana?" |
| `member_of` | Person → Bands | Person MBID | Group artists | "What bands was Dave Grohl in?" |

**Note:** MusicBrainz canonical direction is Person → Group, but both queries are provided for convenience.

---

## Via Provenance Fields

For derived multi-hop relationships, responses include provenance fields showing the intermediate entity:

| Query Type | `via_mbid` Contains | `via_name` Contains |
|-----------|---------------------|---------------------|
| `covers` | Work MBID | Work title |
| `labelmates` | Label MBID | Label name |
| `collaborators` | Band MBID | Band name |
| `label_hierarchy` | — (direct) | — |
| Other queries | — (direct) | — |

These fields enable tracing how entities are connected and building richer narratives.

---

## Query Parameters

### include_attributes

**Type:** boolean (default: `true`)

Controls whether relationship attributes are included in responses:
- `begin_date` / `end_date` - When relationships started/ended
- `attributes` - JSON array of instruments, vocals, roles

**Example attribute values:**
- `["vocals"]` - lead vocals
- `["guitar", "vocals"]` - guitar and vocals
- `["drums", "percussion"]` - percussion instruments

Set `include_attributes: false` to reduce response size when only connections matter.

---

## Implementation Status

This section clarifies which MB relationships are currently queryable vs. documented for reference.

### Fully Implemented (9 Query Types)

| Query Type | MB Relationship | Entity Types | Status |
|-----------|----------------|--------------|--------|
| `band_members` | member of band | Band → Artist | ✓ Full |
| `member_of` | member of band | Artist → Band | ✓ Full |
| `labelmates` | signed to (chain) | Artist → Artist | ✓ Full |
| `collaborators` | member of band (chain) | Artist → Artist | ✓ Full |
| `label_hierarchy` | ownership/imprint | Label → Label | ✓ Full |
| `covers` | performance of (chain) | Recording → Recording | ✓ Full |
| `artist_origin` | area | Artist → Area | ✓ Full |
| `artists_from_area` | area (inverse) | Area → Artist | ✓ Full |
| `recorded_at` | recorded at | Recording → Place | ✓ Full |

### NOT Implemented (Documented for Reference Only)

The following relationships are described in this document for educational purposes but **cannot be queried through the agent**:

**Artist-Recording Credits:**
- `performer`, `instrument`, `vocal` - Who played/sang on recordings
- `producer`, `engineer`, `mix engineer` - Production credits
- `remixer`, `arranger`, `orchestrator` - Arrangement credits

**Artist-Work Credits:**
- `composer`, `lyricist`, `writer` - Songwriting credits
- `arranger`, `translator` - Work modification credits

**Recording-Recording Derivatives:**
- `samples material` - Sample genealogy
- `remix of`, `edit`, `mash-up` - Derivative versions
- `instrumental`, `a cappella`, `karaoke` - Alternate versions

**Work-Work Hierarchies:**
- `part of` - Movements, medleys, song cycles
- `based on`, `arrangement of` - Derivative works

**Event Relationships:**
- `performer`, `held at` - Concert and festival data

**Note:** These relationships exist in MusicBrainz and may be implemented in future versions. The agent will respond with empty results if asked about unsupported relationships.

---

## Summary

MusicBrainz relationships form a rich semantic network enabling:

**Attribution:**
- Who wrote, performed, produced, engineered each recording
- Detailed credits down to specific instruments and vocal types

**Discovery:**
- Cover versions via shared Works
- Sample genealogy via Recording-Recording links
- Collaborations, side projects, band lineages

**Context:**
- Label rosters and scenes
- Event lineups and tour dates
- Geographic and temporal connections

**Key Relationships for Music Intelligence:**
- **Recording → "performance of" → Work** - Enables cover discovery
- **Recording → "samples material" → Recording** - Traces sample lineage
- **Artist → "member of band" → Group** - Maps band membership
- **Artist → "producer/instrument/vocal" → Recording** - Detailed credits
- **Release → "published by" → Label** - Label connections

**Remember:**
- Relationships are directed (subject → predicate → object)
- Attributes add context (instruments, dates, vocal types)
- Multiple hops reveal deep connections (sample chains, collaboration networks)
- Not all relationships are complete (older/obscure releases may lack detail)

Use relationships to illuminate the human curation and creative connections that make music meaningful.
