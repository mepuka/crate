#!/usr/bin/env bun
/**
 * Test Canonical Reference Flow
 *
 * Demonstrates the folder-based canonical reference system:
 * 1. Load canonicals from references/ folder
 * 2. Get canonical by ID
 * 3. Query for variants based on context
 * 4. Get canonical image as base64 for AI prompts
 *
 * Usage:
 *   bun run src/scripts/test-canonical-flow.ts
 *
 * Prerequisites:
 *   - Add canonical images to references/<name>/canonical.png
 *   - Add variants to references/<name>/variants/
 */

import { Effect, Console, Option } from "effect";
import { NodeRuntime } from "@effect/platform-node";

import {
  CanonicalReferenceServiceLive,
  loadAllCanonicals,
  getCanonical,
  getVariantForContext,
  getCanonicalImage,
  listCanonicals,
  type LoadedCanonical,
} from "../services/CanonicalReferenceService.js";

const program = Effect.gen(function* () {
  yield* Console.log("Canonical Reference System Test");
  yield* Console.log("=".repeat(50));
  yield* Console.log("");

  // =========================================================================
  // 1. Load All Canonicals
  // =========================================================================
  yield* Console.log("Step 1: Load All Canonicals");
  yield* Console.log("-".repeat(40));

  const canonicals = yield* loadAllCanonicals().pipe(
    Effect.catchAll((e) => {
      return Effect.succeed([] as ReadonlyArray<LoadedCanonical>);
    })
  );

  if (canonicals.length === 0) {
    yield* Console.log("   No canonicals found in references/ folder.");
    yield* Console.log("");
    yield* Console.log("   To get started:");
    yield* Console.log("   1. Navigate to packages/agent/references/");
    yield* Console.log("   2. Create a folder (e.g., crate-cat/)");
    yield* Console.log("   3. Add config.yaml with metadata");
    yield* Console.log("   4. Add canonical.png (source of truth image)");
    yield* Console.log("   5. Optionally add variants in variants/");
    yield* Console.log("");
    yield* Console.log("   See references/README.md for details.");
    return;
  }

  yield* Console.log(`   Found ${canonicals.length} canonical(s):`);
  for (const c of canonicals) {
    yield* Console.log(`   - ${c.config.name} (${c.config.id})`);
    yield* Console.log(`     Category: ${c.config.category}`);
    yield* Console.log(`     Variants: ${c.variants.length}`);
    if (c.variants.length > 0) {
      for (const v of c.variants) {
        yield* Console.log(`       - ${v.config.name}: ${v.config.useCase}`);
      }
    }
  }
  yield* Console.log("");

  // =========================================================================
  // 2. Get Specific Canonical
  // =========================================================================
  yield* Console.log("Step 2: Get Specific Canonical");
  yield* Console.log("-".repeat(40));

  const firstId = canonicals[0].config.id;
  const canonical = yield* getCanonical(firstId).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

  if (canonical) {
    yield* Console.log(`   Retrieved: ${canonical.config.name}`);
    yield* Console.log(`   Description: ${canonical.config.description.slice(0, 60)}...`);
    yield* Console.log(`   Style Guide:`);
    yield* Console.log(`     Must Preserve: ${canonical.config.styleGuide.mustPreserve.length} rules`);
    yield* Console.log(`     Can Adapt: ${canonical.config.styleGuide.canAdapt.length} aspects`);
    yield* Console.log(`     Never Change: ${canonical.config.styleGuide.neverChange.length} constraints`);
  }
  yield* Console.log("");

  // =========================================================================
  // 3. Query Variants by Context
  // =========================================================================
  yield* Console.log("Step 3: Query Variants by Context");
  yield* Console.log("-".repeat(40));

  // Test warm palette context
  yield* Console.log("   Context: warm palette, jazz album");
  const warmResult = yield* getVariantForContext(firstId, {
    palette: "warm",
    useCase: "jazz",
  }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

  if (Option.isSome(warmResult)) {
    yield* Console.log(`   -> Selected: ${warmResult.value.config.name}`);
    yield* Console.log(`      File: ${warmResult.value.filePath}`);
  } else {
    yield* Console.log("   -> No matching variant (would use canonical)");
  }

  // Test cool palette context
  yield* Console.log("");
  yield* Console.log("   Context: cool palette, electronic");
  const coolResult = yield* getVariantForContext(firstId, {
    palette: "cool",
    useCase: "electronic",
  }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

  if (Option.isSome(coolResult)) {
    yield* Console.log(`   -> Selected: ${coolResult.value.config.name}`);
  } else {
    yield* Console.log("   -> No matching variant (would use canonical)");
  }

  // Test line art for overlay
  yield* Console.log("");
  yield* Console.log("   Context: overlay on busy background");
  const lineResult = yield* getVariantForContext(firstId, {
    style: "line",
    useCase: "overlay",
  }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

  if (Option.isSome(lineResult)) {
    yield* Console.log(`   -> Selected: ${lineResult.value.config.name}`);
  } else {
    yield* Console.log("   -> No matching variant");
  }
  yield* Console.log("");

  // =========================================================================
  // 4. Get Canonical Image for AI
  // =========================================================================
  yield* Console.log("Step 4: Get Canonical Image (for AI prompts)");
  yield* Console.log("-".repeat(40));

  const image = yield* getCanonicalImage(firstId).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

  if (image) {
    yield* Console.log(`   Media Type: ${image.mediaType}`);
    yield* Console.log(`   Base64 Length: ${image.base64.length} chars`);
    yield* Console.log("   Ready to attach to AI generation prompts");
  } else {
    yield* Console.log("   Could not load canonical image");
  }
  yield* Console.log("");

  // =========================================================================
  // 5. Summary
  // =========================================================================
  yield* Console.log("Summary");
  yield* Console.log("-".repeat(40));

  const allIds = yield* listCanonicals();
  yield* Console.log(`   Total canonicals: ${allIds.length}`);
  yield* Console.log(`   IDs: ${allIds.join(", ")}`);
  yield* Console.log("");
  yield* Console.log("=".repeat(50));
  yield* Console.log("Canonical Reference System operational!");
  yield* Console.log("");
  yield* Console.log("Folder-based patterns demonstrated:");
  yield* Console.log("  - Drop folder with config.yaml + images");
  yield* Console.log("  - Auto-discovery of variants");
  yield* Console.log("  - Context-based variant selection");
  yield* Console.log("  - Image loading for AI prompts");
}).pipe(
  Effect.provide(CanonicalReferenceServiceLive),
  Effect.tapError((e) => Console.error(`Error: ${e}`))
);

NodeRuntime.runMain(program);
