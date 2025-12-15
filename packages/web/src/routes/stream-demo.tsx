/**
 * Stream Demo Route
 *
 * Demonstrates the new stream-based timeline architecture.
 * Access via /stream-demo
 *
 * DEV ONLY: Redirects to home in production builds.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { StreamTimelineDemo } from "@/components/StreamTimelineDemo";

export const Route = createFileRoute("/stream-demo")({
  component: StreamDemoComponent,
});

function StreamDemoComponent() {
  // Gate demo routes to development only
  if (!import.meta.env.DEV) {
    return <Navigate to="/" />;
  }
  return <StreamTimelineDemo />;
}
