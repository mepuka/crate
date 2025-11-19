/**
 * Mock Play Generator
 *
 * Utilities for generating realistic PlayResult objects for testing.
 * Matches the PlayResult schema exactly from @crate/api.
 */

import type { PlayResult } from "@crate/api";

/**
 * Sample data pools for realistic mock generation
 */
const ARTISTS = [
  "Radiohead",
  "Portishead",
  "Massive Attack",
  "The National",
  "Interpol",
  "LCD Soundsystem",
  "Yeah Yeah Yeahs",
  "Arcade Fire",
  "Sonic Youth",
  "Pixies",
  "The Smiths",
  "Joy Division",
  "New Order",
  "Depeche Mode",
  "The Cure",
] as const;

const SONGS = [
  "Everything In Its Right Place",
  "Glory Box",
  "Teardrop",
  "Bloodbuzz Ohio",
  "Evil",
  "All My Friends",
  "Maps",
  "Wake Up",
  "Teen Age Riot",
  "Where Is My Mind?",
  "This Charming Man",
  "Love Will Tear Us Apart",
  "Blue Monday",
  "Enjoy The Silence",
  "Just Like Heaven",
] as const;

const ALBUMS = [
  "Kid A",
  "Dummy",
  "Mezzanine",
  "High Violet",
  "Turn On The Bright Lights",
  "Sound of Silver",
  "Fever To Tell",
  "Funeral",
  "Daydream Nation",
  "Doolittle",
  "The Queen Is Dead",
  "Unknown Pleasures",
  "Power, Corruption & Lies",
  "Violator",
  "Disintegration",
] as const;

const LABELS = [
  "Matador Records",
  "4AD",
  "Sub Pop",
  "Merge Records",
  "Domino Recording Co.",
  "XL Recordings",
  "Factory Records",
  "Mute Records",
] as const;

// Shows and hosts are represented as numbers in PlayResult schema
// const SHOWS = ["Morning Show", "Midday Show", "Afternoon Show", "Drive Time", "Evening Show", "Late Night"] as const;
// const HOSTS = ["John Richards", "Cheryl Waters", "Kevin Cole", "Albina Cabrera", "Larry Rose"] as const;

/**
 * Configuration for mock play generation
 */
export interface MockPlayConfig {
  /** Base ID (increments from this) */
  readonly baseId?: number;
  /** Base timestamp (defaults to now, decrements for each play) */
  readonly baseTimestamp?: Date;
  /** Time delta between plays in milliseconds (default: 3 minutes) */
  readonly timeDeltaMs?: number;
  /** Include album art URLs */
  readonly includeAlbumArt?: boolean;
  /** Include release year */
  readonly includeReleaseYear?: boolean;
  /** Random seed for deterministic generation */
  readonly seed?: number;
}

/**
 * Seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  pickFrom<T>(array: readonly T[]): T {
    return array[this.nextInt(array.length)];
  }
}

/**
 * Generate a single realistic PlayResult object.
 *
 * @param index - Sequential index (used for ID and timestamp offset)
 * @param config - Configuration options
 * @returns PlayResult object matching schema
 */
export function generateMockPlay(
  index: number,
  config: MockPlayConfig = {}
): PlayResult {
  const {
    baseId = 1000000,
    baseTimestamp = new Date(),
    timeDeltaMs = 3 * 60 * 1000, // 3 minutes
    includeAlbumArt = true,
    includeReleaseYear = true,
    seed = 42,
  } = config;

  const rng = new SeededRandom(seed + index);

  // Generate timestamp (going backwards in time)
  const airdate = new Date(baseTimestamp.getTime() - index * timeDeltaMs);

  // Pick random attributes
  const artist = rng.pickFrom(ARTISTS);
  const song = rng.pickFrom(SONGS);
  const album = rng.pickFrom(ALBUMS);
  const label = rng.pickFrom(LABELS);

  // Generate play object matching PlayResult schema
  const play: PlayResult = {
    id: baseId + index,
    artist,
    song,
    similarity: 0.95, // High similarity for mock data
    album,
    airdate, // Date object (schema uses DateFromString)
    release_date: includeReleaseYear
      ? new Date(`${1980 + rng.nextInt(44)}-01-01`)
      : null,
    labels: [label],
    rotation_status: rng.next() > 0.5 ? "Heavy" : "Medium",
    is_local: rng.next() > 0.7,
    is_request: rng.next() > 0.9,
    is_live: rng.next() > 0.95,
    comment: null,
    show: rng.nextInt(100), // Number (not string)
    image_uri: includeAlbumArt
      ? `https://via.placeholder.com/300?text=${encodeURIComponent(album.slice(0, 10))}`
      : null,
    thumbnail_uri: includeAlbumArt
      ? `https://via.placeholder.com/100?text=${encodeURIComponent(album.slice(0, 10))}`
      : null,
    artist_mbid: [], // Empty array for mock data
    recording_mbid: null,
    release_mbid: null,
    release_group_mbid: null,
  };

  return play;
}

/**
 * Generate a batch of mock plays.
 *
 * @param count - Number of plays to generate
 * @param config - Configuration options
 * @returns Array of PlayResult objects
 */
export function generateMockPlays(
  count: number,
  config: MockPlayConfig = {}
): PlayResult[] {
  return Array.from({ length: count }, (_, i) => generateMockPlay(i, config));
}

/**
 * Generate a stream of mock plays over time.
 * Returns a generator that yields plays at regular intervals.
 *
 * @param config - Configuration options
 * @returns Generator that yields plays
 */
export function* generateMockPlayStream(
  config: MockPlayConfig = {}
): Generator<PlayResult, void, unknown> {
  let index = 0;
  while (true) {
    yield generateMockPlay(index++, config);
  }
}

/**
 * Create a mock TimelineResponse with realistic data.
 *
 * @param count - Number of plays in response
 * @param hasMore - Whether there are more pages available
 * @param config - Configuration for play generation
 * @returns Mock TimelineResponse object
 */
export function createMockTimelineResponse(
  count: number,
  hasMore: boolean = true,
  config: MockPlayConfig = {}
) {
  const results = generateMockPlays(count, config);

  return {
    results,
    has_more: hasMore,
    next_cursor: hasMore ? `cursor_${Date.now()}` : null,
    total_count: null,
  };
}
