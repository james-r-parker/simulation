// The `plan` job of .github/workflows/preview.yml: reads the workflow_run event and prints `action`, `branch`, `sha`, `pr`
// and `reason` as GITHUB_OUTPUT lines. No secrets, no network beyond `git ls-remote`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployPlan, readBindings } from './lib/deploy-plan.mjs';

/**
 * @typedef {object} PlanDeps
 * @property {Record<string, string | undefined>} env GITHUB_EVENT_PATH, GITHUB_REPOSITORY and GITHUB_OUTPUT
 * @property {(file: string) => string} readFile reads a file
 * @property {(file: string, text: string) => void} appendFile appends to a file
 * @property {boolean} seasonNext whether origin has a `season/next` branch
 */

/**
 * @param {PlanDeps} deps the environment, the files and whether `season/next` exists
 * @returns {string[]} the lines printed: the `key=value` outputs, then a `DeploySkipped` record on a skip
 * @throws {Error} when GITHUB_EVENT_PATH or GITHUB_REPOSITORY is missing
 */
export function runDeployPlan({ env, readFile, appendFile, seasonNext }) {
    if (env.GITHUB_EVENT_PATH === undefined || env.GITHUB_REPOSITORY === undefined) {
        throw new Error('deploy-plan: GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required');
    }
    const event = JSON.parse(readFile(env.GITHUB_EVENT_PATH)).workflow_run;
    const bindings = readBindings(readFile('wrangler.toml'));
    const plan = deployPlan({ event, repo: env.GITHUB_REPOSITORY, bindings, seasonNext });
    const lines = Object.entries(plan).map(([key, value]) => `${key}=${value}`);
    if (env.GITHUB_OUTPUT !== undefined) {
        appendFile(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    }
    const skipped =
        plan.action === 'skip' ? [JSON.stringify({ event: 'DeploySkipped', reason: plan.reason, sha: plan.sha })] : [];
    return [...lines, ...skipped];
}

/**
 * @param {string} cmd a command
 * @param {string[]} args its arguments
 * @returns {number | null} its exit status, its output discarded
 */
export function spawnStatus(cmd, args) {
    return spawnSync(cmd, args, { stdio: 'ignore' }).status;
}

/**
 * @param {(cmd: string, args: string[]) => number | null} status runs a command and returns its exit status
 * @returns {boolean} whether origin has a `season/next` branch
 */
export function seasonNextOf(status) {
    return status('git', ['ls-remote', '--exit-code', 'origin', 'season/next']) === 0;
}

/**
 * @param {Record<string, string | undefined>} env the environment
 * @param {boolean} seasonNext whether origin has a `season/next` branch
 * @returns {PlanDeps} the environment and the real file reader and appender
 */
export function cliDeps(env, seasonNext) {
    return {
        env,
        readFile: (file) => readFileSync(file, 'utf8'),
        appendFile: (file, text) => appendFileSync(file, text),
        seasonNext,
    };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const seasonNext = seasonNextOf(spawnStatus);
    console.log(runDeployPlan(cliDeps(process.env, seasonNext)).join('\n'));
}
