// `npm run build:release -- <version>`: builds the versioned site into `dist-release/` (Vite `--base /v/<version>/`) and
// the latest into `dist/` (`--base /`), and writes `release-entry.json` and the tarball of `dist-release/`.
// Needs the app to use no bare `/` paths (deployment-and-community.md, "Versioned build and paths"); see the doc's
// build state for what is still open there.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createConfig, rulesHash } from '../js/sim/config.js';
import { isVersion } from '../functions/_lib/releases.js';

const version = process.argv[2];
if (!isVersion(version)) {
    throw new Error('usage: build-release <major.minor.patch>');
}
const season = Number(version.split('.')[0]);

/**
 * @param {string[]} args vite arguments
 * @returns {void}
 */
function vite(args) {
    const done = spawnSync('npx', ['vite', 'build', ...args], {
        stdio: 'inherit',
        env: { ...process.env, APP_VERSION: version },
    });
    if (done.status !== 0) {
        throw new Error(`vite build ${args.join(' ')} failed`);
    }
}

vite(['--base', `/v/${version}/`, '--outDir', 'dist-release', '--emptyOutDir']);
vite(['--base', '/', '--outDir', 'dist', '--emptyOutDir']);
const entry = { version, season, date: new Date().toISOString().slice(0, 10), rulesHash: rulesHash(createConfig()) };
writeFileSync('release-entry.json', `${JSON.stringify(entry, null, 2)}\n`);
const tar = spawnSync('tar', ['-czf', `blob-evolution-${version}-dist.tar.gz`, '-C', 'dist-release', '.'], {
    stdio: 'inherit',
});
if (tar.status !== 0) {
    throw new Error('tar failed');
}
const size = readFileSync(`blob-evolution-${version}-dist.tar.gz`).length;
console.log(JSON.stringify({ event: 'ReleaseBuilt', version, season, bytes: size }));
