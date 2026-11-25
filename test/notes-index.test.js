import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, parseEntry, readEntries, renderIndex, topicSlug, withIndex } from '../scripts/notes-index.mjs';

describe('topicSlug', () => {
    it('lower-cases, drops punctuation and joins words with hyphens', () => {
        expect(topicSlug('First: a topic (with punctuation)')).toBe('first-a-topic-with-punctuation');
        expect(topicSlug('!!!')).toBe('entry');
    });

    it('cuts a long topic at a word boundary under 60 characters', () => {
        const slug = topicSlug('a very long topic that goes on and on past sixty characters of slug for sure yes');
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug).toBe('a-very-long-topic-that-goes-on-and-on-past-sixty-characters');
    });
});

describe('parseEntry', () => {
    it('reads the first dated heading and skips one inside a code fence', () => {
        expect(
            parseEntry('```\n### 2026-11-09 - inside a fence\n```\n\n### 2026-11-02 - First: a topic\n\nBody.\n'),
        ).toEqual({
            date: '2026-11-02',
            topic: 'First: a topic',
        });
        expect(parseEntry('# No heading\n')).toBeNull();
    });
});

/** @type {import('../scripts/notes-index.mjs').Entry[]} */
const ENTRIES = [
    { month: '2026-10', file: '2026-10-30-older.md', date: '2026-10-30', topic: 'Older' },
    { month: '2026-11', file: '2026-11-03-b.md', date: '2026-11-03', topic: 'B' },
    { month: '2026-11', file: '2026-11-02-a.md', date: '2026-11-02', topic: 'A: with punctuation' },
];

describe('renderIndex', () => {
    it('puts the newest month first, a month in date order, and links each entry to its own file', () => {
        const lines = renderIndex(ENTRIES)
            .split('\n')
            .filter((line) => line.startsWith('- '));
        expect(lines).toEqual([
            '- 2026-11-02 - A: with punctuation - [2026-11](../notes/2026-11/2026-11-02-a.md)',
            '- 2026-11-03 - B - [2026-11](../notes/2026-11/2026-11-03-b.md)',
            '- 2026-10-30 - Older - [2026-10](../notes/2026-10/2026-10-30-older.md)',
        ]);
    });
});

describe('withIndex', () => {
    it('keeps the text before the index heading and replaces the rest', () => {
        const text = '# Notes\n\n## Platform\n\nfact\n\n## Learned while building\n\nold\n';
        expect(withIndex(text, '## Learned while building\n\nnew\n')).toBe(
            '# Notes\n\n## Platform\n\nfact\n\n## Learned while building\n\nnew\n',
        );
    });

    it('appends the index when the heading is missing', () => {
        expect(withIndex('# Notes\n', '## Learned while building\n')).toBe('# Notes\n\n## Learned while building\n');
    });
});

describe('entry files', () => {
    /** @type {string[]} */
    const dirs = [];
    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    /** @returns {{ notesDir: string, docPath: string }} a temporary notes directory and sim-notes.md */
    function fixture() {
        const dir = mkdtempSync(join(tmpdir(), 'notes-index-'));
        dirs.push(dir);
        const notesDir = join(dir, 'notes');
        mkdirSync(join(notesDir, '2026-11'), { recursive: true });
        writeFileSync(join(notesDir, '2026-11', '2026-11-02-first.md'), '### 2026-11-02 - First\n\nBody.\n');
        writeFileSync(join(notesDir, '2026-11', '2026-11-03-repeated.md'), '### 2026-11-03 - Repeated\n');
        writeFileSync(join(notesDir, 'README.md'), '### 2026-01-01 - not an entry\n');
        const docPath = join(dir, 'sim-notes.md');
        writeFileSync(docPath, '# Notes\n\n## Platform\n\nfact\n');
        return { notesDir, docPath };
    }

    it('reads each entry file of a month directory and ignores files outside one', () => {
        const { notesDir } = fixture();
        expect(readEntries(notesDir).map((e) => `${e.month}/${e.file}`)).toEqual([
            '2026-11/2026-11-02-first.md',
            '2026-11/2026-11-03-repeated.md',
        ]);
        expect(readEntries(join(notesDir, 'nope'))).toEqual([]);
    });

    it('fails --check on a stale index and passes after --write', () => {
        const paths = fixture();
        expect(main(['--check'], paths)).toBe(1);
        expect(main(['--write'], paths)).toBe(0);
        expect(main(['--check'], paths)).toBe(0);
        const text = readFileSync(paths.docPath, 'utf8');
        expect(text).toContain('## Platform');
        expect(text).toContain('- 2026-11-03 - Repeated - [2026-11](../notes/2026-11/2026-11-03-repeated.md)');
        expect(text).not.toContain('not an entry');
    });

    it('goes stale when an entry file is added', () => {
        const paths = fixture();
        main(['--write'], paths);
        writeFileSync(join(paths.notesDir, '2026-11', '2026-11-04-new.md'), '### 2026-11-04 - New\n');
        expect(main(['--check'], paths)).toBe(1);
    });

    it('names a file whose name does not start with its heading date, or that is in the wrong month', () => {
        const paths = fixture();
        writeFileSync(join(paths.notesDir, '2026-11', '2026-11-05-wrong.md'), '### 2026-11-06 - Other date\n');
        expect(() => readEntries(paths.notesDir)).toThrow('docs/notes/2026-11/2026-11-05-wrong.md');
        expect(main(['--check'], paths)).toBe(1);
        writeFileSync(join(paths.notesDir, '2026-11', '2026-11-05-wrong.md'), '### 2026-12-05 - Other month\n');
        expect(() => readEntries(paths.notesDir)).toThrow('2026-11-05-wrong.md');
    });

    it('rejects an unknown argument', () => {
        expect(main(['--nope'], fixture())).toBe(2);
        expect(main(['--write', '--check'], fixture())).toBe(2);
    });
});
