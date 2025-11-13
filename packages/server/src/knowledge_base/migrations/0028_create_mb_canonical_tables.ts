// packages/server/src/knowledge_base/migrations/0028_create_mb_canonical_tables.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // ========================================
  // Canonical MusicBrainz Artists Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_artists (
      artist_mbid TEXT PRIMARY KEY NOT NULL,
      artist_name TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_artists_name
    ON mb_artists(artist_name)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_artists_play_count
    ON mb_artists(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_artists_last_seen
    ON mb_artists(last_seen DESC)
  `

  // ========================================
  // Canonical MusicBrainz Labels Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_labels (
      label_mbid TEXT PRIMARY KEY NOT NULL,
      label_name TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_labels_name
    ON mb_labels(label_name)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_labels_play_count
    ON mb_labels(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_labels_last_seen
    ON mb_labels(last_seen DESC)
  `

  // ========================================
  // Canonical MusicBrainz Recordings Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_recordings (
      recording_mbid TEXT PRIMARY KEY NOT NULL,
      song_title TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_recordings_title
    ON mb_recordings(song_title)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_recordings_play_count
    ON mb_recordings(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_recordings_last_seen
    ON mb_recordings(last_seen DESC)
  `

  // ========================================
  // Canonical MusicBrainz Releases Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_releases (
      release_mbid TEXT PRIMARY KEY NOT NULL,
      album_title TEXT,
      release_date TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_releases_title
    ON mb_releases(album_title)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_releases_play_count
    ON mb_releases(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_releases_last_seen
    ON mb_releases(last_seen DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_releases_release_date
    ON mb_releases(release_date DESC)
  `

  // ========================================
  // Canonical MusicBrainz Release Groups Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_release_groups (
      release_group_mbid TEXT PRIMARY KEY NOT NULL,
      album_title TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_release_groups_title
    ON mb_release_groups(album_title)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_release_groups_play_count
    ON mb_release_groups(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_release_groups_last_seen
    ON mb_release_groups(last_seen DESC)
  `

  // ========================================
  // Canonical MusicBrainz Tracks Table
  // ========================================
  yield* sql`
    CREATE TABLE IF NOT EXISTS mb_tracks (
      track_mbid TEXT PRIMARY KEY NOT NULL,
      song_title TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      play_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_tracks_title
    ON mb_tracks(song_title)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_tracks_play_count
    ON mb_tracks(play_count DESC)
  `

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_mb_tracks_last_seen
    ON mb_tracks(last_seen DESC)
  `
})
