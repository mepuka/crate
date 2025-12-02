/**
 * Recording Page Route - Redirect
 *
 * Redirects to main timeline with recording_mbid filter.
 * Old URLs: /recording/$mbid -> New: /?recording_mbid=$mbid
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/recording/$mbid")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { recording_mbid: params.mbid },
    });
  },
  component: () => null, // Never rendered
});
