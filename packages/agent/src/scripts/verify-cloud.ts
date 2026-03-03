#!/usr/bin/env node
/**
 * Cloud Verification CLI
 *
 * Runs health checks and smoke tests against deployed cloud infrastructure.
 * Outputs a comprehensive report with pass/fail status.
 *
 * Usage:
 *   bun run src/scripts/verify-cloud.ts
 *   FAISS_API_URL=http://localhost:8000 bun run src/scripts/verify-cloud.ts
 *
 * @module
 */

import { Effect, Layer, Console, Data } from "effect";
import { FetchHttpClient } from "@effect/platform";
import { NodeRuntime } from "@effect/platform-node";
import {
  CloudVerificationService,
  CloudVerificationServiceLive,
  CloudVerificationConfig,
  type VerificationReport,
  type ServiceHealth,
  type SmokeTestResult,
} from "../services/CloudVerificationService.js";

class CloudVerificationError extends Data.TaggedError("CloudVerificationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Configuration
// =============================================================================

const ConfigLayer = Layer.succeed(CloudVerificationConfig, {
  faissApiUrl: process.env.FAISS_API_URL ?? "https://cratemusic.duckdns.org",
  cloudRunUrl: process.env.CLOUD_RUN_URL ?? null,
  timeoutMs: 60000,
  retryAttempts: 3,
});

const AppLayer = CloudVerificationServiceLive.pipe(
  Layer.provide(ConfigLayer),
  Layer.provideMerge(FetchHttpClient.layer)
);

// =============================================================================
// Output Formatting
// =============================================================================

const statusIcon = (status: "healthy" | "degraded" | "unhealthy"): string => {
  switch (status) {
    case "healthy":
      return "\u2713"; // checkmark
    case "degraded":
      return "!";
    case "unhealthy":
      return "X";
  }
};

const passIcon = (passed: boolean): string => (passed ? "\u2713" : "X");

const formatServiceHealth = (health: ServiceHealth): string => {
  const icon = statusIcon(health.status);
  const details = health.details
    ? Object.entries(health.details)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  return `  [${icon}] ${health.service}: ${health.status} (${health.latencyMs}ms)${details ? ` - ${details}` : ""}`;
};

const formatSmokeTest = (test: SmokeTestResult): string => {
  const icon = passIcon(test.passed);
  return `  [${icon}] ${test.testName}: ${test.passed ? "PASSED" : "FAILED"} (${test.durationMs}ms)${test.message ? ` - ${test.message}` : ""}`;
};

const formatReport = (report: VerificationReport): string => {
  const lines: string[] = [];

  lines.push("=".repeat(60));
  lines.push("CLOUD INFRASTRUCTURE VERIFICATION REPORT");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
  lines.push(`Duration: ${report.totalDurationMs}ms`);
  lines.push(`Overall Status: ${report.overallStatus.toUpperCase()}`);
  lines.push("");

  lines.push("-".repeat(40));
  lines.push("SERVICE HEALTH");
  lines.push("-".repeat(40));
  for (const health of report.services) {
    lines.push(formatServiceHealth(health));
  }
  lines.push("");

  if (report.smokeTests.length > 0) {
    lines.push("-".repeat(40));
    lines.push("SMOKE TESTS");
    lines.push("-".repeat(40));
    for (const test of report.smokeTests) {
      lines.push(formatSmokeTest(test));
    }
    lines.push("");
  }

  lines.push("=".repeat(60));
  const passedCount = report.smokeTests.filter((t) => t.passed).length;
  const totalTests = report.smokeTests.length;
  lines.push(`Summary: ${passedCount}/${totalTests} tests passed`);

  if (report.overallStatus === "unhealthy") {
    lines.push("");
    lines.push("CRITICAL: Infrastructure is unhealthy! Investigate immediately.");
  } else if (report.overallStatus === "degraded") {
    lines.push("");
    lines.push("WARNING: Infrastructure is degraded. Some features may be impaired.");
  } else {
    lines.push("");
    lines.push("All systems operational.");
  }
  lines.push("=".repeat(60));

  return lines.join("\n");
};

// =============================================================================
// Main Program
// =============================================================================

const program = Effect.gen(function* () {
  yield* Console.log("Starting cloud infrastructure verification...");
  yield* Console.log(`FAISS API URL: ${process.env.FAISS_API_URL ?? "https://cratemusic.duckdns.org"}`);
  yield* Console.log("");

  const verifier = yield* CloudVerificationService;
  const report = yield* verifier.runFullVerification;

  yield* Console.log(formatReport(report));

  // Exit with non-zero status if unhealthy
  if (report.overallStatus === "unhealthy") {
    return yield* Effect.fail(
      new CloudVerificationError({
        message: "Infrastructure verification failed",
        cause: report,
      })
    );
  }

  return report;
}).pipe(
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Console.error(`\nVerification failed: ${error}`);
      return yield* Effect.die(error);
    })
  )
);

// Run
NodeRuntime.runMain(program.pipe(Effect.provide(AppLayer)));
