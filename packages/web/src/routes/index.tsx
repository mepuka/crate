import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '@/components'
import { PlayDetailsPanel } from '@/components/PlayDetailsPanel'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen">
      <Timeline />
      <PlayDetailsPanel />
    </div>
  )
}
