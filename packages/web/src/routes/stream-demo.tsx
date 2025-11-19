/**
 * Stream Demo Route
 *
 * Demonstrates the new stream-based timeline architecture.
 * Access via /stream-demo
 */

import { createFileRoute } from "@tanstack/react-router";
import { StreamTimelineDemo } from "@/components/StreamTimelineDemo";

export const Route = createFileRoute("/stream-demo")({
  component: StreamDemoComponent,
});

function StreamDemoComponent() {
  return <StreamTimelineDemo />;
}
