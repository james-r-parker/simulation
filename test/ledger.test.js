import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ledgerDir, readLedger } from '../scripts/lib/ledger.mjs';

let root = '';
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ledger-'));
    mkdirSync(join(root, 'evals'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readLedger', () => {
    it('reads the old single file when there is no ledger directory', () => {
        writeFileSync(
            join(root, 'evals', 'experiments.json'),
            JSON.stringify({ experiments: [{ id: 'E2' }, { id: 'E1' }] }),
        );
        expect(readLedger(root).map((r) => r.id)).toEqual(['E2', 'E1']);
    });

    it('reads an empty list from a single file with no experiments key', () => {
        writeFileSync(join(root, 'evals', 'experiments.json'), '{}');
        expect(readLedger(root)).toEqual([]);
    });

    it('reads no records when neither source exists', () => {
        expect(readLedger(root)).toEqual([]);
    });

    it('prefers the directory, in numeric id order, and ignores other files', () => {
        writeFileSync(join(root, 'evals', 'experiments.json'), JSON.stringify({ experiments: [{ id: 'E99' }] }));
        mkdirSync(ledgerDir(root));
        for (const id of ['E10', 'E9', 'E100']) {
            writeFileSync(join(ledgerDir(root), `${id}.json`), JSON.stringify({ id }));
        }
        writeFileSync(join(ledgerDir(root), 'notes.txt'), 'ignored');
        expect(readLedger(root).map((r) => r.id)).toEqual(['E9', 'E10', 'E100']);
    });
});
