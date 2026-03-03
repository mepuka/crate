import { SqlClient, SqlSchema } from "@effect/sql"
import type { Schema } from "effect"
import { Effect } from "effect"
import { MusicKBSqlLive } from "../sql/Sql.js"
import * as AuditSchemas from "./schemas.js"

export class AuditService extends Effect.Service<AuditService>()("AuditService", {
  accessors: true,
  scoped: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    const insertAuditLogQuery = SqlSchema.void(
      {
        Request: AuditSchemas.AuditLog.insert,
        execute: (params) => sql`INSERT INTO audit_log ${sql.insert(params)}`
      }
    )

    const insertAuditLog = (data: Schema.Schema.Type<typeof AuditSchemas.AuditLog.insert>) => insertAuditLogQuery(data)

    return {
      insertAuditLog
    } as const
  }),
  dependencies: [MusicKBSqlLive]
}) {}
