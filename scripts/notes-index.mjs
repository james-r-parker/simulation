#!/usr/bin/env node
// Regenerates the index in docs/designs/sim-notes.md from the entry files docs/notes/<YYYY-MM>/<YYYY-MM-DD>-<slug>.md: one
// line per file, from its `### YYYY-MM-DD - <topic>` heading, with a link to it (docs/designs/agent-workflow.md, Phase 7).
// A new entry is a new file, which no other pull request edits; run --write in the same commit.
//
// Usage:
//   node scripts/notes-index.mjs            # print the index section to stdout
//   node scripts/notes-index.mjs --write    # rewrite the index section of docs/designs/sim-notes.md
//   node scripts/notes-index.mjs --check    # exit 1 if the committed index differs from the entry files
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX_HEADING = '## Learned while building';
const ENTRY = /^### (\d{4}-\d{2}-\d{2}) - (.+)$/;

/**
 * @param {string} topic an entry's topic
 * @returns {string} the slug of its file name: lower case ASCII words joined by hyphens, cut at a word boundary under 60
 *   characters
 */
export function topicSlug(topic) {
    const words = topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const cut = words.length > 60 ? words.slice(0, words.slice(0, 60).lastIndexOf('-')) : words;
    return cut || 'entry';
}

/**
 * @param {string} markdown an entry file
 * @returns {{ date: string, topic: string } | null} its first `### YYYY-MM-DD - <topic>` heading outside a code fence, or null
 */
export function parseEntry(markdown) {
    let fenced = false;
    for (const line of markdown.split('\n')) {
        if (line.startsWith('```')) {
            fenced = !fenced;
        }
        const match = fenced ? null : ENTRY.exec(line);
        if (match) {
            return { date: match[1], topic: match[2] };
        }
    }
    return null;
}

/**
 * @typedef {object} Entry
 * @property {string} month the `YYYY-MM` directory
 * @property {string} file the file name, `<YYYY-MM-DD>-<slug>.md`
 * @property {string} date the heading's date
 * @property {string} topic the heading's topic
 */

/**
 * @param {Entry[]} entries every entry
 * @returns {string} the index section: its heading, a sentence, and one bullet per entry, newest month first
 */
export function renderIndex(entries) {
    const lines = [
        INDEX_HEADING,
        '',
        'One line per entry, in date order within a month and newest month first. The entries are in [docs/notes/](../notes/),',
        'one file per entry in `docs/notes/<YYYY-MM>/<YYYY-MM-DD>-<slug>.md`; add one and run `node scripts/notes-index.mjs --write`',
        'in the same commit.',
        '',
    ];
    const order = (/** @type {Entry} */ a, /** @type {Entry} */ b) =>
        a.month === b.month ? 0 : a.month < b.month ? 1 : -1;
    const sorted = [...entries].sort((a, b) => order(a, b) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    for (const { month, file, date, topic } of sorted) {
        lines.push(`- ${date} - ${topic} - [${month}](../notes/${month}/${file})`);
    }
    return `${lines.join('\n')}\n`;
}

/**
 * @param {string} notesDir `docs/notes`, holding a `<YYYY-MM>` directory per month
 * @returns {Entry[]} every entry file
 * @throws {Error} naming a file whose name or heading does not follow the rule: `<YYYY-MM>/<date>-<slug>.md` holding a
 *   `### <date> - <topic>` heading with that date in that month
 */
export function readEntries(notesDir) {
    if (!existsSync(notesDir)) {
        return [];
    }
    /** @type {Entry[]} */
    const entries = [];
    for (const month of readdirSync(notesDir).filter((name) => /^\d{4}-\d{2}$/.test(name))) {
        for (const file of readdirSync(join(notesDir, month)).filter((name) => name.endsWith('.md'))) {
            const heading = parseEntry(readFileSync(join(notesDir, month, file), 'utf8'));
            if (!heading || !file.startsWith(`${heading.date}-`) || !heading.date.startsWith(month)) {
                throw new Error(
                    `docs/notes/${month}/${file}: the file name must start with the date of its "### YYYY-MM-DD - <topic>" heading, in that month's directory`,
                );
            }
            entries.push({ month, file, ...heading });
        }
    }
    return entries;
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
 * @param {boolean} stale whether the committed index differs from the entry files
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
 * @param {string} notesDir `docs/notes`
 * @returns {string | null} the index section, or null after printing which entry file breaks the naming rule
 */
function indexOf(notesDir) {
    try {
        return renderIndex(readEntries(notesDir));
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return null;
    }
}

/**
 * @param {string[]} args `--write`, `--check` or nothing
 * @param {{ notesDir?: string, docPath?: string }} [paths] where the entry directories and sim-notes.md are
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
    const index = indexOf(notesDir);
    if (index === null) {
        return 1;
    }
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
