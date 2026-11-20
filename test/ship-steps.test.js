import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cli } from '../scripts/lib/plan-next-chunk.mjs';
import {
    ShipError,
    appendLog,
    parseShipArgs,
    realSh,
    runShip,
    stepBody,
    stepConfirm,
    stepGate,
    stepGuard,
    stepMergeBase,
    stepPush,
    stepWatch,
} from '../scripts/lib/ship-steps.mjs';

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const bad = (stderr = 'boom') => ({ status: 1, stdout: '', stderr });

/**
 * A fake `sh`: each rule is [prefix, outcome or function]; the first rule whose prefix starts the command line answers,
 * and an unmatched call answers ok(). Every call is recorded.
 * @param {any[]} rules the scripted answers
 * @returns {{sh: any, calls: string[]}} the fake and its call log
 */
function fake(rules = []) {
    /** @type {string[]} */
    const calls = [];
    const sh = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
        const line = `${cmd} ${args.join(' ')}`;
        calls.push(line);
        for (const [prefix, answer] of rules) {
            if (line.startsWith(prefix)) {
                return typeof answer === 'function' ? answer(line) : answer;
            }
        }
        return ok();
    };
    return { sh, calls };
}

const OPTS = { title: 't', body: 'body.md', base: 'main', noMerge: false };
/**
 * @param {any} sh the fake sh
 * @param {Record<string, any>} [state] the run state
 * @param {any} [opts] the options
 * @returns {any} a step context
 */
const ctxOf = (sh, state = {}, opts = OPTS) => ({ opts, sh, state });
/**
 * @param {() => void} fn a step expected to throw
 * @returns {any} the ShipError it threw
 */
const code = (fn) => {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(ShipError);
        return error;
    }
    throw new Error('did not throw');
};

let dir = '';
let home = '';
beforeEach(() => {
    home = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'ship-steps-'));
    process.chdir(dir);
    writeFileSync('body.md', '## Summary\nA change.\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    process.chdir(home);
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
});

const logged = () =>
    readFileSync('.checklogs/ship.jsonl', 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

describe('parseShipArgs', () => {
    it('reads the flags and defaults the base to main', () => {
        expect(parseShipArgs(['--title', 'x', '--body', 'body.md', '--no-merge'])).toEqual({
            title: 'x',
            body: 'body.md',
            base: 'main',
            noMerge: true,
        });
        expect(parseShipArgs(['--title', 'x', '--body', 'body.md', '--base', 'season/next']).base).toBe('season/next');
    });

    it('exits 2 on an unknown flag, a missing value, a missing option or a missing body file', () => {
        expect(code(() => parseShipArgs(['--bogus'])).exitCode).toBe(2);
        expect(code(() => parseShipArgs(['--title'])).exitCode).toBe(2);
        expect(code(() => parseShipArgs(['--title', 'x'])).exitCode).toBe(2);
        expect(code(() => parseShipArgs(['--title', 'x', '--body', 'none.md'])).message).toContain('not found');
    });
});

describe('realSh', () => {
    it('runs a command and returns its status and output, inherited or piped', () => {
        expect(realSh('echo', ['hi'])).toEqual({ status: 0, stdout: 'hi\n', stderr: '' });
        expect(realSh('false', [], { inherit: true }).status).toBe(1);
        expect(realSh('no-such-command-here', []).status).toBe(1);
    });
});

describe('stepGuard', () => {
    it('records the branch and passes a clean feature branch', () => {
        const { sh } = fake([['git rev-parse', ok('feat/x\n')]]);
        const ctx = ctxOf(sh);
        stepGuard(ctx);
        expect(ctx.state.branch).toBe('feat/x');
    });

    it('exits 2 on main or a detached HEAD, and on uncommitted files', () => {
        expect(code(() => stepGuard(ctxOf(fake([['git rev-parse', ok('main')]]).sh))).exitCode).toBe(2);
        expect(code(() => stepGuard(ctxOf(fake([['git rev-parse', ok('HEAD')]]).sh))).result).toBe('on-main');
        const dirty = fake([
            ['git rev-parse', ok('feat/x')],
            ['git status', ok(' M a.js')],
        ]);
        const error = code(() => stepGuard(ctxOf(dirty.sh)));
        expect([error.exitCode, error.result, error.message]).toEqual([2, 'dirty', expect.stringContaining('a.js')]);
    });

    it('fails loudly when git itself fails', () => {
        const error = code(() => stepGuard(ctxOf(fake([['git rev-parse', bad('not a repo')]]).sh)));
        expect(error.message).toContain('not a repo');
    });
});

describe('stepMergeBase', () => {
    it('does nothing when the branch is not behind, and merges with no rebase when it is', () => {
        const level = fake([['git rev-list', ok('0')]]);
        stepMergeBase(ctxOf(level.sh));
        expect(level.calls.some((c) => c.startsWith('git merge'))).toBe(false);
        const behind = fake([['git rev-list', ok('3')]]);
        stepMergeBase(ctxOf(behind.sh));
        expect(behind.calls).toContain('git merge --no-edit origin/main');
        expect(behind.calls.join('\n')).not.toMatch(/rebase|--force/);
    });

    it('exits 3 with the conflicted paths', () => {
        const { sh } = fake([
            ['git rev-list', ok('1')],
            ['git merge', bad('CONFLICT')],
            ['git diff', ok('a.js\nb.js\n')],
        ]);
        const error = code(() => stepMergeBase(ctxOf(sh)));
        expect([error.exitCode, error.result]).toEqual([3, 'conflict']);
        expect(error.message).toContain('a.js\nb.js');
    });
});

describe('stepGate', () => {
    it('runs the quick gate for a full scope and the docs gate for docs or records', () => {
        for (const [scope, flag] of [
            ['full', '--quick'],
            ['docs', '--docs'],
            ['records', '--docs'],
            ['', '--quick'],
        ]) {
            const { sh, calls } = fake([['scripts/change-scope.sh', ok(`${scope}\n`)]]);
            stepGate(ctxOf(sh));
            expect(calls).toContain(`scripts/check.sh --fix ${flag}`);
        }
    });

    it('commits what --fix wrote, and nothing when the tree is clean', () => {
        const dirty = fake([['git status', ok(' M a.md')]]);
        const ctx = ctxOf(dirty.sh);
        stepGate(ctx);
        expect(ctx.state.scope).toBe('full');
        expect(dirty.calls).toContain('git add -u');
        expect(dirty.calls.some((c) => c.startsWith('git commit -m style: apply check.sh --fix'))).toBe(true);
        const clean = fake();
        stepGate(ctxOf(clean.sh));
        expect(clean.calls.some((c) => c.startsWith('git commit'))).toBe(false);
    });

    it('exits 4 and names the failed gates when .checklogs/failed-gates exists, or just fails without it', () => {
        const failing = fake([['scripts/check.sh', bad()]]);
        expect(code(() => stepGate(ctxOf(failing.sh))).message).toBe('ship: the gate failed');
        mkdirSync('.checklogs');
        writeFileSync('.checklogs/failed-gates', 'lint\nformat\n');
        const error = code(() => stepGate(ctxOf(failing.sh)));
        expect([error.exitCode, error.message]).toEqual([4, 'ship: the gate failed: lint, format']);
    });
});

describe('stepBody', () => {
    it('passes a Summary body and exits 5 with the problem for a sim diff without a scene', () => {
        stepBody(ctxOf(fake([['git diff', ok('docs/a.md')]]).sh));
        const error = code(() => stepBody(ctxOf(fake([['git diff', ok('js/sim/a.js')]]).sh)));
        expect([error.exitCode, error.result]).toEqual([5, 'body']);
        expect(error.message).toContain('## Scene served');
    });
});

describe('stepPush', () => {
    const base = [
        ['git push', ok()],
        ['gh pr list', ok('')],
        ['gh pr create', ok('https://github.com/o/r/pull/9\n')],
    ];

    it('pushes, opens the PR and turns on auto-merge with a merge commit', () => {
        const { sh, calls } = fake(base);
        const ctx = ctxOf(sh, { branch: 'feat/x' });
        stepPush(ctx);
        expect(ctx.state.pr).toBe(9);
        expect(typeof ctx.state.pushedAt).toBe('number');
        expect(calls).toContain('gh pr create --base main --title t --body-file body.md');
        expect(calls).toContain('gh pr merge 9 --auto --merge');
    });

    it('resumes on the open PR without creating another', () => {
        const { sh, calls } = fake([['gh pr list', ok('5\n')], ...base]);
        const ctx = ctxOf(sh, { branch: 'feat/x' });
        stepPush(ctx);
        expect(ctx.state.pr).toBe(5);
        expect(calls.some((c) => c.startsWith('gh pr create'))).toBe(false);
    });

    it('--no-merge leaves auto-merge off', () => {
        const { sh, calls } = fake(base);
        stepPush(ctxOf(sh, { branch: 'feat/x' }, { ...OPTS, noMerge: true }));
        expect(calls.some((c) => c.startsWith('gh pr merge'))).toBe(false);
    });

    it('exits 6 when the push, the create (or its URL) or the auto-merge fails', () => {
        for (const rule of [
            ['git push', bad('rejected')],
            ['gh pr create', bad('no auth')],
            ['gh pr create', ok('no url here')],
            ['gh pr merge', bad('protected')],
        ]) {
            const { sh } = fake([rule, ...base]);
            const error = code(() => stepPush(ctxOf(sh, { branch: 'feat/x' })));
            expect([error.exitCode, error.result]).toEqual([6, 'push']);
        }
    });
});

describe('stepWatch', () => {
    const rules = (/** @type {any} */ watch) => [
        ['gh pr checks 9 --watch', watch],
        ['gh run list', ok('3\n')],
    ];

    it('records the CI run count on green checks', () => {
        const ctx = ctxOf(fake(rules(ok())).sh, { pr: 9, branch: 'feat/x' });
        stepWatch(ctx);
        expect(ctx.state.ciRuns).toBe(3);
    });

    it('exits 1 with the failed job names and the log tail of each failed run', () => {
        const checks = JSON.stringify([
            { name: 'test shard-1', bucket: 'fail', link: 'https://x/actions/runs/77/job/1' },
            { name: 'static', bucket: 'pass', link: 'https://x/actions/runs/78/job/2' },
        ]);
        const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
        const { sh, calls } = fake([
            ...rules(bad()),
            ['gh pr checks 9 --json', ok(checks)],
            ['gh run view 77', ok(lines)],
        ]);
        const error = code(() => stepWatch(ctxOf(sh, { pr: 9, branch: 'feat/x' })));
        expect([error.exitCode, error.result]).toEqual([1, 'red']);
        expect(error.message).toContain('test shard-1');
        expect(error.message).toContain('line 59');
        expect(error.message).not.toContain('line 19');
        expect(calls).toContain('gh run view 77 --log-failed');
    });

    it('still reports red when the failed checks cannot be read', () => {
        const { sh } = fake([...rules(bad()), ['gh pr checks 9 --json', ok('not json')]]);
        expect(code(() => stepWatch(ctxOf(sh, { pr: 9, branch: 'b' }))).message).toContain('could not read');
    });
});

describe('stepConfirm', () => {
    const view = (/** @type {string} */ state) =>
        ok(JSON.stringify({ state, mergeStateStatus: 'BLOCKED', url: 'https://x/pull/9' }));
    const state = () => ({ pr: 9, pushedAt: Date.now() - 120_000 });

    it('prints the link and the minutes once the PR is MERGED', () => {
        const ctx = ctxOf(fake([['gh pr view', view('MERGED')]]).sh, state());
        stepConfirm(ctx, { pause: () => {} });
        expect(ctx.state.minutes).toBeGreaterThanOrEqual(2);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('https://x/pull/9'));
    });

    it('waits for the merge: looks again after each pause, then succeeds', () => {
        /** @type {any[]} */
        const answers = [view('OPEN'), view('OPEN'), view('MERGED')];
        const pause = vi.fn();
        const ctx = ctxOf(fake([['gh pr view', () => answers.shift()]]).sh, state());
        stepConfirm(ctx, { waitS: 100, pollS: 10, pause });
        expect(pause).toHaveBeenCalledTimes(2);
        expect(pause).toHaveBeenCalledWith(10);
    });

    it('exits 7 with the merge state when still open after the wait, also when gh view fails', () => {
        const pause = vi.fn();
        const error = code(() =>
            stepConfirm(ctxOf(fake([['gh pr view', view('OPEN')]]).sh, state()), { waitS: 30, pollS: 10, pause }),
        );
        expect([error.exitCode, error.result]).toEqual([7, 'unmerged']);
        expect(error.message).toContain('BLOCKED');
        expect(pause).toHaveBeenCalledTimes(3);
        const failing = code(() => stepConfirm(ctxOf(fake([['gh pr view', bad()]]).sh, state()), { waitS: 0, pause }));
        expect(failing.exitCode).toBe(7);
    });

    it('--no-merge only prints the link', () => {
        const pause = vi.fn();
        const ctx = ctxOf(fake([['gh pr view', view('OPEN')]]).sh, state(), { ...OPTS, noMerge: true });
        stepConfirm(ctx, { pause });
        expect(pause).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('auto-merge left off'));
    });

    it('waits with the real sleep when none is injected', () => {
        /** @type {any[]} */
        const answers = [view('OPEN'), view('MERGED')];
        const ctx = ctxOf(fake([['gh pr view', () => answers.shift()]]).sh, state());
        stepConfirm(ctx, { waitS: 1, pollS: 0.01 });
        expect(ctx.state.minutes).toBeDefined();
    });
});

describe('appendLog', () => {
    it('appends one line per run with the fields the state has, null for the rest', () => {
        appendLog({ branch: 'feat/x', pr: 9, scope: 'docs', ciRuns: 2, minutes: 4.5 }, 'merged');
        appendLog({}, 'dirty');
        appendLog({ pushedAt: Date.now() }, 'red');
        const [first, second, third] = logged();
        expect(first).toEqual({ branch: 'feat/x', pr: 9, scope: 'docs', ciRuns: 2, minutes: 4.5, result: 'merged' });
        expect(second).toEqual({ branch: null, pr: null, scope: null, ciRuns: null, minutes: null, result: 'dirty' });
        expect(third.minutes).toBe(0);
    });
});

describe('runShip', () => {
    const happy = [
        ['git rev-parse', ok('feat/x')],
        ['git rev-list', ok('0')],
        ['git diff', ok('docs/a.md')],
        ['gh pr create', ok('https://github.com/o/r/pull/9')],
        ['gh pr view', ok(JSON.stringify({ state: 'MERGED', url: 'https://x/pull/9' }))],
        ['gh run list', ok('1')],
    ];
    const ARGV = ['--title', 't', '--body', 'body.md'];
    const env = { SHIP_MERGE_WAIT_S: '0' };

    it('returns 0 and logs merged for a clean run, green for --no-merge', () => {
        expect(runShip(ARGV, { sh: fake(happy).sh, env })).toBe(0);
        expect(runShip([...ARGV, '--no-merge'], { sh: fake(happy).sh, env })).toBe(0);
        expect(logged().map((l) => l.result)).toEqual(['merged', 'green']);
        expect(logged()[0]).toMatchObject({ branch: 'feat/x', pr: 9, ciRuns: 1 });
    });

    it('uses the default wait when the environment gives none', () => {
        expect(runShip(ARGV, { sh: fake(happy).sh, env: {} })).toBe(0);
    });

    it('returns the failing step exit code, logs it, and logs nothing for a usage error', () => {
        expect(runShip(ARGV, { sh: fake([['git rev-parse', ok('main')]]).sh, env })).toBe(2);
        expect(runShip(['--nope'], { sh: fake().sh, env })).toBe(2);
        expect(logged().map((l) => l.result)).toEqual(['on-main']);
    });

    it('rethrows an error that is not a ShipError', () => {
        const sh = () => {
            throw new TypeError('bug');
        };
        expect(() => runShip(ARGV, { sh, env })).toThrow('bug');
    });
});

describe('ship-main and plan-next-chunk cli', () => {
    it('ship-main runs runShip with the process arguments and sets the exit code', async () => {
        const argv = process.argv;
        const exitCode = process.exitCode;
        process.argv = ['node', 'ship-main.mjs'];
        vi.resetModules();
        try {
            await import('../scripts/lib/ship-main.mjs');
            expect(process.exitCode).toBe(2);
        } finally {
            process.argv = argv;
            process.exitCode = exitCode;
        }
    });

    it('cli prints the next chunk of a plan, and the usage line with exit 2 without one', () => {
        writeFileSync(
            'p.md',
            '**Status:** Proposed\n\n### Phase 1 - A\n\n| Chunk | Tasks | Builder |\n| - | - | - |\n| A | T1 | Sonnet |\n\n| # | Task |\n| T1 | one |\n',
        );
        expect(cli(['p.md'])).toBe(0);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Next chunk: A'));
        expect(cli([])).toBe(2);
    });
});
