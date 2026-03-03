import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import type { RequestError, ResponseError } from "@effect/platform/HttpClientError"
import { SqlClient, SqlSchema } from "@effect/sql"
import type { SqlError } from "@effect/sql/SqlError"
import { Array, DateTime, Effect, Schedule, Schema, Stream } from "effect"
import type { ParseError } from "effect/ParseResult"
import { AuditLog, MBArtistFetchMetaData } from "../../audit/schemas.js"
import * as AuditService from "../../audit/service.js"
import { MusicKBSqlLive } from "../../sql/Sql.js"
import * as MBEntities from "../entity_persistence/schemas.js"
import { MbArtistId } from "../entity_persistence/schemas.js"
import * as MBDataService from "../entity_persistence/service.js"
import * as RelationshipService from "../relationships/service.js"
import * as MBSchemas from "./schemas.js"

export class MusicBrainzService extends Effect.Service<MusicBrainzService>()("MusicBrainzService", {
  accessors: true,
  scoped: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const mbData = yield* MBDataService.MBDataService
    const relationshipService = yield* RelationshipService.RelationshipService
    const audit = yield* AuditService.AuditService
    const mbUrlBase = "https://musicbrainz.org/ws/2"

    const MBRElationshipParams = {
      "area": "area-rels",
      "genre": "genre-rels",
      "artist": "artist-rels",
      "instrument": "instrument-rels",
      "work": "work-rels",
      "release": "release-rels",
      "recording": "recording-rels",
      "release-group": "release-group-rels",
      "label": "label-rels"
    }

    const fetchArtist = (
      artistId: string,
      kexpPlayId: number | null,
      userAgent: string = "CrateAPI/1.0 (https://github.com/mkessy)"
    ): Effect.Effect<
      MBSchemas.MBArtistResponse,
      ParseError | RequestError | ResponseError | SqlError | MBDataService.MBQueryError
    > =>
      Effect.gen(function*() {
        const inclString = Object.entries(MBRElationshipParams).map(([_key, value]) => `${value}`).join("+")
        const mbUrl = `${mbUrlBase}/artist/${artistId}?inc=${inclString}&fmt=json`

        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(HttpClientRequest.setHeaders({
            "User-Agent": userAgent,
            "Accept": "application/json"
          })),
          HttpClient.retryTransient({
            schedule: Schedule.exponential("2 seconds"),
            times: 3
          }),
          HttpClient.filterStatusOk
        )

        const response = yield* client.get(
          mbUrl
        ).pipe(
          Effect.catchTag("ResponseError", (error) =>
            sql.withTransaction(Effect.gen(function*() {
              if (error.response.status === 404) {
                yield* Effect.logError(
                  `Artist ${artistId} not found in MusicBrainz API. Deleting from unresolved table.`
                )
                yield* audit.insertAuditLog(AuditLog.insert.make({
                  type: "http_fetch",
                  metadata: MBArtistFetchMetaData.make({
                    type: "musicbrainz_artist_fetch",
                    artist_mb_id: artistId,
                    kexp_play_id: kexpPlayId,
                    mb_url: mbUrl,
                    mb_response: null,
                    status: error.response.status
                  })
                }))
                yield* mbData.deleteUnresolvedMBArtists(MBEntities.MbArtistId.make(artistId))
              }
              return yield* Effect.fail(error)
            }))),
          Effect.tap((response) =>
            audit.insertAuditLog(AuditLog.insert.make({
              type: "http_fetch",
              metadata: MBArtistFetchMetaData.make({
                type: "musicbrainz_artist_fetch",
                artist_mb_id: artistId,
                kexp_play_id: kexpPlayId,
                mb_url: mbUrl,
                mb_response: response.toJSON(),
                status: response.status
              })
            }))
          ),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(MBSchemas.MBArtistResponse))
        )

        return response
      }).pipe(Effect.provide(FetchHttpClient.layer))

    // Fetch artists and extract their relationships
    const fetchArtistWithRelationships = (artistId: string, kexpPlayId: number | null, userAgent: string) =>
      Effect.gen(function*() {
        const { relations, ...artist } = yield* fetchArtist(artistId, kexpPlayId, userAgent)

        const artistInsert = yield* Schema.decode(MBEntities.ArtistMBEntityMaster.insert)({
          artist_mb_id: MBEntities.MbArtistId.make(artist.id),
          artist_aliases: JSON.stringify(artist.aliases ?? []),
          artist_name: artist.name,
          artist_disambiguation: artist.disambiguation ?? null,
          artist_type: artist.type ?? null,
          artist_gender: artist.gender ?? null,
          artist_country: artist.country ?? null,
          artist_life_begin: artist["life-span"]?.begin ?? null,
          artist_life_end: artist["life-span"]?.end ?? null,
          artist_life_ended: artist["life-span"]?.ended ? 1 : 0,
          entity_type: "artist",
          entity_metadata: JSON.stringify(artist),
          entity_mb_id: artist.id,
          relation_type: "artist",

          direction: "forward",
          entity_disambiguation: artist.disambiguation ?? "",
          ended: artist["life-span"]?.ended ? 1 : 0,
          begin_date: artist["life-span"]?.begin ?? null,
          end_date: artist["life-span"]?.end ?? null,
          attribute_type: null,
          created_at: DateTime.formatIsoDateUtc(DateTime.unsafeNow()),
          updated_at: DateTime.formatIsoDateUtc(DateTime.unsafeNow())
        })

        // Process all relationships from all artists
        const allRelationships = yield* MBSchemas.relationsFromMBArtist({ ...artist, relations }, kexpPlayId)

        return {
          artistInsert,
          relationships: allRelationships
        } as const
      })

    const fetchUnresolvedMBArtists = (limit: number = 100) =>
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: MBSchemas.UnresolvedMBArtist,
        execute: (_) =>
          sql`SELECT * FROM ${sql.safe("mb_artist_unresolved")} ORDER BY latest_play DESC LIMIT ${
            sql(limit.toString())
          }`
      })

    const processUnresolvedMBArtists: (config?: {
      limit?: number
    }) => Stream.Stream<
      MBSchemas.UnresolvedMBArtist,
      | ParseError
      | SqlError
      | MBDataService.MBQueryError
      | RelationshipService.RelationshipQueryError
      | RequestError
      | ResponseError,
      never
    > = (config?: {
      limit?: number
    }) =>
      fetchUnresolvedMBArtists(config?.limit)().pipe(
        Stream.fromIterableEffect,
        Stream.tap((unresolved) =>
          Effect.gen(function*() {
            const { artistInsert, relationships } = yield* fetchArtistWithRelationships(
              unresolved.artist_mb_id,
              unresolved.kexp_play_id,
              "CrateAPI/1.0 "
            )

            yield* Effect.logInfo(`Processing unresolved artist: ${unresolved.artist_mb_id} ${unresolved.artist}`)

            const validRelationships = Array.getRights(relationships)

            // Combine all operations in a single transaction
            const artistEntity = yield* sql.withTransaction(
              Effect.gen(function*() {
                // Insert artist entity
                const entity = yield* mbData.insertArtistEntity(artistInsert)

                // Delete unresolved artist
                yield* mbData.deleteUnresolvedMBArtists(MbArtistId.make(unresolved.artist_mb_id))

                // Insert relationships if any exist
                yield* Effect.when(() => validRelationships.length > 0)(
                  relationshipService.insertRelationships(validRelationships).pipe(
                    Effect.tap(() => Effect.logInfo(`Inserted ${validRelationships.length} relationships`))
                  )
                )

                return entity
              })
            )

            // Logging outside transaction
            yield* Effect.logInfo(
              `Inserted and deleted unresolved artist entity: ${artistEntity.artist_mb_id} ${artistEntity.artist_name}`
            )

            return artistEntity
          }).pipe(
            Effect.catchTag("ResponseError", (error) =>
              Effect.gen(function*() {
                if (error.response.status === 404) {
                  yield* Effect.logError(`Artist ${unresolved.artist_mb_id} not found in MusicBrainz API`)
                  return unresolved
                }
                return yield* Effect.fail(error) // Re-throw other errors
              }))
          )
        ),
        Stream.throttle({
          cost: () => 1,
          duration: "1.8 seconds",
          units: 1
        })
      )

    return {
      processUnresolvedMBArtists
    } as const
  }),
  dependencies: [
    MBDataService.MBDataService.Default,
    RelationshipService.RelationshipService.Default,
    AuditService.AuditService.Default,
    MusicKBSqlLive
  ]
}) {}
