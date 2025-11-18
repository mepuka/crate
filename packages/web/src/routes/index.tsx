import { createFileRoute } from '@tanstack/react-router'
import { VirtualizedTimeline } from '@/components/VirtualizedTimeline'
import { PlayDetailsPanel } from '@/components/PlayDetailsPanel'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen">
      <VirtualizedTimeline />
      <PlayDetailsPanel />
    </div>
  )
}
