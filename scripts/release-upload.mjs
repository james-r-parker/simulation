// The `deploy` job's R2 step of .github/workflows/release.yml: uploads `dist-release/` under `releases/<version>/`, then
// adds the release to `releases/index.json`. Uses the repo-pinned wrangler passed as WRANGLER (the `.github/deploy`
// install). Run only with `--remote` data: it writes to the account the job's token reaches.
//   node scripts/release-upload.mjs <version> <dist-release-dir> <release-entry.json> [--bucket <name>]
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addRelease, INDEX_KEY } from '../functions/_lib/releases.js';
import { uploadManifest } from './lib/release-upload.mjs';

const [version, dir, entryFile, ...rest] = process.argv.slice(2);
const bucket = rest[0] === '--bucket' ? rest[1] : 'matrix-releases';
const wrangler = process.env.WRANGLER ?? 'wrangler';
const started = Date.now();

/**
 * @param {string[]} args wrangler arguments
 * @returns {import('node:child_process').SpawnSyncReturns<string>} the finished process
 */
function run(args) {
    return spawnSync(wrangler, args, { encoding: 'utf8' });
}

/**
 * @param {string} root a directory
 * @param {string} [prefix] the path so far
 * @returns {string[]} every file below it, relative, with `/` separators
 */
function walk(root, prefix = '') {
    return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((item) =>
        item.isDirectory() ? walk(root, `${prefix}${item.name}/`) : [`${prefix}${item.name}`],
    );
}

const manifest = uploadManifest(version, walk(dir));
for (const row of manifest) {
    const put = run([
        'r2',
        'object',
        'put',
        `${bucket}/${row.key}`,
        '--file',
        join(dir, row.path),
        '--content-type',
        row.contentType,
        '--remote',
    ]);
    if (put.status !== 0) {
        throw new Error(`release-upload: put ${row.key} failed: ${put.stderr}`);
    }
}
const got = run(['r2', 'object', 'get', `${bucket}/${INDEX_KEY}`, '--remote', '--pipe']);
if (got.status !== 0 && !/does not exist|not found|NoSuchKey/i.test(got.stderr)) {
    throw new Error(`release-upload: reading the index failed: ${got.stderr}`);
}
const index = got.status === 0 ? JSON.parse(got.stdout) : { releases: [] };
const next = addRelease(index, JSON.parse(readFileSync(entryFile, 'utf8')));
if (next !== index) {
    const file = `${entryFile}.index.json`;
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    const put = run([
        'r2',
        'object',
        'put',
        `${bucket}/${INDEX_KEY}`,
        '--file',
        file,
        '--content-type',
        'application/json',
        '--remote',
    ]);
    if (put.status !== 0) {
        throw new Error(`release-upload: writing the index failed: ${put.stderr}`);
    }
}
console.log(JSON.stringify({ event: 'ReleaseUploaded', version, keys: manifest.length, wallMs: Date.now() - started }));
