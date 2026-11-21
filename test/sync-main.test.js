// reads: scripts/lib/sync-main.mjs, scripts/lib/merge-base.mjs
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, sh } from '../scripts/lib/sync-main.mjs';

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });

describe('sync-main main', () => {
    afterEach(() => vi.restoreAllMocks());

    it('refuses an unknown or incomplete argument list with exit 2', () => {
        const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const run = vi.fn(() => ok());
        for (const argv of [['--bogus'], ['--base'], ['--base', ''], ['--base', 'a', 'b']]) {
            expect(main(argv, run), argv.join(' ')).toBe(2);
        }
        expect(err).toHaveBeenCalledWith(expect.stringContaining('usage:'));
        expect(run).not.toHaveBeenCalled();
    });

    it('fetches, reports an up-to-date branch, and takes --base', () => {
        const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const calls = /** @type {string[]} */ ([]);
        const run = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
            calls.push(`${cmd} ${args.join(' ')}`);
            return ok('0');
        };
        expect(main([], run)).toBe(0);
        expect(main(['--base', 'dev'], run)).toBe(0);
        expect(calls).toContain('git fetch origin');
        expect(calls).toContain('git rev-list --count HEAD..origin/dev');
        expect(out).toHaveBeenCalledWith('sync: already up to date\n');
    });

    it('reports a merge, and exits 3 with the paths on a conflict that is not generated', () => {
        const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const merged = (/** @type {string} */ cmd, /** @type {string[]} */ args) =>
            ok(args[0] === 'rev-list' ? '2' : '');
        expect(main([], merged)).toBe(0);
        expect(out).toHaveBeenCalledWith('sync: merged origin/main\n');
        const conflicted = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
            if (args[0] === 'merge') {
                return { status: 1, stdout: '', stderr: 'CONFLICT' };
            }
            return ok(args[0] === 'rev-list' ? '2' : args[0] === 'diff' ? 'code.js\n' : '');
        };
        expect(main([], conflicted)).toBe(3);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('code.js'));
    });
});

describe('sync-main sh', () => {
    it('returns the status and output of a command, and 1 for one that cannot start', () => {
        expect(sh('node', ['-e', 'process.stdout.write("hi"); process.exit(3)'])).toEqual({
            status: 3,
            stdout: 'hi',
            stderr: '',
        });
        expect(sh('definitely-not-a-command-xyz', []).status).toBe(1);
    });
});
