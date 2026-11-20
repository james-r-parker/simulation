import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

    it('says release for a diff of only the Release Please files, whichever of them it holds', () => {
        const all = ['CHANGELOG.md', 'package.json', 'package-lock.json', '.release-please-manifest.json'];
        expect(scope([], all)).toBe('release');
        for (const path of all) {
            expect(scope([], [path]), path).toBe('release');
        }
        expect(scope([], ['CHANGELOG.md', '', 'package.json'])).toBe('release');
    });

    it('says release for CHANGELOG.md alone, ahead of docs, and docs for other root Markdown', () => {
        expect(scope([], ['CHANGELOG.md'])).toBe('release');
        expect(scope([], ['README.md'])).toBe('docs');
        expect(scope([], ['CHANGELOG.md', 'README.md'])).toBe('docs');
    });

    it('runs the full gate when any other file joins the version bump', () => {
        for (const extra of ['js/sim/a.js', 'scripts/check.sh', 'docs/designs/a.md', 'wasm/blob-kernels.wasm']) {
            expect(scope([], ['CHANGELOG.md', 'package.json', extra]), extra).toBe('full');
        }
        expect(scope([], ['package.json', 'src/package.json'])).toBe('full');
    });

    it('says release for a base ref whose diff is the version files', () => {
        const repo = mkdtempSync(join(tmpdir(), 'change-scope-'));
        try {
            mkdirSync(join(repo, 'scripts'));
            copyFileSync('scripts/change-scope.sh', join(repo, 'scripts/change-scope.sh'));
            writeFileSync(join(repo, 'package.json'), '{"version":"1.0.0"}\n');
            const env = { PATH: process.env.PATH, HOME: repo };
            /** @param {...string} args git arguments */
            const git = (...args) => spawnSync('git', args, { cwd: repo, env });
            git('init', '-q', '-b', 'main');
            git('add', '-A');
            git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
            git('checkout', '-q', '-b', 'release-please--branches--main');
            writeFileSync(join(repo, 'package.json'), '{"version":"1.1.0"}\n');
            writeFileSync(join(repo, 'CHANGELOG.md'), '# 1.1.0\n');
            git('add', '-A');
            git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'release');
            const out = spawnSync('bash', ['scripts/change-scope.sh', 'main'], { cwd: repo, env, encoding: 'utf8' });
            expect(out.stdout.trim()).toBe('release');
        } finally {
            rmSync(repo, { recursive: true, force: true });
        }
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
