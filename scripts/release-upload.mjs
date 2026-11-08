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
 * @param {string} database the D1 database name
 * @param {string} sql one statement
 * @returns {any[]} the `results` rows of the statement
 * @throws {Error} when wrangler fails
 */
function d1Execute(database, sql) {
    const wrangler = process.env.WRANGLER ?? 'wrangler';
    const done = spawnSync(wrangler, ['d1', 'execute', database, '--remote', '--json', '--command', sql], {
        encoding: 'utf8',
    });
    if (done.status !== 0) {
        throw new Error(`release-upload: d1 execute failed: ${done.stderr}`);
    }
    return JSON.parse(done.stdout)[0]?.results ?? [];
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const record = releaseUpload(process.argv.slice(2), {
        readFile: (file) => readFileSync(file, 'utf8'),
        execute: d1Execute,
        now: Date.now,
    });
    console.log(JSON.stringify(record));
}
