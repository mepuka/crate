import { Atom } from "@effect-atom/atom-react";
import { FetchLatestLive, TimelineKVS } from "@/lib/http-runtime";
import { Effect, Layer } from "effect";
import { TimelineRuntime } from "@/lib/http-runtime";

// Atom that launches the background fetching service
export const latestItemAtom = Atom.runtime((_get) =>
  Effect.gen(function* () {
    yield* Layer.launch(FetchLatestLive);
  }).pipe(Layer.effectDiscard)
);

/**
 * Reactive atom for the last seen play.
 * Automatically updates when TimelineKVS invalidates "timeline:last_seen_id" or "timeline:play" keys.
 *
 * According to Effect Atom docs: https://github.com/tim-smart/effect-atom?tab=readme-ov-file#integration-with-reactivity-from-effectexperimental
 * We use runtime.atom(effect) with Atom.withReactivity() - the effect should be a regular Effect, not a Stream.
 */
export const lastSeenPlayAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getLastSeenPlay();
  })
).pipe(Atom.withReactivity(["timeline:last_seen_id", "timeline:play"]));

/**
 * Reactive atom for a specific play by ID.
 * Automatically updates when TimelineKVS invalidates the play's reactivity key.
 */
export const playAtom = Atom.family((id: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const timelineKVS = yield* TimelineKVS;
      return yield* timelineKVS.getPlay(id);
    })
  ).pipe(Atom.withReactivity([`timeline:play:${id}`]))
);

/**
 * Reactive atom for the last seen play ID.
 * Automatically updates when TimelineKVS invalidates "timeline:last_seen_id" key.
 */
export const lastSeenIdAtom = TimelineRuntime.atom(
  Effect.gen(function* () {
    const timelineKVS = yield* TimelineKVS;
    return yield* timelineKVS.getLastSeenId();
  })
).pipe(Atom.withReactivity(["timeline:last_seen_id"]));
