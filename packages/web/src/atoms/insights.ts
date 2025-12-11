import { Atom, Result } from "@effect-atom/atom-react";
import { Insights } from "@crate/domain";
import { Effect } from "effect";
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

export const fetchInsightsAction = (playId: number) =>
  Effect.gen(function* (_) {
    const client = yield* _(HttpClient.HttpClient);
    const atom = insightsAtom(playId);

    // Check if already loaded
    const current = yield* _(Atom.get(atom));
    if (Result.isSuccess(current)) return;

    // 1. Set Loading (Digging)
    yield* _(Atom.set(atom, Result.waiting(current)));

    // 2. Fetch API
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    // "Fail Quietly": We catch errors and just set empty/fail without toasting
    const response = yield* _(
      client.get(`${baseUrl}/api/insights/plays/${playId}`),
      Effect.flatMap(res => res.json),
      Effect.map((json: any) => json.insights as Insights.Insight[]),
      Effect.catchAll(_err => {
         // Log error but don't crash UI
         return Effect.succeed([] as Insights.Insight[]); 
      })
    );

    // 3. Set Data
    yield* _(Atom.set(atom, Result.success(response)));
  });
