import { Atom, Result } from "@effect-atom/atom-react";
import { newestNPlaysAtom } from "./timeline";

/**
 * Album artwork data structure for the scrolling bar
 */
export interface AlbumArtwork {
  id: number;
  thumbnailUri: string;
  imageUri: string;
  artist: string;
  album: string | null;
  song: string;
}

/**
 * Number of recent plays to show in the scrolling album bar
 */
const ALBUM_BAR_PLAY_COUNT = 25;

/**
 * Derived atom that extracts album artwork from the newest N plays.
 * Filters out plays without artwork and maps to AlbumArtwork structure.
 * Automatically updates when newestNPlaysAtom updates.
 */
export const recentAlbumArtAtom = Atom.make((get) => {
  const recentPlays = get(newestNPlaysAtom(ALBUM_BAR_PLAY_COUNT));

  return Result.map(recentPlays, (plays) => {
    return plays
      .filter((play) => play.thumbnail_uri || play.image_uri)
      .map((play): AlbumArtwork => ({
        id: play.id,
        thumbnailUri: play.thumbnail_uri || play.image_uri || "",
        imageUri: play.image_uri || play.thumbnail_uri || "",
        artist: play.artist,
        album: play.album,
        song: play.song,
      }));
  });
});

/**
 * Animation speed for the scrolling bar (pixels per second)
 */
export const scrollSpeedAtom = Atom.make(() => {
  return 20; // pixels per second - adjust for desired speed
});
