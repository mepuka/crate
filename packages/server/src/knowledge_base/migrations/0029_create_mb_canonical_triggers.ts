// packages/server/src/knowledge_base/migrations/0029_create_mb_canonical_triggers.ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // ========================================
  // TRIGGER: Update MB entities on INSERT
  // ========================================
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS mb_canonical_insert_trigger
    AFTER INSERT ON fact_plays
    BEGIN
      -- Update Artists (from artist_ids JSON array)
      INSERT INTO mb_artists (artist_mbid, artist_name, first_seen, last_seen, play_count)
      SELECT
        artist_ids.value,
        NEW.artist,
        NEW.airdate,
        NEW.airdate,
        1
      FROM json_each(NEW.artist_ids) AS artist_ids
      WHERE artist_ids.value IS NOT NULL AND artist_ids.value != ''
      ON CONFLICT(artist_mbid) DO UPDATE SET
        artist_name = COALESCE(excluded.artist_name, mb_artists.artist_name),
        first_seen = MIN(mb_artists.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_artists.play_count + 1,
        updated_at = datetime('now');

      -- Update Recording
      INSERT INTO mb_recordings (recording_mbid, song_title, first_seen, last_seen, play_count)
      SELECT NEW.recording_id, NEW.song, NEW.airdate, NEW.airdate, 1
      WHERE NEW.recording_id IS NOT NULL AND NEW.recording_id != ''
      ON CONFLICT(recording_mbid) DO UPDATE SET
        song_title = COALESCE(excluded.song_title, mb_recordings.song_title),
        first_seen = MIN(mb_recordings.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_recordings.play_count + 1,
        updated_at = datetime('now');

      -- Update Track
      INSERT INTO mb_tracks (track_mbid, song_title, first_seen, last_seen, play_count)
      SELECT NEW.track_id, NEW.song, NEW.airdate, NEW.airdate, 1
      WHERE NEW.track_id IS NOT NULL AND NEW.track_id != ''
      ON CONFLICT(track_mbid) DO UPDATE SET
        song_title = COALESCE(excluded.song_title, mb_tracks.song_title),
        first_seen = MIN(mb_tracks.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_tracks.play_count + 1,
        updated_at = datetime('now');

      -- Update Release
      INSERT INTO mb_releases (release_mbid, album_title, release_date, first_seen, last_seen, play_count)
      SELECT NEW.release_id, NEW.album, NEW.release_date, NEW.airdate, NEW.airdate, 1
      WHERE NEW.release_id IS NOT NULL AND NEW.release_id != ''
      ON CONFLICT(release_mbid) DO UPDATE SET
        album_title = COALESCE(excluded.album_title, mb_releases.album_title),
        release_date = COALESCE(excluded.release_date, mb_releases.release_date),
        first_seen = MIN(mb_releases.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_releases.play_count + 1,
        updated_at = datetime('now');

      -- Update Release Group
      INSERT INTO mb_release_groups (release_group_mbid, album_title, first_seen, last_seen, play_count)
      SELECT NEW.release_group_id, NEW.album, NEW.airdate, NEW.airdate, 1
      WHERE NEW.release_group_id IS NOT NULL AND NEW.release_group_id != ''
      ON CONFLICT(release_group_mbid) DO UPDATE SET
        album_title = COALESCE(excluded.album_title, mb_release_groups.album_title),
        first_seen = MIN(mb_release_groups.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_release_groups.play_count + 1,
        updated_at = datetime('now');

      -- Update Labels (from label_ids JSON array)
      -- Note: We need to pair labels array with label_ids array by index
      INSERT INTO mb_labels (label_mbid, label_name, first_seen, last_seen, play_count)
      SELECT
        label_ids.value,
        (SELECT value FROM json_each(NEW.labels) WHERE json_each.key = label_ids.key),
        NEW.airdate,
        NEW.airdate,
        1
      FROM json_each(NEW.label_ids) AS label_ids
      WHERE label_ids.value IS NOT NULL AND label_ids.value != ''
      ON CONFLICT(label_mbid) DO UPDATE SET
        label_name = COALESCE(excluded.label_name, mb_labels.label_name),
        first_seen = MIN(mb_labels.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_labels.play_count + 1,
        updated_at = datetime('now');
    END;
  `

  // ========================================
  // TRIGGER: Update MB entities on DELETE
  // ========================================
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS mb_canonical_delete_trigger
    AFTER DELETE ON fact_plays
    BEGIN
      -- Decrement Artists
      UPDATE mb_artists
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE artist_mbid IN (SELECT value FROM json_each(OLD.artist_ids));

      -- Decrement Recording
      UPDATE mb_recordings
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE recording_mbid = OLD.recording_id
        AND OLD.recording_id IS NOT NULL AND OLD.recording_id != '';

      -- Decrement Track
      UPDATE mb_tracks
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE track_mbid = OLD.track_id
        AND OLD.track_id IS NOT NULL AND OLD.track_id != '';

      -- Decrement Release
      UPDATE mb_releases
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE release_mbid = OLD.release_id
        AND OLD.release_id IS NOT NULL AND OLD.release_id != '';

      -- Decrement Release Group
      UPDATE mb_release_groups
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE release_group_mbid = OLD.release_group_id
        AND OLD.release_group_id IS NOT NULL AND OLD.release_group_id != '';

      -- Decrement Labels
      UPDATE mb_labels
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE label_mbid IN (SELECT value FROM json_each(OLD.label_ids));
    END;
  `

  // ========================================
  // TRIGGER: Update MB entities on UPDATE
  // ========================================
  // For updates, we need to handle both old and new values
  // Strategy: decrement old values, increment new values
  yield* sql`
    CREATE TRIGGER IF NOT EXISTS mb_canonical_update_trigger
    AFTER UPDATE ON fact_plays
    WHEN
      NEW.artist_ids != OLD.artist_ids OR
      NEW.recording_id != OLD.recording_id OR
      NEW.track_id != OLD.track_id OR
      NEW.release_id != OLD.release_id OR
      NEW.release_group_id != OLD.release_group_id OR
      NEW.label_ids != OLD.label_ids OR
      NEW.artist != OLD.artist OR
      NEW.song != OLD.song OR
      NEW.album != OLD.album OR
      NEW.release_date != OLD.release_date OR
      NEW.labels != OLD.labels
    BEGIN
      -- Decrement OLD Artists
      UPDATE mb_artists
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE artist_mbid IN (SELECT value FROM json_each(OLD.artist_ids));

      -- Increment NEW Artists
      INSERT INTO mb_artists (artist_mbid, artist_name, first_seen, last_seen, play_count)
      SELECT
        artist_ids.value,
        NEW.artist,
        NEW.airdate,
        NEW.airdate,
        1
      FROM json_each(NEW.artist_ids) AS artist_ids
      WHERE artist_ids.value IS NOT NULL AND artist_ids.value != ''
      ON CONFLICT(artist_mbid) DO UPDATE SET
        artist_name = COALESCE(excluded.artist_name, mb_artists.artist_name),
        first_seen = MIN(mb_artists.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_artists.play_count + 1,
        updated_at = datetime('now');

      -- Decrement OLD Recording
      UPDATE mb_recordings
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE recording_mbid = OLD.recording_id
        AND OLD.recording_id IS NOT NULL AND OLD.recording_id != '';

      -- Increment NEW Recording
      INSERT INTO mb_recordings (recording_mbid, song_title, first_seen, last_seen, play_count)
      SELECT NEW.recording_id, NEW.song, NEW.airdate, NEW.airdate, 1
      WHERE NEW.recording_id IS NOT NULL AND NEW.recording_id != ''
      ON CONFLICT(recording_mbid) DO UPDATE SET
        song_title = COALESCE(excluded.song_title, mb_recordings.song_title),
        first_seen = MIN(mb_recordings.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_recordings.play_count + 1,
        updated_at = datetime('now');

      -- Decrement OLD Track
      UPDATE mb_tracks
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE track_mbid = OLD.track_id
        AND OLD.track_id IS NOT NULL AND OLD.track_id != '';

      -- Increment NEW Track
      INSERT INTO mb_tracks (track_mbid, song_title, first_seen, last_seen, play_count)
      SELECT NEW.track_id, NEW.song, NEW.airdate, NEW.airdate, 1
      WHERE NEW.track_id IS NOT NULL AND NEW.track_id != ''
      ON CONFLICT(track_mbid) DO UPDATE SET
        song_title = COALESCE(excluded.song_title, mb_tracks.song_title),
        first_seen = MIN(mb_tracks.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_tracks.play_count + 1,
        updated_at = datetime('now');

      -- Decrement OLD Release
      UPDATE mb_releases
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE release_mbid = OLD.release_id
        AND OLD.release_id IS NOT NULL AND OLD.release_id != '';

      -- Increment NEW Release
      INSERT INTO mb_releases (release_mbid, album_title, release_date, first_seen, last_seen, play_count)
      SELECT NEW.release_id, NEW.album, NEW.release_date, NEW.airdate, NEW.airdate, 1
      WHERE NEW.release_id IS NOT NULL AND NEW.release_id != ''
      ON CONFLICT(release_mbid) DO UPDATE SET
        album_title = COALESCE(excluded.album_title, mb_releases.album_title),
        release_date = COALESCE(excluded.release_date, mb_releases.release_date),
        first_seen = MIN(mb_releases.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_releases.play_count + 1,
        updated_at = datetime('now');

      -- Decrement OLD Release Group
      UPDATE mb_release_groups
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE release_group_mbid = OLD.release_group_id
        AND OLD.release_group_id IS NOT NULL AND OLD.release_group_id != '';

      -- Increment NEW Release Group
      INSERT INTO mb_release_groups (release_group_mbid, album_title, first_seen, last_seen, play_count)
      SELECT NEW.release_group_id, NEW.album, NEW.airdate, NEW.airdate, 1
      WHERE NEW.release_group_id IS NOT NULL AND NEW.release_group_id != ''
      ON CONFLICT(release_group_mbid) DO UPDATE SET
        album_title = COALESCE(excluded.album_title, mb_release_groups.album_title),
        first_seen = MIN(mb_release_groups.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_release_groups.play_count + 1,
        updated_at = datetime('now');

      -- Decrement OLD Labels
      UPDATE mb_labels
      SET
        play_count = play_count - 1,
        updated_at = datetime('now')
      WHERE label_mbid IN (SELECT value FROM json_each(OLD.label_ids));

      -- Increment NEW Labels
      INSERT INTO mb_labels (label_mbid, label_name, first_seen, last_seen, play_count)
      SELECT
        label_ids.value,
        (SELECT value FROM json_each(NEW.labels) WHERE json_each.key = label_ids.key),
        NEW.airdate,
        NEW.airdate,
        1
      FROM json_each(NEW.label_ids) AS label_ids
      WHERE label_ids.value IS NOT NULL AND label_ids.value != ''
      ON CONFLICT(label_mbid) DO UPDATE SET
        label_name = COALESCE(excluded.label_name, mb_labels.label_name),
        first_seen = MIN(mb_labels.first_seen, excluded.first_seen),
        last_seen = excluded.last_seen,
        play_count = mb_labels.play_count + 1,
        updated_at = datetime('now');
    END;
  `
})
