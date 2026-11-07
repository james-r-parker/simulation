import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/**
 * @param {string[]} paths the changed paths
 * @returns {string} what perf-scope.sh prints for them
 */
function scope(paths) {
    const r = spawnSync('scripts/perf-scope.sh', [], { input: paths.join('\n'), encoding: 'utf8' });
    expect(r.status).toBe(0);
    return r.stdout.trim();
}

describe('perf-scope.sh', { timeout: scaleTimeout(15_000) }, () => {
    it('says perf for a js/sim, js/evo, js/worker or bench path', () => {
        for (const path of ['js/sim/step.js', 'js/evo/observer.js', 'js/worker/protocol.js', 'bench/baseline.json']) {
            expect(scope([path])).toBe('perf');
        }
    });

    it('says perf for a mixed change with one such path', () => {
        expect(scope(['docs/x.md', 'test/a.test.js', 'js/sim/brain.js'])).toBe('perf');
    });

    it('says none for docs, scripts, tests, the app and CI', () => {
        expect(
            scope([
                'docs/designs/a.md',
                'scripts/check.sh',
                'test/a.test.js',
                'js/app/main.js',
                '.github/workflows/check.yml',
            ]),
        ).toBe('none');
    });

    it('does not match a lookalike prefix', () => {
        expect(scope(['js/simulation.js', 'benchmarks/x.js'])).toBe('none');
    });

    it('says none for no paths and rejects two arguments', () => {
        expect(scope([])).toBe('none');
        expect(spawnSync('scripts/perf-scope.sh', ['a', 'b'], { encoding: 'utf8' }).status).toBe(2);
    });
});

describe('check.yml perf job', () => {
    const text = readFileSync('.github/workflows/check.yml', 'utf8');
    const start = text.indexOf('\n  perf:');
    // Up to the next top-level job: the `noise` job after it has its own install and bench-compare steps.
    const next = text.slice(start + 1).search(/\n {2}[a-z][a-z-]*:\n/);
    const job = next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);

    it('runs on pull requests only, advisory, and always reports', () => {
        expect(job).toContain("if: github.event_name == 'pull_request'");
        expect(job).toContain('continue-on-error: true');
    });

    it('skips its install and compare steps when the scope is none', () => {
        const gated = job.split('\n      - ').filter((step) => /npm ci|bench-compare|setup-node/.test(step));
        expect(gated.length).toBe(3);
        for (const step of gated) {
            expect(step).toContain("steps.scope.outputs.scope == 'perf'");
        }
    });

    it('compares against the PR base and writes the table to the run summary', () => {
        expect(job).toContain('scripts/perf-scope.sh');
        expect(job).toContain('--base "origin/$' + '{{ github.base_ref }}"');
        expect(job).toContain('GITHUB_STEP_SUMMARY');
    });
});
