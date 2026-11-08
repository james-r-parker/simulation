// The `deploy` job's registration step of .github/workflows/deploy.yml: adds the release to the D1 `releases` table.
// The release's files are already deployed on its own Pages branch (a previous step). Uses the repo-pinned wrangler
// passed as WRANGLER (the `.github/deploy` install). Writes to the account the job's token reaches (`--remote`).
//   node scripts/release-upload.mjs <release-entry.json> [--db <name>]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aliasBranch } from '../js/library/releases.js';
import { readReleaseSql, registerPlan } from './lib/release-upload.mjs';

/**
 * @typedef {object} UploadDeps
 * @property {(file: string) => string} readFile reads a file
 * @property {(database: string, sql: string) => any[]} execute runs one statement on D1 and returns its rows
 * @property {() => number} now a millisecond clock (wall time of the step only)
 */

/**
 * @param {string[]} argv `<release-entry.json> [--db <name>]`
 * @param {UploadDeps} deps the file reader, the D1 runner and the clock
 * @returns {Record<string, unknown>} the `ReleaseUploaded` record
 */
export function releaseUpload(argv, { readFile, execute, now }) {
    const started = now();
    const [entryFile, ...rest] = argv;
    const database = rest[0] === '--db' ? rest[1] : 'blob-library';
    const entry = JSON.parse(readFile(entryFile));
    const plan = registerPlan(entry, execute(database, readReleaseSql(entry.version))[0] ?? null);
    if (plan.action === 'insert') {
        execute(database, plan.sql);
    }
    return {
        event: 'ReleaseUploaded',
        version: entry.version,
        branch: aliasBranch(entry.version),
        action: plan.action,
        wallMs: now() - started,
    };
}

/**
 * @param {(cmd: string, args: string[]) => {status: number | null, stdout: string, stderr: string}} spawn runs a command
 * @param {string} wrangler the wrangler command
 * @returns {(database: string, sql: string) => any[]} runs one statement on remote D1 and returns its `results` rows,
 *   throwing when wrangler fails
 */
export function makeD1Execute(spawn, wrangler) {
    return (database, sql) => {
        const done = spawn(wrangler, ['d1', 'execute', database, '--remote', '--json', '--command', sql]);
        if (done.status !== 0) {
            throw new Error(`release-upload: d1 execute failed: ${done.stderr}`);
        }
        return JSON.parse(done.stdout)[0]?.results ?? [];
    };
}

/**
 * @param {Record<string, string | undefined>} env the environment (WRANGLER names the wrangler command)
 * @returns {UploadDeps} the real file reader, the remote D1 runner and the clock
 */
export function cliDeps(env) {
    return {
        readFile: (file) => readFileSync(file, 'utf8'),
        execute: makeD1Execute((cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }), env.WRANGLER ?? 'wrangler'),
        now: Date.now,
    };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify(releaseUpload(process.argv.slice(2), cliDeps(process.env))));
}
