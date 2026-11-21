// reads: scripts/lib/merge-base.mjs, scripts/lib/regen.mjs, scripts/lib/notes-merge.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeBase } from '../scripts/lib/merge-base.mjs';
import { mergeNotes, splitNotes } from '../scripts/lib/notes-merge.mjs';
import { GENERATORS } from '../scripts/lib/regen.mjs';

// A fake generator pair in the temporary repo: gen.md is the two source files joined (a whole generated file), and
// idx.md is its own prose with the headings of the month file listed under `## Index` (a generated tail).
const GEN_SCRIPT = `
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f) => readFileSync(f, 'utf8');
if (process.argv[2] === 'whole') {
    writeFileSync('gen.md', read('src-a.txt') + read('src-b.txt'));
} else {
    const idx = read('idx.md');
    const prose = idx.includes('## Index\\n') ? idx.slice(0, idx.indexOf('## Index\\n')) : idx.trimEnd() + '\\n\\n';
    const heads = read('docs/notes/2026-11.md').split('\\n').filter((l) => l.startsWith('### '));
    writeFileSync('idx.md', prose + '## Index\\n' + heads.join('\\n') + '\\n');
}
`;
const GENS = [
    { script: 'gen.mjs', args: ['tail'], path: 'idx.md', whole: false, tail: '## Index' },
    { script: 'gen.mjs', args: ['whole'], path: 'gen.md', whole: true },
];
const NOTES = 'docs/notes/2026-11.md';
const PREAMBLE = '# Notes\n\nIntro.\n\n';

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
        put(NOTES, `${PREAMBLE}### 2026-11-01 - first\n\nBody one.\n`);
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
        expect(result).toMatchObject({ status: 'resolved', regenerated: ['gen.md'], notes: [] });
        expect(text('gen.md')).toBe('a-feat\nb-main\n');
        expect(run('git', ['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ')).toHaveLength(3);
        expect(run('git', ['status', '--porcelain'])).toBe('');
        const message = run('git', ['log', '-1', '--format=%B']);
        expect(message).toContain("Merge remote-tracking branch 'origin/main' into feat");
        expect(message).toContain('Regenerated: gen.md');
    });

    it('keeps both appended notes entries in date order and regenerates the index', () => {
        put(NOTES, `${text(NOTES)}\n### 2026-11-22 - from the branch\n\nBranch body.\n`);
        commit('feat note');
        advanceMain(() => {
            put(NOTES, `${text(NOTES)}\n### 2026-11-21 - from main\n\nMain body.\n`);
            commit('main note');
        });
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result).toMatchObject({ status: 'resolved', notes: [NOTES] });
        const heads = text(NOTES)
            .split('\n')
            .filter((l) => l.startsWith('### '));
        expect(heads).toEqual([
            '### 2026-11-01 - first',
            '### 2026-11-21 - from main',
            '### 2026-11-22 - from the branch',
        ]);
        expect(text(NOTES)).toContain('Branch body.');
        expect(text(NOTES)).toContain('Main body.');
        expect(text('idx.md')).toBe(`Prose.\n\n## Index\n${heads.join('\n')}\n`);
        const message = run('git', ['log', '-1', '--format=%B']);
        expect(message).toContain('Regenerated: idx.md');
        expect(message).toContain(`Notes entries kept from both sides: ${NOTES}`);
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

    it('stops when a side edited an existing notes entry', () => {
        put(NOTES, text(NOTES).replace('Body one.', 'Body one, edited on the branch.'));
        commit('feat edit');
        advanceMain(() => {
            put(NOTES, `${text(NOTES)}\n### 2026-11-21 - from main\n\nMain body.\n`);
            commit('main note');
        });
        const result = mergeBase(sh, 'main', { generators: GENS, cwd: dir });
        expect(result.status).toBe('conflict');
    });
});

describe('mergeNotes', () => {
    const entry = (/** @type {string} */ date, /** @type {string} */ body = 'x') => `### ${date} - t\n\n${body}\n`;
    const file = (/** @type {string[]} */ ...entries) => `${PREAMBLE}${entries.join('\n')}`;

    it('keeps the base, then both sides appended entries, sorted by date', () => {
        const base = file(entry('2026-11-02'));
        const merged = mergeNotes({
            base,
            ours: `${base}\n${entry('2026-11-05', 'ours')}`,
            theirs: `${base}\n${entry('2026-11-03', 'theirs')}`,
        });
        expect(splitNotes(merged ?? '').entries.map((e) => e.slice(4, 14))).toEqual([
            '2026-11-02',
            '2026-11-03',
            '2026-11-05',
        ]);
    });

    it('does not reorder an unsorted file, and refuses an edited preamble or a removed entry', () => {
        const base = file(entry('2026-11-09'), entry('2026-11-02'));
        const added = mergeNotes({ base, ours: `${base}\n${entry('2026-11-05')}`, theirs: base });
        expect(splitNotes(added ?? '').entries.map((e) => e.slice(4, 14))).toEqual([
            '2026-11-09',
            '2026-11-02',
            '2026-11-05',
        ]);
        expect(mergeNotes({ base, ours: base.replace('Intro.', 'Changed.'), theirs: base })).toBeNull();
        expect(mergeNotes({ base, ours: `${PREAMBLE}${entry('2026-11-09')}`, theirs: base })).toBeNull();
    });
});

describe('GENERATORS', () => {
    it('name scripts and committed files that exist', () => {
        for (const g of GENERATORS) {
            expect(existsSync(`scripts/${g.script}`), g.script).toBe(true);
            expect(existsSync(g.path), g.path).toBe(true);
        }
    });
});
