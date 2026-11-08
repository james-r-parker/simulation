// The `deploy` job's registration step of .github/workflows/deploy.yml: adds the release to the D1 `releases` table.
// The release's files are already deployed on its own Pages branch (a previous step). Uses the repo-pinned wrangler
// passed as WRANGLER (the `.github/deploy` install). Writes to the account the job's token reaches (`--remote`).
//   node scripts/release-upload.mjs <release-entry.json> [--db <name>]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { aliasBranch } from '../js/library/releases.js';
import { readReleaseSql, registerPlan } from './lib/release-upload.mjs';

const [entryFile, ...rest] = process.argv.slice(2);
const database = rest[0] === '--db' ? rest[1] : 'blob-library';
const wrangler = process.env.WRANGLER ?? 'wrangler';
const started = Date.now();

/**
 * @param {string} sql one statement
 * @returns {any[]} the `results` rows of the statement
 */
function execute(sql) {
    const done = spawnSync(wrangler, ['d1', 'execute', database, '--remote', '--json', '--command', sql], {
        encoding: 'utf8',
    });
    if (done.status !== 0) {
        throw new Error(`release-upload: d1 execute failed: ${done.stderr}`);
    }
    return JSON.parse(done.stdout)[0]?.results ?? [];
}

const entry = JSON.parse(readFileSync(entryFile, 'utf8'));
const plan = registerPlan(entry, execute(readReleaseSql(entry.version))[0] ?? null);
if (plan.action === 'insert') {
    execute(plan.sql);
}
console.log(
    JSON.stringify({
        event: 'ReleaseUploaded',
        version: entry.version,
        branch: aliasBranch(entry.version),
        action: plan.action,
        wallMs: Date.now() - started,
    }),
);
