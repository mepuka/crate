import { createFileRoute } from '@tanstack/react-router'
import { VirtualizedTimeline } from '@/components/VirtualizedTimeline'
import { PlayDetailsPanel } from '@/components/PlayDetailsPanel'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="relative min-h-screen w-full">
      {/* Timeline and Panel share viewport - both position independently */}
      <VirtualizedTimeline />
      <PlayDetailsPanel />
    </div>
  )
}
