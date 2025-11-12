import { Reactivity } from "@effect/experimental"
import { BunContext } from "@effect/platform-bun"
import { SqlClient } from "@effect/sql"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { fromFileSystem } from "@effect/sql/Migrator/FileSystem"
import { Effect, Layer } from "effect"
import { DomainConfig, DomainConfigLive } from "../config/DomainConfig.js"

/**
 * Creates a SQLite client layer using configuration from DomainConfig.
 * This layer depends on DomainConfig to get the database path.
 */
const MusicKBClientLive = Layer.effect(
  SqlClient.SqlClient,
  Effect.gen(function*() {
    const config = yield* DomainConfig
    const dbSettings = yield* config.getDatabaseSettings
    yield* Effect.log(dbSettings)

    return yield* SqliteClient.make({
      filename: dbSettings.path,
      create: true,
      readwrite: true
    })
  })
)

export const MusicKBMigratorLive = Effect.gen(function*() {
  const config = yield* DomainConfig
  const dbSettings = yield* config.getDatabaseSettings
  yield* Effect.log("SETTINGS: ", dbSettings)

  return SqliteMigrator.layer({
    loader: fromFileSystem(dbSettings.migrationsPath),
    schemaDirectory: dbSettings.migrationsPath
  })
}).pipe(
  Layer.unwrapEffect,
  Layer.provide(BunContext.layer),
  Layer.provide(MusicKBClientLive),
  Layer.provide(DomainConfigLive),
  Layer.provide(Reactivity.layer)
)

export const MusicKBSqlLive = MusicKBClientLive.pipe(
  Layer.provide(DomainConfigLive),
  Layer.provide(Reactivity.layer)
)
