-- The gene library index (docs/designs/deployment-and-community.md, Phase 2, "Data").
-- Applied with `wrangler d1 migrations apply blob-library --remote`; the champion files are in R2.
-- A later migration adds `users` (Phase 3). `uploader_id` has no foreign key until then.

CREATE TABLE seasons (
    season       INTEGER PRIMARY KEY,
    rules_hash   TEXT    NOT NULL,
    input_count  INTEGER NOT NULL,
    brain_hidden INTEGER NOT NULL,
    output_count INTEGER NOT NULL,
    opened       TEXT    NOT NULL,
    major        INTEGER NOT NULL
);

CREATE TABLE champions (
    id             TEXT    PRIMARY KEY,
    season         INTEGER NOT NULL REFERENCES seasons (season),
    rules_hash     TEXT    NOT NULL,
    specialisation INTEGER NOT NULL CHECK (specialisation BETWEEN 0 AND 4),
    name           TEXT    NOT NULL,
    cell           INTEGER,
    uploader_id    INTEGER,
    created        INTEGER NOT NULL,
    status         TEXT    NOT NULL CHECK (status IN ('pending', 'verified', 'rejected', 'removed')),
    reject_reason  TEXT,
    elo            REAL,
    win_rate       REAL,
    games          INTEGER,
    verified_at    INTEGER,
    verified_sha   TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    bytes          INTEGER NOT NULL,
    r2_key         TEXT    NOT NULL
);

-- The list query picks the index that matches its filter and sort (keyset paging, no offset scans).
CREATE INDEX champions_by_spec    ON champions (season, status, specialisation, elo DESC, id);
CREATE INDEX champions_by_elo     ON champions (season, status, elo DESC, id);
CREATE INDEX champions_by_created ON champions (season, status, created DESC, id);
