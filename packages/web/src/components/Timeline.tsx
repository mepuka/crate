import { useAtomValue, useAtomMount, Result } from '@effect-atom/atom-react'
import { Chunk, Option } from 'effect'
import {
  latestItemAtom,
  playIdsAtom,
  playAtom,
  playsChunkAtom,
  playsSortedByAirdateDescAtom,
  newestPlayAtom,
  oldestPlayAtom,
  playIdsSortedAtom,
} from '@/atoms/timeline'
import { DevAtomDisplay } from './DevAtomDisplay'

export function Timeline() {
  // Mount the background fetching service
  useAtomMount(latestItemAtom);

  // Get reactive play IDs - automatically updates when KVS changes
  const playIds = useAtomValue(playIdsAtom);

  // Demo: Get derived atoms using timeline utilities
  const playsChunk = useAtomValue(playsChunkAtom);
  const sortedPlays = useAtomValue(playsSortedByAirdateDescAtom);
  const newestPlay = useAtomValue(newestPlayAtom);
  const oldestPlay = useAtomValue(oldestPlayAtom);
  const sortedPlayIds = useAtomValue(playIdsSortedAtom);

  return (
    <>
      <DevAtomDisplay />
      <div className="p-4 max-w-4xl mx-auto pt-16">
        <h2 className="text-2xl font-bold mb-4">Timeline</h2>

      {/* Demo Section: Derived Atoms using Timeline Utilities */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-3 text-gray-800">
          Demo: Derived Atoms with Order Utilities
        </h3>
        <div className="space-y-2 text-sm">
          <div>
            <strong>Plays Chunk Size:</strong>{' '}
            {Result.matchWithWaiting(playsChunk, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) => Chunk.size(s.value),
            })}
          </div>
          <div>
            <strong>Sorted Plays Size:</strong>{' '}
            {Result.matchWithWaiting(sortedPlays, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) => Chunk.size(s.value),
            })}
          </div>
          <div>
            <strong>Newest Play:</strong>{' '}
            {Result.matchWithWaiting(newestPlay, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) =>
                Option.match(s.value, {
                  onNone: () => 'None',
                  onSome: (play) =>
                    `${play.artist} - ${play.song} (${new Date(play.airdate).toLocaleDateString()})`,
                }),
            })}
          </div>
          <div>
            <strong>Oldest Play:</strong>{' '}
            {Result.matchWithWaiting(oldestPlay, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) =>
                Option.match(s.value, {
                  onNone: () => 'None',
                  onSome: (play) =>
                    `${play.artist} - ${play.song} (${new Date(play.airdate).toLocaleDateString()})`,
                }),
            })}
          </div>
          <div>
            <strong>Newest 5 Play IDs:</strong>{' '}
            {Result.matchWithWaiting(sortedPlayIds, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) => s.value.slice(0, 5).join(', '),
            })}
          </div>
          <div>
            <strong>Sorted Play IDs Count:</strong>{' '}
            {Result.matchWithWaiting(sortedPlayIds, {
              onWaiting: () => 'Loading...',
              onError: (e) => `Error: ${String(e)}`,
              onDefect: (d) => `Defect: ${String(d)}`,
              onSuccess: (s) => s.value.length,
            })}
          </div>
        </div>
      </div>

      {Result.matchWithWaiting(playIds, {
        onWaiting: () => (
          <div className="border p-8 rounded text-center text-gray-500">
            <p>Loading plays from the background service...</p>
            <p className="text-sm mt-2">New plays will appear here automatically</p>
          </div>
        ),
        onError: (error) => (
          <div className="text-red-500">Error loading timeline: {String(error)}</div>
        ),
        onDefect: (defect) => (
          <div className="text-red-500">Defect: {String(defect)}</div>
        ),
        onSuccess: (success) => (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded">
              <p>
                New plays will appear at the top as they're fetched by the background service.
                Currently tracking <strong>{success.value.length}</strong> play{success.value.length !== 1 ? 's' : ''}.
              </p>
            </div>

            {/* List of plays (newest first) */}
            {success.value.length === 0 ? (
              <div className="border p-8 rounded text-center text-gray-500">
                <p>Waiting for plays from the background service...</p>
                <p className="text-sm mt-2">New plays will appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-3">
                {success.value.map((id) => (
                  <PlayCard key={id} playId={id} />
                ))}
              </div>
            )}
          </div>
        ),
      })}
      </div>
    </>
  )
}

function PlayCard({ playId }: { playId: number }) {
  const play = useAtomValue(playAtom(playId));

  return (
    <div className="border p-4 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
      {Result.matchWithWaiting(play, {
        onWaiting: () => (
          <div className="text-gray-500">Loading play #{playId}...</div>
        ),
        onError: (error) => (
          <div className="text-red-500">Error loading play: {String(error)}</div>
        ),
        onDefect: (defect) => (
          <div className="text-red-500">Defect: {String(defect)}</div>
        ),
        onSuccess: (success) => (
          <div>
            {Option.match(success.value, {
              onNone: () => (
                <div className="text-gray-500">Play #{playId} not found</div>
              ),
              onSome: (playData) => (
                <div className="space-y-2">
                  <div className="text-sm text-gray-500 font-mono">#{playData.id}</div>
                  <div>
                    <div className="font-semibold text-lg">{playData.artist}</div>
                    <div className="text-gray-700">{playData.song}</div>
                    {playData.album && (
                      <div className="text-sm text-gray-600 italic">{playData.album}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(playData.airdate).toLocaleString()}
                  </div>
                </div>
              ),
            })}
          </div>
        ),
      })}
    </div>
  );
}
