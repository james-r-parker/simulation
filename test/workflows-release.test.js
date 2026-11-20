// The release scope of check.yml: the Release Please pull request runs the `scope` job alone, the required `check` and
// `browser-smoke` still report success, and no other diff skips the gate (docs/designs/agent-workflow.md, Release PR).
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const check = readFileSync('.github/workflows/check.yml', 'utf8');

/**
 * @param {string} id job id
 * @returns {string} the job's text, up to the next top-level comment
 */
function job(id) {
    const start = check.indexOf(`\n  ${id}:`);
    const next = check.indexOf('\n  # ', start + 1);
    return check.slice(start, next < 0 ? undefined : next);
}

/**
 * The shell of a step's `run: |` block, de-indented.
 * @param {string} jobId job id
 * @param {string} stepName the step's name
 * @returns {string} the script
 */
function stepScript(jobId, stepName) {
    const step =
        job(jobId)
            .split('\n      - ')
            .find((text) => text.startsWith(`name: ${stepName}`)) ?? '';
    const lines = step
        .slice(step.indexOf('run: |') + 'run: |'.length)
        .split('\n')
        .slice(1);
    return lines.map((line) => line.replace(/^ {10}/, '')).join('\n');
}

describe('check.yml release scope', { timeout: scaleTimeout(30_000) }, () => {
    let dir = '';
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'release-scope-'));
        mkdirSync(join(dir, 'scripts'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /**
     * Runs a step's script with a change-scope.sh stand-in that prints `general` (and `browser` for --browser).
     * @param {{jobId: string, step: string, general: string, event: string, headRef: string}} run the step and inputs
     * @returns {string} the `scope=` line the step wrote to $GITHUB_OUTPUT
     */
    function scopeOf({ jobId, step, general, event, headRef }) {
        const stub = join(dir, 'scripts/change-scope.sh');
        writeFileSync(stub, `#!/usr/bin/env bash\n[[ "$1" == --browser ]] && echo browser || echo ${general}\n`);
        chmodSync(stub, 0o755);
        const output = join(dir, 'out.txt');
        writeFileSync(output, '');
        spawnSync('bash', ['-c', stepScript(jobId, step)], {
            cwd: dir,
            env: {
                PATH: process.env.PATH,
                GITHUB_OUTPUT: output,
                EVENT: event,
                BASE: 'origin/main',
                BEFORE: '0'.repeat(40),
                HEAD_REF: headRef,
            },
        });
        return readFileSync(output, 'utf8').trim();
    }

    const scopeStep = (/** @type {string} */ general, /** @type {string} */ event, /** @type {string} */ headRef) =>
        scopeOf({ jobId: 'scope', step: 'Change scope', general, event, headRef });

    it('reports release for a release-please pull request whose diff is the version files', () => {
        expect(scopeStep('release', 'pull_request', 'release-please--branches--main')).toBe('scope=release');
    });

    it('keeps the full gate for a release-shaped diff on any other branch, in the queue and on a push', () => {
        expect(scopeStep('release', 'pull_request', 'dependabot/npm_and_yarn/vite-9')).toBe('scope=full');
        expect(scopeStep('release', 'merge_group', '')).toBe('scope=full');
        expect(scopeStep('release', 'push', '')).toBe('scope=full');
    });

    it('leaves the docs and full scopes alone on the release branch', () => {
        expect(scopeStep('docs', 'pull_request', 'release-please--branches--main')).toBe('scope=docs');
        expect(scopeStep('full', 'pull_request', 'release-please--branches--main')).toBe('scope=full');
    });

    it('skips the browser smoke steps for the release pull request only', () => {
        const smoke = (/** @type {string} */ general, /** @type {string} */ event, /** @type {string} */ ref) =>
            scopeOf({ jobId: 'browser-smoke', step: 'Browser scope', general, event, headRef: ref });
        expect(smoke('release', 'pull_request', 'release-please--branches--main')).toBe('scope=none');
        expect(smoke('release', 'pull_request', 'dependabot/npm_and_yarn/vite-9')).toBe('scope=browser');
        expect(smoke('full', 'pull_request', 'release-please--branches--main')).toBe('scope=browser');
        expect(smoke('release', 'merge_group', '')).toBe('scope=browser');
    });

    it('skips every other job for release, and no job for another scope', () => {
        expect(job('static')).toContain("if: needs.scope.outputs.scope != 'release'");
        expect(job('test')).toContain("needs.scope.outputs.scope != 'release'");
        expect(job('coverage')).toContain("needs.test.result != 'skipped'");
        for (const id of ['scope', 'check', 'browser-smoke']) {
            expect(job(id), `${id} is never skipped by scope`).not.toMatch(/^ {4}if: .*scope\.outputs\.scope/m);
        }
    });

    it('reports check as success when the only job that ran is scope', () => {
        const aggregate = stepScript('check', 'Every job passed or was skipped');
        /** @param {string} results the joined job results @returns {number | null} the exit status */
        const status = (results) =>
            spawnSync('bash', ['-c', aggregate], { env: { PATH: process.env.PATH, RESULTS: results } }).status;
        expect(status('success skipped skipped skipped')).toBe(0);
        expect(status('success failure skipped skipped')).not.toBe(0);
        expect(status('success success success cancelled')).not.toBe(0);
        expect(job('check')).toContain('needs: [scope, static, test, coverage]');
        expect(job('check')).toContain('always()');
    });
});
