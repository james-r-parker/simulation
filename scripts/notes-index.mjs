#!/usr/bin/env node
// Regenerates the index in docs/designs/sim-notes.md from the dated entries in docs/notes/<YYYY-MM>.md: one line per
// `### YYYY-MM-DD - <topic>` heading, with a link to it (docs/designs/agent-workflow.md, Context diet, Notes).
// A new entry goes into the month file; run --write in the same commit.
//
// Usage:
//   node scripts/notes-index.mjs            # print the index section to stdout
//   node scripts/notes-index.mjs --write    # rewrite the index section of docs/designs/sim-notes.md
//   node scripts/notes-index.mjs --check    # exit 1 if the committed index differs from the month files
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_HEADING = '## Learned while building';
const ENTRY = /^### (\d{4}-\d{2}-\d{2}) - (.+)$/;

/**
 * @param {string} heading a heading's text
 * @returns {string} its GitHub anchor: lower case, punctuation dropped, spaces to hyphens
 */
export function slug(heading) {
    return heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-');
}

/**
 * @param {string} markdown a month file
 * @returns {{ date: string, topic: string, anchor: string }[]} its dated entries in file order, with the anchor
 *   GitHub gives each heading (a repeated heading gets `-1`, `-2`)
 */
export function parseEntries(markdown) {
    const seen = new Map();
    const entries = [];
    let fenced = false;
    for (const line of markdown.split('\n')) {
        if (line.startsWith('```')) {
            fenced = !fenced;
        }
        const match = fenced ? null : ENTRY.exec(line);
        if (match) {
            const base = slug(line.slice(4));
            const count = seen.get(base) ?? 0;
            seen.set(base, count + 1);
            entries.push({ date: match[1], topic: match[2], anchor: count === 0 ? base : `${base}-${count}` });
        }
    }
    return entries;
}

/**
 * @param {{ month: string, markdown: string }[]} files the month files
 * @returns {string} the index section: its heading, a sentence, and one bullet per entry, newest month first
 */
export function renderIndex(files) {
    const lines = [
        INDEX_HEADING,
        '',
        'One line per entry, in date order within a month and newest month first. The entries are in [docs/notes/](../notes/);',
        'add one to the month file and run `node scripts/notes-index.mjs --write` in the same commit.',
        '',
    ];
    for (const { month, markdown } of [...files].sort((a, b) => (a.month < b.month ? 1 : -1))) {
        for (const { date, topic, anchor } of parseEntries(markdown)) {
            lines.push(`- ${date} - ${topic} - [${month}](../notes/${month}.md#${anchor})`);
        }
    }
    return `${lines.join('\n')}\n`;
}

/**
 * @param {string} notesDir the directory of month files
 * @returns {{ month: string, markdown: string }[]} each `<YYYY-MM>.md` file
 */
function readMonths(notesDir) {
    if (!existsSync(notesDir)) {
        return [];
    }
    return readdirSync(notesDir)
        .filter((name) => /^\d{4}-\d{2}\.md$/.test(name))
        .map((name) => ({ month: name.slice(0, 7), markdown: readFileSync(join(notesDir, name), 'utf8') }));
}

/**
 * @param {string} current the text of sim-notes.md
 * @param {string} index the generated index section
 * @returns {string} the text with its index section replaced (everything before the heading is kept)
 */
export function withIndex(current, index) {
    const at = current.indexOf(`${INDEX_HEADING}\n`);
    return (at === -1 ? `${current.trimEnd()}\n\n` : current.slice(0, at)) + index;
}

/**
 * @param {string} path a file
 * @returns {string} its text, or '' when it does not exist
 */
function readText(path) {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/**
 * @param {boolean} stale whether the committed index differs from the month files
 * @returns {number} the exit code, after saying which it is
 */
function reportStale(stale) {
    if (stale) {
        process.stderr.write('docs/designs/sim-notes.md index is stale. Run: node scripts/notes-index.mjs --write\n');
        return 1;
    }
    process.stdout.write('docs/designs/sim-notes.md index is up to date.\n');
    return 0;
}

/**
 * @param {string[]} args `--write`, `--check` or nothing
 * @param {{ notesDir?: string, docPath?: string }} [paths] where the month files and sim-notes.md are
 * @returns {number} the exit code
 */
export function main(
    args,
    { notesDir = join(ROOT, 'docs/notes'), docPath = join(ROOT, 'docs/designs/sim-notes.md') } = {},
) {
    const mode = args.length === 0 ? '--print' : args[0];
    if (args.length > 1 || !['--print', '--write', '--check'].includes(mode)) {
        process.stderr.write(`usage: node scripts/notes-index.mjs [--write | --check] (got: ${args.join(' ')})\n`);
        return 2;
    }
    const index = renderIndex(readMonths(notesDir));
    const current = readText(docPath);
    const next = withIndex(current, index);
    if (mode === '--write') {
        writeFileSync(docPath, next);
        process.stdout.write('Wrote the index in docs/designs/sim-notes.md\n');
        return 0;
    }
    if (mode === '--check') {
        return reportStale(current !== next);
    }
    process.stdout.write(index);
    return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
