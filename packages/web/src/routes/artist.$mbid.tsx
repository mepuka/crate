/**
 * Artist Page Route
 *
 * Displays all plays by an artist, filtered by artist MBID.
 */

import { createFileRoute } from "@tanstack/react-router";
import { EntityPage } from "@/components/EntityPage";

export const Route = createFileRoute("/artist/$mbid")({
  component: () => <EntityPage type="artist" />,
});
