import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { HttpClient } from "@effect/platform"
import { Kexp } from "@crate/domain"

const { KexpProgramsResponse, KexpShowsResponse } = Kexp

// Error types
export class NetworkError extends Error {
  readonly _tag = "NetworkError"
}

export class ParseError extends Error {
  readonly _tag = "ParseError"
}

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError"
}

// Type aliases for better readability
type KexpProgramsResponseType = Schema.Schema.Type<typeof KexpProgramsResponse>
type KexpShowsResponseType = Schema.Schema.Type<typeof KexpShowsResponse>

// Service interface
export class KexpApiService extends Context.Tag("KexpApiService")<
  KexpApiService,
  {
    readonly fetchPrograms: Effect.Effect<
      KexpProgramsResponseType,
      NetworkError | ParseError
    >
    readonly fetchShows: (
      limit: number
    ) => Effect.Effect<KexpShowsResponseType, NetworkError | ParseError>
  }
>() {}

const BASE_URL = "https://api.kexp.org/v2"

export const KexpApiServiceLive = Layer.effect(
  KexpApiService,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient

    const retryPolicy = Schedule.exponential("100 millis").pipe(
      Schedule.compose(Schedule.recurs(3))
    )

    const fetchPrograms = httpClient
      .get(`${BASE_URL}/programs/?format=json`)
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap((json) =>
          Schema.decodeUnknown(KexpProgramsResponse)(json).pipe(
            Effect.mapError((error) => new ParseError(String(error)))
          )
        ),
        Effect.retry(retryPolicy),
        Effect.catchAll((error) =>
          Effect.fail(
            error instanceof ParseError ? error : new NetworkError(String(error))
          )
        )
      )

    const fetchShows = (limit: number) =>
      httpClient
        .get(`${BASE_URL}/shows/?format=json&limit=${limit}`)
        .pipe(
          Effect.flatMap((response) => response.json),
          Effect.flatMap((json) =>
            Schema.decodeUnknown(KexpShowsResponse)(json).pipe(
              Effect.mapError((error) => new ParseError(String(error)))
            )
          ),
          Effect.retry(retryPolicy),
          Effect.catchAll((error) =>
            Effect.fail(
              error instanceof ParseError
                ? error
                : new NetworkError(String(error))
            )
          )
        )

    return {
      fetchPrograms,
      fetchShows
    }
  })
)
