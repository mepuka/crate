import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">KXP Radio Crate</h1>
        <p className="text-muted-foreground">Timeline will go here...</p>
        <Button>Get Started</Button>
      </div>
    </div>
  )
}
