/**
 * Release Page Route - Redirect
 *
 * Redirects to main timeline with release_mbid filter.
 * Old URLs: /release/$mbid -> New: /?release_mbid=$mbid
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/release/$mbid")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { release_mbid: params.mbid },
    });
  },
  component: () => null, // Never rendered
});
