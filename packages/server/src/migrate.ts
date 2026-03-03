import { BunRuntime } from "@effect/platform-bun"
import { SqlClient } from "@effect/sql"
import { Effect, Layer } from "effect"
import { MusicKBMigratorLive, MusicKBSqlLive } from "./sql/Sql.js"

const MigrationLayer = Layer.mergeAll(
  MusicKBMigratorLive,
  MusicKBSqlLive
)

const runMigrations = Effect.scoped(
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    yield* sql.unsafe(`SELECT 1`)
  }).pipe(
    Effect.provide(MigrationLayer)
  )
)

runMigrations.pipe(BunRuntime.runMain)
