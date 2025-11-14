import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { ScrollingAlbumBar } from '@/components/ScrollingAlbumBar'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <ScrollingAlbumBar />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
