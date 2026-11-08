import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readReleaseSql, registerPlan } from '../scripts/lib/release-upload.mjs';

const entry = { version: '6.1.0', season: 6, date: '2026-11-07', rulesHash: 'h' };
const row = { version: '6.1.0', season: 6, released: '2026-11-07', rules_hash: 'h' };

describe('registerPlan', () => {
    it('inserts when nothing is stored, and the SQL runs on the real migration', () => {
        const plan = registerPlan(entry, null);
        expect(plan.action).toBe('insert');
        const db = new DatabaseSync(':memory:');
        for (const file of ['0001_library.sql', '0002_champion_files.sql']) {
            db.exec(readFileSync(`migrations/${file}`, 'utf8'));
        }
        db.exec(/** @type {{sql: string}} */ (plan).sql);
        expect(db.prepare(readReleaseSql('6.1.0')).get()).toMatchObject(row);
    });

    it('is a no-op for an identical stored row and refuses a different one', () => {
        expect(registerPlan(entry, row)).toEqual({ action: 'noop' });
        expect(() => registerPlan(entry, { ...row, rules_hash: 'other' })).toThrow('release_conflict');
    });

    it('refuses a bad version and inlines only a valid one into SQL', () => {
        expect(() => registerPlan({ ...entry, version: '6.1' }, null)).toThrow('bad_version');
        expect(() => readReleaseSql("6.1.0' OR '1'='1")).toThrow('bad version');
        expect(readReleaseSql('6.1.0')).toContain("WHERE version = '6.1.0'");
    });
});
