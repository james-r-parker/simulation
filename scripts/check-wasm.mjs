// Checks the committed WASM kernels (docs/designs/wasm-kernels.md): the binary's sha256 must match
// wasm/blob-kernels.wasm.sha256, and on a machine with cargo and wasm-opt a fresh build from wasm/src must reproduce it. Without
// them the rebuild is skipped with a note. wasm/blob-kernels.src.sha256 records the hash of every source the binary is
// built from, so a source change without a rebuild fails here (and in test/check-wasm.test.js) on a machine without cargo.
// Prints one line per problem and exits 1 if there are any.
// Usage: node scripts/check-wasm.mjs [--no-rebuild] | --write-sources (scripts/build-wasm.sh records the source hashes)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BINARY = join(ROOT, 'wasm/blob-kernels.wasm');
const HASH_FILE = join(ROOT, 'wasm/blob-kernels.wasm.sha256');
const BUILD = join(ROOT, 'scripts/build-wasm.sh');
const WASM_DIR = join(ROOT, 'wasm');
const SOURCE_HASH_FILE = join(WASM_DIR, 'blob-kernels.src.sha256');

/** Sources outside `src/` that change the built bytes. */
const BUILD_INPUTS = ['.cargo/config.toml', 'Cargo.lock', 'Cargo.toml', 'rust-toolchain.toml'];

/**
 * @param {string} wasmDir the crate directory
 * @returns {string[]} every source the binary is built from, relative to the crate, in code-point order
 */
export function sourceFiles(wasmDir = WASM_DIR) {
    const rust = readdirSync(join(wasmDir, 'src'))
        .filter((name) => name.endsWith('.rs'))
        .map((name) => `src/${name}`);
    return [...BUILD_INPUTS, ...rust].filter((file) => existsSync(join(wasmDir, file))).sort();
}

/**
 * @param {string} wasmDir the crate directory
 * @returns {string} one `<sha256>  <file>` line per source, as `blob-kernels.src.sha256` records them
 */
export function sourceHashText(wasmDir = WASM_DIR) {
    return sourceFiles(wasmDir)
        .map((file) => `${sha256Hex(readFileSync(join(wasmDir, file)))}  ${file}\n`)
        .join('');
}

/**
 * Compares the sources with the hashes recorded when the binary was last built.
 * @param {string | null} recorded the recorded file, or null when it is missing
 * @param {string} actual `sourceHashText` of the crate now
 * @returns {string[]} problems
 */
export function checkSources(recorded, actual) {
    if (recorded === null) {
        return ['wasm: wasm/blob-kernels.src.sha256 is missing - run scripts/build-wasm.sh'];
    }
    if (recorded === actual) {
        return [];
    }
    const want = new Set(recorded.split('\n'));
    const changed = actual
        .split('\n')
        .filter((line) => line !== '' && !want.has(line))
        .map((line) => line.slice(66));
    const named = changed.length > 0 ? changed.join(', ') : 'a source was removed';
    return [`wasm: ${named} changed since wasm/blob-kernels.wasm was built - run scripts/build-wasm.sh`];
}

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

/** The wasm-opt version scripts/build-wasm.sh pins; another version optimises to different bytes. */
const WASM_OPT_VERSION = '120';

/**
 * Whether this machine has the whole rebuild toolchain: cargo (on the PATH or in ~/.cargo/bin) and wasm-opt at the
 * pinned version. A hosted CI runner ships cargo but not wasm-opt, so cargo alone is not enough.
 * @param {Record<string, string | undefined>} env the environment
 * @returns {boolean} whether scripts/build-wasm.sh can run here
 */
export function hasRebuildTools(env = process.env) {
    const childEnv = { ...env, PATH: `${join(homedir(), '.cargo/bin')}:${env.PATH ?? ''}` };
    if (spawnSync('cargo', ['--version'], { env: childEnv, stdio: 'ignore' }).status !== 0) {
        return false;
    }
    const opt = spawnSync('wasm-opt', ['--version'], { env: childEnv, encoding: 'utf8' });
    return opt.status === 0 && new RegExp(`^wasm-opt version ${WASM_OPT_VERSION}(\\s|$)`).test(opt.stdout ?? '');
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
if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
    process.argv.includes('--write-sources')
) {
    writeFileSync(SOURCE_HASH_FILE, sourceHashText());
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const bytes = existsSync(BINARY) ? readFileSync(BINARY) : null;
    const hashText = existsSync(HASH_FILE) ? readFileSync(HASH_FILE, 'utf8') : null;
    const recorded = existsSync(SOURCE_HASH_FILE) ? readFileSync(SOURCE_HASH_FILE, 'utf8') : null;
    const problems = [...checkHash(bytes, hashText), ...checkSources(recorded, sourceHashText())];
    if (problems.length === 0 && bytes !== null && !process.argv.includes('--no-rebuild')) {
        if (hasRebuildTools()) {
            problems.push(...checkRebuild(bytes));
        } else {
            console.log(
                `wasm: cargo or wasm-opt ${WASM_OPT_VERSION} not found - skipped the rebuild check (the hash checks ran)`,
            );
        }
    }
    for (const problem of problems) {
        console.log(problem);
    }
    process.exitCode = problems.length === 0 ? 0 : 1;
}
/* v8 ignore stop */
