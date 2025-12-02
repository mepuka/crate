/**
 * Release Page Route
 *
 * Displays all plays from a release (specific album version), filtered by release MBID.
 */

import { createFileRoute } from "@tanstack/react-router";
import { EntityPage } from "@/components/EntityPage";

export const Route = createFileRoute("/release/$mbid")({
  component: () => <EntityPage type="release" />,
});
