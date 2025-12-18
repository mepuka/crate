/**
 * CloudVerificationService
 *
 * Effect service for verifying cloud infrastructure health and running
 * post-deploy smoke tests. Uses Effect's expressive type system to
 * model verification results and compose complex health checks.
 *
 * @module
 */

import { Context, Data, Effect, Layer, Schedule, Schema, Duration, pipe } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";

// =============================================================================
// Configuration
// =============================================================================

export class CloudVerificationConfig extends Context.Tag("CloudVerificationConfig")<
  CloudVerificationConfig,
  {
    readonly faissApiUrl: string;
    readonly cloudRunUrl: string | null;
    readonly timeoutMs: number;
    readonly retryAttempts: number;
  }
>() {
  static readonly Default = Layer.succeed(CloudVerificationConfig, {
    faissApiUrl: process.env.FAISS_API_URL ?? "https://cratemusic.duckdns.org",
    cloudRunUrl: process.env.CLOUD_RUN_URL ?? null,
    timeoutMs: 30000,
    retryAttempts: 3,
  });
}

// =============================================================================
// Errors
// =============================================================================

export class HealthCheckError extends Data.TaggedError("HealthCheckError")<{
  readonly service: string;
  readonly endpoint: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class SmokeTestError extends Data.TaggedError("SmokeTestError")<{
  readonly testName: string;
  readonly expected: string;
  readonly actual: string;
  readonly cause?: unknown;
}> {}

// =============================================================================
// Result Types
// =============================================================================

const HealthStatus = Schema.Literal("healthy", "degraded", "unhealthy");
type HealthStatus = typeof HealthStatus.Type;

export const ServiceHealth = Schema.Struct({
  service: Schema.String,
  status: HealthStatus,
  latencyMs: Schema.Number,
  details: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  checkedAt: Schema.DateFromSelf,
});
export type ServiceHealth = typeof ServiceHealth.Type;

export const SmokeTestResult = Schema.Struct({
  testName: Schema.String,
  passed: Schema.Boolean,
  durationMs: Schema.Number,
  message: Schema.optional(Schema.String),
});
export type SmokeTestResult = typeof SmokeTestResult.Type;

export const VerificationReport = Schema.Struct({
  timestamp: Schema.DateFromSelf,
  overallStatus: HealthStatus,
  services: Schema.Array(ServiceHealth),
  smokeTests: Schema.Array(SmokeTestResult),
  totalDurationMs: Schema.Number,
});
export type VerificationReport = typeof VerificationReport.Type;

// =============================================================================
// FAISS API Health Response Schema
// =============================================================================

const FaissHealthResponse = Schema.Struct({
  status: Schema.String,
  index_loaded: Schema.Boolean,
  database_connected: Schema.Boolean,
  total_vectors: Schema.optional(Schema.Number),
});

const FaissSearchResponse = Schema.Struct({
  results: Schema.Array(Schema.Unknown),
  total: Schema.Number,
  query_time_ms: Schema.Number,
});

const FaissGraphResponse = Schema.Struct({
  query_type: Schema.String,
  total: Schema.Number,
  connections: Schema.Array(Schema.Unknown),
});

// =============================================================================
// Service Interface
// =============================================================================

export interface CloudVerificationServiceInterface {
  /**
   * Check health of FAISS API
   */
  readonly checkFaissHealth: Effect.Effect<
    ServiceHealth,
    HealthCheckError,
    HttpClient.HttpClient
  >;

  /**
   * Run FAISS API smoke tests (search, graph queries)
   */
  readonly runFaissSmokeTests: Effect.Effect<
    SmokeTestResult[],
    SmokeTestError,
    HttpClient.HttpClient
  >;

  /**
   * Run full verification suite and generate report
   */
  readonly runFullVerification: Effect.Effect<
    VerificationReport,
    HealthCheckError | SmokeTestError,
    HttpClient.HttpClient
  >;
}

// =============================================================================
// Service Tag
// =============================================================================

export class CloudVerificationService extends Context.Tag("CloudVerificationService")<
  CloudVerificationService,
  CloudVerificationServiceInterface
>() {}

// =============================================================================
// Implementation
// =============================================================================

const makeCloudVerificationService = Effect.gen(function* () {
  const config = yield* CloudVerificationConfig;

  const withRetry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.retry(
        Schedule.exponential(Duration.millis(500)).pipe(
          Schedule.compose(Schedule.recurs(config.retryAttempts))
        )
      ),
      Effect.timeout(Duration.millis(config.timeoutMs))
    );

  const measureLatency = <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<{ result: A; latencyMs: number }, E, R> =>
    Effect.gen(function* () {
      const start = Date.now();
      const result = yield* effect;
      const latencyMs = Date.now() - start;
      return { result, latencyMs };
    });

  // ---------------------------------------------------------------------------
  // FAISS Health Check
  // ---------------------------------------------------------------------------

  const checkFaissHealth: CloudVerificationServiceInterface["checkFaissHealth"] =
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const url = `${config.faissApiUrl}/api/health`;

      yield* Effect.logInfo(`Checking FAISS API health: ${url}`);

      const { result: response, latencyMs } = yield* measureLatency(
        pipe(
          HttpClientRequest.get(url),
          client.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(FaissHealthResponse)),
          withRetry
        )
      ).pipe(
        Effect.mapError((cause) =>
          new HealthCheckError({
            service: "faiss-api",
            endpoint: url,
            message: "Failed to reach FAISS API health endpoint",
            cause,
          })
        )
      );

      const status: HealthStatus =
        response.status === "ok" && response.index_loaded && response.database_connected
          ? "healthy"
          : response.status === "ok"
            ? "degraded"
            : "unhealthy";

      yield* Effect.logInfo(
        `FAISS API health: ${status} (${latencyMs}ms, vectors: ${response.total_vectors ?? "unknown"})`
      );

      return {
        service: "faiss-api",
        status,
        latencyMs,
        details: {
          indexLoaded: response.index_loaded,
          databaseConnected: response.database_connected,
          totalVectors: response.total_vectors ?? 0,
        },
        checkedAt: new Date(),
      };
    });

  // ---------------------------------------------------------------------------
  // FAISS Smoke Tests
  // ---------------------------------------------------------------------------

  const runFaissSmokeTests: CloudVerificationServiceInterface["runFaissSmokeTests"] =
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const results: SmokeTestResult[] = [];

      // Test 1: Semantic Search
      const searchTest = yield* Effect.gen(function* () {
        const start = Date.now();
        const url = `${config.faissApiUrl}/api/search`;

        const response = yield* pipe(
          HttpClientRequest.post(url),
          HttpClientRequest.setHeader("Content-Type", "application/json"),
          HttpClientRequest.bodyJson({ query: "seattle grunge rock", limit: 5 }),
          Effect.flatMap(client.execute),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(FaissSearchResponse)),
          withRetry
        ).pipe(
          Effect.mapError((cause) =>
            new SmokeTestError({
              testName: "semantic-search",
              expected: "search results with total > 0",
              actual: `request failed: ${String(cause)}`,
              cause,
            })
          )
        );

        const durationMs = Date.now() - start;
        const passed = response.total > 0 && response.results.length > 0;

        return {
          testName: "semantic-search",
          passed,
          durationMs,
          message: passed
            ? `Found ${response.total} results in ${response.query_time_ms}ms`
            : `No results returned (total: ${response.total})`,
        };
      }).pipe(Effect.catchAll((e) => Effect.succeed({
        testName: "semantic-search",
        passed: false,
        durationMs: 0,
        message: `Error: ${e.message}`,
      })));

      results.push(searchTest);

      // Test 2: Graph Connections
      const graphTest = yield* Effect.gen(function* () {
        const start = Date.now();
        const url = `${config.faissApiUrl}/api/graph/connections`;

        // Radiohead MBID for testing
        const response = yield* pipe(
          HttpClientRequest.post(url),
          HttpClientRequest.setHeader("Content-Type", "application/json"),
          HttpClientRequest.bodyJson({
            query_type: "band_members",
            mbids: ["a74b1b7f-71a5-4011-9441-d0b5e4122711"],
            limit: 10,
          }),
          Effect.flatMap(client.execute),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(FaissGraphResponse)),
          withRetry
        ).pipe(
          Effect.mapError((cause) =>
            new SmokeTestError({
              testName: "graph-connections",
              expected: "graph query response with results",
              actual: `request failed: ${String(cause)}`,
              cause,
            })
          )
        );

        const durationMs = Date.now() - start;
        const passed = response.query_type === "band_members";

        return {
          testName: "graph-connections",
          passed,
          durationMs,
          message: passed
            ? `Graph query returned ${response.total} results`
            : `Unexpected query_type: ${response.query_type}`,
        };
      }).pipe(Effect.catchAll((e) => Effect.succeed({
        testName: "graph-connections",
        passed: false,
        durationMs: 0,
        message: `Error: ${e.message}`,
      })));

      results.push(graphTest);

      // Test 3: Play retrieval
      const playTest = yield* Effect.gen(function* () {
        const start = Date.now();
        const url = `${config.faissApiUrl}/api/plays/1`;

        const response = yield* pipe(
          HttpClientRequest.get(url),
          client.execute,
          Effect.flatMap((r) => r.json),
          withRetry
        ).pipe(
          Effect.mapError((cause) =>
            new SmokeTestError({
              testName: "play-retrieval",
              expected: "play object with play_id",
              actual: `request failed: ${String(cause)}`,
              cause,
            })
          )
        );

        const durationMs = Date.now() - start;
        const hasId = typeof response === "object" && response !== null && "id" in response;

        return {
          testName: "play-retrieval",
          passed: hasId,
          durationMs,
          message: hasId
            ? `Retrieved play ID: ${(response as { id: number }).id}`
            : "Response missing id field",
        };
      }).pipe(Effect.catchAll((e) => Effect.succeed({
        testName: "play-retrieval",
        passed: false,
        durationMs: 0,
        message: `Error: ${e.message}`,
      })));

      results.push(playTest);

      // Check if any critical tests failed
      const criticalFailures = results.filter((r) => !r.passed && r.testName === "semantic-search");
      if (criticalFailures.length > 0) {
        yield* Effect.logWarning(
          `Critical smoke test failed: ${criticalFailures.map((f) => f.testName).join(", ")}`
        );
      }

      return results;
    });

  // ---------------------------------------------------------------------------
  // Full Verification
  // ---------------------------------------------------------------------------

  const runFullVerification: CloudVerificationServiceInterface["runFullVerification"] =
    Effect.gen(function* () {
      const start = Date.now();
      yield* Effect.logInfo("Starting full cloud verification");

      // Run health checks
      const faissHealth = yield* checkFaissHealth.pipe(
        Effect.catchAll((e) =>
          Effect.succeed({
            service: "faiss-api",
            status: "unhealthy" as const,
            latencyMs: 0,
            details: { error: e.message },
            checkedAt: new Date(),
          })
        )
      );

      const services: ServiceHealth[] = [faissHealth];

      // Run smoke tests only if services are healthy/degraded
      const smokeTests: SmokeTestResult[] = yield* Effect.gen(function* () {
        if (faissHealth.status === "unhealthy") {
          yield* Effect.logWarning("Skipping smoke tests - FAISS API unhealthy");
          return [];
        }
        return yield* runFaissSmokeTests.pipe(
          Effect.catchAll(() => Effect.succeed([]))
        );
      });

      const totalDurationMs = Date.now() - start;

      // Determine overall status
      const allHealthy = services.every((s) => s.status === "healthy");
      const anyUnhealthy = services.some((s) => s.status === "unhealthy");
      const allTestsPassed = smokeTests.every((t) => t.passed);

      const overallStatus: HealthStatus = anyUnhealthy
        ? "unhealthy"
        : !allHealthy || !allTestsPassed
          ? "degraded"
          : "healthy";

      yield* Effect.logInfo(
        `Verification complete: ${overallStatus} (${totalDurationMs}ms)`
      );

      return {
        timestamp: new Date(),
        overallStatus,
        services,
        smokeTests,
        totalDurationMs,
      };
    });

  return {
    checkFaissHealth,
    runFaissSmokeTests,
    runFullVerification,
  } satisfies CloudVerificationServiceInterface;
});

// =============================================================================
// Layers
// =============================================================================

export const CloudVerificationServiceLive: Layer.Layer<
  CloudVerificationService,
  never,
  CloudVerificationConfig
> = Layer.effect(CloudVerificationService, makeCloudVerificationService);

export const CloudVerificationServiceWithDefaults: Layer.Layer<
  CloudVerificationService,
  never,
  HttpClient.HttpClient
> = CloudVerificationServiceLive.pipe(Layer.provide(CloudVerificationConfig.Default));
