// The role budget (`npm run role:budget`): for each role a closed-form budget of its job from the config alone, with a margin
// per step (docs/designs/role-budget.md). Phase 1: the hunter against each prey. A detector and a tuning tool, never fitness.
// Logs every cell at debug level to `.sim/logs/role-budget-<configHash>.jsonl`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { arenaConfig } from '../js/evo/chase-arena.js';
import { chaseCells, kinematicRows } from '../js/evo/role-budget-check.js';
import { defenceCheck } from '../js/evo/role-budget-defence-check.js';
import { warnCheck } from '../js/evo/role-budget-warn-check.js';
import { PREY_SPECS } from '../js/evo/role-budget-chase.js';
import { catchShares } from '../js/evo/role-budget-shares.js';
import { BUILT_ROWS, matrix } from '../js/evo/role-budget-matrix.js';
import { validateModel } from '../js/evo/role-budget-model.js';
import { searchSettings, withPath } from '../js/evo/role-budget-search.js';
import { configHash } from '../js/sim/config.js';
import { emitReport, runAsMain, withLogFile } from './lib/audit-io.mjs';
import { exitCodeOf, parseFlags } from './lib/cli-args.mjs';
import { formatDefenderSearch, searchDefenderRows } from './lib/role-budget-defender-search.mjs';
import { formatCheck, formatReport, formatSearch } from './lib/role-budget-report.mjs';
import { logRunConfig } from './lib/run-config.mjs';

const USAGE =
    'usage: role-budget [--config <file.json>] [--set <path>=<value> ...] [--model <file.json>] [--mix <spec=w,...>] [--rows <a,b>] [--search] [--check] [--reliable] [--out-dir <dir>] [--json] [--out <path>]';

/** The most findings of one pair the search writes override files for. */
const FILES_PER_PAIR = 5;

/**
 * @typedef {object} BudgetArgs
 * @property {string | null} config a config overrides file (the format of `audit:chase --config`)
 * @property {string[]} set overrides `path=value`, applied after the file
 * @property {string | null} model a file of overrides of `MODEL_DEFAULTS`
 * @property {Record<string, number> | undefined} mix the weights of the `predator:average` row
 * @property {string[] | undefined} rows the rows to print
 * @property {boolean} search whether to search a single setting for each row that is not fit
 * @property {boolean} check whether to play each row's scene beside the formula
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
        booleanFlags: { '--search': 'search', '--check': 'check', '--reliable': 'reliable', '--json': 'json' },
        defaults: {
            config: null,
            model: null,
            mix: undefined,
            rows: undefined,
            search: false,
            check: false,
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
 *   each prey row that is not fit for the rung screen (impossible, or caught but not learnable), and the override files
 *   written
 */
function searchRows(config, overrides, result, { model, outDir, arm }) {
    const unfit = result.rows.filter(
        (r) => PREY_SPECS.includes(r.name.slice('predator:'.length)) && r.detail?.fit === false,
    );
    return unfit.map((row) => {
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
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {string} prey the prey spec
 * @returns {{pair: string, straight: any[], broken: any[], shares: Record<string, import('../js/evo/role-budget-shares.js').CatchShares>}} the predator's cells on both bounds
 */
function chasePair(config, prey) {
    const straight = chaseCells(config, { hunter: 'predator', prey, straight: true });
    const broken = chaseCells(config, { hunter: 'predator', prey, straight: false });
    return {
        pair: `predator:${prey}`,
        straight,
        broken,
        shares: { straight: catchShares(straight), broken: catchShares(broken) },
    };
}

/**
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {{defence: boolean, scout: boolean, model: import('../js/evo/role-budget-model.js').RoleModel}} asked whether the
 *   defender and the scout rows were asked for, and the model options
 * @returns {{readings: import('../js/evo/role-budget-defence-check.js').DefenceReading[], drift: number}} their scenes
 *   beside their formulas
 */
function guildReadings(config, { defence, scout, model }) {
    const parts = [defence ? defenceCheck(config, model) : null, scout ? warnCheck(config, model) : null];
    const played = parts.filter((part) => part !== null);
    return {
        readings: played.flatMap((part) => part.readings),
        drift: played.reduce((sum, part) => sum + part.drift, 0),
    };
}

/**
 * Plays the scene of each requested prey beside the formula, on both prey bounds, and the kinematics against the body table.
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {{preys: string[], defence: boolean, scout: boolean, model: import('../js/evo/role-budget-model.js').RoleModel}} asked
 *   the prey rows asked for, whether the defender and scout rows were, and the model options
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @returns {{kinematics: import('../js/evo/role-budget-check.js').KinematicRow[], pairs: any[],
 *   defence: import('../js/evo/role-budget-defence-check.js').DefenceReading[], drift: number}} the check
 */
function crossCheck(config, { preys, defence, scout, model }, log) {
    const kinematics = kinematicRows(config);
    const pairs = preys.map((prey) => chasePair(config, prey));
    const played = guildReadings(config, { defence, scout, model });
    let drift = played.drift;
    for (const r of played.readings.filter((reading) => reading.drift)) {
        log.log('warn', 'RoleBudgetDrift', {
            row: r.row,
            step: r.what,
            formula: r.formula,
            scene: r.scene,
            tolerance: r.tolerance,
        });
    }
    for (const k of kinematics.filter((row) => row.drift)) {
        drift += 1;
        log.log('warn', 'RoleBudgetDrift', {
            row: k.spec,
            step: k.what,
            formula: k.formula,
            scene: k.sim,
            tolerance: k.tolerance,
        });
    }
    for (const { pair, straight, broken, shares } of pairs) {
        for (const [bound, share] of Object.entries(shares).filter((entry) => entry[1].drift > 0)) {
            drift += share.drift;
            log.log('warn', 'RoleBudgetDrift', {
                row: pair,
                step: `catch share ${bound}`,
                formula: share.bearings.map((b) => b.formula),
                scene: share.bearings.map((b) => b.sim),
                tolerance: 'sign and rank per bearing',
            });
        }
        for (const c of [...straight, ...broken].filter((cell) => cell.drift)) {
            drift += 1;
            log.log('warn', 'RoleBudgetDrift', {
                row: pair,
                step: `${c.distance}px@${c.bearing}`,
                formula: c.formula,
                scene: c.sim,
                tolerance: 2,
            });
        }
    }
    return { kinematics, pairs, defence: played.readings, drift };
}

/**
 * @param {Record<string, any>} config an `arenaConfig`
 * @param {{overrides: Record<string, any>, result: ReturnType<typeof matrix>, where: {model: any, outDir: string, arm: string}}} from
 *   the overrides that made it, the matrix and where the search writes
 * @returns {{searched: any[], defence: ReturnType<typeof searchDefenderRows>}} the search of each hunter row that is not
 *   fit, and of the defender row when it was asked for
 */
function searchAll(config, { overrides, result, where }) {
    const defender = result.rows.some((r) => r.name === 'defender:predator');
    return {
        searched: searchRows(config, overrides, result, where),
        defence: defender ? searchDefenderRows(config, { ...where, overrides }) : [],
    };
}

/**
 * @param {boolean} json whether to print JSON
 * @param {{hash: string, result: ReturnType<typeof matrix>, searched: any[], defence: any[], check: any}} parts the config
 *   hash, the matrix, the searches and the cross-check
 * @returns {string} the report: JSON, or the matrix followed by each part that was asked for
 */
function render(json, { hash, result, searched, defence, check }) {
    if (json) {
        return JSON.stringify({ configHash: hash, ...result, searched, defenderSearch: defence, check }, null, 2);
    }
    return [
        formatReport(result, hash),
        ...(searched.length > 0 ? [formatSearch(searched)] : []),
        ...(defence.length > 0 ? [formatDefenderSearch(defence)] : []),
        ...(check ? [formatCheck(check)] : []),
    ].join('\n\n');
}

/**
 * @param {readonly string[]} rows the rows asked for
 * @param {import('../js/evo/role-budget-model.js').RoleModel} model the model options
 * @returns {{preys: string[], defence: boolean, scout: boolean, model: import('../js/evo/role-budget-model.js').RoleModel}}
 *   what the cross-check plays: the prey of each hunter row asked for, whether the defender and scout rows were, and the model
 */
function asked(rows, model) {
    const preys = rows
        .filter((r) => r.startsWith('predator:'))
        .map((r) => r.slice('predator:'.length))
        .filter((s) => PREY_SPECS.includes(s));
    return { preys, defence: rows.includes('defender:predator'), scout: rows.includes('scout:predator'), model };
}

/**
 * @param {BudgetArgs} args the options
 * @param {{logDir?: string, print?: (text: string) => void}} [io] where the log goes and where the report prints
 * @returns {Promise<{result: ReturnType<typeof matrix>, searched: any[], defenderSearch: any[], check: any}>} what was computed
 * @throws {Error} with `exitCode` 1 and `RoleBudgetDrift` when `--check` finds a cell outside its tolerance
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
        const result = matrix(config, model, args.rows ?? BUILT_ROWS, { mix: args.mix });
        logCells(config, result, hash, log);
        const { searched, defence } = args.search
            ? searchAll(config, { overrides, result, where: { model, outDir: args.outDir, arm } })
            : { searched: [], defence: [] };
        const check = args.check ? crossCheck(config, asked(args.rows ?? BUILT_ROWS, model), log) : null;
        const text = render(args.json, { hash, result, searched, defence, check });
        emitReport(text, { print, out: args.out });
        if (check !== null && check.drift > 0) {
            throw Object.assign(new Error(`RoleBudgetDrift: ${check.drift} reading(s) outside their tolerance`), {
                exitCode: 1,
            });
        }
        return { result, searched, defenderSearch: defence, check };
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
