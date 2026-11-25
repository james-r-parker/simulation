// The wiring of the affected tests in check.yml: the `scope` job picks the matrix, the `test` job runs it, `check` stays the
// one required status (docs/designs/agent-workflow.md, Affected tests in CI). The step scripts run in a sandbox with
// scripts/affected.mjs stubbed, so no network and no real diff is involved.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fullMatrix } from '../../scripts/lib/affected-matrix.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

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
 * @param {string} jobId job id
 * @param {string} stepName the step's name
 * @returns {string} the step's `run: |` script, de-indented
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

describe('check.yml Affected tests step', { timeout: scaleTimeout(30_000) }, () => {
    let dir = '';
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'affected-step-'));
        mkdirSync(join(dir, 'scripts'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /**
     * Runs the step with a scripts/affected.mjs stand-in that logs its arguments and exits `exitFor(args)`.
     * @param {{event: string, scope: string, failWhen?: string}} run the event, the change scope, and when the stand-in fails ('selection': the call without --full; 'any': every call)
     * @returns {{status: number | null, calls: string[], output: string}} the exit status, each call's arguments and the step output
     */
    function runStep({ event, scope, failWhen = '' }) {
        const stub = join(dir, 'scripts/affected.mjs');
        const log = join(dir, 'calls.txt');
        writeFileSync(
            stub,
            `import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, args.join(' ') + '\\n');
const fail = ${JSON.stringify(failWhen)};
if (fail === 'any' || (fail === 'selection' && !args.includes('--full'))) process.exit(1);
`,
        );
        chmodSync(stub, 0o755);
        const output = join(dir, 'out.txt');
        writeFileSync(output, '');
        writeFileSync(log, '');
        const done = spawnSync('bash', ['-c', stepScript('scope', 'Affected tests')], {
            cwd: dir,
            env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, EVENT: event, SCOPE: scope, BASE: 'origin/main' },
        });
        const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
        return {
            status: done.status,
            calls: calls.map((c) => c.replace(output, 'OUT')),
            output: readFileSync(output, 'utf8'),
        };
    }

    it('runs no test for the docs, records and release scopes, whatever the event', () => {
        for (const scope of ['docs', 'records', 'release']) {
            const result = runStep({ event: 'pull_request', scope });
            expect(result.calls, scope).toEqual([]);
            expect(result.output).toBe(`mode=${scope}\nhas_tests=false\ncoverage=none\nmatrix={"include":[]}\n`);
        }
    });

    it('selects against the base branch on a pull request', () => {
        const result = runStep({ event: 'pull_request', scope: 'full' });
        expect(result.calls).toEqual(['origin/main --out affected.json --github-output OUT']);
        expect(result.status).toBe(0);
    });

    it('runs the whole suite on a push and a manual run', () => {
        for (const event of ['push', 'workflow_dispatch']) {
            const result = runStep({ event, scope: 'full' });
            expect(result.calls, event).toEqual(['--full --out affected.json --github-output OUT']);
        }
    });

    it('falls back to the whole suite when the selection fails, and fails the job when that fails too', () => {
        const fallback = runStep({ event: 'pull_request', scope: 'full', failWhen: 'selection' });
        expect(fallback.status).toBe(0);
        expect(fallback.calls).toEqual([
            'origin/main --out affected.json --github-output OUT',
            '--full --out affected.json --github-output OUT',
        ]);
        const broken = runStep({ event: 'pull_request', scope: 'full', failWhen: 'any' });
        expect(broken.status).not.toBe(0);
    });

    it('writes outputs the workflow can read: the real script on the whole suite', () => {
        const output = join(dir, 'real.txt');
        writeFileSync(output, '');
        const done = spawnSync('node', ['scripts/affected.mjs', '--full', '--github-output', output], {
            encoding: 'utf8',
        });
        expect(done.status).toBe(0);
        const lines = Object.fromEntries(
            readFileSync(output, 'utf8')
                .trim()
                .split('\n')
                .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
        );
        expect(lines).toMatchObject({ mode: 'full', has_tests: 'true', coverage: 'whole' });
        expect(JSON.parse(lines.matrix ?? '').include).toEqual(fullMatrix());
    });
});

describe('check.yml records scope', () => {
    const steps = job('static').split('\n      - ');

    it('runs the docs gate and then the two ledger checks, and no other gate', () => {
        const docs = steps.find((s) => s.includes('scripts/check.sh --ci --docs')) ?? '';
        expect(docs).toContain("scope == 'docs' || needs.scope.outputs.scope == 'records'");
        const ledger = steps.find((s) => s.startsWith('name: Ledger checks')) ?? '';
        expect(ledger).toContain("scope == 'records'");
        expect(ledger).toContain('node scripts/check-experiments.mjs');
        expect(ledger).toContain('node scripts/check-metric-names.mjs');
        for (const name of ['Local gate\n', 'Open affected-test misses']) {
            const step = steps.find((s) => s.startsWith(`name: ${name}`)) ?? '';
            expect(step, name).toContain("scope != 'records'");
        }
    });

    it('leaves the test, coverage and related-ratchet jobs to the selection, which reaches none', () => {
        expect(job('test')).toContain("has_tests == 'true'");
        expect(job('coverage')).toContain("coverage == 'whole'");
        expect(job('ratchet-related')).toContain("coverage == 'related'");
    });
});

describe('check.yml jobs that follow the selection', () => {
    it('hands the scope job outputs to the test job and skips it when no test is reached', () => {
        const scope = job('scope');
        for (const name of ['mode', 'has_tests', 'coverage', 'matrix']) {
            expect(scope).toContain(`${name}: \${{ steps.affected.outputs.${name} }}`);
        }
        expect(job('test')).toContain("if: needs.scope.outputs.has_tests == 'true'");
        expect(job('test')).toContain('needs: scope');
    });

    it('keeps the reached list as an artifact on a pull request, for the miss ledger', () => {
        const step = scopeStep('Upload the reached tests');
        expect(step).toContain("github.event_name == 'pull_request'");
        expect(step).toContain('name: affected');
        expect(step).toContain('path: affected.json');
    });

    it('holds the changed files of a pull request to their baseline, and counts the skip exit as a pass', () => {
        const text = job('ratchet-related');
        expect(text).toContain("if: needs.scope.outputs.coverage == 'related'");
        expect(text).toContain('node scripts/ratchet-related.mjs --base "$BASE"');
        expect(text).toContain('[[ $status -eq 0 || $status -eq 3 ]]');
        expect(text).toContain('fetch-depth: 0');
    });

    it('runs the whole-suite ratchet only with the whole suite', () => {
        expect(job('coverage')).toContain("needs.scope.outputs.coverage == 'whole'");
        expect(job('coverage')).toContain('node scripts/quality-ratchet.mjs --check');
    });

    it('keeps check the one required status: it needs every job and fails on a failed or cancelled one, not a skipped one', () => {
        const text = job('check');
        expect(text).toContain('needs: [scope, static, test, coverage, ratchet-related]');
        expect(text).toContain("if: github.event_name != 'workflow_dispatch' && always()");
        const aggregate = stepScript('check', 'Every job passed or was skipped');
        /** @param {string} results the joined job results @returns {number | null} the exit status */
        const status = (results) =>
            spawnSync('bash', ['-c', aggregate], { env: { PATH: process.env.PATH, RESULTS: results } }).status;
        // scope, static, test, coverage, ratchet-related: a pull request that reached tests has no whole coverage.
        expect(status('success success success skipped success')).toBe(0);
        expect(status('success success skipped success skipped')).toBe(0);
        expect(status('success success failure skipped success')).not.toBe(0);
        expect(status('failure skipped skipped skipped skipped')).not.toBe(0);
        expect(status('success success success skipped cancelled')).not.toBe(0);
    });
});

/**
 * @param {string} stepName a step name in the scope job
 * @returns {string} the step's text
 */
function scopeStep(stepName) {
    return (
        job('scope')
            .split('\n      - ')
            .find((text) => text.startsWith(`name: ${stepName}`)) ?? ''
    );
}

describe('check.yml on the push to main', () => {
    /**
     * Runs a step script of a job with a change-scope.sh stand-in that says docs, as it would for a docs-only diff.
     * @param {string} jobId job id
     * @param {string} stepName the step's name
     * @param {string} event the event name
     * @returns {string} the `scope=` line the step wrote
     */
    function scopeOnPush(jobId, stepName, event) {
        const dir = mkdtempSync(join(tmpdir(), 'push-scope-'));
        try {
            mkdirSync(join(dir, 'scripts'));
            const stub = join(dir, 'scripts/change-scope.sh');
            writeFileSync(stub, '#!/usr/bin/env bash\necho docs\n');
            chmodSync(stub, 0o755);
            const output = join(dir, 'out.txt');
            writeFileSync(output, '');
            spawnSync('bash', ['-c', stepScript(jobId, stepName)], {
                cwd: dir,
                env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, EVENT: event, BASE: 'origin/main', HEAD_REF: '' },
            });
            return readFileSync(output, 'utf8').trim();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it('runs the whole suite and the browser smoke for any push, a docs-only one included', () => {
        expect(scopeOnPush('scope', 'Change scope', 'push')).toBe('scope=full');
        expect(scopeOnPush('browser-smoke', 'Browser scope', 'push')).toBe('scope=browser');
        // A pull request is still classified: the same diff reads docs.
        expect(scopeOnPush('scope', 'Change scope', 'pull_request')).toBe('scope=docs');
    });

    it('runs the static gates without the tests, which are the matrix, and the open-miss check on a pull request only', () => {
        const text = job('static');
        expect(text).toContain('scripts/check.sh --ci --skip=test');
        expect(text).toContain('issues: read');
        const step = text.split('\n      - ').find((part) => part.startsWith('name: Open affected-test misses')) ?? '';
        expect(step).toContain("github.event_name == 'pull_request'");
        expect(step).toContain('run: node scripts/miss-ledger.mjs check');
        expect(step).toContain('GH_TOKEN: ${{ github.token }}');
    });

    it('opens the red-main issue after a red full run on main only, with the rights it needs and no more', () => {
        const text = job('red-main');
        expect(text).toContain(
            "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && always() && needs.check.result == 'failure'",
        );
        expect(text).toContain('needs: [check]');
        expect(text).toContain('issues: write');
        expect(text).toContain('run: node scripts/miss-ledger.mjs report');
        expect(text).not.toMatch(/contents: write/);
        // check does not wait for it: it reports on the run that failed.
        expect(job('check')).not.toContain('red-main');
    });

    it('closes the red-main issues after a green full run on main only, with the rights it needs and no more', () => {
        const text = job('green-main');
        // success() is false when any job upstream of `check` was skipped (coverage and noise are, on a push), so the job
        // skipped on the green run of 5d678319; !cancelled() lets `needs.check.result` decide, as red-main's always() does.
        expect(text).toContain(
            "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && !cancelled() && needs.check.result == 'success'",
        );
        expect(text).not.toContain('success()');
        expect(text).toContain('needs: [check]');
        expect(text).toContain('issues: write');
        expect(text).toContain('run: node scripts/miss-ledger.mjs close');
        expect(text).not.toMatch(/contents: write/);
        expect(job('check')).not.toContain('green-main');
    });
});
