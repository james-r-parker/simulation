// The role budget (`npm run role:budget`): for each role a closed-form budget of its job from the config alone, with a margin
// per step (docs/designs/role-budget.md). Phase 1: the hunter against each prey. A detector and a tuning tool, never fitness.
// Logs every cell at debug level to `.sim/logs/role-budget-<configHash>.jsonl`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { arenaConfig } from '../js/evo/chase-arena.js';
import { PREY_SPECS } from '../js/evo/role-budget-chase.js';
import { PHASE1_ROWS, matrix } from '../js/evo/role-budget-matrix.js';
import { validateModel } from '../js/evo/role-budget-model.js';
import { searchSettings, withPath } from '../js/evo/role-budget-search.js';
import { configHash } from '../js/sim/config.js';
import { emitReport, runAsMain, withLogFile } from './lib/audit-io.mjs';
import { exitCodeOf, parseFlags } from './lib/cli-args.mjs';
import { formatReport, formatSearch } from './lib/role-budget-report.mjs';
import { logRunConfig } from './lib/run-config.mjs';

const USAGE =
    'usage: role-budget [--config <file.json>] [--set <path>=<value> ...] [--model <file.json>] [--mix <spec=w,...>] [--rows <a,b>] [--search] [--reliable] [--out-dir <dir>] [--json] [--out <path>]';

/** The most findings of one pair the search writes override files for. */
const FILES_PER_PAIR = 5;

/**
 * @typedef {object} BudgetArgs
 * @property {string | null} config a config overrides file (the format of `audit:chase --config`)
 * @property {string[]} set overrides `path=value`, applied after the file
 * @property {string | null} model a file of overrides of `MODEL_DEFAULTS`
 * @property {Record<string, number> | undefined} mix the weights of the `predator:average` row
 * @property {string[] | undefined} rows the rows to print
 * @property {boolean} search whether to search a single setting for each impossible row
 * @property {boolean} reliable whether the hunter acts only on a prey it reliably sees
 * @property {string} outDir where the search writes its override files
 * @property {boolean} json whether to print JSON
 * @property {string | null} out a file to write the output to
 */

/**
 * @param {string | undefined} value `spec=weight,spec=weight`
 * @returns {Record<string, number>} the weights
 * @throws {Error} on an entry that is not `name=number`
 */
function parseMix(value) {
    return Object.fromEntries(
        String(value)
            .split(',')
            .map((entry) => {
                const [name, weight, ...extra] = entry.split('=');
                if (
                    !name ||
                    weight === undefined ||
                    extra.length > 0 ||
                    weight === '' ||
                    Number.isNaN(Number(weight))
                ) {
                    throw new Error(`--mix: "${entry}" is not spec=weight\n${USAGE}`);
                }
                return [name, Number(weight)];
            }),
    );
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{rest: string[], set: string[]}} the arguments without the `--set` pairs, and those pairs
 */
function pullSets(argv) {
    /** @type {string[]} */
    const set = [];
    /** @type {string[]} */
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--set') {
            if (argv[i + 1] === undefined) {
                throw new Error(`--set needs path=value\n${USAGE}`);
            }
            set.push(argv[++i]);
        } else {
            rest.push(argv[i]);
        }
    }
    return { rest, set };
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {BudgetArgs} parsed options
 */
export function parseArgs(argv) {
    const { rest, set } = pullSets(argv);
    const opts = parseFlags(rest, {
        valueFlags: {
            '--config': (v) => ['config', String(v)],
            '--model': (v) => ['model', String(v)],
            '--mix': (v) => ['mix', parseMix(v)],
            '--rows': (v) => ['rows', String(v).split(',')],
            '--out-dir': (v) => ['outDir', String(v)],
            '--out': (v) => ['out', String(v)],
        },
        booleanFlags: { '--search': 'search', '--reliable': 'reliable', '--json': 'json' },
        defaults: {
            config: null,
            model: null,
            mix: undefined,
            rows: undefined,
            search: false,
            reliable: false,
            outDir: 'evals/role-budget',
            json: false,
            out: null,
        },
        usage: USAGE,
    });
    return /** @type {BudgetArgs} */ ({ ...opts, set });
}

/**
 * @param {string} text the value of a `--set`
 * @returns {number | boolean | string} the number, the boolean or the string it reads as
 */
function valueOf(text) {
    if (text === 'true' || text === 'false') {
        return text === 'true';
    }
    return text !== '' && !Number.isNaN(Number(text)) ? Number(text) : text;
}

/**
 * @param {Record<string, any>} overrides the overrides so far
 * @param {string[]} set the `path=value` pairs
 * @returns {Record<string, any>} the overrides with each pair applied in order
 * @throws {Error} on a pair that is not `path=value`
 */
export function applySets(overrides, set) {
    return set.reduce((acc, pair) => {
        const at = pair.indexOf('=');
        if (at <= 0) {
            throw new Error(`--set: "${pair}" is not path=value\n${USAGE}`);
        }
        return withPath(acc, pair.slice(0, at), /** @type {any} */ (valueOf(pair.slice(at + 1))));
    }, overrides);
}

/**
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {ReturnType<typeof matrix>} result the matrix
 * @param {string} hash the config hash
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @returns {void}
 */
function logCells(config, result, hash, log) {
    for (const row of result.rows) {
        for (const [step, c] of Object.entries(row.cells)) {
            log.log('debug', 'RoleBudgetCell', {
                row: row.name,
                step,
                margin: c.margin,
                status: c.status,
                binding: c.binding,
                configHash: hash,
            });
        }
    }
}

/**
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {Record<string, any>} overrides the overrides that made it
 * @param {ReturnType<typeof matrix>} result the matrix
 * @param {{model: any, outDir: string, arm: string}} where the model, the output directory and the arm's name
 * @returns {{pair: string, findings: import('../js/evo/role-budget-search.js').Finding[], files: string[]}[]} the search of
 *   each prey row that is impossible, and the override files written
 */
function searchRows(config, overrides, result, { model, outDir, arm }) {
    const impossible = result.rows.filter((r) => r.name.startsWith('predator:') && r.status === 'impossible');
    return impossible
        .filter((r) => PREY_SPECS.includes(r.name.slice('predator:'.length)))
        .map((row) => {
            const prey = row.name.slice('predator:'.length);
            const findings = searchSettings(config, { hunter: 'predator', prey }, { overrides, model });
            mkdirSync(outDir, { recursive: true });
            const files = findings.slice(0, FILES_PER_PAIR).map((f, i) => {
                const file = join(outDir, `${arm}-predator-${prey}-${i + 1}.json`);
                writeFileSync(file, `${JSON.stringify(f.overrides, null, 2)}\n`);
                return file;
            });
            return { pair: `predator:${prey}`, findings: findings.slice(0, FILES_PER_PAIR), files };
        });
}

/**
 * @param {BudgetArgs} args the options
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the report prints
 * @returns {Promise<{result: ReturnType<typeof matrix>, searched: any[]}>} what was computed
 */
export async function runBudget(args, { logDir = '.sim/logs', print = console.log } = {}) {
    const fileOverrides = args.config === null ? {} : JSON.parse(readFileSync(args.config, 'utf8'));
    const overrides = applySets(fileOverrides, args.set);
    const config = arenaConfig(overrides);
    const hash = configHash(config);
    const modelFile = args.model === null ? {} : JSON.parse(readFileSync(args.model, 'utf8'));
    const model = validateModel(args.reliable ? { ...modelFile, reliableSight: true } : modelFile);
    const arm = args.config === null ? 'defaults' : basename(args.config, '.json');
    return withLogFile({ path: join(logDir, `role-budget-${hash}.jsonl`), level: 'debug' }, async (log) => {
        logRunConfig(log, {
            tool: 'role-budget',
            policy: null,
            configHash: hash,
            seeds: null,
            ticks: null,
            extra: { model },
        });
        const result = matrix(config, model, args.rows ?? PHASE1_ROWS, { mix: args.mix });
        logCells(config, result, hash, log);
        const searched = args.search ? searchRows(config, overrides, result, { model, outDir: args.outDir, arm }) : [];
        const text = args.json
            ? JSON.stringify({ configHash: hash, ...result, searched }, null, 2)
            : [formatReport(result, hash), ...(searched.length > 0 ? [formatSearch(searched)] : [])].join('\n\n');
        emitReport(text, { print, out: args.out });
        return { result, searched };
    });
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the report prints
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv, io = {}) {
    return exitCodeOf(() => runBudget(parseArgs(argv), io));
}

await runAsMain(import.meta.url, main);
