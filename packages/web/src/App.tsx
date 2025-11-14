import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { Toaster } from 'sonner'
import { useKexpDataSync } from '@/atoms/kexp-sync'

// Create the router instance
const router = createRouter({ routeTree })

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  // Initialize KEXP data sync - starts worker and fetches data
  useKexpDataSync()

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
}
