import { Data } from "effect"

// API Errors
export class TimelineApiError extends Data.TaggedError("TimelineApiError")<{
  readonly cause: unknown
  readonly context?: string
}> {}

export class SearchApiError extends Data.TaggedError("SearchApiError")<{
  readonly cause: unknown
  readonly query: string
}> {}

export class PlayNotFoundError extends Data.TaggedError("PlayNotFoundError")<{
  readonly playId: number
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly cause: unknown
  readonly url: string
}> {}

// Validation Errors
export class InvalidCursorError extends Data.TaggedError("InvalidCursorError")<{
  readonly cursor: string
}> {}

export class InvalidPercentageError extends Data.TaggedError("InvalidPercentageError")<{
  readonly percentage: number
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly errors: string[]
}> {}
