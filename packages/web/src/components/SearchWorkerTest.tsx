/**
 * Search Worker Test Component
 *
 * Minimal component to test end-to-end worker integration.
 * Demonstrates:
 * - Worker communication via atoms
 * - Reactive updates with useAtomValue()
 * - Loading/error state handling
 * - Result display
 */

import React, { useState } from "react";
import { useAtomValue, Result } from "@effect-atom/atom-react";
import { searchQueryAtom } from "@/atoms/search-worker";
import type { PlayResult } from "@crate/api";

export function SearchWorkerTest() {
  const [query, setQuery] = useState("funk soul");
  const [submittedQuery, setSubmittedQuery] = useState("funk soul");

  // Use the atom to get reactive results
  // This will automatically re-fetch when submittedQuery changes
  const result = useAtomValue(searchQueryAtom(submittedQuery));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Search Worker Test</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter search query..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Search
          </button>
        </div>
      </form>

      <div className="border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold mb-2">Results:</h2>

        {Result.matchWithWaiting(result, {
          onWaiting: () => <div className="text-gray-500">Loading...</div>,
          onError: (error) => (
            <div className="text-red-500">
              <div className="font-semibold">Error occurred:</div>
              <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(error, null, 2)}</pre>
            </div>
          ),
          onDefect: (defect) => (
            <div className="text-red-500">
              <div className="font-semibold">Unexpected error occurred:</div>
              <pre className="text-xs mt-2 overflow-auto">{String(defect)}</pre>
            </div>
          ),
          onSuccess: (success) => (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Found {success.value.length} results
              </p>
              <ul className="space-y-2">
                {success.value
                  .slice(0, 10)
                  .map((play: typeof PlayResult.Type) => (
                    <li
                      key={play.id}
                      className="p-2 bg-gray-50 rounded border border-gray-200"
                    >
                      <div className="font-medium">{play.artist}</div>
                      <div className="text-sm text-gray-600">{play.song}</div>
                      <div className="text-xs text-gray-400">
                        {play.airdate.toLocaleString()}
                      </div>
                    </li>
                  ))}
              </ul>
              {success.value.length > 10 && (
                <p className="text-sm text-gray-500 mt-2">
                  ...and {success.value.length - 10} more
                </p>
              )}
            </div>
          ),
        })}
      </div>
    </div>
  );
}
