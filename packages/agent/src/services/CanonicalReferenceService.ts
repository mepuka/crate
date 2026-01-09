/**
 * CanonicalReferenceService
 *
 * File-based canonical reference system. Drop a folder with metadata + images.
 * Similar to skills - each canonical is a folder with:
 *   - config.yaml (or config.json) - metadata, style guide, prompt template
 *   - canonical.{png,jpg,svg} - the source of truth image
 *   - variants/ - subfolder with variant images
 *
 * Structure:
 *   references/
 *   ├── crate-cat/
 *   │   ├── config.yaml
 *   │   ├── canonical.png
 *   │   └── variants/
 *   │       ├── line-art.svg
 *   │       ├── silhouette.svg
 *   │       └── warm.png
 *   └── kexp-studio/
 *       ├── config.yaml
 *       ├── canonical.jpg
 *       └── variants/
 *           └── wide-shot.jpg
 */

import { Effect, Context, Schema, Layer, Data, Option } from "effect";
import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";

// ============================================================================
// Schemas
// ============================================================================

export const CanonicalCategory = Schema.Literal("mascot", "setting", "typography", "texture", "prop");
export type CanonicalCategory = typeof CanonicalCategory.Type;

export const RenderStyle = Schema.Literal("line", "filled", "shaded", "realistic", "silhouette");
export type RenderStyle = typeof RenderStyle.Type;

/** Style guide for maintaining consistency */
export const StyleGuide = Schema.Struct({
  mustPreserve: Schema.Array(Schema.String),
  canAdapt: Schema.Array(Schema.String),
  neverChange: Schema.Array(Schema.String),
});
export type StyleGuide = typeof StyleGuide.Type;

/** Variant metadata (from folder or inline in config) */
export const VariantConfig = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  useCase: Schema.String,
  palette: Schema.optional(Schema.Literal("warm", "cool", "neutral", "any")),
  style: Schema.optional(RenderStyle),
  description: Schema.optional(Schema.String),
});
export type VariantConfig = typeof VariantConfig.Type;

/** Config file schema (config.yaml) */
export const CanonicalConfig = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  category: CanonicalCategory,

  // The canonical image file (relative to folder)
  canonical: Schema.String, // e.g., "canonical.png"

  // Style guide
  styleGuide: StyleGuide,

  // Prompt template for AI generation
  promptTemplate: Schema.String,

  // Variants (can be defined here or auto-discovered from variants/ folder)
  variants: Schema.optional(Schema.Array(VariantConfig)),

  // Additional metadata
  tags: Schema.optional(Schema.Array(Schema.String)),
  author: Schema.optional(Schema.String),
  created: Schema.optional(Schema.String),
});
export type CanonicalConfig = typeof CanonicalConfig.Type;

/** Loaded canonical reference with resolved paths */
export interface LoadedCanonical {
  readonly config: CanonicalConfig;
  readonly folderPath: string;
  readonly canonicalPath: string;
  readonly variants: ReadonlyArray<LoadedVariant>;
}

/** Loaded variant with resolved path */
export interface LoadedVariant {
  readonly config: VariantConfig;
  readonly filePath: string;
}

/** Selection context for finding best variant */
export const SelectionContext = Schema.Struct({
  mood: Schema.optional(Schema.String),
  palette: Schema.optional(Schema.Literal("warm", "cool", "neutral")),
  useCase: Schema.optional(Schema.String),
  style: Schema.optional(RenderStyle),
});
export type SelectionContext = typeof SelectionContext.Type;

// ============================================================================
// Errors
// ============================================================================

export class CanonicalNotFoundError extends Data.TaggedError("CanonicalNotFoundError")<{
  readonly id: string;
  readonly searchPath?: string;
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly path: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class VariantNotFoundError extends Data.TaggedError("VariantNotFoundError")<{
  readonly canonicalId: string;
  readonly context: SelectionContext;
}> {}

// ============================================================================
// Service Interface
// ============================================================================

export interface CanonicalReferenceServiceInterface {
  /** Load all canonicals from the references folder */
  readonly loadAll: () => Effect.Effect<ReadonlyArray<LoadedCanonical>, ConfigParseError>;

  /** Get canonical by ID */
  readonly get: (id: string) => Effect.Effect<LoadedCanonical, CanonicalNotFoundError | ConfigParseError>;

  /** Get canonical by category */
  readonly getByCategory: (
    category: CanonicalCategory
  ) => Effect.Effect<ReadonlyArray<LoadedCanonical>, ConfigParseError>;

  /** Get best variant for context */
  readonly getVariantForContext: (
    id: string,
    context: SelectionContext
  ) => Effect.Effect<Option.Option<LoadedVariant>, CanonicalNotFoundError | ConfigParseError>;

  /** Get canonical image as base64 (for AI prompts) */
  readonly getCanonicalImage: (
    id: string
  ) => Effect.Effect<{ base64: string; mediaType: string }, CanonicalNotFoundError | ConfigParseError>;

  /** List all canonical IDs */
  readonly list: () => Effect.Effect<ReadonlyArray<string>, ConfigParseError>;

  /** Reload from disk (after adding new references) */
  readonly reload: () => Effect.Effect<void, ConfigParseError>;
}

export class CanonicalReferenceService extends Context.Tag("CanonicalReferenceService")<
  CanonicalReferenceService,
  CanonicalReferenceServiceInterface
>() {}

// ============================================================================
// Implementation
// ============================================================================

const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp"];
const CONFIG_FILES = ["config.yaml", "config.yml", "config.json"];

/** Try to read a file, returning Option */
const tryReadFile = (filePath: string): Effect.Effect<Option.Option<string>> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: () => null,
  }).pipe(
    Effect.map(Option.some),
    Effect.catchAll(() => Effect.succeed(Option.none()))
  );

/** Load a single canonical from a folder */
const loadCanonicalFromFolder = (
  folderPath: string
): Effect.Effect<LoadedCanonical, ConfigParseError> =>
  Effect.gen(function* () {
    // Find and load config file
    let configPath: string | null = null;
    let configContent: string | null = null;

    for (const configFile of CONFIG_FILES) {
      const tryPath = path.join(folderPath, configFile);
      const content = yield* tryReadFile(tryPath);
      if (Option.isSome(content)) {
        configContent = content.value;
        configPath = tryPath;
        break;
      }
    }

    if (!configPath || !configContent) {
      return yield* new ConfigParseError({
        path: folderPath,
        reason: `No config file found (tried: ${CONFIG_FILES.join(", ")})`,
      });
    }

    // Parse config
    let rawConfig: unknown;
    try {
      if (configPath.endsWith(".json")) {
        rawConfig = JSON.parse(configContent);
      } else {
        rawConfig = yaml.parse(configContent);
      }
    } catch (e) {
      return yield* new ConfigParseError({
        path: configPath,
        reason: "Failed to parse config file",
        cause: e,
      });
    }

    // Validate against schema
    const config = yield* Schema.decodeUnknown(CanonicalConfig)(rawConfig).pipe(
      Effect.mapError(
        (e) =>
          new ConfigParseError({
            path: configPath!,
            reason: `Invalid config: ${e.message}`,
            cause: e,
          })
      )
    );

    // Resolve canonical image path
    const canonicalPath = path.join(folderPath, config.canonical);

    // Check canonical exists
    yield* Effect.tryPromise({
      try: () => fs.access(canonicalPath),
      catch: () =>
        new ConfigParseError({
          path: canonicalPath,
          reason: `Canonical image not found: ${config.canonical}`,
        }),
    });

    // Load variants
    const variants: LoadedVariant[] = [];

    // From config
    if (config.variants) {
      for (const v of config.variants) {
        const variantPath = path.join(folderPath, "variants", v.file);
        variants.push({ config: v, filePath: variantPath });
      }
    }

    // Auto-discover from variants/ folder
    const variantsDir = path.join(folderPath, "variants");
    const variantFiles = yield* Effect.tryPromise({
      try: () => fs.readdir(variantsDir),
      catch: () => [] as string[],
    }).pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

    for (const file of variantFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) continue;

      // Skip if already in config
      const alreadyConfigured = variants.some(
        (v) => path.basename(v.filePath) === file
      );
      if (alreadyConfigured) continue;

      // Auto-generate config from filename
      const name = path.basename(file, ext).replace(/-/g, " ");
      variants.push({
        config: {
          name: name.charAt(0).toUpperCase() + name.slice(1),
          file,
          useCase: `${name} variant`,
        },
        filePath: path.join(variantsDir, file),
      });
    }

    return {
      config,
      folderPath,
      canonicalPath,
      variants,
    };
  });

/** Create the service implementation */
const makeCanonicalReferenceService = (
  referencesPath: string
): Effect.Effect<CanonicalReferenceServiceInterface, never> =>
  Effect.sync(() => {
    // In-memory cache
    let cache: Map<string, LoadedCanonical> = new Map();

    const loadAllImpl = (): Effect.Effect<ReadonlyArray<LoadedCanonical>, ConfigParseError> =>
      Effect.gen(function* () {
        const loaded: LoadedCanonical[] = [];

        // List folders in references directory
        const entries = yield* Effect.tryPromise({
          try: () => fs.readdir(referencesPath, { withFileTypes: true }),
          catch: () => [] as Dirent[],
        }).pipe(Effect.catchAll(() => Effect.succeed([] as Dirent[])));

        if (entries.length === 0) {
          // References folder doesn't exist or is empty
          return [];
        }

        const folders = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => e.name);

        // Load each folder
        for (const folder of folders) {
          const folderPath = path.join(referencesPath, folder);
          const result = yield* loadCanonicalFromFolder(folderPath).pipe(
            Effect.tapError((e) =>
              Effect.logWarning(`Failed to load canonical from ${folder}: ${e.reason}`)
            ),
            Effect.option
          );

          if (Option.isSome(result)) {
            loaded.push(result.value);
            cache.set(result.value.config.id, result.value);
          }
        }

        yield* Effect.logInfo(`Loaded ${loaded.length} canonical references`);
        return loaded;
      });

    return {
      loadAll: loadAllImpl,

      get: (id) =>
        Effect.gen(function* () {
          // Check cache first
          const cached = cache.get(id);
          if (cached) return cached;

          // Try to load
          yield* loadAllImpl();
          const result = cache.get(id);
          if (!result) {
            return yield* new CanonicalNotFoundError({ id, searchPath: referencesPath });
          }
          return result;
        }),

      getByCategory: (category) =>
        Effect.gen(function* () {
          if (cache.size === 0) {
            yield* loadAllImpl();
          }
          return Array.from(cache.values()).filter(
            (c) => c.config.category === category
          );
        }),

      getVariantForContext: (id, context) =>
        Effect.gen(function* () {
          const canonical = yield* Effect.gen(function* () {
            const cached = cache.get(id);
            if (cached) return cached;
            yield* loadAllImpl();
            const result = cache.get(id);
            if (!result) {
              return yield* new CanonicalNotFoundError({ id });
            }
            return result;
          });

          if (canonical.variants.length === 0) {
            return Option.none();
          }

          // Score each variant
          const scored = canonical.variants.map((v) => {
            let score = 0;

            if (context.palette && v.config.palette) {
              if (v.config.palette === context.palette || v.config.palette === "any") {
                score += 3;
              }
            }

            if (context.useCase) {
              const useCaseLower = context.useCase.toLowerCase();
              if (v.config.useCase.toLowerCase().includes(useCaseLower)) {
                score += 4;
              }
              if (v.config.name.toLowerCase().includes(useCaseLower)) {
                score += 2;
              }
            }

            if (context.style && v.config.style === context.style) {
              score += 3;
            }

            if (context.mood && v.config.description?.toLowerCase().includes(context.mood.toLowerCase())) {
              score += 2;
            }

            return { variant: v, score };
          });

          const sorted = scored.sort((a, b) => b.score - a.score);

          if (sorted.length === 0 || sorted[0].score === 0) {
            return Option.none();
          }

          return Option.some(sorted[0].variant);
        }),

      getCanonicalImage: (id) =>
        Effect.gen(function* () {
          const canonical = yield* Effect.gen(function* () {
            const cached = cache.get(id);
            if (cached) return cached;
            yield* loadAllImpl();
            const result = cache.get(id);
            if (!result) {
              return yield* new CanonicalNotFoundError({ id });
            }
            return result;
          });

          const buffer = yield* Effect.tryPromise({
            try: () => fs.readFile(canonical.canonicalPath),
            catch: () => new CanonicalNotFoundError({ id }),
          });

          const ext = path.extname(canonical.canonicalPath).toLowerCase();
          const mediaType =
            ext === ".png" ? "image/png" :
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
            ext === ".svg" ? "image/svg+xml" :
            ext === ".webp" ? "image/webp" :
            "application/octet-stream";

          return {
            base64: buffer.toString("base64"),
            mediaType,
          };
        }),

      list: () =>
        Effect.gen(function* () {
          if (cache.size === 0) {
            yield* loadAllImpl();
          }
          return Array.from(cache.keys());
        }),

      reload: () =>
        Effect.gen(function* () {
          cache.clear();
          yield* loadAllImpl();
        }),
    };
  });

// ============================================================================
// Layers
// ============================================================================

/** Default references path */
const DEFAULT_REFERENCES_PATH = "./references";

/** Create layer with custom references path */
export const CanonicalReferenceServiceLayer = (referencesPath: string) =>
  Layer.effect(
    CanonicalReferenceService,
    makeCanonicalReferenceService(referencesPath)
  );

/** Default layer using ./references */
export const CanonicalReferenceServiceLive = CanonicalReferenceServiceLayer(
  DEFAULT_REFERENCES_PATH
);

/** Test layer with test-references/ path */
export const CanonicalReferenceServiceTest = CanonicalReferenceServiceLayer(
  "./test-references"
);

// ============================================================================
// Convenience Accessors
// ============================================================================

export const loadAllCanonicals = () =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.loadAll());

export const getCanonical = (id: string) =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.get(id));

export const getCanonicalsByCategory = (category: CanonicalCategory) =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.getByCategory(category));

export const getVariantForContext = (id: string, context: SelectionContext) =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.getVariantForContext(id, context));

export const getCanonicalImage = (id: string) =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.getCanonicalImage(id));

export const listCanonicals = () =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.list());

export const reloadCanonicals = () =>
  Effect.flatMap(CanonicalReferenceService, (s) => s.reload());
