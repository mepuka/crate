import { useAtomValue, useAtomMount, Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { latestItemAtom, lastSeenPlayAtom, lastSeenIdAtom } from '@/atoms/timeline'

export function Timeline() {
  // Mount the background fetching service
  useAtomMount(latestItemAtom);

  // Get reactive values - these will automatically update when KVS changes
  const lastSeenPlay = useAtomValue(lastSeenPlayAtom);
  const lastSeenId = useAtomValue(lastSeenIdAtom);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Timeline Reactivity Test</h2>
      
      <div className="space-y-4">
        {/* Last Seen Play ID */}
        <div className="border p-4 rounded">
          <h3 className="font-semibold mb-2">Last Seen Play ID</h3>
          {Result.matchWithWaiting(lastSeenId, {
            onWaiting: () => (
              <div className="text-gray-500">Loading...</div>
            ),
            onError: (error) => (
              <div className="text-red-500">Error: {String(error)}</div>
            ),
            onDefect: (defect) => (
              <div className="text-red-500">Defect: {String(defect)}</div>
            ),
            onSuccess: (success) => (
              <div>
                {Option.match(success.value, {
                  onNone: () => (
                    <div className="text-gray-500">No last seen play ID yet...</div>
                  ),
                  onSome: (id) => (
                    <div className="text-blue-600 font-mono">ID: {id}</div>
                  ),
                })}
              </div>
            ),
          })}
        </div>

        {/* Last Seen Play Details */}
        <div className="border p-4 rounded">
          <h3 className="font-semibold mb-2">Last Seen Play</h3>
          {Result.matchWithWaiting(lastSeenPlay, {
            onWaiting: () => (
              <div className="text-gray-500">Loading play data...</div>
            ),
            onError: (error) => (
              <div className="text-red-500">Error: {String(error)}</div>
            ),
            onDefect: (defect) => (
              <div className="text-red-500">Defect: {String(defect)}</div>
            ),
            onSuccess: (success) => (
              <div>
                {Option.match(success.value, {
                  onNone: () => (
                    <div className="text-gray-500">
                      No last seen play yet. The background service is fetching plays...
                    </div>
                  ),
                  onSome: (play) => (
                    <div className="space-y-2">
                      <div className="font-mono text-sm">
                        <div><strong>ID:</strong> {play.id}</div>
                        <div><strong>Artist:</strong> {play.artist}</div>
                        <div><strong>Song:</strong> {play.song}</div>
                        <div><strong>Airdate:</strong> {play.airdate.toISOString()}</div>
                        {play.album && (
                          <div><strong>Album:</strong> {play.album}</div>
                        )}
                      </div>
                    </div>
                  ),
                })}
              </div>
            ),
          })}
        </div>

        <div className="text-sm text-gray-600 mt-4">
          <p>
            This component demonstrates reactivity. When the background service
            (FetchLatestLive) stores plays in KVS, these atoms will automatically
            update because they subscribe to the reactivity keys:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><code className="bg-gray-100 px-1">timeline:last_seen_id</code></li>
            <li><code className="bg-gray-100 px-1">timeline:play</code></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
