// Validates evals/experiments.json against evals/experiments.schema.json (the `conventions` gate runs it).
// Usage: node scripts/check-experiments.mjs [ledger.json] [schema.json]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './lib/json-schema-lite.mjs';

const LEDGER = new URL('../evals/experiments.json', import.meta.url);
const SCHEMA = new URL('../evals/experiments.schema.json', import.meta.url);

/**
 * Names where an entry sits: `experiments[2] (E3)`, or just the index when it has no usable id.
 * @param {number} index the entry's position
 * @param {unknown} entry the entry
 * @returns {string} the label
 */
function label(index, entry) {
    const id = entry !== null && typeof entry === 'object' ? /** @type {any} */ (entry).id : undefined;
    return typeof id === 'string' ? `experiments[${index}] (${id})` : `experiments[${index}]`;
}

/**
 * Formats a schema error, naming the entry and the schema path.
 * @param {string} prefix the entry label, or '' for the ledger itself
 * @param {import('./lib/json-schema-lite.mjs').SchemaError} error the error
 * @returns {string} the line
 */
function format(prefix, error) {
    const at = error.instancePath === '' ? '' : `at ${error.instancePath.slice(1)}: `;
    return `${prefix === '' ? '' : `${prefix}: `}${error.schemaPath === '' ? '/' : error.schemaPath}: ${at}${error.message}`;
}

/**
 * Checks ids are unique and increase down the list.
 * @param {{ id?: unknown }[]} entries the entries that passed the schema
 * @returns {string[]} problems
 */
function checkIds(entries) {
    /** @type {string[]} */
    const problems = [];
    const seen = new Map();
    let last = -1;
    entries.forEach((entry, index) => {
        const id = String(entry.id);
        const number = Number(id.slice(1));
        if (seen.has(id)) {
            problems.push(`${label(index, entry)}: duplicate id ${id} (first at experiments[${seen.get(id)}])`);
        } else if (number <= last) {
            problems.push(`${label(index, entry)}: ids must increase, ${id} follows E${last}`);
        }
        seen.set(id, seen.get(id) ?? index);
        last = Math.max(last, number);
    });
    return problems;
}

/**
 * Validates a ledger.
 * @param {unknown} ledger the parsed ledger
 * @param {Record<string, any>} schema the parsed schema
 * @returns {string[]} one line per problem; empty when the ledger is valid
 */
export function checkLedger(ledger, schema) {
    const entrySchema = schema.properties.experiments.items;
    /** @type {string[]} */
    const problems = [];
    const top = validate({ ...schema, properties: { experiments: { type: 'array' } } }, ledger);
    problems.push(...top.map((error) => format('', error)));
    const entries = ledger !== null && typeof ledger === 'object' ? /** @type {any} */ (ledger).experiments : undefined;
    if (!Array.isArray(entries)) {
        return problems;
    }
    entries.forEach((entry, index) => {
        for (const error of validate(entrySchema, entry)) {
            problems.push(format(label(index, entry), error));
        }
    });
    if (problems.length === 0) {
        problems.push(...checkIds(entries));
    }
    return problems;
}

/**
 * @param {string | URL} path a JSON file
 * @returns {{ value?: any, problem?: string }} the parsed value, or why it could not be read
 */
function readJson(path) {
    try {
        return { value: JSON.parse(readFileSync(path, 'utf8')) };
    } catch (error) {
        return { problem: `${String(path)}: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/**
 * Reads, validates and reports the ledger files.
 * @param {string | URL} ledgerPath the ledger file
 * @param {string | URL} schemaPath the schema file
 * @returns {string[]} the problems
 */
export function checkFiles(ledgerPath = LEDGER, schemaPath = SCHEMA) {
    const ledger = readJson(ledgerPath);
    const schema = readJson(schemaPath);
    const unreadable = [ledger, schema].flatMap((read) => (read.problem === undefined ? [] : [read.problem]));
    return unreadable.length > 0 ? unreadable : checkLedger(ledger.value, schema.value);
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
