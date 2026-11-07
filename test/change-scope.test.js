import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/**
 * @param {string[]} args arguments for scripts/change-scope.sh
 * @param {string[]} paths the changed paths, on stdin
 * @returns {string} what the script prints
 */
function scope(args, paths) {
    const r = spawnSync('scripts/change-scope.sh', args, { input: paths.join('\n'), encoding: 'utf8' });
    expect(r.status).toBe(0);
    return r.stdout.trim();
}

describe('change-scope.sh', { timeout: scaleTimeout(15_000) }, () => {
    it('says docs for Markdown under docs/ and .claude/ and at the root, else full', () => {
        expect(scope([], ['docs/designs/a.md', '.claude/skills/x/SKILL.md', 'README.md'])).toBe('docs');
        expect(scope([], ['docs/designs/a.md', 'scripts/check.sh'])).toBe('full');
        expect(scope([], [])).toBe('full');
    });

    it('rejects two arguments', () => {
        expect(spawnSync('scripts/change-scope.sh', ['a', 'b'], { encoding: 'utf8' }).status).toBe(2);
    });
});

describe('change-scope.sh --browser', { timeout: scaleTimeout(15_000) }, () => {
    it('says browser for any path the built app or the smoke test reads', () => {
        const paths = [
            'js/app/main.js',
            'js/worker/protocol.js',
            'js/sim/step.js',
            'js/evo/observer.js',
            'index.html',
            'public/db-worker.js',
            'vite.config.js',
            'package.json',
            'package-lock.json',
            'wasm/blob-kernels.wasm',
            'css/app.css',
            'test/browser/smoke.spec.js',
            'scripts/browser-smoke.sh',
            '.github/workflows/check.yml',
        ];
        for (const path of paths) {
            expect(scope(['--browser'], [path]), path).toBe('browser');
        }
    });

    it('says browser for a mixed change with one such path', () => {
        expect(scope(['--browser'], ['docs/x.md', 'test/a.test.js', 'js/app/ui/panel.js'])).toBe('browser');
    });

    it('says none for docs, tests, scripts, evals, bench and other workflows', () => {
        const paths = [
            'docs/designs/a.md',
            'test/sim/a.test.js',
            'scripts/check.sh',
            'evals/seeds.json',
            'bench/baseline.json',
        ];
        expect(scope(['--browser'], [...paths, '.github/workflows/nightly.yml'])).toBe('none');
    });

    it('does not match a lookalike prefix', () => {
        expect(scope(['--browser'], ['jsx/a.js', 'publicity.md', 'cssx/a.css'])).toBe('none');
    });

    it('says browser for no paths, so an unknown change is never skipped', () => {
        expect(scope(['--browser'], [])).toBe('browser');
    });

    it('takes a base sha, as the merge queue passes it, and fails on an unknown one', () => {
        // An empty diff (HEAD against itself) is unclassifiable, so it runs the smoke.
        const same = spawnSync('scripts/change-scope.sh', ['--browser', 'HEAD'], { encoding: 'utf8' });
        expect(same.stdout.trim()).toBe('browser');
        // The workflow turns a failure into the full scope (`|| echo browser`).
        const bad = spawnSync('scripts/change-scope.sh', ['--browser', '0'.repeat(40)], { encoding: 'utf8' });
        expect(bad.status).not.toBe(0);
    });
});
