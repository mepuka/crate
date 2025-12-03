/**
 * Assets Service
 *
 * Provides access to static assets (DJ bios, show descriptions) that are loaded
 * at build time. This service is cloud-ready - no filesystem access required.
 *
 * @module
 */

import {
  Context,
  Effect,
  Schema,
  HashMap,
  pipe,
  Option,
  Array as Arr,
  Layer,
} from "effect";

// =============================================================================
// Import static assets at build time
// =============================================================================

// JSON assets imported statically - bundled at build time
import djBiosRaw from "../../assets/dj-bios.json" with { type: "json" };
// Pre-parsed show descriptions
import { SHOW_DESCRIPTIONS, type ShowDescription } from "../data/shows.js";

// =============================================================================
// Schemas
// =============================================================================

/**
 * DJ bio schema - data from the pre-fetched JSON
 */
export const DjBioSchema = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  bio: Schema.String,
  email: Schema.optional(Schema.String),
  shows: Schema.Array(Schema.String),
  fetchedAt: Schema.String,
});
export type DjBio = typeof DjBioSchema.Type;

/**
 * Array of DJ bios
 */
const DjBioArraySchema = Schema.Array(DjBioSchema);

// Re-export ShowDescription type
export type { ShowDescription };

// =============================================================================
// Pure Helper Functions
// =============================================================================

/**
 * Normalize a name for fuzzy matching
 */
export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Create a lookup map from a list of items by normalized name
 */
const createLookupMap = <T>(
  items: readonly T[],
  getKeys: (item: T) => readonly string[]
): HashMap.HashMap<string, T> =>
  pipe(
    items,
    Arr.flatMap((item) =>
      getKeys(item).map((key) => [normalizeName(key), item] as const)
    ),
    HashMap.fromIterable
  );

/**
 * Find an item by name with fuzzy matching
 */
const findByName = <T>(
  map: HashMap.HashMap<string, T>,
  name: string
): Option.Option<T> => {
  const normalized = normalizeName(name);

  // Exact match first
  const exact = HashMap.get(map, normalized);
  if (Option.isSome(exact)) {
    return exact;
  }

  // Partial match - find any key that contains or is contained by the search
  for (const [key, value] of map) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return Option.some(value);
    }
  }

  return Option.none();
};

// =============================================================================
// Assets Service
// =============================================================================

/**
 * Assets service interface - provides access to pre-loaded static data
 */
export interface AssetsService {
  /** All loaded DJ bios */
  readonly djBios: readonly DjBio[];
  /** All parsed show descriptions */
  readonly showDescriptions: readonly ShowDescription[];
  /** Find a DJ bio by name (fuzzy match) */
  readonly findDjBio: (name: string) => Option.Option<DjBio>;
  /** Find a show description by name (fuzzy match) */
  readonly findShowDescription: (
    name: string
  ) => Option.Option<ShowDescription>;
}

/**
 * Assets service tag
 */
export class Assets extends Context.Tag("Assets")<Assets, AssetsService>() {}

// =============================================================================
// Live Implementation
// =============================================================================

/**
 * Create the live assets service by parsing and indexing static data
 */
const makeAssetsService = Effect.gen(function* () {
  // Decode DJ bios with schema validation
  const djBios = yield* Schema.decodeUnknown(DjBioArraySchema)(djBiosRaw).pipe(
    Effect.mapError((e) => new Error(`Failed to decode DJ bios: ${e.message}`))
  );

  // Show descriptions are already parsed
  const showDescriptions = SHOW_DESCRIPTIONS;

  // Create lookup maps for fast fuzzy matching
  const djBiosByName = createLookupMap(djBios, (bio) => [
    bio.name,
    bio.slug.replace(/-/g, " "),
  ]);

  const showDescriptionsByName = createLookupMap(showDescriptions, (show) => [
    show.name,
    show.slug.replace(/-/g, " "),
  ]);

  return {
    djBios,
    showDescriptions,
    findDjBio: (name: string) => findByName(djBiosByName, name),
    findShowDescription: (name: string) =>
      findByName(showDescriptionsByName, name),
  } satisfies AssetsService;
});

/**
 * Live layer for the Assets service
 * Uses orDie since static JSON should always parse correctly
 */
export const AssetsLive: Layer.Layer<Assets> = Layer.effect(
  Assets,
  Effect.orDie(makeAssetsService)
);

/**
 * Test layer with empty assets
 */
export const AssetsTest: Layer.Layer<Assets> = Layer.succeed(Assets, {
  djBios: [],
  showDescriptions: [],
  findDjBio: () => Option.none(),
  findShowDescription: () => Option.none(),
} satisfies AssetsService);
