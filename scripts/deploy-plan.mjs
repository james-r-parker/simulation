// The `plan` job of .github/workflows/preview.yml: reads the workflow_run event and prints `action`, `branch`, `sha`, `pr`
// and `reason` as GITHUB_OUTPUT lines. No secrets, no network beyond `git ls-remote`.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { deployPlan, readBindings } from './lib/deploy-plan.mjs';

const eventPath = process.env.GITHUB_EVENT_PATH;
const repo = process.env.GITHUB_REPOSITORY;
if (eventPath === undefined || repo === undefined) {
    throw new Error('deploy-plan: GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required');
}
const event = JSON.parse(readFileSync(eventPath, 'utf8')).workflow_run;
const seasonNext =
    spawnSync('git', ['ls-remote', '--exit-code', 'origin', 'season/next'], { stdio: 'ignore' }).status === 0;
const plan = deployPlan({ event, repo, bindings: readBindings(readFileSync('wrangler.toml', 'utf8')), seasonNext });
const lines = Object.entries(plan).map(([key, value]) => `${key}=${value}`);
console.log(lines.join('\n'));
if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}
if (plan.action === 'skip') {
    console.log(JSON.stringify({ event: 'DeploySkipped', reason: plan.reason, sha: plan.sha }));
}
