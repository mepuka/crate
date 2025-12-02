import { createFileRoute, useParams, Link } from '@tanstack/react-router'
import { useAtomValue, Result } from '@effect-atom/atom-react'
import { playAtom } from '@/atoms/timeline'
import { Option } from 'effect'
import { z } from 'zod'

// Schema for search params we want to preserve
const playSearchSchema = z.object({
  artist_mbid: z.string().optional(),
  release_group_mbid: z.string().optional(),
  release_mbid: z.string().optional(),
  recording_mbid: z.string().optional(),
})

export const Route = createFileRoute('/play/$id')({
  validateSearch: (search) => playSearchSchema.parse(search),
  component: PlayDetailPage,
})

function PlayDetailPage() {
  const { id } = useParams({ from: '/play/$id' })
  const search = Route.useSearch()
  const play = useAtomValue(playAtom(Number(id)))

  return (
    <div className="container mx-auto p-6">
      <header className="mb-6">
        <Link
          to="/"
          search={search}
          className="text-sm text-gray-600 hover:text-gray-900 mb-4 inline-block"
        >
          ← Back to Timeline
        </Link>
      </header>

      {Result.matchWithWaiting(play, {
        onWaiting: () => (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading play...</p>
          </div>
        ),
        onError: (error) => (
          <div className="text-center py-12">
            <p className="text-red-500">Error loading play: {error.message}</p>
          </div>
        ),
        onDefect: (_defect) => (
          <div className="text-center py-12">
            <p className="text-red-500">Unexpected error loading play</p>
          </div>
        ),
        onSuccess: (success) => (
          Option.match(success.value, {
            onNone: () => (
              <div className="text-center py-12">
                <p className="text-gray-500">Play not found</p>
              </div>
            ),
            onSome: (playData) => (
              <div className="max-w-2xl">
                <h1 className="text-3xl font-bold mb-4">
                  {playData.artist || 'Unknown Artist'}
                </h1>
                <h2 className="text-xl text-gray-700 mb-6">
                  {playData.song || 'Unknown Song'}
                </h2>

                <dl className="space-y-3">
                  {playData.album && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Album</dt>
                      <dd className="text-base">{playData.album}</dd>
                    </div>
                  )}

                  {playData.airdate && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Air Date</dt>
                      <dd className="text-base">{new Date(playData.airdate).toLocaleString()}</dd>
                    </div>
                  )}

                  <div>
                    <dt className="text-sm font-medium text-gray-500">Play ID</dt>
                    <dd className="text-base">{playData.id}</dd>
                  </div>
                </dl>
              </div>
            ),
          })
        ),
      })}
    </div>
  )
}
