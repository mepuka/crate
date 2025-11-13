import { createFileRoute } from '@tanstack/react-router'
import { PlayCard } from '@/components'
import { Play } from '@/domain'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Mock data for testing PlayCard
const mockPlay: Play = {
  id: 1,
  artist: 'Radiohead',
  song: 'Paranoid Android',
  similarity: 0,
  album: 'OK Computer',
  airdate: new Date(),
  labels: ['Parlophone', 'Capitol Records'],
  rotation_status: 'Heavy',
  is_local: false,
  is_live: false,
  is_request: true,
  comment: 'This is a test comment to show how comments display in the expanded view.',
  show: 1,
  image_uri: null,
  thumbnail_uri: null,
  artist_mbid: null,
  recording_mbid: null,
  release_mbid: null,
  release_group_mbid: null
}

const mockPlayLocal: Play = {
  ...mockPlay,
  id: 2,
  artist: 'The Sonics',
  song: 'Strychnine',
  album: 'Here Are The Sonics',
  is_local: true,
  is_request: false,
  rotation_status: 'Medium',
  airdate: new Date(Date.now() - 1000 * 60 * 45) // 45 minutes ago
}

const mockPlayLive: Play = {
  ...mockPlay,
  id: 3,
  artist: 'Pearl Jam',
  song: 'Black',
  album: 'Ten',
  is_live: true,
  is_request: false,
  is_local: false,
  rotation_status: null,
  airdate: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
}

function HomePage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">PlayCard Component Preview</h1>
        <p className="text-muted-foreground">Testing all variants and sizes. Click any card to copy link.</p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-3">Default Size</h2>
          <div className="space-y-2">
            <PlayCard play={mockPlay} />
            <PlayCard play={mockPlayLocal} />
            <PlayCard play={mockPlayLive} />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Compact Size</h2>
          <div className="space-y-2">
            <PlayCard play={mockPlay} size="compact" />
            <PlayCard play={mockPlayLocal} size="compact" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Expanded Size</h2>
          <div className="space-y-2">
            <PlayCard play={mockPlay} size="expanded" />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Variants</h2>
          <div className="space-y-2">
            <PlayCard play={mockPlay} isFocused />
            <PlayCard play={mockPlay} variant="dimmed" />
          </div>
        </div>
      </div>
    </div>
  )
}
