/**
 * Stream Test Controls
 *
 * UI controls for manually testing stream-based timeline.
 * Allows switching between different stream modes and monitoring status.
 */

import { useAtomValue, useAtom } from "@effect-atom/atom-react";
import { useState } from "react";
import {
  streamStatusAtom,
  streamPlayCountAtom,
  streamModeAtom,
  restartStreamAtom,
  stopStreamAtom,
  switchStreamModeAtom,
  type StreamMode,
} from "@/atoms/timeline-stream-atoms";

export function StreamTestControls() {
  const status = useAtomValue(streamStatusAtom);
  const mode = useAtomValue(streamModeAtom);
  const playCount = useAtomValue(streamPlayCountAtom);

  const [, restart] = useAtom(restartStreamAtom);
  const [, stop] = useAtom(stopStreamAtom);
  const [, switchMode] = useAtom(switchStreamModeAtom);

  const [limit, setLimit] = useState(20);
  const [maxPages, setMaxPages] = useState(5);
  const [emitInterval, setEmitInterval] = useState(2000);
  const [maxPlays, setMaxPlays] = useState(100);

  const handleModeChange = (newMode: StreamMode) => {
    switchMode(newMode);
  };

  const handleRestart = () => {
    restart({
      mode,
      paginationParams: { limit },
      sseConfig: { emitIntervalMs: emitInterval, maxPlays },
      maxPages,
    });
  };

  const handleStop = () => {
    stop();
  };

  // Status checks for future implementation (loading, error states not yet implemented)
  // @ts-ignore - Placeholder for future status states
  const statusColor = (() => {
    // @ts-ignore
    if (status.status === "loading") return "text-yellow-600";
    // @ts-ignore
    if (status.status === "complete") return "text-green-600";
    // @ts-ignore
    if (status.status === "error") return "text-red-600";
    return "text-gray-500";
  })();

  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-sm">
      <h2 className="text-xl font-bold mb-4">Stream Test Controls</h2>

      {/* Status Display */}
      <div className="mb-6 p-4 bg-gray-50 rounded-md">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-sm text-gray-600">Status</div>
            <div className={`text-lg font-semibold ${statusColor}`}>
              {status.status.toUpperCase()}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-600">Mode</div>
            <div className="text-lg font-semibold text-blue-600">
              {mode.toUpperCase()}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-600">Plays Collected</div>
            <div className="text-lg font-semibold text-purple-600">
              {playCount}
            </div>
          </div>
        </div>

        {status.status === "complete" && "count" in status && (
          <div className="mt-2 text-sm text-gray-600">
            Stream completed with {status.count} plays
          </div>
        )}

        {/* @ts-ignore - Error status not yet implemented */}
        {status.status === "error" && "error" in status && (
          <div className="mt-2 text-sm text-red-600">
            {/* @ts-ignore */}
            Error: {String(status.error)}
          </div>
        )}
      </div>

      {/* Mode Selection */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Stream Mode
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleModeChange("off")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "off"
                ? "bg-gray-800 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Off
          </button>
          <button
            onClick={() => handleModeChange("pagination")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "pagination"
                ? "bg-blue-600 text-white"
                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
            }`}
          >
            Pagination
          </button>
          <button
            onClick={() => handleModeChange("mock-sse")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "mock-sse"
                ? "bg-green-600 text-white"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            Mock SSE
          </button>
          <button
            onClick={() => handleModeChange("burst-sse")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "burst-sse"
                ? "bg-purple-600 text-white"
                : "bg-purple-100 text-purple-700 hover:bg-purple-200"
            }`}
          >
            Burst SSE
          </button>
        </div>
      </div>

      {/* Pagination Settings */}
      {mode === "pagination" && (
        <div className="mb-6 p-4 bg-blue-50 rounded-md">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Pagination Settings
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Limit (plays per page)
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min={1}
                max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Max Pages
              </label>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                min={1}
                max={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* SSE Settings */}
      {(mode === "mock-sse" || mode === "burst-sse") && (
        <div className="mb-6 p-4 bg-green-50 rounded-md">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            SSE Settings
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Emit Interval (ms)
              </label>
              <input
                type="number"
                value={emitInterval}
                onChange={(e) => setEmitInterval(Number(e.target.value))}
                min={100}
                max={10000}
                step={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Max Plays
              </label>
              <input
                type="number"
                value={maxPlays}
                onChange={(e) => setMaxPlays(Number(e.target.value))}
                min={1}
                max={1000}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleRestart}
          disabled={mode === "off"}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Restart Stream
        </button>
        <button
          onClick={handleStop}
          disabled={mode === "off"}
          className="px-6 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Stop
        </button>
      </div>

      {/* Info Panel */}
      <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">How to Use</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            <strong>Pagination:</strong> Fetches pages from timeline API with
            cursor-based pagination
          </li>
          <li>
            <strong>Mock SSE:</strong> Simulates server-sent events, emitting
            plays at regular intervals
          </li>
          <li>
            <strong>Burst SSE:</strong> Emits plays in rapid bursts, useful for
            testing batch updates
          </li>
          <li>
            <strong>Off:</strong> Disables stream consumption
          </li>
        </ul>
      </div>
    </div>
  );
}
