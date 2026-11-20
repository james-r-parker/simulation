import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, parseEntries, renderIndex, slug, withIndex } from '../scripts/notes-index.mjs';

const NOV = `# Notes 2026-11

### 2026-11-02 - First: a topic (with punctuation)

Body.

\`\`\`
### 2026-11-09 - inside a fence
\`\`\`

### 2026-11-03 - Repeated

### 2026-11-03 - Repeated
`;
const OCT = '# Notes 2026-10\n\n### 2026-10-30 - Older\n';

describe('slug', () => {
    it('lower-cases, drops punctuation and turns spaces into hyphens', () => {
        expect(slug('2026-11-02 - First: a topic (with punctuation)')).toBe(
            '2026-11-02---first-a-topic-with-punctuation',
        );
    });
});

describe('parseEntries', () => {
    it('lists dated headings in file order, skips fenced ones and numbers repeats like GitHub', () => {
        const entries = parseEntries(NOV);
        expect(entries.map((entry) => entry.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-03']);
        expect(entries.map((entry) => entry.anchor)).toEqual([
            '2026-11-02---first-a-topic-with-punctuation',
            '2026-11-03---repeated',
            '2026-11-03---repeated-1',
        ]);
    });
});

describe('renderIndex', () => {
    it('puts the newest month first and links each entry to its month file', () => {
        const lines = renderIndex([
            { month: '2026-10', markdown: OCT },
            { month: '2026-11', markdown: NOV },
        ])
            .split('\n')
            .filter((line) => line.startsWith('- '));
        expect(lines).toHaveLength(4);
        expect(lines[0]).toBe(
            '- 2026-11-02 - First: a topic (with punctuation) - [2026-11](../notes/2026-11.md#2026-11-02---first-a-topic-with-punctuation)',
        );
        expect(lines[3]).toBe('- 2026-10-30 - Older - [2026-10](../notes/2026-10.md#2026-10-30---older)');
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

describe('main', () => {
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
        mkdirSync(notesDir);
        writeFileSync(join(notesDir, '2026-11.md'), NOV);
        writeFileSync(join(notesDir, 'README.md'), '### 2026-01-01 - not a month file\n');
        const docPath = join(dir, 'sim-notes.md');
        writeFileSync(docPath, '# Notes\n\n## Platform\n\nfact\n');
        return { notesDir, docPath };
    }

    it('fails --check on a stale index and passes after --write, ignoring files that are not month files', () => {
        const paths = fixture();
        expect(main(['--check'], paths)).toBe(1);
        expect(main(['--write'], paths)).toBe(0);
        expect(main(['--check'], paths)).toBe(0);
        const text = readFileSync(paths.docPath, 'utf8');
        expect(text).toContain('## Platform');
        expect(text).toContain('- 2026-11-03 - Repeated');
        expect(text).not.toContain('not a month file');
    });

    it('goes stale when an entry is added to a month file', () => {
        const paths = fixture();
        main(['--write'], paths);
        writeFileSync(join(paths.notesDir, '2026-11.md'), `${NOV}\n### 2026-11-04 - New\n`);
        expect(main(['--check'], paths)).toBe(1);
    });

    it('rejects an unknown argument', () => {
        expect(main(['--nope'], fixture())).toBe(2);
        expect(main(['--write', '--check'], fixture())).toBe(2);
    });
});
