# Events Domain Types Design

## Summary

Domain types for music venues, festivals, and upcoming shows/events to support:
1. AI agent extraction from DJ comments
2. Frontend display of upcoming shows and event information

## Architecture: Three Core Entities

```
Venue ←──── Event ────→ Festival
              │
              ▼
         EventArtist
              │
              ▼
         EventMention ───→ fact_plays
```

- **Venue**: Physical locations (clubs, theaters, arenas, record stores)
- **Festival**: Multi-day music events with lineups
- **Event**: Specific performance occurrences linking artists to venues/festivals
- **EventMention**: Links extracted events back to source DJ comments

---

## Schemas

### Venue

```typescript
export const VenueType = Schema.Literal(
  "arena",         // Climate Pledge, WaMu (10k+)
  "theater",       // Paramount, Moore, Neptune (1-5k)
  "club",          // Showbox, Crocodile, Neumos (200-1500)
  "bar",           // Tractor Tavern, Madame Lou's (<500)
  "record-store",  // Easy Street, Sonic Boom
  "outdoor",       // Amphitheaters, parks
  "festival-grounds",
  "other"
)

export class Venue extends Schema.Class<Venue>("Venue")({
  id: Schema.String,              // UUID or slug
  name: Schema.String,
  type: VenueType,

  // Location
  city: Schema.String,
  state: Schema.NullOr(Schema.String),
  country: Schema.String,
  address: Schema.NullOr(Schema.String),

  // Metadata
  capacity: Schema.NullOr(Schema.Number),
  website: Schema.NullOr(Schema.String),
  aliases: Schema.Array(Schema.String), // For fuzzy matching

  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}
```

### Festival

```typescript
export class Festival extends Schema.Class<Festival>("Festival")({
  id: Schema.String,
  name: Schema.String,

  // Edition info
  year: Schema.NullOr(Schema.Number),
  edition: Schema.NullOr(Schema.String),

  // Dates
  start_date: Schema.DateFromString,
  end_date: Schema.DateFromString,

  // Location
  city: Schema.String,
  state: Schema.NullOr(Schema.String),
  country: Schema.String,
  venue_name: Schema.NullOr(Schema.String),

  // Metadata
  website: Schema.NullOr(Schema.String),
  ticket_url: Schema.NullOr(Schema.String),
  aliases: Schema.Array(Schema.String),
  curated_by: Schema.NullOr(Schema.String),

  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}

export class FestivalLineup extends Schema.Class<FestivalLineup>("FestivalLineup")({
  festival_id: Schema.String,
  artist_name: Schema.String,
  artist_mbid: Schema.NullOr(Schema.String),
  day: Schema.NullOr(Schema.DateFromString),
  stage: Schema.NullOr(Schema.String),
  set_time: Schema.NullOr(Schema.String),
  is_headliner: Schema.Boolean,
}) {}
```

### Event

```typescript
export const EventType = Schema.Literal(
  "concert",
  "festival-set",
  "in-store",
  "radio-session",
  "residency",
  "tour-stop"
)

export class Event extends Schema.Class<Event>("Event")({
  id: Schema.String,
  type: EventType,

  // When
  date: Schema.DateFromString,
  time: Schema.NullOr(Schema.String),
  doors_time: Schema.NullOr(Schema.String),

  // Where
  venue_id: Schema.NullOr(Schema.String),
  festival_id: Schema.NullOr(Schema.String),
  venue_name: Schema.NullOr(Schema.String), // Denormalized for display
  city: Schema.String,

  // Tickets
  ticket_url: Schema.NullOr(Schema.String),
  ticket_status: Schema.NullOr(Schema.Literal(
    "on-sale", "sold-out", "presale", "free", "unknown"
  )),

  // Tour context
  tour_name: Schema.NullOr(Schema.String),

  created_at: Schema.DateFromString,
  updated_at: Schema.DateFromString
}) {}

export class EventArtist extends Schema.Class<EventArtist>("EventArtist")({
  event_id: Schema.String,
  artist_name: Schema.String,
  artist_mbid: Schema.NullOr(Schema.String),
  billing: Schema.Literal("headliner", "support", "opener", "special-guest"),
  billing_order: Schema.Number,
}) {}

export class EventMention extends Schema.Class<EventMention>("EventMention")({
  event_id: Schema.String,
  play_id: Schema.Number,
  mentioned_at: Schema.DateFromString,
  extracted_at: Schema.DateFromString,
}) {}
```

### Extraction Metadata

```typescript
export const ExtractionConfidence = Schema.Literal("high", "medium", "low")
export const ExtractionSource = Schema.Literal(
  "dj-comment", "link-content", "manual", "api"
)

export class ExtractionMeta extends Schema.Class<ExtractionMeta>("ExtractionMeta")({
  source: ExtractionSource,
  source_id: Schema.NullOr(Schema.String),
  confidence: ExtractionConfidence,
  extracted_at: Schema.DateFromString,
  extracted_by: Schema.String,
  raw_text: Schema.NullOr(Schema.String),
}) {}

export class TemporalReference extends Schema.Class<TemporalReference>("TemporalReference")({
  raw_text: Schema.String,          // "tonight", "tomorrow"
  reference_date: Schema.DateFromString,
  resolved_date: Schema.DateFromString,
  confidence: ExtractionConfidence,
}) {}
```

---

## File Structure

```
packages/domain/src/
├── events/
│   ├── index.ts          # Re-exports
│   ├── Venue.ts          # Venue, VenueType
│   ├── Festival.ts       # Festival, FestivalLineup
│   ├── Event.ts          # Event, EventType, EventArtist, EventMention
│   └── extraction.ts     # ExtractionMeta, TemporalReference, confidence types
├── faiss/
│   └── schemas.ts        # Existing PlayResult etc.
└── index.ts              # Add: export * from "./events/index.js"
```

---

## Research: DJ Comment Patterns

### Venues Mentioned (Seattle Focus)
- **Arenas**: Climate Pledge Arena, WaMu Theater
- **Theaters**: Paramount Theatre, Moore Theatre, Neptune Theatre
- **Clubs**: The Showbox, Showbox SoDo, The Crocodile, Neumos
- **Bars**: Tractor Tavern, Madame Lou's, Clock-Out Lounge, Substation
- **Record Stores**: Sonic Boom Records, Easy Street Records

### Festivals Mentioned
- Bumbershoot Music and Arts Festival
- Capitol Hill Block Party (CHBP)
- Psychic Salamander Festival (Modest Mouse curated)
- Mosswood Meltdown
- Pickathon
- Sasquatch (historical)

### Common Patterns
- "Playing at [Venue] on [Date]"
- "[Artist] will be at [Venue] on [Date]"
- "Catch them at [Festival] on [Day]"
- "[Artist] touring: [Date] [City] @ [Venue]"
- "TONIGHT at [Venue]" (relative to airdate)
- "Tickets: [URL]"

### Multi-City Tour Format
```
Jul 29 Seattle, WA, US - Tractor Tavern
Jul 31 Portland, OR, US - Pickathon
Aug 3 Arcata, CA, US - The Miniplex
```

---

## Implementation Tasks

1. Create `packages/domain/src/events/` directory
2. Implement Venue.ts with VenueType
3. Implement Festival.ts with FestivalLineup
4. Implement Event.ts with EventArtist, EventMention
5. Implement extraction.ts with metadata types
6. Create index.ts with re-exports
7. Update packages/domain/src/index.ts to export events module
8. Add corresponding database tables to faiss-search-api (future)

---

## Notes

- Aliases field on Venue/Festival enables fuzzy matching during extraction
- ExtractionMeta tracks provenance for all agent-extracted data
- TemporalReference handles relative date references ("tonight", "tomorrow")
- EventMention links back to source plays for attribution
- Denormalized venue_name on Event enables fast UI rendering without joins
