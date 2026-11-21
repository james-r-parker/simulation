// The experiment ledger as one list: `evals/ledger/E<id>.json` per record when the directory exists, else the single
// `evals/experiments.json` it replaces (docs/designs/agent-workflow.md, Experiment ledger).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * @returns {Record<string, any>[]} the records of `evals/ledger/`, in id order
 */
function readDirectory(root) {
    const dir = ledgerDir(root);
    return readdirSync(dir)
        .filter((name) => RECORD_FILE.test(name))
        .sort((a, b) => Number(RECORD_FILE.exec(a)?.[1]) - Number(RECORD_FILE.exec(b)?.[1]))
        .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

/**
 * @param {string} root the repository root
 * @returns {Record<string, any>[]} the records of the old single file, in file order; empty when it is absent
 */
function readSingleFile(root) {
    const file = join(root, 'evals', 'experiments.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).experiments ?? []) : [];
}

/**
 * @param {string} root the repository root
 * @returns {Record<string, any>[]} every experiment record: `evals/ledger/` when it exists, else `evals/experiments.json`
 */
export function readLedger(root) {
    return existsSync(ledgerDir(root)) ? readDirectory(root) : readSingleFile(root);
}
