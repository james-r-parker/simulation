import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
    aliasBranch,
    aliasHost,
    GET_RELEASE_SQL,
    isVersion,
    LATEST_OF_SEASON_SQL,
    LIST_RELEASES_SQL,
    releaseSql,
    sameRelease,
    toIndex,
} from '../../js/library/releases.js';

const entry = (/** @type {string} */ version, /** @type {number} */ season = 6) => ({
    version,
    season,
    date: '2026-11-07',
    rulesHash: 'abc',
});

function openDb() {
    const db = new DatabaseSync(':memory:');
    for (const file of ['0001_library.sql', '0002_champion_files.sql']) {
        db.exec(readFileSync(`migrations/${file}`, 'utf8'));
    }
    return db;
}

describe('versions', () => {
    it('accepts digits-only major.minor.patch', () => {
        expect(['6.1.0', '10.20.30'].every(isVersion)).toBe(true);
        for (const bad of ['6.1', '6.1.0.1', 'v6.1.0', '6.1.x', '../1.0.0', '', 6, null]) {
            expect(isVersion(bad)).toBe(false);
        }
    });

    it('names the Pages branch one to one and builds the alias host', () => {
        expect(aliasBranch('6.1.0')).toBe('v6-1-0');
        expect(aliasBranch('6.11.0')).not.toBe(aliasBranch('6.1.10'));
        expect(aliasHost('6.1.0', 'matrix-6be')).toBe('v6-1-0.matrix-6be.pages.dev');
        expect(() => aliasBranch('x')).toThrow('bad_version');
    });
});

describe('the releases table', () => {
    it('lists in version order and resolves the newest of a season, comparing numbers not text', () => {
        const db = openDb();
        for (const e of [entry('6.9.0'), entry('6.10.0'), entry('6.2.1'), entry('7.0.0', 7)]) {
            db.exec(releaseSql(e));
        }
        const rows = /** @type {any[]} */ (db.prepare(LIST_RELEASES_SQL).all());
        expect(rows.map((r) => r.version)).toEqual(['6.2.1', '6.9.0', '6.10.0', '7.0.0']);
        expect(db.prepare(LATEST_OF_SEASON_SQL).get(6)?.version).toBe('6.10.0');
        expect(db.prepare(LATEST_OF_SEASON_SQL).get(9)).toBeUndefined();
        expect(toIndex(rows).releases[0]).toEqual(entry('6.2.1'));
    });

    it('refuses a second insert of a version and tells an identical entry from a different one', () => {
        const db = openDb();
        db.exec(releaseSql(entry('6.1.0')));
        expect(() => db.exec(releaseSql(entry('6.1.0')))).toThrow();
        const row = /** @type {any} */ (db.prepare(GET_RELEASE_SQL).get('6.1.0'));
        expect(sameRelease(row, entry('6.1.0'))).toBe(true);
        expect(sameRelease(row, { ...entry('6.1.0'), rulesHash: 'other' })).toBe(false);
    });

    it('rejects a bad version and quotes text values', () => {
        expect(() => releaseSql(entry('6.1'))).toThrow('bad_version');
        expect(releaseSql({ ...entry('6.1.0'), rulesHash: "a'b" })).toContain("'a''b'");
    });
});
