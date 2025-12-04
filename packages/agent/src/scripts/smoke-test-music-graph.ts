/**
 * Smoke test for MusicGraphService
 *
 * Tests the full MusicGraphService layer against the live Graph API.
 * Run with: bun --env-file=../../.env src/scripts/smoke-test-music-graph.ts
 */

import { Effect, Console, Option } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import {
  MusicGraphService,
  MusicGraphServiceFull,
} from "../services/MusicGraphService.js";

// Radiohead's MBID - a well-known artist for testing
const RADIOHEAD_MBID = "a74b1b7f-71a5-4011-9441-d0b5e4122711";

const program = Effect.gen(function* () {
  const graph = yield* MusicGraphService;

  yield* Console.log("=== MusicGraphService Smoke Test ===\n");

  // Step 1: Expand graph from Radiohead
  yield* Console.log("1. Expanding graph from Radiohead...");
  const expandResult = yield* graph.expand({
    mbids: [RADIOHEAD_MBID],
    query_type: "band_members",
    include_attributes: true,
  });

  yield* Console.log(
    `   Source MBIDs: ${expandResult.connections.source_mbids.join(", ")}`
  );
  yield* Console.log(
    `   Connections found: ${expandResult.connections.connections.length}`
  );
  yield* Console.log(`   New nodes added: ${expandResult.newNodes}`);
  yield* Console.log(`   New edges added: ${expandResult.newEdges}\n`);

  // Step 2: Get neighbors of Radiohead
  yield* Console.log("2. Getting neighbors of Radiohead...");
  const neighbors = yield* graph.neighbors(RADIOHEAD_MBID);
  yield* Console.log(`   Found ${neighbors.length} neighbors:`);
  for (const n of neighbors.slice(0, 5)) {
    yield* Console.log(`     - ${n.name} (${n.nodeType})`);
  }
  if (neighbors.length > 5) {
    yield* Console.log(`     ... and ${neighbors.length - 5} more\n`);
  } else {
    yield* Console.log("");
  }

  // Step 3: Get snapshot
  yield* Console.log("3. Getting graph snapshot...");
  const snapshot = yield* graph.snapshot();
  yield* Console.log(`   Total nodes: ${snapshot.nodes.length}`);
  yield* Console.log(`   Total edges: ${snapshot.edges.length}\n`);

  // Step 4: Expand with collaborators to get more artists
  yield* Console.log("4. Expanding with collaborators...");
  const collabResult = yield* graph.expand({
    mbids: [RADIOHEAD_MBID],
    query_type: "collaborators",
    include_attributes: true,
    limit: 10,
  });
  yield* Console.log(
    `   Collaborators found: ${collabResult.connections.connections.length}`
  );
  yield* Console.log(`   New nodes added: ${collabResult.newNodes}`);
  yield* Console.log(`   New edges added: ${collabResult.newEdges}\n`);

  // Step 5: Stress test – iterative expansion across all query types
  const STRESS_DEPTH = 4;
  const STRESS_FANOUT = 50;
  const QUERY_TYPES: ReadonlyArray<
    | "band_members"
    | "member_of"
    | "labelmates"
    | "label_hierarchy"
    | "covers"
    | "artist_origin"
    | "artists_from_area"
    | "recorded_at"
    | "collaborators"
  > = [
    "band_members",
    "member_of",
    "labelmates",
    "label_hierarchy",
    "covers",
    "artist_origin",
    "artists_from_area",
    "recorded_at",
    "collaborators",
  ];

  let frontier = [RADIOHEAD_MBID];

  for (let depth = 1; depth <= STRESS_DEPTH; depth++) {
    yield* Console.log(
      `5.${depth}. Stress depth ${depth} from ${frontier.length} seed nodes...`
    );

    let depthNewNodes = 0;
    let depthNewEdges = 0;

    for (const queryType of QUERY_TYPES) {
      yield* Console.log(
        `   → Query type: ${queryType} (seeds=${frontier.length})`
      );

      const stressResult = yield* graph.expand({
        mbids: frontier,
        query_type: queryType,
        include_attributes: true,
        limit: STRESS_FANOUT,
      });

      depthNewNodes += stressResult.newNodes;
      depthNewEdges += stressResult.newEdges;

      // Grow frontier with connections from this query, capped to STRESS_FANOUT
      const nextFromQuery = stressResult.connections.connections
        .map((c) => c.mbid)
        .filter((mbid, idx, arr) => arr.indexOf(mbid) === idx);

      frontier = [...frontier, ...nextFromQuery].filter(
        (mbid, idx, arr) => arr.indexOf(mbid) === idx
      );

      if (frontier.length > STRESS_FANOUT) {
        frontier = frontier.slice(0, STRESS_FANOUT);
      }
    }

    const snapshotDepth = yield* graph.snapshot();
    yield* Console.log(
      `   Summary depth ${depth}: newNodes=${depthNewNodes}, newEdges=${depthNewEdges}, snapshot nodes=${snapshotDepth.nodes.length}, edges=${snapshotDepth.edges.length}`
    );

    if (frontier.length === 0) {
      yield* Console.log("   Frontier exhausted, stopping stress expansion.\n");
      break;
    }
  }

  // Step 6: Final graph state
  yield* Console.log("\n6. Final graph state...");
  const finalSnapshot = yield* graph.snapshot();
  yield* Console.log(`   Total nodes: ${finalSnapshot.nodes.length}`);
  yield* Console.log(`   Total edges: ${finalSnapshot.edges.length}`);

  // Show some sample nodes
  yield* Console.log("\n   Sample nodes:");
  for (const node of finalSnapshot.nodes.slice(0, 10)) {
    yield* Console.log(`     - ${node.name} (${node.nodeType}): ${node.mbid}`);
  }

  // Step 7: Test path finding between first and last node (if we have enough nodes)
  if (finalSnapshot.nodes.length >= 2) {
    const firstNode = finalSnapshot.nodes[0];
    const lastNode = finalSnapshot.nodes[finalSnapshot.nodes.length - 1];

    yield* Console.log(
      `\n7. Finding path from "${firstNode?.name}" to "${lastNode?.name}"...`
    );
    const pathResult = yield* graph.path(firstNode!.mbid, lastNode!.mbid);

    if (Option.isSome(pathResult)) {
      yield* Console.log(
        `   Path found with ${pathResult.value.length} nodes:`
      );
      for (const node of pathResult.value) {
        yield* Console.log(`     -> ${node.name}`);
      }
    } else {
      yield* Console.log("   No path found (nodes may not be connected)");
    }
  }

  // Step 8: Search for longer paths across a sampled set of nodes
  if (finalSnapshot.nodes.length >= 2) {
    const sampleSize = Math.min(50, finalSnapshot.nodes.length);
    const sample = finalSnapshot.nodes.slice(0, sampleSize);

    let bestPath: readonly (typeof sample)[number][] | null = null;

    for (let i = 0; i < sampleSize; i++) {
      for (let j = i + 1; j < sampleSize; j++) {
        const from = sample[i];
        const to = sample[j];

        const maybePath = yield* graph.path(from.mbid, to.mbid);
        if (Option.isSome(maybePath)) {
          const pathNodes = maybePath.value;
          if (!bestPath || pathNodes.length > bestPath.length) {
            bestPath = pathNodes;
          }
        }
      }
    }

    if (bestPath && bestPath.length > 0) {
      yield* Console.log(
        `\n8. Longest sampled path has ${bestPath.length} nodes:`
      );
      for (const node of bestPath) {
        yield* Console.log(`     -> ${node.name} (${node.nodeType})`);
      }
    } else {
      yield* Console.log("\n8. No paths found in sampled node pairs");
    }
  }

  yield* Console.log("\n=== Smoke Test Complete ===");
});

// Compose layers and run

const runnable = program.pipe(Effect.provide(MusicGraphServiceFull));

BunRuntime.runMain(runnable);
