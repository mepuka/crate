import { Atom } from "@effect-atom/atom-react";
import { Effect, Option } from "effect";
import {
  StreamingLinksClient,
  TimelineKVS,
  TimelineRuntime,
} from "@/lib/http-runtime";
import {
  type StreamingLinksRequestType,
  type StreamingLinksResponseType,
  PlayResult,
} from "@crate/api";

/**
 * Build the most specific streaming-links request from a play's MBIDs.
 * Priority: recording → release_group → release → artist.
 */
const buildStreamingLinksRequest = (
  play: PlayResult
): Option.Option<StreamingLinksRequestType> => {
  const artistMbid = play.artist_mbid[0];

  const request: StreamingLinksRequestType = {
    recording_mbid: play.recording_mbid ?? undefined,
    release_group_mbid: play.release_group_mbid ?? undefined,
    release_mbid: play.release_mbid ?? undefined,
    artist_mbid: artistMbid ?? undefined,
  };

  return request.recording_mbid ||
    request.release_group_mbid ||
    request.release_mbid ||
    request.artist_mbid
    ? Option.some(request)
    : Option.none<StreamingLinksRequestType>();
};

/**
 * Fetch streaming links (Spotify, Apple Music, etc.) for a play by ID.
 * Returns Option<StreamingLinksResponse> wrapped in Result.
 */
export const streamingLinksForPlayAtom = Atom.family((playId: number) =>
  TimelineRuntime.atom(
    Effect.gen(function* () {
      const client = yield* StreamingLinksClient;
      const kvs = yield* TimelineKVS;

      const playOption = yield* kvs.getPlay(playId);
      if (Option.isNone(playOption)) {
        return Option.none<StreamingLinksResponseType>();
      }

      const request = buildStreamingLinksRequest(playOption.value);
      if (Option.isNone(request)) {
        return Option.none<StreamingLinksResponseType>();
      }

      const response = yield* client.streamingLinks.getStreamingLinks({
        urlParams: request.value,
      });

      return Option.some(response);
    })
  ).pipe(Atom.withReactivity([`timeline:play:${playId}`]))
);
