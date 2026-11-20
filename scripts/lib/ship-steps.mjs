// The seven steps of scripts/ship.sh, which takes a committed branch to a merged PR. Each step takes a context
// `{opts, sh, state}`: `sh(cmd, args, {inherit})` runs a command (tests replace it), `state` is what the run learns.
// A failing step throws a ShipError whose exit code the script returns:
//   2 uncommitted files or on main (or a bad argument)   3 merge conflict   4 gate failed   5 PR body fails the template
//   6 push or gh failed   1 checks red   7 green but not merged after the wait
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { bodyProblems } from './ship-body.mjs';

export class ShipError extends Error {
    /**
     * @param {number} exitCode the script's exit code
     * @param {string} result the word logged in ship.jsonl
     * @param {string} message what to print
     */
    constructor(exitCode, result, message) {
        super(message);
        this.exitCode = exitCode;
        this.result = result;
    }
}

/**
 * @typedef {{status: number, stdout: string, stderr: string}} Outcome
 * @typedef {(cmd: string, args: string[], options?: {inherit?: boolean}) => Outcome} Sh
 * @typedef {{title: string, body: string, base: string, noMerge: boolean}} ShipOptions
 * @typedef {{opts: ShipOptions, sh: Sh, state: Record<string, any>}} Ctx
 */

/** @type {Sh} */
export function realSh(cmd, args, { inherit = false } = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {ShipOptions} the options
 * @throws {ShipError} exit 2 on a bad argument
 */
export function parseShipArgs(argv) {
    const usage = 'usage: ship.sh --title <subject> --body <file> [--base <branch>] [--no-merge]';
    /** @type {Record<string, any>} */
    const opts = { title: '', body: '', base: 'main', noMerge: false };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--no-merge') {
            opts.noMerge = true;
        } else if (['--title', '--body', '--base'].includes(flag) && argv[i + 1] !== undefined) {
            opts[flag.slice(2)] = argv[++i];
        } else {
            throw new ShipError(2, 'usage', `ship: unknown or incomplete argument: ${flag}\n${usage}`);
        }
    }
    if (!opts.title || !opts.body) {
        throw new ShipError(2, 'usage', `ship: --title and --body are required\n${usage}`);
    }
    if (!existsSync(opts.body)) {
        throw new ShipError(2, 'usage', `ship: body file not found: ${opts.body}`);
    }
    return /** @type {ShipOptions} */ (opts);
}

/**
 * @param {Ctx} ctx the context
 * @param {string[]} args git arguments
 * @returns {string} trimmed stdout of a git command that must succeed
 */
function git({ sh }, args) {
    const r = sh('git', args);
    if (r.status !== 0) {
        throw new ShipError(1, 'git-error', `ship: git ${args.join(' ')} failed: ${r.stderr.trim()}`);
    }
    return r.stdout.trim();
}

/**
 * Step 1: fails on uncommitted files or a branch named main.
 * @param {Ctx} ctx the context
 */
export function stepGuard(ctx) {
    ctx.state.branch = git(ctx, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (ctx.state.branch === 'main' || ctx.state.branch === 'HEAD') {
        throw new ShipError(2, 'on-main', `ship: refusing to ship from ${ctx.state.branch}; make a branch first`);
    }
    const dirty = git(ctx, ['status', '--porcelain']);
    if (dirty) {
        throw new ShipError(2, 'dirty', `ship: uncommitted files:\n${dirty}`);
    }
}

/**
 * Step 2: merges origin/<base> into the branch when it is behind (a merge commit; never a rebase or a force push).
 * @param {Ctx} ctx the context
 */
export function stepMergeBase(ctx) {
    const { base } = ctx.opts;
    git(ctx, ['fetch', 'origin']);
    if (Number(git(ctx, ['rev-list', '--count', `HEAD..origin/${base}`])) === 0) {
        return;
    }
    const r = ctx.sh('git', ['merge', '--no-edit', `origin/${base}`]);
    if (r.status !== 0) {
        const paths = ctx.sh('git', ['diff', '--name-only', '--diff-filter=U']).stdout.trim();
        throw new ShipError(
            3,
            'conflict',
            `ship: merging origin/${base} conflicts (merge left in progress; resolve, commit, rerun):\n${paths}`,
        );
    }
}

/**
 * Step 3: runs the gate the change scope needs and commits what --fix wrote.
 * @param {Ctx} ctx the context
 */
export function stepGate(ctx) {
    const scope = ctx.sh('scripts/change-scope.sh', [`origin/${ctx.opts.base}`]).stdout.trim() || 'full';
    ctx.state.scope = scope;
    const docsOnly = scope === 'docs' || scope === 'records';
    const r = ctx.sh('scripts/check.sh', ['--fix', docsOnly ? '--docs' : '--quick'], { inherit: true });
    if (r.status !== 0) {
        const failed = existsSync('.checklogs/failed-gates')
            ? readFileSync('.checklogs/failed-gates', 'utf8').trim()
            : '';
        throw new ShipError(4, 'gate', `ship: the gate failed${failed ? `: ${failed.split('\n').join(', ')}` : ''}`);
    }
    if (git(ctx, ['status', '--porcelain'])) {
        git(ctx, ['add', '-u']);
        git(ctx, ['commit', '-m', 'style: apply check.sh --fix']);
    }
}

/**
 * Step 4: checks the body file against the create-pr template.
 * @param {Ctx} ctx the context
 */
export function stepBody(ctx) {
    const paths = git(ctx, ['diff', '--name-only', `origin/${ctx.opts.base}...HEAD`]).split('\n');
    const problems = bodyProblems(readFileSync(ctx.opts.body, 'utf8'), paths);
    if (problems.length > 0) {
        throw new ShipError(5, 'body', `ship: the PR body fails the create-pr template:\n${problems.join('\n')}`);
    }
}

/**
 * Step 5: pushes, opens the PR (or finds the open one) and turns on auto-merge with a merge commit.
 * @param {Ctx} ctx the context
 */
export function stepPush(ctx) {
    const { sh, opts, state } = ctx;
    const fail = (/** @type {string} */ what, /** @type {Outcome} */ r) =>
        new ShipError(6, 'push', `ship: ${what} failed: ${(r.stderr || r.stdout).trim()}`);
    const pushed = sh('git', ['push', '-u', 'origin', 'HEAD']);
    if (pushed.status !== 0) {
        throw fail('git push', pushed);
    }
    state.pushedAt = Date.now();
    const found = sh('gh', [
        'pr',
        'list',
        '--head',
        state.branch,
        '--base',
        opts.base,
        '--state',
        'open',
        '--json',
        'number',
        '--jq',
        '.[0].number // empty',
    ]);
    let number = found.stdout.trim();
    if (found.status === 0 && number) {
        console.log(`ship: PR #${number} is already open for ${state.branch}`);
    } else {
        const created = sh('gh', [
            'pr',
            'create',
            '--base',
            opts.base,
            '--title',
            opts.title,
            '--body-file',
            opts.body,
        ]);
        number = /\/pull\/(\d+)/.exec(created.stdout)?.[1] ?? '';
        if (created.status !== 0 || !number) {
            throw fail('gh pr create', created);
        }
    }
    state.pr = Number(number);
    if (!opts.noMerge) {
        const auto = sh('gh', ['pr', 'merge', number, '--auto', '--merge']);
        if (auto.status !== 0) {
            throw fail('gh pr merge --auto', auto);
        }
    }
}

/**
 * @param {Ctx} ctx the context
 * @returns {string} the last 40 lines of the failed log of each failed run, with the failed job names
 */
function failureReport({ sh, state }) {
    const r = sh('gh', ['pr', 'checks', String(state.pr), '--json', 'name,bucket,link']);
    /** @type {{name: string, bucket: string, link: string}[]} */
    let checks;
    try {
        checks = JSON.parse(r.stdout);
    } catch {
        return 'ship: could not read the failed checks';
    }
    const failed = checks.filter((c) => c.bucket === 'fail');
    const runs = new Set(failed.map((c) => /\/runs\/(\d+)/.exec(c.link)?.[1]).filter(Boolean));
    const out = [`ship: failed jobs: ${failed.map((c) => c.name).join(', ')}`];
    for (const id of runs) {
        const log = sh('gh', ['run', 'view', String(id), '--log-failed'])
            .stdout.trimEnd()
            .split('\n');
        out.push(`--- last 40 lines of run ${id}`, ...log.slice(-40));
    }
    return out.join('\n');
}

/**
 * Step 6: waits for the checks with gh's own watch.
 * @param {Ctx} ctx the context
 */
export function stepWatch(ctx) {
    const { sh, state } = ctx;
    const r = sh('gh', ['pr', 'checks', String(state.pr), '--watch', '--fail-fast'], { inherit: true });
    const runs = sh('gh', [
        'run',
        'list',
        '--branch',
        state.branch,
        '--event',
        'pull_request',
        '--json',
        'databaseId',
        '--jq',
        'length',
    ]);
    state.ciRuns = Number(runs.stdout.trim()) || null;
    if (r.status !== 0) {
        throw new ShipError(1, 'red', failureReport(ctx));
    }
}

/** @param {number} seconds how long to block */
function sleep(seconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/**
 * Step 7: confirms the PR is MERGED, then prints the link and the minutes from push to merge. With --no-merge it only
 * prints the link.
 * @param {Ctx} ctx the context
 * @param {{waitS?: number, pollS?: number, pause?: (seconds: number) => void}} [wait] the merge wait: total seconds,
 *   seconds between looks and the function that waits (tests pass a no-op)
 */
export function stepConfirm(ctx, { waitS = 600, pollS = 10, pause = sleep } = {}) {
    const { sh, state, opts } = ctx;
    const look = () => {
        const r = sh('gh', ['pr', 'view', String(state.pr), '--json', 'state,mergeStateStatus,url']);
        return r.status === 0 ? JSON.parse(r.stdout || '{}') : {};
    };
    let view = look();
    if (opts.noMerge) {
        console.log(`ship: checks green, auto-merge left off: ${view.url ?? `PR #${state.pr}`}`);
        return;
    }
    for (let waited = 0; view.state !== 'MERGED' && waited < waitS; waited += pollS) {
        pause(pollS);
        view = look();
    }
    if (view.state !== 'MERGED') {
        throw new ShipError(
            7,
            'unmerged',
            `ship: checks are green but PR #${state.pr} is ${view.state} (mergeStateStatus ${view.mergeStateStatus}) after ${waitS} s`,
        );
    }
    state.minutes = Math.round(((Date.now() - state.pushedAt) / 60000) * 10) / 10;
    console.log(`ship: merged ${view.url} in ${state.minutes} min from push`);
}

/**
 * @param {Record<string, any>} state what the run learned
 * @param {string} result the outcome word
 */
export function appendLog(state, result) {
    const minutes =
        state.minutes ?? (state.pushedAt ? Math.round(((Date.now() - state.pushedAt) / 60000) * 10) / 10 : null);
    const line = {
        branch: state.branch ?? null,
        pr: state.pr ?? null,
        scope: state.scope ?? null,
        ciRuns: state.ciRuns ?? null,
        minutes,
        result,
    };
    mkdirSync('.checklogs', { recursive: true });
    appendFileSync('.checklogs/ship.jsonl', `${JSON.stringify(line)}\n`);
}

/**
 * @param {unknown} error what a step threw
 * @param {Record<string, any>} state what the run learned
 * @returns {number} the exit code; rethrows anything that is not a ShipError
 */
function exitFor(error, state) {
    if (!(error instanceof ShipError)) {
        throw error;
    }
    console.error(error.message);
    if (error.result !== 'usage') {
        appendLog(state, error.result);
    }
    return error.exitCode;
}

/**
 * @param {string[]} argv arguments after the script name
 * @param {{sh?: Sh, env?: Record<string, string | undefined>}} [deps] test seams
 * @returns {number} the exit code
 */
export function runShip(argv, { sh = realSh, env = process.env } = {}) {
    const state = {};
    try {
        const ctx = { opts: parseShipArgs(argv), sh, state };
        const wait = { waitS: Number(env.SHIP_MERGE_WAIT_S ?? 600), pollS: Number(env.SHIP_MERGE_POLL_S ?? 10) };
        for (const step of [stepGuard, stepMergeBase, stepGate, stepBody, stepPush, stepWatch]) {
            step(ctx);
        }
        stepConfirm(ctx, wait);
        appendLog(state, ctx.opts.noMerge ? 'green' : 'merged');
        return 0;
    } catch (error) {
        return exitFor(error, state);
    }
}
