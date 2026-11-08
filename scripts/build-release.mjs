// `npm run build:release -- <version>`: builds the versioned site into `dist-release/` (Vite `--base /v/<version>/`) and
// the latest into `dist/` (`--base /`), and writes `release-entry.json` and the tarball of `dist-release/`.
// Needs the app to use no bare `/` paths (deployment-and-community.md, "Versioned build and paths"); see the doc's
// build state for what is still open there.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig, rulesHash } from '../js/sim/config.js';
import { isVersion } from '../js/library/releases.js';

/**
 * @typedef {object} BuildDeps
 * @property {(cmd: string, args: string[], env?: Record<string, string>) => number} run runs a command, returns its status
 * @property {(file: string, text: string) => void} writeFile writes a file
 * @property {(file: string) => number} sizeOf the byte size of a file
 * @property {string} date today, `YYYY-MM-DD`
 * @property {string} rules the rules hash of this tree
 */

/**
 * @param {string | undefined} version the release version
 * @param {BuildDeps} deps the command runner, the files, the date and the rules hash
 * @returns {{event: string, version: string, season: number, bytes: number}} the `ReleaseBuilt` record
 * @throws {Error} on a bad version or a failed command
 */
export function buildRelease(version, { run, writeFile, sizeOf, date, rules }) {
    if (version === undefined || !isVersion(version)) {
        throw new Error('usage: build-release <major.minor.patch>');
    }
    const season = Number(version.split('.')[0]);
    for (const [base, outDir] of [
        [`/v/${version}/`, 'dist-release'],
        ['/', 'dist'],
    ]) {
        const args = ['vite', 'build', '--base', base, '--outDir', outDir, '--emptyOutDir'];
        if (run('npx', args, { APP_VERSION: version }) !== 0) {
            throw new Error(`vite build --base ${base} failed`);
        }
    }
    writeFile('release-entry.json', `${JSON.stringify({ version, season, date, rulesHash: rules }, null, 2)}\n`);
    const tarball = `blob-evolution-${version}-dist.tar.gz`;
    if (run('tar', ['-czf', tarball, '-C', 'dist-release', '.']) !== 0) {
        throw new Error('tar failed');
    }
    return { event: 'ReleaseBuilt', version, season, bytes: sizeOf(tarball) };
}

/**
 * @returns {BuildDeps} the real command runner, the files, today's date and this tree's rules hash
 */
export function cliDeps() {
    return {
        run: (cmd, args, env = {}) =>
            spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1,
        writeFile: (file, text) => writeFileSync(file, text),
        sizeOf: (file) => readFileSync(file).length,
        date: new Date().toISOString().slice(0, 10),
        rules: rulesHash(createConfig()),
    };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify(buildRelease(process.argv[2], cliDeps())));
}
