import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
// import { ScrollingAlbumBar } from '@/components/ScrollingAlbumBar' // Disabled for Phase 1

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      {/* Disabled for Phase 1 stream layer refactoring */}
      {/* <ScrollingAlbumBar /> */}
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
