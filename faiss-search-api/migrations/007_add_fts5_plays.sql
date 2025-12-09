-- Migration: Add FTS5 full-text search for plays
-- Uses porter stemmer for English word matching
-- Zero RAM overhead - SQLite handles indexing on disk

-- Create FTS5 virtual table for play search
-- content= references fact_plays for external content (saves disk space)
CREATE VIRTUAL TABLE IF NOT EXISTS plays_fts USING fts5(
    artist,
    song,
    album,
    comment,
    content='fact_plays',
    content_rowid='id',
    tokenize='porter unicode61'
);

-- Populate from existing data (only if empty)
INSERT INTO plays_fts(rowid, artist, song, album, comment)
SELECT id,
       COALESCE(artist, ''),
       COALESCE(song, ''),
       COALESCE(album, ''),
       COALESCE(comment, '')
FROM fact_plays
WHERE NOT EXISTS (SELECT 1 FROM plays_fts LIMIT 1);

-- Triggers to keep FTS5 in sync with fact_plays

-- Insert trigger
CREATE TRIGGER IF NOT EXISTS plays_fts_insert AFTER INSERT ON fact_plays BEGIN
    INSERT INTO plays_fts(rowid, artist, song, album, comment)
    VALUES (NEW.id,
            COALESCE(NEW.artist, ''),
            COALESCE(NEW.song, ''),
            COALESCE(NEW.album, ''),
            COALESCE(NEW.comment, ''));
END;

-- Delete trigger (FTS5 requires special 'delete' command)
CREATE TRIGGER IF NOT EXISTS plays_fts_delete AFTER DELETE ON fact_plays BEGIN
    INSERT INTO plays_fts(plays_fts, rowid, artist, song, album, comment)
    VALUES ('delete', OLD.id,
            COALESCE(OLD.artist, ''),
            COALESCE(OLD.song, ''),
            COALESCE(OLD.album, ''),
            COALESCE(OLD.comment, ''));
END;

-- Update trigger (delete old, insert new)
CREATE TRIGGER IF NOT EXISTS plays_fts_update AFTER UPDATE ON fact_plays BEGIN
    INSERT INTO plays_fts(plays_fts, rowid, artist, song, album, comment)
    VALUES ('delete', OLD.id,
            COALESCE(OLD.artist, ''),
            COALESCE(OLD.song, ''),
            COALESCE(OLD.album, ''),
            COALESCE(OLD.comment, ''));
    INSERT INTO plays_fts(rowid, artist, song, album, comment)
    VALUES (NEW.id,
            COALESCE(NEW.artist, ''),
            COALESCE(NEW.song, ''),
            COALESCE(NEW.album, ''),
            COALESCE(NEW.comment, ''));
END;
