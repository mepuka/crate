/**
 * Persist Prompts to Files
 *
 * Fetches KEXP plays and generates prompts, saving them to files for review.
 * Includes both current plays and historical plays.
 *
 * Usage: bun packages/agent/scripts/persist-prompts.ts
 */

import { Effect, Schema, Console } from "effect";
import * as Kexp from "@crate/domain/kexp/schemas";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  PromptBuilderService,
  builtPromptToAiPrompt,
  type BuiltPrompt,
} from "../src/services/PromptBuilderService.js";

const { KexpPlaysResponse, isTrackPlay } = Kexp;

// Output directory for prompts
const OUTPUT_DIR = path.join(
  import.meta.dir,
  "..",
  "assets",
  "generated-prompts"
);

// Ensure output directory exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Fetch plays from KEXP API
const fetchPlays = (params: { limit?: number; offset?: number } = {}) =>
  Effect.gen(function* () {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    const url = `https://api.kexp.org/v2/plays/?format=json&limit=${limit}&offset=${offset}`;

    const response = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (error) => new Error(`Failed to fetch plays: ${error}`),
    });

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse plays JSON: ${error}`),
    });

    const parsed = yield* Schema.decodeUnknown(KexpPlaysResponse)(json).pipe(
      Effect.mapError(
        (error) => new Error(`Schema validation failed: ${error}`)
      )
    );

    return parsed.results.filter(isTrackPlay);
  });

// Fetch show info for a play
const fetchShowForPlay = (showId: number) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(`https://api.kexp.org/v2/shows/${showId}/?format=json`),
      catch: (error) => new Error(`Failed to fetch show: ${error}`),
    });

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse show JSON: ${error}`),
    });

    return yield* Schema.decodeUnknown(Kexp.KexpShow)(json).pipe(
      Effect.mapError(
        (error) => new Error(`Show schema validation failed: ${error}`)
      )
    );
  });

// Format a prompt for file output
function formatPromptForFile(
  play: Kexp.KexpTrackPlay,
  show: Kexp.KexpShow | undefined,
  builtPrompt: BuiltPrompt
): string {
  const lines: string[] = [];

  lines.push("# Generated Prompt");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");

  // Play info
  lines.push("## Play Information");
  lines.push("");
  lines.push(`- **Play ID:** ${play.id}`);
  lines.push(`- **Artist:** ${play.artist}`);
  lines.push(`- **Track:** ${play.song}`);
  lines.push(`- **Album:** ${play.album || "N/A"}`);
  lines.push(`- **Airdate:** ${play.airdate}`);
  if (play.comment) {
    lines.push(`- **DJ Comment:** ${play.comment.slice(0, 200)}${play.comment.length > 200 ? "..." : ""}`);
  }
  lines.push("");

  // Show info
  if (show) {
    lines.push("## Show Information");
    lines.push("");
    lines.push(`- **Show:** ${show.program_name}`);
    lines.push(`- **Host(s):** ${show.host_names.join(", ")}`);
    if (show.tagline) {
      lines.push(`- **Tagline:** ${show.tagline}`);
    }
    lines.push("");
  }

  // Metadata
  lines.push("## Prompt Metadata");
  lines.push("");
  lines.push(`- **Has DJ Bio:** ${builtPrompt.metadata.hasDjBio}`);
  lines.push(`- **Has Comment:** ${builtPrompt.metadata.hasComment}`);
  lines.push(
    `- **System Prompt Length:** ${builtPrompt.systemPrompt.length} chars`
  );
  lines.push(
    `- **User Message Length:** ${builtPrompt.userMessage.length} chars`
  );
  lines.push("");

  // Full system prompt
  lines.push("---");
  lines.push("");
  lines.push("## System Prompt");
  lines.push("");
  lines.push("```");
  lines.push(builtPrompt.systemPrompt);
  lines.push("```");
  lines.push("");

  // Full user message
  lines.push("---");
  lines.push("");
  lines.push("## User Message");
  lines.push("");
  lines.push("```markdown");
  lines.push(builtPrompt.userMessage);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// Sanitize filename
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

// Main program
const program = Effect.gen(function* () {
  yield* Console.log("🎵 Generating and Persisting Prompts\n");

  ensureDir(OUTPUT_DIR);
  const currentDir = path.join(OUTPUT_DIR, "current");
  const pastDir = path.join(OUTPUT_DIR, "past");
  ensureDir(currentDir);
  ensureDir(pastDir);

  const promptBuilder = yield* PromptBuilderService;

  // Show loaded data stats
  const djBios = yield* promptBuilder.getAllDjBios();
  const showDescriptions = yield* promptBuilder.getAllShowDescriptions();
  yield* Console.log(`📚 Loaded ${djBios.length} DJ bios`);
  yield* Console.log(
    `📚 Loaded ${showDescriptions.length} show descriptions\n`
  );

  // Fetch current plays (most recent)
  yield* Console.log("📻 Fetching current plays...");
  const currentPlays = yield* fetchPlays({ limit: 10 });
  yield* Console.log(`   Found ${currentPlays.length} current track plays`);

  // Fetch past plays (older ones)
  yield* Console.log("📻 Fetching past plays (offset 100)...");
  const pastPlays = yield* fetchPlays({ limit: 10, offset: 100 });
  yield* Console.log(`   Found ${pastPlays.length} past track plays\n`);

  // Process current plays
  yield* Console.log("═".repeat(60));
  yield* Console.log("Processing CURRENT plays...\n");

  let currentCount = 0;
  for (const play of currentPlays.slice(0, 5)) {
    const show = yield* fetchShowForPlay(play.show).pipe(
      Effect.catchAll(() =>
        Effect.succeed(undefined as Kexp.KexpShow | undefined)
      )
    );

    const builtPrompt = yield* promptBuilder.buildForKexpPlay(play, { show });
    const content = formatPromptForFile(play, show, builtPrompt);

    const filename = `${sanitizeFilename(play.artist || "unknown")}-${sanitizeFilename(play.song || "unknown")}-${play.id}.md`;
    const filepath = path.join(currentDir, filename);

    fs.writeFileSync(filepath, content, "utf-8");
    yield* Console.log(`   ✅ ${play.artist} - "${play.song}"`);
    currentCount++;
  }
  yield* Console.log(`\n   Saved ${currentCount} current prompts to ${currentDir}\n`);

  // Process past plays
  yield* Console.log("═".repeat(60));
  yield* Console.log("Processing PAST plays...\n");

  let pastCount = 0;
  for (const play of pastPlays.slice(0, 5)) {
    const show = yield* fetchShowForPlay(play.show).pipe(
      Effect.catchAll(() =>
        Effect.succeed(undefined as Kexp.KexpShow | undefined)
      )
    );

    const builtPrompt = yield* promptBuilder.buildForKexpPlay(play, { show });
    const content = formatPromptForFile(play, show, builtPrompt);

    const filename = `${sanitizeFilename(play.artist || "unknown")}-${sanitizeFilename(play.song || "unknown")}-${play.id}.md`;
    const filepath = path.join(pastDir, filename);

    fs.writeFileSync(filepath, content, "utf-8");
    yield* Console.log(`   ✅ ${play.artist} - "${play.song}"`);
    pastCount++;
  }
  yield* Console.log(`\n   Saved ${pastCount} past prompts to ${pastDir}\n`);

  yield* Console.log("═".repeat(60));
  yield* Console.log(`\n✅ Done! Total prompts saved: ${currentCount + pastCount}`);
  yield* Console.log(`\nOutput directory: ${OUTPUT_DIR}`);
});

// Run with proper layers
const runnable = program.pipe(Effect.provide(PromptBuilderService.Default));

Effect.runPromise(runnable).catch(console.error);
