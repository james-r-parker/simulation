#!/usr/bin/env node
// The default way an agent runs tests: vitest with the JSON reporter, printed as a summary line, each failure and the tests
// near their limit. Usage: scripts/test-failures.sh [--scope fast|slow|affected|all] [--base <ref>] [--full] [files...]
// (`npm run test:report -- ...`). No scope runs `affected`. Exits 1 on failure. `--log <file>` instead digests a saved
// vitest log (check.sh's test gate uses it). Logic: scripts/lib/test-report.mjs and scripts/lib/ci-log.mjs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summariseJob } from './lib/ci-log.mjs';
import { formatReport, selectTests } from './lib/test-report.mjs';
import { busyScale, testTimeoutFor } from './lib/test-timeout.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
/** @param {string} name a flag @returns {string | undefined} its value */
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const full = args.includes('--full');

const logFile = flag('--log');
if (logFile) {
    console.log(summariseJob('test', readFileSync(logFile, 'utf8'), { full }).slice(1).join('\n'));
    process.exit(0);
}

const valued = new Set(['--scope', '--base']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const scope = flag('--scope') ?? 'affected';
const tmp = mkdtempSync(join(tmpdir(), 'test-report-'));
try {
    let affected = null;
    if (scope === 'affected') {
        const out = join(tmp, 'affected.json');
        const run = spawnSync('node', ['scripts/affected.mjs', flag('--base') ?? 'origin/main', '--out', out], {
            cwd: root,
            encoding: 'utf8',
        });
        if (run.status !== 0) {
            console.error(run.stderr || 'scripts/affected.mjs failed');
            process.exit(2);
        }
        const result = JSON.parse(readFileSync(out, 'utf8'));
        affected = result.mode === 'full' ? null : result.tests;
    }
    const pick = selectTests({ scope, files, affected });
    console.error(`scope: ${pick.note}`);
    if (pick.empty) {
        console.log('0 passed, 0 failed, 0 skipped (no test file reached)');
        process.exit(0);
    }
    const json = join(tmp, 'result.json');
    const start = Date.now();
    const vitest = ['vitest', 'run', '--reporter=json', `--outputFile.json=${json}`, ...pick.filters];
    const run = spawnSync('npx', vitest, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, ...pick.env },
        maxBuffer: 1 << 28,
    });
    let result;
    try {
        result = JSON.parse(readFileSync(json, 'utf8'));
    } catch {
        console.log(`vitest wrote no result (exit ${run.status})`);
        console.log((run.stderr || run.stdout || '').split('\n').slice(0, 20).join('\n'));
        process.exit(1);
    }
    const defaultTimeoutMs = testTimeoutFor(['vitest']) * busyScale();
    console.log(formatReport(result, { root, defaultTimeoutMs, wallMs: Date.now() - start, full }).join('\n'));
    process.exit(result.numFailedTests > 0 || result.numFailedTestSuites > 0 || run.status ? 1 : 0);
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
