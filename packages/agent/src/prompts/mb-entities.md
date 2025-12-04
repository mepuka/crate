# MusicBrainz Entity Reference

This document provides a comprehensive overview of MusicBrainz entities for AI agents working with music data.

## Overview

MusicBrainz organizes music metadata around **13 core entity types**. Each entity has a unique identifier (MBID) and connects to other entities through typed relationships.

---

## Core Entities

### Artist

**Definition:** A musician, group of musicians, collaboration, or other music professional.

**Types:**
- **Person** - Individual musician or contributor
- **Group** - Band, ensemble, orchestra
- **Orchestra** - Classical orchestra
- **Choir** - Choral ensemble
- **Character** - Fictional performer (anime characters, virtual bands)
- **Other** - Non-musical entities related to music (dancers, actors in musicals)

**Key Fields:**
- `name` - Primary name
- `sort-name` - Name for alphabetical sorting (e.g., "Beatles, The")
- `disambiguation` - Clarifying text when names collide (e.g., "US rapper" vs "UK producer")
- `country` - Primary country association
- `area` - Geographic region
- `life-span` - Begin/end dates (for people: birth/death; for groups: formation/dissolution)
- `type` - Person, Group, Orchestra, Choir, Character, Other
- `aliases` - Alternative names and spellings

**Usage Notes:**
- Artists are credited on releases and recordings through **artist credits**
- Detailed contribution information comes from **relationships** (producer, performer, etc.)
- Band members connect via **member of band** relationship
- Legal names vs. stage names use **is person** relationship

---

### Recording

**Definition:** A specific audio performance - the actual sound waves captured in a studio session, live performance, or remix.

**Key Principle:** Each unique mix, edit, or take is a separate Recording.

**Key Fields:**
- `title` - Recording name
- `artist-credit` - Artists credited (can differ from actual performers)
- `length` - Duration in milliseconds (calculated as median of track lengths)
- `isrc` - International Standard Recording Code
- `disambiguation` - Version identifier (e.g., "2024 remaster", "live version")

**Examples:**
- Studio version of "Helpless" by Neil Young = One Recording
- Live version of "Helpless" from 1971 = Different Recording
- Remix of "Helpless" by DJ Shadow = Different Recording
- Same studio version on CD, vinyl, streaming = Same Recording (different Releases)

**Usage Notes:**
- Recordings link to **Works** via "performance of" relationship
- Multiple recordings of the same song = cover versions (via shared Work)
- One Recording can appear on many Releases (reissues, compilations, etc.)
- Use `recording_mbid` to find all plays of the exact same audio

---

### Release

**Definition:** A specific product you can buy or download - the physical CD, vinyl pressing, digital download, or streaming version.

**Key Principle:** Each edition, pressing, or regional version is a separate Release.

**Key Fields:**
- `title` - Release name
- `artist-credit` - Credited artists
- `date` - Release date (can be partial: year only, year-month)
- `country` - Release country/region
- `label` - Record label or imprint
- `catalog-number` - Label's catalog ID
- `barcode` - UPC/EAN
- `status` - Official, Promotional, Bootleg, Pseudo-Release
- `packaging` - Jewel Case, Digipak, Vinyl, Digital Media, etc.
- `language` - Primary language (ISO 639-3)
- `script` - Writing system (ISO 15924)

**Hierarchy:**
```
Release
  └─ Medium (disc/side)
      └─ Track (position on medium)
          └─ Recording (the audio)
```

**Examples:**
- US CD edition of "Helpless" (1970) = Release A
- UK vinyl edition of "Helpless" (1970) = Release B
- 2024 deluxe remaster = Release C
- All three are in the same **Release Group** but different Releases

**Usage Notes:**
- Use `release_mbid` for exact edition/pressing
- Medium = physical format (Disc 1, Disc 2, Side A, etc.)
- Tracks reference Recordings (the actual audio)

---

### Release Group

**Definition:** The abstract "album" or "single" concept that groups all editions/pressings.

**Types:**
- **Album** - Standard full-length release
- **Single** - 1-3 tracks released to promote an album
- **EP** - Extended play (4-6 tracks, shorter than album)
- **Compilation** - Collection of previously released tracks
- **Soundtrack** - Music from film, TV, game
- **Spokenword** - Audiobook, poetry reading, comedy
- **Interview** - Spoken interview recording
- **Audiobook** - Book recording
- **Audio drama** - Scripted dramatic performance
- **Live** - Concert recording
- **Remix** - Album of remixes
- **DJ-mix** - Continuous DJ mix
- **Mixtape/Street** - Informal release
- **Broadcast** - Radio/TV broadcast recording
- **Other** - Doesn't fit other types

**Key Fields:**
- `title` - Album/single name
- `artist-credit` - Primary artists
- `primary-type` - Main type (Album, Single, EP, etc.)
- `secondary-types` - Additional attributes (Compilation, Live, Remix, etc.)
- `first-release-date` - Original release date

**Usage Notes:**
- Use `release_group_mbid` to find all versions of an album (any country, format, remaster)
- A Release Group can have dozens of Releases (different countries, formats, remasters)
- Search filters: Use Release Group to find "the album" regardless of which pressing

---

### Work

**Definition:** The abstract composition or intellectual creation - the "song" as a creative work, independent of any recording.

**Key Principle:** Work = the composition. Recording = a performance of that composition.

**Key Fields:**
- `title` - Work name (canonical, in original language)
- `type` - Song, Aria, Symphony, Movement, Soundtrack, etc.
- `iswc` - International Standard Musical Work Code
- `language` - Language of lyrics
- `disambiguation` - Clarifying text

**Types:**
- Song (popular music)
- Aria (opera vocal piece)
- Symphony (orchestral work)
- Concerto, Sonata, Suite, Étude (classical forms)
- Movement (part of larger work)
- Soundtrack (film/game music)
- Composition (generic)

**Relationships:**
- **Composer** - Who wrote the music
- **Lyricist** - Who wrote the words
- **Writer** - Who wrote both music and lyrics
- **Arranger** - Who arranged the composition
- **Part of** - Movements within symphonies, songs in musicals
- **Based on** - Adaptations, samples, parodies

**Critical Use Case - Identifying Covers:**

```
Work: "Hallelujah" (by Leonard Cohen)
  ├─ Recording 1: Leonard Cohen - 1984 studio version
  ├─ Recording 2: Jeff Buckley - 1994 version
  ├─ Recording 3: Rufus Wainwright - 2001 version
  └─ Recording 4: Pentatonix - 2016 a cappella version
```

**All Recordings link to the same Work via "performance of" relationship.**

**Usage Notes:**
- Works enable cross-version discovery (find all covers)
- A Recording can be "performance of" multiple Works (medleys)
- Works can be parts of larger Works (symphony movements, album tracks)
- Use Work relationships to find composer, lyricist, original artist

---

### Label

**Definition:** A record label, imprint, or publishing entity that releases music.

**Key Fields:**
- `name` - Label name
- `sort-name` - Sortable name
- `type` - Original Production, Bootleg Production, Reissue Production, etc.
- `label-code` - LC code (European label identifier)
- `country` - Country of operation
- `area` - Geographic region
- `life-span` - Active dates (begin/end)

**Label Types:**
- Original Production (releases original recordings)
- Bootleg Production (unauthorized releases)
- Reissue Production (reissues older material)
- Production (general)
- Distributor (distributes but doesn't produce)
- Holding (parent company)
- Rights Society (ASCAP, BMI, etc.)

**Usage Notes:**
- Labels connect to Releases via relationships
- Important for indie music discovery (label identity matters)
- "Labelmate" connections (artists on same label) are culturally significant
- **Important limitation:** Label MBIDs cannot be used to filter searches in most systems

---

### Area

**Definition:** Geographic region - country, city, subdivision, or administrative region.

**Types:**
- Country
- Subdivision (state/province)
- County
- Municipality (city/town)
- City
- District
- Island

**Key Fields:**
- `name` - Area name
- `type` - Country, City, etc.
- `iso-3166-1` - Country code (for countries)
- `iso-3166-2` - Subdivision code
- `iso-3166-3` - Former country code

**Usage Notes:**
- Used for artist origin, release country, label location
- Areas have begin/end dates (countries that no longer exist)
- Hierarchical (cities within states within countries)

---

### Place

**Definition:** A venue, studio, or physical location where music is performed, recorded, or engineered.

**Types:**
- Studio (recording studio)
- Venue (concert hall, club)
- Stadium
- Arena
- Indoor arena
- Religious building (church, cathedral)
- Outdoor (festival grounds)

**Key Fields:**
- `name` - Place name
- `type` - Studio, Venue, etc.
- `address` - Physical address
- `coordinates` - Latitude/longitude
- `area` - Geographic area (city/country)
- `life-span` - Active dates

**Usage Notes:**
- Places connect to Recordings ("recorded at")
- Places connect to Events ("held at")
- Historic venues retain significance (Abbey Road Studios, CBGB)

---

### Event

**Definition:** An organized occurrence - concert, festival, award ceremony, etc.

**Types:**
- Concert
- Festival
- Convention/Expo
- Masterclass/Clinic
- Award ceremony
- Launch event
- Competition

**Key Fields:**
- `name` - Event name
- `type` - Concert, Festival, etc.
- `time` - Date/time of event
- `cancelled` - Whether event was cancelled
- `setlist` - Performance setlist (if known)

**Relationships:**
- **held at** - Place where event occurred
- **part of** - Event series (tour, festival series)
- **artist** - Performers at event

**Usage Notes:**
- Connect Recordings to live performances
- Track tour dates and festival lineups
- Historical concert documentation

---

### Series

**Definition:** A sequence of related releases, recordings, events, or works with a common theme.

**Types:**
- Release (album series, "Now That's What I Call Music")
- Release group (artist's discography)
- Recording (singles series)
- Work (song cycle, opera series)
- Catalogue (publisher's catalog)
- Event (tour, festival editions)

**Key Fields:**
- `name` - Series name
- `type` - Release, Event, etc.
- `ordering-type` - Automatic, Manual

**Examples:**
- "Now That's What I Call Music" (compilation series)
- "Bonnaroo Music Festival" (annual festival series)
- "Symphony No. X" (Beethoven's symphony cycle)

---

### Instrument

**Definition:** A device or voice type used to make musical sounds.

**Types:**
- String instruments (Guitar, Violin, Bass, etc.)
- Wind instruments (Flute, Saxophone, Trumpet, etc.)
- Percussion (Drums, Vibraphone, Timpani, etc.)
- Keyboard instruments (Piano, Organ, Synthesizer, etc.)
- Electronic instruments (Drum machine, Sampler, etc.)
- Voice (Soprano, Tenor, Baritone, etc.)
- Family/ensemble groupings (Strings, Brass, Woodwinds, etc.)

**Usage Notes:**
- Instruments connect to Recordings via Artist-Recording relationships
- Specify what an artist played on a recording
- Can be specific (Fender Stratocaster) or generic (electric guitar)

---

### Genre

**Definition:** A high-level music style descriptor.

**Note:** Genre is a restricted entity (privileged editors only).

**Examples:**
- Rock, Pop, Jazz, Classical, Electronic, Hip-Hop, Metal, Folk, etc.

**Usage Notes:**
- Less granular than tags or styles
- Used for broad categorization
- Not as rich as collaborative tagging systems

---

## MusicBrainz Identifiers (MBIDs)

### Format

**Structure:** 36-character UUID (Universally Unique Identifier)

**Example:** `a74b1b7f-71a5-4011-9441-d0b5e4122711`

**Pattern:** 8 hex - 4 hex - 4 hex - 4 hex - 12 hex

### Characteristics

**Permanent:** Once assigned, an MBID never changes for that entity.

**Unique (mostly):** Each entity gets one MBID, but merged entities can have multiple MBIDs that redirect to a single canonical entity.

**Scope:** MBIDs exist for all core entities: Artist, Recording, Release, Release Group, Work, Label, Area, Place, Event, Series, Instrument, Genre.

**Also:** Tracks have MBIDs (though tracks aren't full entities).

### Usage

**Disambiguation:** MBIDs differentiate entities with identical names.
- "John Williams" (composer) vs "John Williams" (guitarist)
- Same artist name, different MBIDs

**Cross-System Linking:** MBIDs enable reliable identification across databases, music players, taggers, and APIs.

**URI Construction:** `https://musicbrainz.org/{entity-type}/{mbid}`
- Example: `https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711`

**Search Precision:**
- `artist_mbid` - All plays by this artist (any release)
- `recording_mbid` - All plays of this specific recording
- `release_mbid` - Plays from this specific pressing/edition
- `release_group_mbid` - Plays from any edition of this album

---

## Entity Relationships & Hierarchies

### The Recording → Release → Release Group Hierarchy

```
Artist: Fleet Foxes
  └─ Release Group: "Fleet Foxes" (2008 album)
      ├─ Release: US CD (Sub Pop, 2008)
      │   └─ Medium: CD
      │       └─ Track 1: "White Winter Hymnal"
      │           └─ Recording: "White Winter Hymnal" (studio version)
      ├─ Release: UK vinyl (Bella Union, 2008)
      │   └─ Medium: Vinyl Side A
      │       └─ Track 3: "White Winter Hymnal"
      │           └─ Recording: "White Winter Hymnal" (same studio version)
      └─ Release: 2021 remaster (Sub Pop)
          └─ Medium: CD
              └─ Track 1: "White Winter Hymnal"
                  └─ Recording: "White Winter Hymnal" (2021 remaster - different recording!)
```

**Key insight:** The same Recording appears on multiple Releases. Different recordings (e.g., remaster) are separate Recording entities.

---

### The Work → Recording Connection (Covers & Versions)

```
Work: "Hurt" (composed by Trent Reznor)
  ├─ Recording: Nine Inch Nails - "Hurt" (1994 studio version)
  │   └─ Release: "The Downward Spiral"
  │
  └─ Recording: Johnny Cash - "Hurt" (2002 cover version)
      └─ Release: "American IV: The Man Comes Around"
```

**Both Recordings are "performance of" the same Work.**

**Finding covers:**
1. Get the `recording_mbid` for the track you're analyzing
2. Look up that Recording's relationships
3. Find the "performance of" relationship → gets you the `work_mbid`
4. Find all other Recordings with "performance of" that Work
5. Result: All cover versions of that song

---

### Artist Credits vs. Relationships

**Artist Credit** = The displayed name on a release or recording
- "Crosby, Stills, Nash & Young"
- "Daft Punk feat. Pharrell Williams"
- "Various Artists"

**Relationships** = Detailed contribution information
- Stephen Stills: performer, guitar, vocals
- Neil Young: performer, guitar, vocals
- Graham Nash: performer, vocals
- David Crosby: performer, vocals

**Key distinction:**
- Artist credits are for display ("who gets top billing")
- Relationships are for detailed roles ("who actually did what")

---

## Best Practices for AI Agents

### 1. Always Use MBIDs When Available

**Good:**
```
search_plays(artist_mbid="a74b1b7f-71a5-4011-9441-d0b5e4122711")
```

**Bad:**
```
search_plays(artist_name="Radiohead")  // Ambiguous! Multiple artists might match.
```

### 2. Understand Entity Granularity

**Use the right entity type for your query:**

- Want all versions of an album? → `release_group_mbid`
- Want a specific pressing? → `release_mbid`
- Want a specific audio version? → `recording_mbid`
- Want everything by an artist? → `artist_mbid`

### 3. Never Fabricate MBIDs

**If you don't have an MBID, use `null`.**

MBIDs must be real MusicBrainz identifiers. Downstream systems use them for cross-referencing. A fake MBID breaks the entire chain.

### 4. Respect the Recording/Work Distinction

**Recording** = performance (audio)
**Work** = composition (abstract idea)

If a DJ says "their cover of the Bowie classic":
1. The current play is a **Recording** by Artist A
2. It's a "performance of" a **Work** by Bowie
3. Find the Work, find other Recordings of that Work = find the original + other covers

### 5. Use Disambiguation Fields

When presenting results to users, include `disambiguation` text:
- "John Williams (composer)"
- "John Williams (guitarist)"

This prevents confusion when multiple entities share names.

---

## Agent Entity Type Conventions

The agent uses simplified `node_type` values that differ from canonical MusicBrainz entity types for clarity:

### node_type: "band"

- **MB Equivalent:** Artist entity with `type: "Group"`
- **Meaning:** A musical group, band, orchestra, or collective
- **Why Different:** MusicBrainz treats bands as a subtype of Artist. We expose "band" as a distinct node_type to make responses more intuitive.
- **Canonical Artist Types Included:** Group, Orchestra, Choir

### node_type: "artist"

- **MB Equivalent:** Artist entity with `type: "Person"` (or Character, Other)
- **Meaning:** An individual musician, performer, or contributor
- **Why Simplified:** In graph responses, we distinguish people from groups for clearer relationship semantics.

### Other Node Types

| Our `node_type` | MB Entity Type | Notes |
|-----------------|----------------|-------|
| `artist` | Artist (Person) | Individual humans |
| `band` | Artist (Group/Orchestra/Choir) | Collectives |
| `label` | Label | Record labels, imprints |
| `recording` | Recording | Audio performances |
| `work` | Work | Compositions |
| `area` | Area | Geographic regions |
| `place` | Place | Venues, studios |

### Mapping Back to MusicBrainz

When looking up entities in MusicBrainz by MBID:
- Both `artist` and `band` node_types use the MusicBrainz Artist API
- The `type` field in MB response distinguishes Person vs Group

---

## Summary

MusicBrainz entities form a rich ontology for music metadata:

- **Artist** - Who makes music
- **Recording** - The audio (what you hear)
- **Release** - The product (what you buy)
- **Release Group** - The album concept (what critics review)
- **Work** - The composition (what gets copyrighted)
- **Label** - Who releases it
- **Area, Place** - Where it happens
- **Event, Series** - When it happens
- **Instrument, Genre** - How it's categorized

**Core relationships enable powerful queries:**
- Find all covers via shared Works
- Trace samples via Recording-Recording links
- Discover collaborators via Artist-Artist relationships
- Map label rosters via Artist-Label connections

**MBIDs are the glue** - permanent, unique identifiers that enable precise cross-system linking.
