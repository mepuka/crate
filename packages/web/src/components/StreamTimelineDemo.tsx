/**
 * Stream Timeline Demo
 *
 * Demonstrates the new stream-based timeline architecture.
 * Shows both cursor pagination and mock SSE streams side-by-side.
 *
 * This is a separate component that doesn't interfere with existing timeline.
 */

import { useAtomValue, Result } from "@effect-atom/atom-react";
import {
  streamPlaysAtom,
  streamPlayCountAtom,
  streamStatusAtom,
} from "@/atoms/timeline-stream-atoms";
import { StreamTestControls } from "@/components/StreamTestControls";
import type { PlayResult } from "@crate/api";
import { Chunk } from "effect";

function PlayCard({ play }: { play: PlayResult }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {/* Album Art */}
        {play.image_uri && (
          <img
            src={play.image_uri}
            alt={play.album ?? "Album art"}
            className="w-16 h-16 rounded-md object-cover flex-shrink-0"
          />
        )}

        {/* Play Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate">
            {play.song}
          </div>
          <div className="text-sm text-gray-600 truncate">{play.artist}</div>
          <div className="text-xs text-gray-500 truncate mt-1">
            {play.album}
          </div>

          {/* Metadata */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {play.is_local && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                Local
              </span>
            )}
            {play.is_request && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                Request
              </span>
            )}
            {play.is_live && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                Live
              </span>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-xs text-gray-500 flex-shrink-0">
          {play.airdate && new Date(play.airdate).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function PlayList({ plays }: { plays: readonly PlayResult[] }) {
  if (plays.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No plays loaded yet. Start a stream to see results.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plays.map((play) => (
        <PlayCard key={play.id} play={play} />
      ))}
    </div>
  );
}

export function StreamTimelineDemo() {
  const status = useAtomValue(streamStatusAtom);
  const playCount = useAtomValue(streamPlayCountAtom);
  const playsResult = useAtomValue(streamPlaysAtom);

  // Convert Result<Chunk<PlayResult>> to readonly PlayResult[]
  // Effect Atom handles reactivity - no need for useEffect + local state
  const plays = Result.matchWithWaiting(playsResult, {
    onWaiting: () => [] as readonly PlayResult[],
    onSuccess: (s) => Chunk.toReadonlyArray(s.value),
    onError: (e) => {
      console.error("[StreamTimelineDemo] Error loading plays:", e);
      return [] as readonly PlayResult[];
    },
    onDefect: (d) => {
      console.error("[StreamTimelineDemo] Defect loading plays:", d);
      return [] as readonly PlayResult[];
    },
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Stream Timeline Demo
        </h1>
        <p className="text-gray-600">
          Experimental stream-based timeline architecture (Phase 1)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Panel */}
        <div className="lg:col-span-1">
          <StreamTestControls />
        </div>

        {/* Timeline Display */}
        <div className="lg:col-span-2">
          <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Timeline Stream</h2>
              <div className="text-sm text-gray-600">
                {playCount} {playCount === 1 ? "play" : "plays"}
              </div>
            </div>

            {/* Error State */}
            {/* @ts-ignore */}
            {status.status === "error" && "error" in status && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
                <div className="font-semibold mb-2">Stream Error</div>
                {/* @ts-ignore */}
                <div className="text-sm">{String(status.error)}</div>
              </div>
            )}

            {/* Streaming indicator */}
            {/* @ts-ignore */}
            {status.status === "loading" && plays.length > 0 && (
              <div className="mb-4 flex items-center gap-2 text-sm text-blue-600">
                <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
                <span>Streaming plays...</span>
              </div>
            )}

            {/* Play List - show during loading and after */}
            {plays.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Timeline ({plays.length} {plays.length === 1 ? "play" : "plays"})
                </h3>
                <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
                  <PlayList plays={plays} />
                </div>
              </div>
            )}

            {/* Empty State */}
            {/* @ts-ignore */}
            {status.status !== "error" && plays.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-400 text-5xl mb-4">🎵</div>
                <div className="text-gray-600 font-medium mb-2">
                  {/* @ts-ignore */}
                  {status.status === "loading" ? "Waiting for plays..." : "No plays loaded"}
                </div>
                <div className="text-sm text-gray-500">
                  {/* @ts-ignore */}
                  {status.status === "loading"
                    ? "Stream is starting..."
                    : "Select a stream mode and click \"Restart Stream\" to begin"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Architecture Info */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          Stream Architecture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-blue-800 mb-2">
              Pure Stream Layer
            </h4>
            <ul className="text-blue-700 space-y-1">
              <li>• Stream.paginateEffect for cursor pagination</li>
              <li>• Stream.unfold for SSE simulation</li>
              <li>• No state management in streams</li>
              <li>• Built-in retry and logging</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 mb-2">
              Reactive Atoms
            </h4>
            <ul className="text-blue-700 space-y-1">
              <li>• Atoms consume stream results</li>
              <li>• TimelineKVS integration (shared storage)</li>
              <li>• Automatic reactivity via Effect Atom</li>
              <li>• Mode switching (pagination / SSE / off)</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-2">Implementation Files</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-blue-700 font-mono">
            <div>src/streams/timeline-pagination-stream.ts</div>
            <div>src/streams/timeline-mock-sse-stream.ts</div>
            <div>src/atoms/timeline-stream-atoms.ts</div>
            <div>src/utils/mock-play-generator.ts</div>
          </div>
        </div>
      </div>
    </div>
  );
}
