import { BunRuntime } from "@effect/platform-bun"
import { Chunk, Console, Effect, Layer, Stream } from "effect"
import * as MusicBrainzService from "../musicbrainz_api/service.js"

const program = Effect.gen(function*() {
  const mb = yield* MusicBrainzService.MusicBrainzService
  const unresolved = Chunk.toArray(
    yield* mb.processUnresolvedMBArtists({
      limit: 4000
    }).pipe(Stream.runCollect)
  )
  yield* Console.log(unresolved)
})

const AppLayer = Layer.mergeAll(
  MusicBrainzService.MusicBrainzService.Default,
  Layer.scope
)

program.pipe(
  Effect.provide(AppLayer)
).pipe(BunRuntime.runMain)
