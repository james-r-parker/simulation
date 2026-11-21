import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bodyProblems } from '../scripts/lib/ship-body.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const GOOD = '## Summary\nA change.\n';
const SCENE = '## Scene served\nHunters stay alive; detector `hunters_alive`.\n';

describe('bodyProblems', () => {
    it('needs a Summary on every body', () => {
        expect(bodyProblems(GOOD, ['docs/a.md'])).toEqual([]);
        expect(bodyProblems('hello', ['docs/a.md'])).toEqual(['missing section: ## Summary']);
    });

    it('needs a scene and a backticked detector metric on a sim or evo diff', () => {
        expect(bodyProblems(GOOD, ['js/sim/brain.js'])[0]).toContain('missing section: ## Scene served');
        expect(bodyProblems(`${GOOD}## Scene served\nNone - no change\n`, ['js/evo/x.js'])[0]).toContain('says None');
        expect(bodyProblems(`${GOOD}## Scene served\nHunters\n`, ['js/evo/x.js'])[0]).toContain('no detector metric');
        expect(bodyProblems(GOOD + SCENE, ['js/sim/brain.js'])).toEqual([]);
        expect(bodyProblems(GOOD, ['js/app/main.js'])).toEqual([]);
    });
});

// gh is a stub that records every call; GH_* variables steer it. git is real, on a fixture repo whose origin is a local
// bare repository, so nothing leaves the machine.
const GH_STUB = `#!/usr/bin/env bash
echo "$*" >>"$GH_LOG"
case "$1 $2" in
  "pr list") echo "\${GH_EXISTING_PR:-}" ;;
  "pr create") echo "https://github.com/o/r/pull/42"; exit "\${GH_CREATE_STATUS:-0}" ;;
  "pr merge") exit 0 ;;
  "pr checks")
    if [[ "$*" == *--watch* ]]; then exit "\${GH_CHECKS_STATUS:-0}"; fi
    if [[ -n "\${GH_NO_CHECKS:-}" ]]; then echo "no checks reported on the 'feat/x' branch" >&2; exit 1; fi
    echo '[{"name":"test shard-1","bucket":"fail","link":"https://github.com/o/r/actions/runs/777/job/1"}]' ;;
  "pr view") echo "{\\"state\\":\\"\${GH_PR_STATE:-MERGED}\\",\\"mergeStateStatus\\":\\"BLOCKED\\",\\"url\\":\\"https://github.com/o/r/pull/42\\"}" ;;
  "run view") echo "log line"; exit 0 ;;
  "run list") echo 2 ;;
esac
`;

let dir = '';
let work = '';
let env = {};

/**
 * @param {string} cwd where to run
 * @param {string[]} args git arguments
 * @returns {string} trimmed stdout
 */
function git(cwd, args) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env });
    expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
    return r.stdout.trim();
}

/**
 * @param {string[]} args ship.sh arguments
 * @param {Record<string, string>} [extra] extra environment
 * @returns {{status: number | null, stdout: string, stderr: string}} the outcome
 */
function ship(args, extra = {}) {
    const r = spawnSync('scripts/ship.sh', args, { cwd: work, encoding: 'utf8', env: { ...env, ...extra } });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** @returns {string} the gh calls so far */
const ghCalls = () => readFileSync(join(dir, 'gh.log'), 'utf8');
/** @returns {Record<string, any>[]} the ship.jsonl lines */
const logLines = () =>
    readFileSync(join(work, '.checklogs/ship.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ship-'));
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), GH_STUB);
    chmodSync(join(bin, 'gh'), 0o755);
    writeFileSync(join(dir, 'gh.log'), '');
    env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_LOG: join(dir, 'gh.log'),
        SHIP_MERGE_WAIT_S: '1',
        SHIP_MERGE_POLL_S: '1',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
    };
    const origin = join(dir, 'origin.git');
    work = join(dir, 'work');
    git(dir, ['init', '--bare', '-b', 'main', origin]);
    git(dir, ['clone', origin, work]);
    mkdirSync(join(work, 'scripts/lib'), { recursive: true });
    cpSync(resolve('scripts/ship.sh'), join(work, 'scripts/ship.sh'));
    for (const f of ['ship-main.mjs', 'ship-steps.mjs', 'ship-body.mjs', 'ship-wait.mjs']) {
        cpSync(resolve('scripts/lib', f), join(work, 'scripts/lib', f));
    }
    // Stub gates: change-scope prints $SCOPE; check.sh records its flags, optionally writes a file or fails.
    writeFileSync(join(work, 'scripts/change-scope.sh'), '#!/usr/bin/env bash\necho "${SCOPE:-full}"\n');
    writeFileSync(
        join(work, 'scripts/check.sh'),
        '#!/usr/bin/env bash\necho "$*" >>"$GH_LOG.check"\n[[ -z "${CHECK_WRITES:-}" ]] || echo fixed >>tracked.txt\n' +
            '[[ -z "${CHECK_FAILS:-}" ]] || { mkdir -p .checklogs; echo lint >.checklogs/failed-gates; exit 1; }\n',
    );
    for (const f of ['ship.sh', 'change-scope.sh', 'check.sh']) {
        chmodSync(join(work, 'scripts', f), 0o755);
    }
    writeFileSync(join(work, 'tracked.txt'), 'a\n');
    writeFileSync(join(work, '.gitignore'), '.checklogs\n');
    writeFileSync(join(work, 'body.md'), GOOD);
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'init']);
    git(work, ['push', 'origin', 'main']);
    git(work, ['switch', '-c', 'feat/x']);
    writeFileSync(join(work, 'change.txt'), 'c\n');
    git(work, ['add', 'change.txt']);
    git(work, ['commit', '-m', 'feat: change']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ARGS = ['--title', 'feat: x', '--body', 'body.md'];

describe('ship.sh', { timeout: scaleTimeout(60_000) }, () => {
    it('ships a clean branch: pushes, opens the PR, enables auto-merge, waits, confirms and logs', () => {
        const r = ship(ARGS);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain('merged https://github.com/o/r/pull/42');
        const calls = ghCalls();
        expect(calls).toContain('pr create --base main --title feat: x --body-file body.md');
        expect(calls).toContain('pr merge 42 --auto --merge');
        expect(calls).toContain('pr checks 42 --watch --fail-fast');
        expect(git(work, ['ls-remote', '--heads', 'origin', 'feat/x'])).toContain('refs/heads/feat/x');
        expect(readFileSync(`${join(dir, 'gh.log')}.check`, 'utf8')).toBe('--fix --quick\n');
        const [line] = logLines();
        expect(line).toMatchObject({ branch: 'feat/x', pr: 42, scope: 'full', ciRuns: 2, result: 'merged' });
        expect(typeof line.minutes).toBe('number');
    });

    it('exit 2 on uncommitted files or on main, before any push', () => {
        writeFileSync(join(work, 'loose.txt'), 'x');
        const dirty = ship(ARGS);
        expect(dirty.status).toBe(2);
        expect(dirty.stderr).toContain('loose.txt');
        rmSync(join(work, 'loose.txt'));
        git(work, ['switch', 'main']);
        expect(ship(ARGS).status).toBe(2);
        expect(ghCalls()).toBe('');
    });

    it('exit 2 on a missing argument or body file', () => {
        expect(ship(['--title', 'x']).status).toBe(2);
        expect(ship(['--title', 'x', '--body', 'nope.md']).status).toBe(2);
    });

    it('merges origin/main when behind, with a merge commit and no rebase', () => {
        const other = join(dir, 'other');
        git(dir, ['clone', join(dir, 'origin.git'), other]);
        writeFileSync(join(other, 'upstream.txt'), 'u');
        git(other, ['add', 'upstream.txt']);
        git(other, ['commit', '-m', 'upstream']);
        git(other, ['push', 'origin', 'main']);
        const r = ship(ARGS);
        expect(r.status, r.stderr).toBe(0);
        expect(git(work, ['log', '-1', '--format=%p']).split(' ')).toHaveLength(2);
    });

    it('exit 3 with the conflicted paths when the merge conflicts', () => {
        const other = join(dir, 'other');
        git(dir, ['clone', join(dir, 'origin.git'), other]);
        writeFileSync(join(other, 'change.txt'), 'theirs\n');
        git(other, ['add', 'change.txt']);
        git(other, ['commit', '-m', 'upstream']);
        git(other, ['push', 'origin', 'main']);
        const r = ship(ARGS);
        expect(r.status).toBe(3);
        expect(r.stderr).toContain('change.txt');
        expect(logLines()[0].result).toBe('conflict');
        expect(ghCalls()).not.toContain('pr create');
    });

    it('runs the docs gate for a docs scope and commits what --fix wrote', () => {
        const r = ship(ARGS, { SCOPE: 'docs', CHECK_WRITES: '1' });
        expect(r.status, r.stderr).toBe(0);
        expect(readFileSync(`${join(dir, 'gh.log')}.check`, 'utf8')).toBe('--fix --docs\n');
        expect(git(work, ['log', '-1', '--format=%s'])).toBe('style: apply check.sh --fix');
        expect(logLines()[0].scope).toBe('docs');
    });

    it('exit 4 with the failed gates when the gate fails, and pushes nothing', () => {
        const r = ship(ARGS, { CHECK_FAILS: '1' });
        expect(r.status).toBe(4);
        expect(r.stderr).toContain('lint');
        expect(git(work, ['ls-remote', '--heads', 'origin', 'feat/x'])).toBe('');
    });

    it('exit 5 and the missing section when a sim diff has no scene', () => {
        mkdirSync(join(work, 'js/sim'), { recursive: true });
        writeFileSync(join(work, 'js/sim/a.js'), 'x');
        git(work, ['add', 'js/sim/a.js']);
        git(work, ['commit', '-m', 'feat: sim']);
        const r = ship(ARGS);
        expect(r.status).toBe(5);
        expect(r.stderr).toContain('## Scene served');
        expect(ghCalls()).toBe('');
    });

    it('exit 6 when gh pr create fails', () => {
        const r = ship(ARGS, { GH_CREATE_STATUS: '1' });
        expect(r.status).toBe(6);
        expect(ghCalls()).not.toContain('pr merge');
    });

    it('reuses an open PR on a rerun and skips pr create', () => {
        const r = ship(ARGS, { GH_EXISTING_PR: '42' });
        expect(r.status, r.stderr).toBe(0);
        expect(ghCalls()).not.toContain('pr create');
    });

    it('--no-merge never enables auto-merge and stops after green checks', () => {
        const r = ship([...ARGS, '--no-merge'], { GH_PR_STATE: 'OPEN' });
        expect(r.status, r.stderr).toBe(0);
        expect(ghCalls()).not.toContain('pr merge');
        expect(logLines()[0].result).toBe('green');
    });

    it('exit 1 with the failed job names and log tail on red checks', () => {
        const r = ship(ARGS, { GH_CHECKS_STATUS: '1' });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('test shard-1');
        expect(r.stderr).toContain('log line');
        expect(logLines()[0].result).toBe('red');
    });

    it('exit 1 no-checks, and never watches, when no check registers within the grace period', () => {
        const r = ship(ARGS, { GH_NO_CHECKS: '1', SHIP_CHECKS_GRACE_S: '0.2', SHIP_CHECKS_POLL_S: '0.1' });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('no checks registered on PR #42 after 0.2 s');
        expect(ghCalls()).not.toContain('pr checks 42 --watch --fail-fast');
        expect(logLines()[0].result).toBe('no-checks');
    });

    it('exit 7 with the merge state when green but not merged after the wait', () => {
        const r = ship(ARGS, { GH_PR_STATE: 'OPEN' });
        expect(r.status).toBe(7);
        expect(r.stderr).toContain('BLOCKED');
        expect(logLines()[0].result).toBe('unmerged');
    });

    it('never rebases or force pushes', () => {
        ship(ARGS);
        const source = readFileSync(resolve('scripts/lib/ship-steps.mjs'), 'utf8');
        expect(source).not.toMatch(/'rebase'|'--force'|'-f'|--force-with-lease/);
    });
});
