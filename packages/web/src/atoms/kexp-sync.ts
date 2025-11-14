/**
 * KEXP Data Sync Hook
 *
 * Connects the KEXP data worker to reactive atoms.
 * Subscribes to worker messages and updates atoms accordingly.
 *
 * Architecture:
 * - Uses the singleton KexpDataClient to communicate with the worker
 * - Subscribes to all worker messages via callback
 * - Updates appropriate atoms based on message type
 * - Initiates data fetch on mount
 * - Cleans up subscription on unmount
 *
 * Usage:
 * ```tsx
 * import { useKexpDataSync } from "@/atoms/kexp-sync"
 *
 * function App() {
 *   // Initialize KEXP data sync (starts worker, fetches data)
 *   useKexpDataSync()
 *
 *   return <div>...</div>
 * }
 * ```
 */

import { useEffect } from "react"
import { getKexpDataClient } from "@/services/kexp-data-client"
import type { WorkerResponse } from "@/workers/kexp-data-worker-protocol"
import {
  updatePrograms,
  updateShows,
  setProgramsLoading,
  setShowsLoading,
  setProgramsError,
  setShowsError
} from "./kexp-atoms"

/**
 * Hook to synchronize KEXP worker data with atoms.
 *
 * This hook should be called once at the app root to initialize
 * the KEXP data worker and wire up the reactive state.
 *
 * On mount:
 * - Subscribes to worker messages
 * - Sets loading states to true
 * - Requests programs and shows from worker
 *
 * On unmount:
 * - Unsubscribes from worker messages
 *
 * The worker will:
 * 1. Check cache and immediately return cached data if available
 * 2. Fetch fresh data from KEXP API in background
 * 3. Update cache and send fresh data
 *
 * This pattern ensures instant rendering with cached data while
 * keeping data fresh in the background.
 */
export function useKexpDataSync() {
  useEffect(() => {
    const client = getKexpDataClient()

    // Subscribe to worker messages
    const unsubscribe = client.subscribe((response: WorkerResponse) => {
      switch (response.type) {
        case "programs-data":
          // Update programs data
          updatePrograms(response.programs, response.timestamp, response.cached)
          break

        case "shows-data":
          // Update shows data
          updateShows(response.shows, response.timestamp, response.cached)
          break

        case "error":
          console.error(`KEXP worker error (${response.requestType}):`, response.error)
          // Set error state and clear loading state
          if (response.requestType === "fetch-programs") {
            setProgramsError(response.error)
          } else if (response.requestType === "fetch-shows") {
            setShowsError(response.error)
          }
          break

        case "show-info":
          // Individual show info requests are handled by the promise-based API
          // in the client, not through subscriptions
          break
      }
    })

    // Initial fetch: set loading states and request data
    setProgramsLoading(true)
    setShowsLoading(true)
    client.fetchPrograms()
    client.fetchShows(200)

    // Cleanup: unsubscribe from worker
    return () => {
      unsubscribe()
    }
  }, []) // Empty deps: only run once on mount
}
