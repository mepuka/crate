import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '@/components'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return <Timeline />
}
