/**
 * KEXP Data Client
 *
 * Main thread client for communicating with the KEXP Data Worker.
 * Provides a clean API for fetching programs, shows, and show info.
 *
 * Architecture:
 * - Plain JavaScript Worker API (not Effect's Worker API)
 * - Message-based communication with typed protocol
 * - Singleton pattern for shared worker instance
 * - Callback-based subscriptions for streaming updates
 * - Promise-based API for request/response operations
 *
 * Usage:
 * ```ts
 * const client = getKexpDataClient()
 *
 * // Subscribe to all messages
 * client.subscribe((message) => {
 *   console.log('Received:', message)
 * })
 *
 * // Fetch data
 * const programs = await client.fetchPrograms()
 * const shows = await client.fetchShows(50)
 * const info = await client.getShowInfo(123)
 *
 * // Cleanup
 * client.terminate()
 * ```
 */

import type {
  WorkerRequest,
  WorkerResponse,
  ProgramsData,
  ShowsData,
  ShowInfoResponse,
} from "../workers/kexp-data-worker-protocol"

/**
 * Message callback type for worker responses
 */
type MessageCallback = (message: WorkerResponse) => void

/**
 * KexpDataClient
 *
 * Client for communicating with KEXP Data Worker.
 * Handles worker initialization, message routing, and lifecycle management.
 */
export class KexpDataClient {
  private worker: Worker
  private messageCallbacks: Set<MessageCallback> = new Set()
  private pendingRequests: Map<
    string,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: (value: any) => void
      reject: (error: Error) => void
    }
  > = new Map()

  constructor() {
    // Initialize worker with module support
    this.worker = new Worker(
      new URL("../workers/kexp-data-worker.ts", import.meta.url),
      { type: "module" }
    )

    // Set up message handler
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data)
    }

    // Set up error handler
    this.worker.onerror = (error: ErrorEvent) => {
      console.error("KEXP Data Worker error:", error)
      // Reject all pending requests
      for (const [key, pending] of this.pendingRequests.entries()) {
        pending.reject(new Error(`Worker error: ${error.message}`))
        this.pendingRequests.delete(key)
      }
    }
  }

  /**
   * Handle incoming messages from worker
   */
  private handleMessage(message: WorkerResponse): void {
    // Notify all subscribers
    for (const callback of this.messageCallbacks) {
      try {
        callback(message)
      } catch (error) {
        console.error("Error in message callback:", error)
      }
    }

    // Handle responses for pending requests
    if (message.type === "programs-data") {
      this.resolvePending("fetch-programs", message)
    } else if (message.type === "shows-data") {
      this.resolvePending("fetch-shows", message)
    } else if (message.type === "show-info") {
      this.resolvePending("get-show-info", message)
    } else if (message.type === "error") {
      this.rejectPending(message.requestType, new Error(message.error))
    }
  }

  /**
   * Resolve a pending request
   */
  private resolvePending(requestType: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestType)
    if (pending) {
      pending.resolve(value)
      this.pendingRequests.delete(requestType)
    }
  }

  /**
   * Reject a pending request
   */
  private rejectPending(requestType: string, error: Error): void {
    const pending = this.pendingRequests.get(requestType)
    if (pending) {
      pending.reject(error)
      this.pendingRequests.delete(requestType)
    }
  }

  /**
   * Send a request to the worker and wait for response
   */
  private sendRequest<T>(
    request: WorkerRequest,
    requestType: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Store promise handlers
      this.pendingRequests.set(requestType, { resolve, reject })

      // Send request to worker
      this.worker.postMessage(request)

      // Set timeout to prevent hanging
      setTimeout(() => {
        if (this.pendingRequests.has(requestType)) {
          this.pendingRequests.delete(requestType)
          reject(new Error(`Request timeout: ${requestType}`))
        }
      }, 30000) // 30 second timeout
    })
  }

  /**
   * Subscribe to worker messages
   * Returns unsubscribe function
   */
  subscribe(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback)
    return () => {
      this.messageCallbacks.delete(callback)
    }
  }

  /**
   * Unsubscribe a specific callback
   */
  unsubscribe(callback: MessageCallback): void {
    this.messageCallbacks.delete(callback)
  }

  /**
   * Fetch all KEXP programs
   * Returns programs data with cache metadata
   */
  async fetchPrograms(): Promise<ProgramsData> {
    return this.sendRequest<ProgramsData>(
      { type: "fetch-programs" },
      "fetch-programs"
    )
  }

  /**
   * Fetch recent KEXP shows
   * @param limit - Maximum number of shows to fetch (default: 50)
   */
  async fetchShows(limit = 50): Promise<ShowsData> {
    return this.sendRequest<ShowsData>(
      { type: "fetch-shows", limit },
      "fetch-shows"
    )
  }

  /**
   * Get detailed information about a specific show
   * @param showId - KEXP show ID
   * @returns Show info with associated program, or nulls if not found
   */
  async getShowInfo(showId: number): Promise<ShowInfoResponse> {
    return this.sendRequest<ShowInfoResponse>(
      { type: "get-show-info", showId },
      "get-show-info"
    )
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate(): void {
    this.worker.terminate()
    this.messageCallbacks.clear()
    this.pendingRequests.clear()
  }
}

/**
 * Singleton instance
 */
let instance: KexpDataClient | null = null

/**
 * Get or create the singleton KexpDataClient instance
 */
export function getKexpDataClient(): KexpDataClient {
  if (!instance) {
    instance = new KexpDataClient()
  }
  return instance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetKexpDataClient(): void {
  if (instance) {
    instance.terminate()
    instance = null
  }
}
