/**
 * Cloud Verification Tests
 *
 * Integration tests that verify cloud infrastructure is healthy and operational.
 * These tests run against the deployed services (FAISS API, Cloud Run) and
 * validate critical functionality for production confidence.
 *
 * Run locally: FAISS_API_URL=https://cratemusic.duckdns.org pnpm exec vitest run test/cloud-verification.test.ts
 * Run in CI: Part of agent-ci.yml verify-integration job
 *
 * Note: Tests share a single verification run to minimize API calls and reduce test time.
 *
 * @module
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Effect, Layer, Exit } from "effect";
import { FetchHttpClient } from "@effect/platform";
import {
  CloudVerificationService,
  CloudVerificationServiceLive,
  CloudVerificationConfig,
  type VerificationReport,
} from "../src/services/CloudVerificationService.js";

// =============================================================================
// Test Configuration Layer
// =============================================================================

const TestConfig = Layer.succeed(CloudVerificationConfig, {
  faissApiUrl: process.env.FAISS_API_URL ?? "https://cratemusic.duckdns.org",
  cloudRunUrl: process.env.CLOUD_RUN_URL ?? null,
  timeoutMs: 60000, // 60s for CI
  retryAttempts: 2,
});

const TestLayer = CloudVerificationServiceLive.pipe(
  Layer.provide(TestConfig),
  Layer.provideMerge(FetchHttpClient.layer)
);

// =============================================================================
// Shared Verification Report (run once before all tests)
// =============================================================================

let report: VerificationReport;

beforeAll(async () => {
  const program = Effect.gen(function* () {
    const verifier = yield* CloudVerificationService;
    return yield* verifier.runFullVerification;
  }).pipe(Effect.provide(TestLayer));

  const exit = await Effect.runPromiseExit(program);
  if (Exit.isFailure(exit)) {
    throw new Error(`Verification failed: ${exit.cause}`);
  }
  report = exit.value;
}, 180000); // 3 min setup timeout

// =============================================================================
// Health Check Tests
// =============================================================================

describe("Cloud Infrastructure Health", () => {
  it("FAISS API is healthy and responsive", () => {
    const faissHealth = report.services.find((s) => s.service === "faiss-api");

    expect(faissHealth).toBeDefined();
    expect(faissHealth!.service).toBe("faiss-api");
    expect(["healthy", "degraded"]).toContain(faissHealth!.status);
    expect(faissHealth!.latencyMs).toBeLessThan(30000);
    expect(faissHealth!.checkedAt).toBeInstanceOf(Date);

    // Verify critical details
    if (faissHealth!.details) {
      expect(faissHealth!.details.indexLoaded).toBe(true);
      expect(faissHealth!.details.databaseConnected).toBe(true);
      expect(typeof faissHealth!.details.totalVectors).toBe("number");
      expect(faissHealth!.details.totalVectors).toBeGreaterThan(2000000); // ~2.2M vectors
    }
  });
});

// =============================================================================
// Smoke Tests
// =============================================================================

describe("Cloud Smoke Tests", () => {
  it("semantic search returns results", () => {
    const searchTest = report.smokeTests.find((r) => r.testName === "semantic-search");

    expect(searchTest).toBeDefined();
    expect(searchTest!.passed).toBe(true);
    expect(searchTest!.durationMs).toBeLessThan(60000);
    console.log(`Search test: ${searchTest!.message}`);
  });

  it("graph connections query works", () => {
    const graphTest = report.smokeTests.find((r) => r.testName === "graph-connections");

    expect(graphTest).toBeDefined();
    expect(graphTest!.passed).toBe(true);
    console.log(`Graph test: ${graphTest!.message}`);
  });

  it("play retrieval works", () => {
    const playTest = report.smokeTests.find((r) => r.testName === "play-retrieval");

    expect(playTest).toBeDefined();
    expect(playTest!.passed).toBe(true);
    console.log(`Play test: ${playTest!.message}`);
  });
});

// =============================================================================
// Full Verification Suite
// =============================================================================

describe("Full Verification Report", () => {
  it("generates comprehensive verification report", () => {
    // Report structure
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(["healthy", "degraded", "unhealthy"]).toContain(report.overallStatus);
    expect(report.services.length).toBeGreaterThan(0);
    expect(report.totalDurationMs).toBeGreaterThan(0);

    // Overall status should be healthy or degraded for a working deployment
    expect(["healthy", "degraded"]).toContain(report.overallStatus);

    // All smoke tests should pass
    const failedTests = report.smokeTests.filter((t) => !t.passed);
    if (failedTests.length > 0) {
      console.warn(`Failed tests: ${failedTests.map((t) => `${t.testName}: ${t.message}`).join(", ")}`);
    }

    // At most one non-critical test can fail
    expect(failedTests.length).toBeLessThanOrEqual(1);

    console.log(`Verification complete: ${report.overallStatus} in ${report.totalDurationMs}ms`);
    console.log(`Services: ${report.services.map((s) => `${s.service}=${s.status}`).join(", ")}`);
    console.log(`Tests: ${report.smokeTests.filter((t) => t.passed).length}/${report.smokeTests.length} passed`);
  });
});

// =============================================================================
// Production Readiness Gate
// =============================================================================

describe("Production Readiness", () => {
  it("deployment meets production criteria", () => {
    // Production criteria:
    // 1. FAISS API must be healthy
    const faissHealth = report.services.find((s) => s.service === "faiss-api");
    expect(faissHealth).toBeDefined();
    expect(faissHealth!.status).toBe("healthy");

    // 2. Vector index must be loaded with expected size
    if (faissHealth!.details) {
      expect(faissHealth!.details.indexLoaded).toBe(true);
      expect(faissHealth!.details.totalVectors).toBeGreaterThan(2000000);
    }

    // 3. Critical smoke tests must pass
    const criticalTests = ["semantic-search", "play-retrieval"];
    for (const testName of criticalTests) {
      const test = report.smokeTests.find((t) => t.testName === testName);
      expect(test).toBeDefined();
      expect(test!.passed).toBe(true);
    }

    // 4. Response times must be acceptable
    expect(faissHealth!.latencyMs).toBeLessThan(30000); // Health check < 30s

    console.log("Production readiness criteria: PASSED");
  });
});
