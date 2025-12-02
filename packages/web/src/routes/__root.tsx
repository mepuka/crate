import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ScrollingAlbumBar } from '@/components/ScrollingAlbumBar'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip link for keyboard users - visible only on focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:p-3 focus:bg-background focus:text-foreground focus:rounded-md focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <ScrollingAlbumBar />
      <main id="main-content" className="flex-1 relative z-0">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  )
}
