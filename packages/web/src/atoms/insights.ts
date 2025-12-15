import { Atom, Result } from "@effect-atom/atom-react";
import { Insights } from "@crate/domain";
import { PlayInsightsResponse } from "@crate/domain/faiss/enrichment";
import { Effect, Schema, Array as A, pipe } from "effect";
import { HttpClient } from "@effect/platform";

// State: Result<Insight[]>
// - Initial: Result.initial()
// - Loading: Result.waiting(prev)
// - Success: Result.success(data)
// - Error: Result.fail(error)
export const insightsAtom = Atom.family((_playId: number) =>
  Atom.make<Result.Result<Insights.Insight[]>>(Result.initial())
);

// Derived: Status for the "Spectrum Notch"
export type NotchState = "idle" | "digging" | "ready" | "empty" | "error";

export const notchStateAtom = Atom.family((playId: number) =>
  Atom.make((get) => {
    const result = get(insightsAtom(playId));
    return Result.matchWithWaiting(result, {
      onWaiting: () => "digging" as NotchState,
      onSuccess: (success) => (success.value.length > 0 ? "ready" : "empty") as NotchState,
      onError: () => "error" as NotchState,
      onDefect: () => "error" as NotchState
    });
  })
);

/** Decode raw insight data from InsightRecord.data field */
const decodeInsightData = (data: unknown): Insights.Insight | null => {
  const result = Schema.decodeUnknownEither(Insights.Insight)(data);
  return result._tag === "Right" ? result.right : null;
};

export const fetchInsightsAction = (playId: number) =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient);
    const atom = insightsAtom(playId);

    // Check if already loaded
    const current = yield* _(Atom.get(atom));
    if (Result.isSuccess(current)) return;

    // 1. Set Loading (Digging)
    yield* _(Atom.set(atom, Result.waiting(current)));

    // 2. Fetch and validate API response
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    const insights = yield* _(
      client.get(`${baseUrl}/api/insights/plays/${playId}`),
      Effect.flatMap(res => res.json),
      // Validate response structure with Schema
      Effect.flatMap(json =>
        Schema.decodeUnknown(PlayInsightsResponse)(json)
      ),
      // Extract and decode the insight data from each record
      Effect.map(response => pipe(
        response.insights,
        A.map(record => decodeInsightData(record.data)),
        A.filter((insight): insight is Insights.Insight => insight !== null)
      )),
      // Fail quietly - return empty array on any error
      Effect.catchAll(() => Effect.succeed([] as Insights.Insight[]))
    );

    // 3. Set Data
    yield* _(Atom.set(atom, Result.success(insights)));
  });
