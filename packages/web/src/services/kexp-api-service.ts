import { Context, Data, Effect, Layer, Schedule, Schema } from "effect";
import { HttpClient } from "@effect/platform";
import { Kexp } from "@crate/domain";

const { KexpProgramsResponse, KexpShowsResponse } = Kexp;

// Error types
export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly url: string;
  readonly cause: unknown;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

// Type aliases for better readability
type KexpProgramsResponseType = Schema.Schema.Type<typeof KexpProgramsResponse>;
type KexpShowsResponseType = Schema.Schema.Type<typeof KexpShowsResponse>;

// Service interface
export class KexpApiService extends Context.Tag("KexpApiService")<
  KexpApiService,
  {
    readonly fetchPrograms: Effect.Effect<
      KexpProgramsResponseType,
      NetworkError | ParseError
    >;
    readonly fetchShows: (
      limit: number
    ) => Effect.Effect<KexpShowsResponseType, NetworkError | ParseError>;
  }
>() {}

const BASE_URL = "https://api.kexp.org/v2";

const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.intersect(Schedule.recurs(3))
);

export const KexpApiServiceLive = Layer.effect(
  KexpApiService,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    const fetchPrograms = httpClient
      .get(`${BASE_URL}/programs/?format=json`)
      .pipe(
        Effect.withSpan("kexp.fetchPrograms", {
          kind: "client",
          captureStackTrace: false,
        }),
        Effect.withTracerEnabled(false), // Disable tracing to avoid CORS issues
        Effect.flatMap((response) => response.json),
        Effect.flatMap((json) =>
          Schema.decodeUnknown(KexpProgramsResponse)(json).pipe(
            Effect.mapError(
              (error) =>
                new ParseError({
                  message: "Failed to parse KEXP programs response",
                  cause: error,
                })
            )
          )
        ),
        Effect.retry(retryPolicy),
        Effect.catchAll((error) =>
          Effect.fail(
            error instanceof ParseError
              ? error
              : new NetworkError({
                  url: `${BASE_URL}/programs/?format=json`,
                  cause: error,
                })
          )
        )
      );

    const fetchShows = (limit: number) =>
      httpClient.get(`${BASE_URL}/shows/?format=json&limit=${limit}`).pipe(
        Effect.withSpan("kexp.fetchShows", {
          kind: "client",
          captureStackTrace: false,
        }),
        Effect.withTracerEnabled(false), // Disable tracing to avoid CORS issues
        Effect.flatMap((response) => response.json),
        Effect.flatMap((json) =>
          Schema.decodeUnknown(KexpShowsResponse)(json).pipe(
            Effect.mapError(
              (error) =>
                new ParseError({
                  message: "Failed to parse KEXP shows response",
                  cause: error,
                })
            )
          )
        ),
        Effect.retry(retryPolicy),
        Effect.catchAll((error) =>
          Effect.fail(
            error instanceof ParseError
              ? error
              : new NetworkError({
                  url: `${BASE_URL}/shows/?format=json&limit=${limit}`,
                  cause: error,
                })
          )
        )
      );

    return KexpApiService.of({
      fetchPrograms,
      fetchShows,
    });
  })
);
