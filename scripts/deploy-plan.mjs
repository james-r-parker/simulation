// The `plan` job of .github/workflows/preview.yml: reads the workflow_run event and prints `action`, `branch`, `sha`, `pr`
// and `reason` as GITHUB_OUTPUT lines. No secrets, no network.
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployPlan, readBindings } from './lib/deploy-plan.mjs';

/**
 * @typedef {object} PlanDeps
 * @property {Record<string, string | undefined>} env GITHUB_EVENT_PATH, GITHUB_REPOSITORY and GITHUB_OUTPUT
 * @property {(file: string) => string} readFile reads a file
 * @property {(file: string, text: string) => void} appendFile appends to a file
 */

/**
 * @param {PlanDeps} deps the environment and the files
 * @returns {string[]} the lines printed: the `key=value` outputs, then a `DeploySkipped` record on a skip
 * @throws {Error} when GITHUB_EVENT_PATH or GITHUB_REPOSITORY is missing
 */
export function runDeployPlan({ env, readFile, appendFile }) {
    if (env.GITHUB_EVENT_PATH === undefined || env.GITHUB_REPOSITORY === undefined) {
        throw new Error('deploy-plan: GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required');
    }
    const event = JSON.parse(readFile(env.GITHUB_EVENT_PATH)).workflow_run;
    const bindings = readBindings(readFile('wrangler.toml'));
    const plan = deployPlan({ event, repo: env.GITHUB_REPOSITORY, bindings });
    const lines = Object.entries(plan).map(([key, value]) => `${key}=${value}`);
    if (env.GITHUB_OUTPUT !== undefined) {
        appendFile(env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    }
    const skipped =
        plan.action === 'skip' ? [JSON.stringify({ event: 'DeploySkipped', reason: plan.reason, sha: plan.sha })] : [];
    return [...lines, ...skipped];
}

/**
 * @param {Record<string, string | undefined>} env the environment
 * @returns {PlanDeps} the environment and the real file reader and appender
 */
export function cliDeps(env) {
    return {
        env,
        readFile: (file) => readFileSync(file, 'utf8'),
        appendFile: (file, text) => appendFileSync(file, text),
    };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    console.log(runDeployPlan(cliDeps(process.env)).join('\n'));
}
