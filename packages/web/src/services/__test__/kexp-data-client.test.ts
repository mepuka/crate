/**
 * Basic tests for KexpDataClient
 *
 * These tests verify the client's basic structure and API surface.
 * Full integration tests would require a running worker and are better
 * suited for end-to-end tests in the browser.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { getKexpDataClient, resetKexpDataClient } from "../kexp-data-client"

describe("KexpDataClient", () => {
  beforeEach(() => {
    resetKexpDataClient()
  })

  afterEach(() => {
    resetKexpDataClient()
  })

  it("should create a singleton instance", () => {
    const client1 = getKexpDataClient()
    const client2 = getKexpDataClient()
    expect(client1).toBe(client2)
  })

  it("should have fetchPrograms method", () => {
    const client = getKexpDataClient()
    expect(typeof client.fetchPrograms).toBe("function")
  })

  it("should have fetchShows method", () => {
    const client = getKexpDataClient()
    expect(typeof client.fetchShows).toBe("function")
  })

  it("should have getShowInfo method", () => {
    const client = getKexpDataClient()
    expect(typeof client.getShowInfo).toBe("function")
  })

  it("should have subscribe method", () => {
    const client = getKexpDataClient()
    expect(typeof client.subscribe).toBe("function")
  })

  it("should have unsubscribe method", () => {
    const client = getKexpDataClient()
    expect(typeof client.unsubscribe).toBe("function")
  })

  it("should have terminate method", () => {
    const client = getKexpDataClient()
    expect(typeof client.terminate).toBe("function")
  })

  it("should allow subscribe and unsubscribe", () => {
    const client = getKexpDataClient()
    const callback = () => {}

    const unsubscribe = client.subscribe(callback)
    expect(typeof unsubscribe).toBe("function")

    // Should not throw when unsubscribing
    expect(() => unsubscribe()).not.toThrow()
    expect(() => client.unsubscribe(callback)).not.toThrow()
  })
})
