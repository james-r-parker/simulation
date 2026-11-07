// Checks the committed WASM kernels (docs/designs/wasm-kernels.md): the binary's sha256 must match
// wasm/blob-kernels.wasm.sha256, and on a machine with cargo a fresh build from wasm/src must reproduce it. Without
// cargo the rebuild is skipped with a note. Prints one line per problem and exits 1 if there are any.
// Usage: node scripts/check-wasm.mjs [--no-rebuild]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BINARY = join(ROOT, 'wasm/blob-kernels.wasm');
const HASH_FILE = join(ROOT, 'wasm/blob-kernels.wasm.sha256');
const BUILD = join(ROOT, 'scripts/build-wasm.sh');

/**
 * @param {Uint8Array} bytes file contents
 * @returns {string} the lowercase hex sha256
 */
export function sha256Hex(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Reads the hash out of a `sha256sum` line (`<hex>  blob-kernels.wasm`).
 * @param {string} text the hash file's contents
 * @returns {string | null} the hex hash, or null when the line is not a sha256sum line
 */
export function parseHashFile(text) {
    const match = /^([0-9a-f]{64})\s+\*?blob-kernels\.wasm\s*$/.exec(text.trim());
    return match === null ? null : match[1];
}

/**
 * Compares a binary with its recorded hash.
 * @param {Uint8Array | null} bytes the binary, or null when it is missing
 * @param {string | null} hashText the hash file, or null when it is missing
 * @returns {string[]} problems
 */
export function checkHash(bytes, hashText) {
    if (bytes === null) {
        return ['wasm: wasm/blob-kernels.wasm is missing - run scripts/build-wasm.sh'];
    }
    if (hashText === null) {
        return ['wasm: wasm/blob-kernels.wasm.sha256 is missing - run scripts/build-wasm.sh'];
    }
    const expected = parseHashFile(hashText);
    if (expected === null) {
        return ['wasm: wasm/blob-kernels.wasm.sha256 is not a sha256sum line - run scripts/build-wasm.sh'];
    }
    const actual = sha256Hex(bytes);
    return actual === expected
        ? []
        : [
              `wasm: wasm/blob-kernels.wasm hashes to ${actual}, the .sha256 file says ${expected} - run scripts/build-wasm.sh`,
          ];
}

/**
 * @param {Record<string, string | undefined>} env the environment
 * @returns {boolean} whether cargo can be run, on the PATH or in ~/.cargo/bin
 */
export function hasCargo(env = process.env) {
    const path = `${join(homedir(), '.cargo/bin')}:${env.PATH ?? ''}`;
    return spawnSync('cargo', ['--version'], { env: { ...env, PATH: path }, stdio: 'ignore' }).status === 0;
}

/**
 * Rebuilds the kernels into a temporary file and compares its hash with the committed binary's.
 * @param {Uint8Array} bytes the committed binary
 * @returns {string[]} problems
 */
function checkRebuild(bytes) {
    const dir = mkdtempSync(join(tmpdir(), 'check-wasm-'));
    try {
        const out = join(dir, 'blob-kernels.wasm');
        const run = spawnSync('bash', [BUILD, out], { encoding: 'utf8' });
        if (run.status !== 0) {
            return [`wasm: scripts/build-wasm.sh failed (exit ${run.status}): ${(run.stderr ?? '').trim()}`];
        }
        const rebuilt = sha256Hex(readFileSync(out));
        return rebuilt === sha256Hex(bytes)
            ? []
            : [
                  `wasm: a fresh build of wasm/src hashes to ${rebuilt}, not the committed binary - run scripts/build-wasm.sh`,
              ];
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/* v8 ignore start - the command-line shell; the checks above are unit-tested */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const bytes = existsSync(BINARY) ? readFileSync(BINARY) : null;
    const hashText = existsSync(HASH_FILE) ? readFileSync(HASH_FILE, 'utf8') : null;
    const problems = checkHash(bytes, hashText);
    if (problems.length === 0 && bytes !== null && !process.argv.includes('--no-rebuild')) {
        if (hasCargo()) {
            problems.push(...checkRebuild(bytes));
        } else {
            console.log('wasm: cargo not found - skipped the rebuild check (the hash check ran)');
        }
    }
    for (const problem of problems) {
        console.log(problem);
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
