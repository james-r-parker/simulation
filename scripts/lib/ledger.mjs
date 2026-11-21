// The experiment ledger as one list: one `evals/ledger/E<id>.json` per record (docs/designs/agent-workflow.md,
// Experiment ledger).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ id: string, date: string, outcome?: string, plan?: string, kind?: string, [field: string]: any }} LedgerRecord
 */

/** The file name of one record. */
export const RECORD_FILE = /^E(\d+)\.json$/;

/**
 * @param {string} root the repository root
 * @returns {string} the ledger directory
 */
export function ledgerDir(root) {
    return join(root, 'evals', 'ledger');
}

/**
 * @param {string} root the repository root
 * @returns {LedgerRecord[]} every record in `evals/ledger/`, in id order; empty when the directory is absent
 */
export function readLedger(root) {
    const dir = ledgerDir(root);
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir)
        .filter((name) => RECORD_FILE.test(name))
        .sort((a, b) => Number(RECORD_FILE.exec(a)?.[1]) - Number(RECORD_FILE.exec(b)?.[1]))
        .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}
