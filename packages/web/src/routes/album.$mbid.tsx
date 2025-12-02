/**
 * Album Page Route
 *
 * Displays all plays from an album (release group - all versions),
 * filtered by release_group MBID.
 */

import { createFileRoute } from "@tanstack/react-router";
import { EntityPage } from "@/components/EntityPage";

export const Route = createFileRoute("/album/$mbid")({
  component: () => <EntityPage type="release_group" />,
});
