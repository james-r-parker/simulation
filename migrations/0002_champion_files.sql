-- Champion files move into D1 (docs/designs/deployment-and-community.md, Decisions "Storage"): the account is on the
-- free plan only and R2 needs a payment method. A file is about 32 KB, far under D1's 2 MB row limit; the 64 KB cap
-- keeps one INSERT under D1's 100 KB statement limit. The file is in its own table so list queries never read it.

CREATE TABLE champion_files (
    id   TEXT PRIMARY KEY REFERENCES champions (id),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 2 AND 65536)
);

ALTER TABLE champions DROP COLUMN r2_key;

-- The release index moves out of R2 too (`releases/index.json` is this table). A release is served by the Pages
-- deployment on branch `v<major>-<minor>-<patch>` (js/library/releases.js, `aliasBranch`), so there are no files to store.
CREATE TABLE releases (
    version    TEXT    PRIMARY KEY,
    major      INTEGER NOT NULL,
    minor      INTEGER NOT NULL,
    patch      INTEGER NOT NULL,
    season     INTEGER NOT NULL,
    released   TEXT    NOT NULL,
    rules_hash TEXT    NOT NULL
);

CREATE INDEX releases_by_season ON releases (season, major DESC, minor DESC, patch DESC);
