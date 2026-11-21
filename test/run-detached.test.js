import { spawnSync } from 'node:child_process';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRun, main as registryMain, readRuns } from '../scripts/lib/run-registry.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const DETACH = resolve('scripts/run-detached.sh');
const WAIT = resolve('scripts/wait-run.sh');
const SPAWN_TIMEOUT_MS = scaleTimeout(30_000);

let dir = '';
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-detached-'));
    // The tree a --frozen run copies: small, with the directories the copy leaves out.
    for (const sub of ['src/lib', 'src/node_modules', 'src/.git', 'src/coverage']) {
        mkdirSync(join(dir, sub), { recursive: true });
    }
    writeFileSync(join(dir, 'src', 'package.json'), '{}');
    writeFileSync(join(dir, 'src', 'lib', 'a.js'), 'x');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Runs one of the two scripts with RUNS_DIR pointing at the temporary directory.
 * @param {string} script script path
 * @param {string[]} args arguments
 * @param {Record<string, string>} [env] extra environment
 * @returns {{status: number | null, stdout: string, stderr: string}} the outcome
 */
function run(script, args, env = {}) {
    const r = spawnSync(script, args, {
        encoding: 'utf8',
        cwd: dir,
        env: {
            ...process.env,
            RUNS_DIR: join(dir, 'runs'),
            RUN_DETACHED_ROOT: join(dir, 'src'),
            WAIT_RUN_POLL: '0.1',
            ...env,
        },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('run-detached.sh and wait-run.sh', { timeout: SPAWN_TIMEOUT_MS }, () => {
    it('runs a command detached, writes the log and the exit code, and wait-run returns it', () => {
        const started = run(DETACH, ['ok', '--', 'bash', '-c', 'echo hello; echo oops >&2; exit 0']);
        expect(started.status).toBe(0);
        expect(started.stdout).toContain('started ok');
        const waited = run(WAIT, ['ok']);
        expect(waited.status).toBe(0);
        expect(waited.stdout).toContain('exit code: 0');
        expect(waited.stdout).toContain('hello');
        expect(waited.stdout).toContain('oops');
        expect(readFileSync(join(dir, 'runs', 'ok.done'), 'utf8').trim()).toBe('0');
        expect(readFileSync(join(dir, 'runs', 'ok.log'), 'utf8')).toContain('hello');
    });

    it('exits with the command exit code', () => {
        run(DETACH, ['bad', '--', 'bash', '-c', 'exit 7']);
        const waited = run(WAIT, ['bad']);
        expect(waited.status).toBe(7);
        expect(waited.stdout).toContain('exit code: 7');
    });

    it('records the run in runs.json', () => {
        run(DETACH, ['rec', '--', 'bash', '-c', 'exit 0']);
        run(WAIT, ['rec']);
        const [record] = readRuns(join(dir, 'runs', 'runs.json'));
        expect(record.name).toBe('rec');
        expect(record.cmd).toContain('bash');
        expect(record.pid).toBeGreaterThan(1);
        expect(record.frozen).toBeNull();
        expect(record.cwd).toBe(realpathSync(dir));
        expect(Date.parse(record.started)).not.toBeNaN();
    });

    it('records the workers a run claims: --workers, the pool default, or null', () => {
        run(DETACH, ['w1', '--', 'bash', '-c', 'exit 0', 'x', '--workers', '3']);
        run(DETACH, ['w2', '--', 'bash', '-c', 'exit 0', 'eval']);
        run(DETACH, ['w3', '--', 'bash', '-c', 'exit 0']);
        for (const name of ['w1', 'w2', 'w3']) {
            run(WAIT, [name]);
        }
        const [a, b, c] = readRuns(join(dir, 'runs', 'runs.json'));
        expect(a.workers).toBe(3);
        expect(b.workers).toBeGreaterThanOrEqual(1);
        expect(c.workers).toBeNull();
    });

    it('refuses an existing name and leaves the first run alone', () => {
        run(DETACH, ['dup', '--', 'bash', '-c', 'echo first']);
        run(WAIT, ['dup']);
        const second = run(DETACH, ['dup', '--', 'bash', '-c', 'echo second']);
        expect(second.status).toBe(2);
        expect(second.stderr).toContain('already used');
        expect(readFileSync(join(dir, 'runs', 'dup.log'), 'utf8')).toContain('first');
    });

    it('rejects bad arguments and bad names', () => {
        expect(run(DETACH, []).status).toBe(2);
        expect(run(DETACH, ['x']).status).toBe(2);
        expect(run(DETACH, ['x', '--nope', '--', 'true']).status).toBe(2);
        expect(run(DETACH, ['x', '--']).status).toBe(2);
        expect(run(DETACH, ['../x', '--', 'true']).status).toBe(2);
    });

    it('copies the tree into a new frozen directory with a node_modules symlink', () => {
        const started = run(DETACH, ['fz', '--frozen', '--', 'bash', '-c', 'pwd; ls']);
        expect(started.status).toBe(0);
        const waited = run(WAIT, ['fz']);
        expect(waited.status).toBe(0);
        const [record] = readRuns(join(dir, 'runs', 'runs.json'));
        expect(record.frozen).toMatch(/frozen-fz-\d{8}-\d{6}$/);
        expect(record.cwd).toBe(record.frozen);
        expect(waited.stdout).toContain(record.frozen);
        const frozen = /** @type {string} */ (record.frozen);
        expect(existsSync(join(frozen, 'package.json'))).toBe(true);
        expect(existsSync(join(frozen, 'lib', 'a.js'))).toBe(true);
        expect(existsSync(join(frozen, '.git'))).toBe(false);
        expect(existsSync(join(frozen, 'coverage'))).toBe(false);
        expect(lstatSync(join(frozen, 'node_modules')).isSymbolicLink()).toBe(true);
    });

    it('keeps two frozen runs in separate directories', () => {
        run(DETACH, ['fa', '--frozen', '--', 'true']);
        run(DETACH, ['fb', '--frozen', '--', 'true']);
        run(WAIT, ['fa']);
        run(WAIT, ['fb']);
        const [a, b] = readRuns(join(dir, 'runs', 'runs.json'));
        expect(a.frozen).not.toBe(b.frozen);
    });

    it('times out with 124 while the run keeps going', () => {
        run(DETACH, ['slow', '--', 'bash', '-c', 'sleep 3; echo late']);
        const waited = run(WAIT, ['slow', '--timeout', '1']);
        expect(waited.status).toBe(124);
        expect(waited.stdout).toContain('timeout after 1s');
        expect(run(WAIT, ['slow']).status).toBe(0);
    });

    it('reports a run that was killed without an exit code', () => {
        const runs = join(dir, 'runs');
        mkdirSync(runs);
        writeFileSync(join(runs, 'ghost.log'), 'partial output\n');
        writeFileSync(join(runs, 'ghost.pid'), '2147480000\n');
        const waited = run(WAIT, ['ghost']);
        expect(waited.status).toBe(125);
        expect(waited.stdout).toContain('died without an exit code');
        expect(waited.stdout).toContain('partial output');
    });

    it('rejects an unknown name and bad wait arguments', () => {
        expect(run(WAIT, ['nothing']).status).toBe(2);
        expect(run(WAIT, []).status).toBe(2);
        expect(run(WAIT, ['x', '--timeout']).status).toBe(2);
        expect(run(WAIT, ['x', '--timeout', 'soon']).status).toBe(2);
        expect(run(WAIT, ['x', '--what']).status).toBe(2);
    });

    it('does not depend on pgrep', () => {
        for (const script of [DETACH, WAIT]) {
            const code = readFileSync(script, 'utf8')
                .split('\n')
                .filter((line) => !line.trim().startsWith('#'));
            expect(code.join('\n')).not.toMatch(/pgrep|pkill/);
        }
    });
});

describe('run-registry', () => {
    const record = {
        name: 'a',
        cmd: 'true',
        pid: 5,
        dir: '/d',
        cwd: '/d',
        frozen: null,
        started: '2026-11-16T00:00:00Z',
    };

    it('reads no runs from a missing file and adds runs in order', () => {
        const file = join(dir, 'sub', 'runs.json');
        expect(readRuns(file)).toEqual([]);
        addRun(file, record);
        addRun(file, { ...record, name: 'b' });
        expect(readRuns(file).map((r) => r.name)).toEqual(['a', 'b']);
    });

    it('refuses a duplicate name and a registry that is not an array', () => {
        const file = join(dir, 'runs.json');
        addRun(file, record);
        expect(() => addRun(file, record)).toThrow('already recorded');
        writeFileSync(file, '{}');
        expect(() => readRuns(file)).toThrow('not a JSON array');
    });

    it('has a CLI that adds a run and reports usage and duplicate errors', () => {
        const file = join(dir, 'cli.json');
        const argv = ['add', file, 'n', 'cmd', '9', '/d', '/c', '-', 't'];
        expect(registryMain(argv)).toBe(0);
        expect(readRuns(file)[0]).toMatchObject({ name: 'n', pid: 9, frozen: null });
        expect(registryMain(['add', file, 'n', 'cmd', '9', '/d', '/c', '/f', 't'])).toBe(1);
        expect(registryMain(['nope'])).toBe(2);
    });
});
