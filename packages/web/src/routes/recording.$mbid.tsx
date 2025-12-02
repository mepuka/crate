/**
 * Recording Page Route
 *
 * Displays all plays of a specific recording (track), filtered by recording MBID.
 */

import { createFileRoute } from "@tanstack/react-router";
import { EntityPage } from "@/components/EntityPage";

export const Route = createFileRoute("/recording/$mbid")({
  component: () => <EntityPage type="recording" />,
});
