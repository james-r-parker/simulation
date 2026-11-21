// Three-way merge of a docs/notes/<YYYY-MM>.md file where both sides only appended `### ` entries. Two pull requests
// that each add an entry at the end of the month file conflict in git's eyes and not in meaning; both entries stay, in
// date order (docs/designs/agent-workflow.md, Phase 7).

const HEADING = /^### (\d{4}-\d{2}-\d{2}) /;

/** @param {string} entry an entry @returns {string} its date, or '' */
const dateOf = (entry) => HEADING.exec(entry)?.[1] ?? '';

/**
 * @param {string} text a month file
 * @returns {{preamble: string, entries: string[]}} the text before the first dated heading, and each entry from its
 *   heading to the next one (a heading inside a code fence does not start one)
 */
export function splitNotes(text) {
    /** @type {string[]} */
    const preamble = [];
    /** @type {string[][]} */
    const entries = [];
    let fenced = false;
    for (const line of text.split('\n')) {
        if (line.startsWith('```')) {
            fenced = !fenced;
        }
        if (!fenced && HEADING.test(line)) {
            entries.push([]);
        }
        (entries.at(-1) ?? preamble).push(line);
    }
    return { preamble: preamble.join('\n'), entries: entries.map((e) => e.join('\n').trimEnd()) };
}

/**
 * @param {string[]} side one side's entries
 * @param {string[]} base the common ancestor's entries
 * @returns {string[] | null} what the side appended, or null when it changed or removed an entry of the base
 */
function appended(side, base) {
    return base.every((entry, i) => side[i] === entry) ? side.slice(base.length) : null;
}

/**
 * @param {string[]} entries entries in file order
 * @returns {string[]} the entries sorted by date, equal dates keeping their order
 */
function byDate(entries) {
    return entries
        .map((entry, i) => ({ entry, i }))
        .sort((a, b) => dateOf(a.entry).localeCompare(dateOf(b.entry)) || a.i - b.i)
        .map((x) => x.entry);
}

/**
 * @param {{base: string, ours: string, theirs: string}} texts the three versions of the file
 * @returns {string | null} the merged file, or null when a side did more than append entries (a person resolves it)
 */
export function mergeNotes({ base, ours, theirs }) {
    const [b, o, t] = [splitNotes(base), splitNotes(ours), splitNotes(theirs)];
    const [mine, yours] = [appended(o.entries, b.entries), appended(t.entries, b.entries)];
    if (!mine || !yours || o.preamble !== b.preamble || t.preamble !== b.preamble) {
        return null;
    }
    const all = [...b.entries, ...mine, ...yours];
    // Dates are the key only when the file already keeps them in order; an unsorted file keeps ours, then theirs.
    const sorted = byDate(b.entries).every((e, i) => e === b.entries[i]);
    const merged = sorted ? byDate(all) : all;
    const head = b.preamble.trimEnd();
    return `${head ? `${head}\n\n` : ''}${merged.join('\n\n')}\n`;
}
