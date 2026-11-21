import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecord } from '../scripts/lib/experiment-new.mjs';

vi.mock('../scripts/lib/experiment-ids.mjs', () => ({ gitIn: () => () => 'main', nextId: () => 'E5' }));

const dirs = /** @type {string[]} */ ([]);
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('createRecord', () => {
    it('refuses to overwrite a record another lane wrote under the id it drew', () => {
        const root = mkdtempSync(join(tmpdir(), 'new-'));
        dirs.push(root);
        mkdirSync(join(root, 'evals', 'ledger'), { recursive: true });
        const file = join(root, 'evals', 'ledger', 'E5.json');
        writeFileSync(file, 'theirs');
        expect(() => createRecord(root, { plan: 'x.md' }, '2026-11-21')).toThrow(/EEXIST/);
        expect(readFileSync(file, 'utf8')).toBe('theirs');
    });

    it('writes the record when the id is free', () => {
        const root = mkdtempSync(join(tmpdir(), 'new-'));
        dirs.push(root);
        expect(createRecord(root, { plan: 'x.md' }, '2026-11-21')).toBe('E5');
        expect(JSON.parse(readFileSync(join(root, 'evals', 'ledger', 'E5.json'), 'utf8')).branch).toBe('main');
    });
});
