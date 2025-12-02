/**
 * Artist Page Route - Redirect
 *
 * Redirects to main timeline with artist_mbid filter.
 * Old URLs: /artist/$mbid -> New: /?artist_mbid=$mbid
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/artist/$mbid")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/",
      search: { artist_mbid: params.mbid },
    });
  },
  component: () => null, // Never rendered
});
