import { SqlClient, SqlSchema } from "@effect/sql"
import { Effect } from "effect"
import { FactPlays } from "../data/schemas/fact-tables.js"
import { MusicKBSqlLive } from "../sql/Sql.js"

export class FactPlaysRepo extends Effect.Service<FactPlaysRepo>()(
  "FactPlaysRepo",
  {
    scoped: Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const upsert = SqlSchema.single({
        Request: FactPlays.insert,
        Result: FactPlays.insert,
        execute: (request) => sql`INSERT INTO fact_plays ${sql.insert(request)} RETURNING *`
      })

      return { upsert } as const
    }),
    dependencies: [MusicKBSqlLive]
  }
) {}
