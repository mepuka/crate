import { Schema } from "effect"
import { Kexp } from "@crate/domain"

const { KexpProgram, KexpShow } = Kexp

// Request messages (main → worker)
export const FetchProgramsRequest = Schema.Struct({
  type: Schema.Literal("fetch-programs")
})
export type FetchProgramsRequest = Schema.Schema.Type<typeof FetchProgramsRequest>

export const FetchShowsRequest = Schema.Struct({
  type: Schema.Literal("fetch-shows"),
  limit: Schema.Number
})
export type FetchShowsRequest = Schema.Schema.Type<typeof FetchShowsRequest>

export const GetShowInfoRequest = Schema.Struct({
  type: Schema.Literal("get-show-info"),
  showId: Schema.Number
})
export type GetShowInfoRequest = Schema.Schema.Type<typeof GetShowInfoRequest>

export const WorkerRequest = Schema.Union(
  FetchProgramsRequest,
  FetchShowsRequest,
  GetShowInfoRequest
)
export type WorkerRequest = Schema.Schema.Type<typeof WorkerRequest>

// Response messages (worker → main)
export const ProgramsData = Schema.Struct({
  type: Schema.Literal("programs-data"),
  programs: Schema.Array(KexpProgram),
  cached: Schema.Boolean,
  timestamp: Schema.String
})
export type ProgramsData = Schema.Schema.Type<typeof ProgramsData>

export const ShowsData = Schema.Struct({
  type: Schema.Literal("shows-data"),
  shows: Schema.Array(KexpShow),
  cached: Schema.Boolean,
  timestamp: Schema.String
})
export type ShowsData = Schema.Schema.Type<typeof ShowsData>

export const ShowInfoResponse = Schema.Struct({
  type: Schema.Literal("show-info"),
  show: Schema.NullOr(KexpShow),
  program: Schema.NullOr(KexpProgram)
})
export type ShowInfoResponse = Schema.Schema.Type<typeof ShowInfoResponse>

export const ErrorResponse = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.String,
  requestType: Schema.String
})
export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponse>

export const WorkerResponse = Schema.Union(
  ProgramsData,
  ShowsData,
  ShowInfoResponse,
  ErrorResponse
)
export type WorkerResponse = Schema.Schema.Type<typeof WorkerResponse>
