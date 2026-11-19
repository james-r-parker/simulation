// The champion world trial of the tuning lane (docs/designs/training-loop.md, Tuning lane, step 4): a 16-seed eval of
// `champions-v1` on an arm's exported champions against the matching live eval on the same seeds, read through
// `eval:compare`. The live report is cached by seeds, ticks and the default config's hash. A detector, never fitness.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configHash, createConfig } from '../../js/sim/config.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** The metrics the trial reads. */
export const WORLD_METRICS = Object.freeze([
    'eval.hunter_catches_per_1k',
    'eval.hunter_kills_per_life_mean',
    'eval.food_energy_per_1k',
]);
const DEFAULT_TICKS = 200000;

/**
 * @typedef {(script: string, argv: string[]) => Promise<{code: number, stdout: string}>} RunNode
 */

/**
 * @type {RunNode}
 */
export function runNode(script, argv) {
    return new Promise((done, fail) => {
        const child = spawn(process.execPath, [join(ROOT, 'scripts', `${script}.mjs`), ...argv], {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.on('error', fail);
        child.on('close', (code) => done({ code: code ?? 1, stdout }));
    });
}

/**
 * @param {string} [root] the repository root
 * @returns {string} 16 hex characters of the contents of `js/sim`, `js/evo` and the kernels' hash file: any change to the
 *   sim's code, not only its config, changes it
 */
export function codeHash(root = ROOT) {
    const hash = createHash('sha256');
    /** @param {string} dir */
    const walk = (dir) => {
        for (const entry of readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            const rel = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(rel);
            } else {
                hash.update(rel).update(readFileSync(join(root, rel)));
            }
        }
    };
    ['js/sim', 'js/evo'].forEach(walk);
    hash.update(readFileSync(join(root, 'wasm', 'blob-kernels.wasm.sha256')));
    return hash.digest('hex').slice(0, 16);
}

/**
 * @param {{seeds: number, ticks: number, code?: string}} trial the trial's size and the sim code's hash (default `codeHash()`)
 * @returns {string} the live report's cache file name: seeds, ticks, the default config's hash and the code hash
 */
export const liveName = ({ seeds, ticks, code = codeHash() }) =>
    `live-${seeds}x${ticks}-${configHash(createConfig({}))}-${code}.json`;

/**
 * @param {Record<string, any>} comparison `eval:compare --json` output
 * @returns {Record<string, {before: number | null, after: number | null, effect: number | null, verdict: string}>} the
 *   trial's metrics read from the rows
 */
export function readings(comparison) {
    return Object.fromEntries(
        WORLD_METRICS.map((metric) => {
            const row = (comparison.rows ?? []).find((/** @type {{metric: string}} */ r) => r.metric === metric);
            return [
                metric,
                {
                    before: row?.before ?? null,
                    after: row?.after ?? null,
                    effect: row?.effect ?? null,
                    verdict: row?.verdict ?? 'missing',
                },
            ];
        }),
    );
}

/**
 * @param {RunNode} run runs a script
 * @param {string} before the before report
 * @param {string} after the after report
 * @returns {Promise<ReturnType<typeof readings>>} the readings of `after` against `before`
 * @throws {Error} when `eval:compare` exits non-zero or prints no JSON
 */
async function compare(run, before, after) {
    const { code, stdout } = await run('eval-compare', [before, after, '--json']);
    if (code !== 0) {
        throw new Error(`eval:compare ${before} ${after} exited ${code}`);
    }
    return readings(JSON.parse(stdout));
}

/**
 * @typedef {object} TrialOptions
 * @property {{name: string, championsDir: string}[]} arms the arms to trial, `base` (the reference) among them
 * @property {number} seeds seeds per eval
 * @property {number} [ticks] ticks per eval (default 200000)
 * @property {number | null} [workers] workers per eval
 * @property {string} dir where the reports and option files go (created)
 * @property {string} liveDir where the cached live report goes (created)
 * @property {RunNode} [run] runs a script (default a child node process); a test stands in for it
 */

/**
 * Evals the live policy once (cached) and `champions-v1` on each arm's champions, then compares each arm with live, and
 * each other arm with `base`.
 * @param {TrialOptions} options the trial
 * @returns {Promise<Record<string, {vsLive: ReturnType<typeof readings>, vsBase: ReturnType<typeof readings> | null}>>}
 *   each arm's readings
 */
export async function worldTrial({ arms, seeds, ticks = DEFAULT_TICKS, workers = null, dir, liveDir, run = runNode }) {
    mkdirSync(dir, { recursive: true });
    mkdirSync(liveDir, { recursive: true });
    const size = [
        '--seeds',
        String(seeds),
        '--ticks',
        String(ticks),
        ...(workers === null ? [] : ['--workers', String(workers)]),
    ];
    const live = resolve(liveDir, liveName({ seeds, ticks }));
    if (!existsSync(live)) {
        await evalOne(run, ['--policy', 'live', '--out', live, ...size]);
    }
    /** @type {Record<string, any>} */
    const out = {};
    const base = arms.find((arm) => arm.name === 'base');
    for (const arm of arms) {
        const report = resolve(dir, `champions-${arm.name}.json`);
        const options = resolve(dir, `options-${arm.name}.json`);
        writeFileSync(options, `${JSON.stringify({ championsDir: resolve(arm.championsDir) })}\n`);
        await evalOne(run, ['--policy', 'champions-v1', '--policy-options', options, '--out', report, ...size]);
        out[arm.name] = {
            vsLive: await compare(run, live, report),
            vsBase:
                base === undefined || arm === base
                    ? null
                    : await compare(run, resolve(dir, `champions-${base.name}.json`), report),
        };
    }
    return out;
}

/**
 * @param {RunNode} run runs a script
 * @param {string[]} argv the `eval` script arguments
 * @returns {Promise<void>}
 * @throws {Error} when the eval exits non-zero
 */
async function evalOne(run, argv) {
    const { code } = await run('eval', argv);
    if (code !== 0) {
        throw new Error(`eval ${argv.join(' ')} exited ${code}`);
    }
}
