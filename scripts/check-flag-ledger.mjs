// Checks scripts/flag-ledger.json against the config rules (the `conventions` gate runs it). Every boolean or enum
// rule is a behaviour switch, and a switch is deleted once its new value wins: the ledger names the plan task that
// deletes the losing path, or says why the switch is permanent. It fails when
// - a boolean or enum rule is missing from the ledger;
// - an entry names a key that no longer exists;
// - an entry names a plan whose status says it is built while the key still exists;
// - an entry is malformed (a missing field, a duplicate key, a plan file that is not there).
// Usage: node scripts/check-flag-ledger.mjs [ledger.json]
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC_FIELD_RULES } from '../js/sim/config-spec-rules.js';
import { CONFIG_RULES } from '../js/sim/config-validate.js';

const ROOT = new URL('../', import.meta.url);
const LEDGER = new URL('flag-ledger.json', import.meta.url);

/** Status keywords of a plan that is finished; a switch it names must be gone (`Built` is the build log's word). */
const DONE = /^(Built|Implemented)\b/;

/**
 * The config keys a ledger entry may name.
 * @param {Record<string, { type: string }>} [rules] the top-level rules
 * @param {Record<string, { type: string }>} [specRules] the rules of a specialisation's fields
 * @returns {{ all: Set<string>, switches: string[] }} every key (a specialisation field as `specialisations.<field>`)
 *   and the boolean or enum ones, which the ledger must list
 */
export function configKeys(rules = CONFIG_RULES, specRules = SPEC_FIELD_RULES) {
    /** @type {[string, { type: string }][]} */
    const entries = [
        ...Object.entries(rules),
        ...Object.entries(specRules).map(
            ([field, rule]) => /** @type {[string, { type: string }]} */ ([`specialisations.${field}`, rule]),
        ),
    ];
    return {
        all: new Set(entries.map(([key]) => key)),
        switches: entries.filter(([, rule]) => rule.type === 'bool' || rule.type === 'enum').map(([key]) => key),
    };
}

/**
 * @param {string} text a plan document
 * @returns {string | null} the text after `**Status:**` on the first status line, or null when there is none
 */
export function statusOf(text) {
    const line = text.split('\n').find((candidate) => candidate.startsWith('**Status:**'));
    return line === undefined ? null : line.slice('**Status:**'.length).trim();
}

/**
 * @param {unknown} entry a ledger entry
 * @param {number} index its position
 * @returns {string | null} what is wrong with the entry's shape, or null
 */
function shapeProblem(entry, index) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return `entry ${index} is not an object`;
    }
    const { key, plan, task, reason } = /** @type {Record<string, unknown>} */ (entry);
    const text = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== '';
    if (!text(key)) {
        return `entry ${index} has no key`;
    }
    if (!text(reason)) {
        return `${key}: reason is empty - say why the switch stays, or why it is permanent`;
    }
    const planned = text(plan) && text(task);
    if (!planned && !(plan === null && task === null)) {
        return `${key}: plan and task are both set (the task that deletes the losing path) or both null (permanent)`;
    }
    return null;
}

/**
 * @param {string} key a ledger key that exists
 * @param {string} plan the plan the entry names
 * @param {string | null | undefined} status the plan's status text, null without one, undefined without the file
 * @returns {string | null} what is wrong with the entry's plan, or null
 */
function planProblem(key, plan, status) {
    if (status === undefined) {
        return `${key}: plan ${plan} does not exist`;
    }
    if (status !== null && DONE.test(status)) {
        return `${key}: plan ${plan} is built (${status.split(' - ')[0]}) but the key still exists`;
    }
    return null;
}

/**
 * Checks the ledger against the config keys and the plans.
 * @param {object} input what to check
 * @param {{ all: Set<string>, switches: string[] }} input.keys the config keys
 * @param {unknown} input.ledger the parsed ledger
 * @param {(plan: string) => string | null | undefined} input.statusOfPlan a plan's status text, null when the plan has
 *   none and undefined when the file is not there
 * @returns {string[]} one line per problem
 */
export function checkFlagLedger({ keys, ledger, statusOfPlan }) {
    if (!Array.isArray(ledger)) {
        return ['the ledger is not an array of { key, plan, task, reason }'];
    }
    /** @type {(string | null)[]} */
    const found = [];
    const seen = new Set();
    for (const [index, entry] of ledger.entries()) {
        const shape = shapeProblem(entry, index);
        found.push(shape);
        if (shape === null) {
            const { key, plan } = /** @type {{ key: string, plan: string | null }} */ (entry);
            found.push(seen.has(key) ? `${key}: listed twice` : null);
            seen.add(key);
            const gone = `${key}: no such config key any more - remove the entry`;
            found.push(!keys.all.has(key) ? gone : plan === null ? null : planProblem(key, plan, statusOfPlan(plan)));
        }
    }
    for (const key of keys.switches) {
        found.push(
            seen.has(key)
                ? null
                : `${key}: a boolean or enum rule with no ledger entry - add { key, plan, task, reason }`,
        );
    }
    return found.filter((problem) => problem !== null);
}

/**
 * Reads the ledger and the plans and checks them against the real config rules.
 * @param {string | URL} [ledgerPath] the ledger file
 * @param {URL} [root] the repository root plans are named from
 * @returns {string[]} the problems
 */
export function checkFiles(ledgerPath = LEDGER, root = ROOT) {
    let ledger;
    try {
        ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    } catch (error) {
        return [`${String(ledgerPath)}: ${error instanceof Error ? error.message : String(error)}`];
    }
    const statusOfPlan = (/** @type {string} */ plan) => {
        const path = new URL(plan, root);
        return existsSync(path) ? statusOf(readFileSync(path, 'utf8')) : undefined;
    };
    return checkFlagLedger({ keys: configKeys(), ledger, statusOfPlan });
}

/* v8 ignore start -- thin CLI; the exported functions are tested */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [ledgerArg] = process.argv.slice(2);
    const problems = checkFiles(ledgerArg ?? LEDGER);
    for (const problem of problems) {
        console.log(`flag-ledger: ${problem}`);
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
