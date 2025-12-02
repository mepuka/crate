/**
 * Album Page Route - Redirect
 *
 * Redirects to main timeline with release_group_mbid filter.
 * Old URLs: /album/$mbid -> New: /?release_group_mbid=$mbid
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/album/$mbid")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { release_group_mbid: params.mbid },
    });
  },
  component: () => null, // Never rendered
});
