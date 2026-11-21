// Validates every record in evals/ledger/ against evals/experiments.schema.json (the `conventions` gate runs it).
// Usage: node scripts/check-experiments.mjs [ledger-dir] [schema.json]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECORD_FILE } from './lib/ledger.mjs';
import { validate } from './lib/json-schema-lite.mjs';

const LEDGER = new URL('../evals/ledger/', import.meta.url);
const SCHEMA = new URL('../evals/experiments.schema.json', import.meta.url);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The first experiment id that must name committed reports (carrying-capacity.md, C6). */
export const FIRST_REPORT_ID = 151;
/** Where the reports a record names must live. */
export const REPORT_DIR = 'evals/decisions/';

/**
 * Formats a schema error, naming the file and the schema path.
 * @param {string} file the record's file name
 * @param {import('./lib/json-schema-lite.mjs').SchemaError} error the error
 * @returns {string} the line
 */
function format(file, error) {
    const at = error.instancePath === '' ? '' : `at ${error.instancePath.slice(1)}: `;
    return `${file}: ${error.schemaPath === '' ? '/' : error.schemaPath}: ${at}${error.message}`;
}

/**
 * @param {string} path a path a record names
 * @param {string} root the repo root
 * @returns {string | null} why the path is not a committed report, null when it is one
 */
function reportProblem(path, root) {
    if (!path.startsWith(REPORT_DIR) || path.split('/').includes('..')) {
        return `${path}: a report lives under ${REPORT_DIR}`;
    }
    const file = resolve(root, path);
    return existsSync(file) && statSync(file).isFile() ? null : `${path}: no such file`;
}

/**
 * Checks that a record from `FIRST_REPORT_ID` on names its reports and that each is a file under `evals/decisions/`.
 * @param {{ id: string, reports?: string[] }} record a record that passed the schema
 * @param {string} file the record's file name
 * @param {string} root the repo root the report paths are relative to
 * @returns {string[]} problems
 */
function checkReports(record, file, root) {
    if (Number(record.id.slice(1)) < FIRST_REPORT_ID) {
        return [];
    }
    const reports = record.reports ?? [];
    /** @type {string[]} */
    const problems = reports.length === 0 ? [`${file}: from E${FIRST_REPORT_ID} on a record names its reports`] : [];
    for (const path of reports) {
        const problem = reportProblem(path, root);
        if (problem !== null) {
            problems.push(`${file}: reports: ${problem}`);
        }
    }
    return problems;
}

/**
 * Validates one record.
 * @param {unknown} record the parsed record
 * @param {Record<string, any>} schema the parsed schema (describes one record)
 * @param {string} file the record's file name, `E<id>.json`
 * @param {string} [root] the repo root the report paths are relative to
 * @returns {string[]} one line per problem; empty when the record is valid
 */
export function checkRecord(record, schema, file, root = REPO_ROOT) {
    const found = validate(schema, record).map((error) => format(file, error));
    if (found.length > 0) {
        return found;
    }
    const entry = /** @type {{ id: string, reports?: string[] }} */ (record);
    const named = `${entry.id}.json`;
    return [
        ...(named === file ? [] : [`${file}: the file name must match the id ${entry.id} (${named})`]),
        ...checkReports(entry, file, root),
    ];
}

/**
 * @param {string} message why a file could not be read
 * @param {string} path the file
 * @returns {string} the problem line
 */
const unreadable = (message, path) => `${path}: ${message}`;

/**
 * @param {string} path a JSON file
 * @returns {{ value?: any, problem?: string }} the parsed value, or why it could not be read
 */
function readJson(path) {
    try {
        return { value: JSON.parse(readFileSync(path, 'utf8')) };
    } catch (error) {
        return { problem: unreadable(error instanceof Error ? error.message : String(error), path) };
    }
}

/**
 * Validates every file in a ledger directory.
 * @param {string} dir the ledger directory
 * @param {Record<string, any>} schema the parsed schema
 * @param {string} [root] the repo root the report paths are relative to
 * @returns {string[]} the problems, sorted by file
 */
export function checkDirectory(dir, schema, root = REPO_ROOT) {
    /** @type {string[]} */
    const problems = [];
    for (const name of readdirSync(dir).sort()) {
        if (!RECORD_FILE.test(name)) {
            problems.push(`${name}: not a record file; a ledger file is named E<id>.json`);
            continue;
        }
        const read = readJson(join(dir, name));
        problems.push(...(read.problem === undefined ? checkRecord(read.value, schema, name, root) : [read.problem]));
    }
    return problems;
}

/**
 * @param {string | URL} path a path or a file URL
 * @returns {string} the path
 */
const toPath = (path) => (path instanceof URL ? fileURLToPath(path) : path);

/**
 * Reads, validates and reports the ledger.
 * @param {string | URL} ledgerDir the ledger directory
 * @param {string | URL} schemaPath the schema file
 * @returns {string[]} the problems
 */
export function checkFiles(ledgerDir = LEDGER, schemaPath = SCHEMA) {
    const schema = readJson(toPath(schemaPath));
    const dir = toPath(ledgerDir);
    if (schema.problem !== undefined) {
        return [schema.problem];
    }
    return existsSync(dir) ? checkDirectory(dir, schema.value) : [unreadable('no such directory', dir)];
}

/* v8 ignore start -- thin CLI; the exported functions are tested */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [ledgerArg, schemaArg] = process.argv.slice(2);
    const problems = checkFiles(ledgerArg ?? LEDGER, schemaArg ?? SCHEMA);
    for (const problem of problems) {
        console.log(`experiments: ${problem}`);
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
