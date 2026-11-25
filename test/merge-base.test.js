// reads: scripts/lib/merge-base.mjs, scripts/lib/regen.mjs, scripts/check-conventions.sh
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeBase } from '../scripts/lib/merge-base.mjs';
import { GENERATORS } from '../scripts/lib/regen.mjs';

// A fake generator pair in the temporary repo: gen.md is the two source files joined (a whole generated file), and
// idx.md is its own prose with the headings of the month file listed under `## Index` (a generated tail).
const GEN_SCRIPT = `
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const read = (f) => readFileSync(f, 'utf8');
if (process.argv[2] === 'whole') {
    writeFileSync('gen.md', read('src-a.txt') + read('src-b.txt'));
} else {
    const idx = read('idx.md');
    const prose = idx.includes('## Index\\n') ? idx.slice(0, idx.indexOf('## Index\\n')) : idx.trimEnd() + '\\n\\n';
    const heads = readdirSync('docs/notes/2026-11').sort().map((f) => read('docs/notes/2026-11/' + f).split('\\n')[0]);
    writeFileSync('idx.md', prose + '## Index\\n' + heads.join('\\n') + '\\n');
}
`;
const GENS = [
    { script: 'gen.mjs', args: ['tail'], path: 'idx.md', whole: false, tail: '## Index' },
    { script: 'gen.mjs', args: ['whole'], path: 'gen.md', whole: true },
];
const NOTES = 'docs/notes/2026-11';

/** @param {string} cwd @returns {(cmd: string, args: string[]) => {status: number, stdout: string, stderr: string}} */
function shIn(cwd) {
    const env = { ...process.env };
    for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
        delete env[key];
    }
    return (cmd, args) => {
        const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
        return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    };
}

describe('mergeBase', () => {
    let root = '';
    let dir = '';
    let sh = shIn('.');

    const put = (/** @type {string} */ file, /** @type {string} */ text) => {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), text);
    };
    const run = (/** @type {string} */ cmd, /** @type {string[]} */ args) => {
        const r = sh(cmd, args);
        expect(r.status, `${cmd} ${args.join(' ')}: ${r.stderr}`).toBe(0);
        return r.stdout;
    };
    const commit = (/** @type {string} */ message) => {
        run('node', ['scripts/gen.mjs', 'whole']);
        run('node', ['scripts/gen.mjs', 'tail']);
        run('git', ['add', '-A']);
        run('git', ['commit', '-m', message]);
    };
    const text = (/** @type {string} */ file) => readFileSync(join(dir, file), 'utf8');

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'merge-base-'));
        dir = join(root, 'work');
        mkdirSync(dir);
        sh = shIn(dir);
        run('git', ['init', '-q', '-b', 'main']);
        run('git', ['config', 'user.email', 'test@example.com']);
        run('git', ['config', 'user.name', 'Test']);
        run('git', ['config', 'commit.gpgsign', 'false']);
        put('scripts/gen.mjs', GEN_SCRIPT);
        put('src-a.txt', 'a\n');
        put('src-b.txt', 'b\n');
        put('code.js', 'one\ntwo\nthree\n');
        put('idx.md', 'Prose.\n');
        put(`${NOTES}/2026-11-01-first.md`, '### 2026-11-01 - first\n\nBody one.\n');
        commit('base');
        run('git', ['clone', '-q', '--bare', dir, join(root, 'origin.git')]);
        run('git', ['remote', 'add', 'origin', join(root, 'origin.git')]);
        run('git', ['fetch', '-q', 'origin']);
        run('git', ['switch', '-q', '-c', 'feat']);
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    /** Moves main on (and publishes it), then comes back to feat. */
    const advanceMain = (/** @type {() => void} */ change) => {
        run('git', ['switch', '-q', 'main']);
        change();
        run('git', ['push', '-q', 'origin', 'main']);
        run('git', ['switch', '-q', 'feat']);
        run('git', ['fetch', '-q', 'origin']);
    };

    it('is up to date when the base has nothing new', () => {
        expect(mergeBase(sh, 'main', { generators: GENS, cwd: dir })).toEqual({ status: 'up-to-date' });
    });

    it('merges without regenerating when nothing conflicts', () => {
        put('code.js', 'one\ntwo\nthree\nfeat\n');
        commit('feat code');
        advanceMain(() => {
            put('src-b.txt', 'b2\n');
            commit('main b');
        });
        // gen.md changed on main only, so git merges it by itself.
        expect(mergeBase(sh, 'main', { generators: GENS, cwd: dir })).toEqual({ status: 'clean' });
    });

    it('settles a conflict in generated files only, and names them in the merge commit', () => {
        put('src-a.txt', 'a-feat\n');
        commit('feat a');
        advanceMain(() => {
            put('src-b.txt', 'b-main\n');
            commit('main b');
        });
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result).toMatchObject({ status: 'resolved', regenerated: ['gen.md'] });
        expect(text('gen.md')).toBe('a-feat\nb-main\n');
        expect(run('git', ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ')).toHaveLength(3);
        expect(run('git', ['status', '--porcelain'])).toBe('');
        const message = run('git', ['log', '-1', '--format=%B']);
        expect(message).toContain("Merge remote-tracking branch 'origin/main' into feat");
        expect(message).toContain('Regenerated: gen.md');
    });

    it('merges two new notes entries without a conflict, and the index lists both', () => {
        put(`${NOTES}/2026-11-22-from-the-branch.md`, '### 2026-11-22 - from the branch\n\nBranch body.\n');
        commit('feat note');
        advanceMain(() => {
            put(`${NOTES}/2026-11-21-from-main.md`, '### 2026-11-21 - from main\n\nMain body.\n');
            commit('main note');
        });
        // Each pull request adds its own file, so git merges them by itself; idx.md's tail conflicts and is regenerated.
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result).toMatchObject({ status: 'resolved', regenerated: ['idx.md'] });
        expect(text(`${NOTES}/2026-11-22-from-the-branch.md`)).toContain('Branch body.');
        expect(text(`${NOTES}/2026-11-21-from-main.md`)).toContain('Main body.');
        expect(text('idx.md')).toBe(
            'Prose.\n\n## Index\n### 2026-11-01 - first\n### 2026-11-21 - from main\n### 2026-11-22 - from the branch\n',
        );
        expect(run('git', ['status', '--porcelain'])).toBe('');
    });

    it('stops on a real code conflict, naming every conflicted path, with the merge left in progress', () => {
        put('code.js', 'one\nfeat\nthree\n');
        put('src-a.txt', 'a-feat\n');
        commit('feat');
        advanceMain(() => {
            put('code.js', 'one\nmain\nthree\n');
            put('src-a.txt', 'a-main\n');
            commit('main');
        });
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result).toEqual({ status: 'conflict', paths: ['code.js', 'gen.md', 'src-a.txt'] });
        expect(existsSync(join(dir, '.git', 'MERGE_HEAD'))).toBe(true);
        expect(text('code.js')).toContain('<<<<<<<');
    });

    it('stops when both sides edited the same notes entry', () => {
        put(`${NOTES}/2026-11-01-first.md`, '### 2026-11-01 - first\n\nBody one, edited on the branch.\n');
        commit('feat edit');
        advanceMain(() => {
            put(`${NOTES}/2026-11-01-first.md`, '### 2026-11-01 - first\n\nBody one, edited on main.\n');
            commit('main edit');
        });
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result).toMatchObject({ status: 'conflict' });
        expect(/** @type {any} */ (result).paths).toContain(`${NOTES}/2026-11-01-first.md`);
    });
});

describe('GENERATORS', () => {
    it('name scripts and committed files that exist', () => {
        for (const g of GENERATORS) {
            expect(existsSync(`scripts/${g.script}`), g.script).toBe(true);
            expect(existsSync(g.path), g.path).toBe(true);
        }
    });

    it('hold every generator whose committed file a gate checks, so a merge regenerates it rather than conflicting', () => {
        const conventions = readFileSync('scripts/check-conventions.sh', 'utf8');
        const checked = [...conventions.matchAll(/node scripts\/([\w-]+\.mjs) --check/g)].map((m) => m[1]);
        const listed = GENERATORS.map((g) => g.script);
        expect(checked.length).toBeGreaterThan(5);
        for (const script of [...checked, 'designs-index.mjs']) {
            expect(listed, script).toContain(script);
        }
    });
});
