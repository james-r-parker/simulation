// The head of a design doc: title, `**Status:**`, `**Validated:**`, `**Priority:**` and `**Depends on:**` lines.

import { DesignDocError, MARKDOWN_LINK } from './markdown.mjs';

/** Matched longest-first: "In progress" is two words, so a first-word match would misread it. */
export const KEYWORDS = [
    { name: 'In progress', blurb: 'Partly built - the note says which phases are real.' },
    { name: 'Implemented', blurb: 'Describe shipped code. Trust these, and fix them when the code moves.' },
    { name: 'Superseded', blurb: 'Kept for history only.' },
    { name: 'Reference', blurb: 'Not designs of the simulation - audits, research, learnings and guides.' },
    { name: 'Proposed', blurb: 'Plans. Nothing built; do not read these as descriptions of the code.' },
];

/** Keywords whose docs are plans: they carry a stamp, a priority and the full lint. */
export const UNBUILT = new Set(['Proposed', 'In progress']);

/** Long detail text pushes an index entry onto several wrapped lines and buries the next one. */
const MAX_DETAIL = 160;

const STARTS_SOMETHING_ELSE = /^(\*\*[A-Z]|#|>|[-*+]\s|\d+\.\s|\||```)/;
const KEYWORD_END = /^[\s\-–—:.]/;
const LEADING_SEPARATOR = /^\s*[-–—:]\s*/;
const TRAILING_FULL_STOP = /\s*\.\s*$/;
const VALIDATED = /^\*\*Validated:\*\*\s*(?<sha>[0-9a-f]{7,40})\s*\((?<date>\d{4}-\d{2}-\d{2})\)/;
const PRIORITY = /^\*\*Priority:\*\*\s*(?<rank>[1-9][0-9]*)\s*[-–—]\s*(?<reason>\S.*)$/;

/**
 * The first `# ` heading.
 * @param {string[]} lines
 * @param {string} fileName
 */
export function readTitle(lines, fileName) {
    const line = lines.find((l) => l.startsWith('# '));
    if (!line) {
        throw new DesignDocError(`${fileName}: no "# " title. Every design doc opens with one.`);
    }
    return line.slice(2).trim();
}

/**
 * The status keyword and detail. The status line may wrap; a continuation stops at anything that plainly starts
 * something else, such as the `**Validated:**` stamp directly under it.
 * @param {string[]} lines
 * @param {string} fileName
 * @returns {{keyword: string, detail: string}}
 */
export function readStatus(lines, fileName) {
    const start = lines.findIndex((l) => l.startsWith('**Status:**'));
    if (start === -1) {
        throw new DesignDocError(`${fileName}: no "**Status:**" line. See docs/designs/STYLE.md.`);
    }
    const collected = [lines[start].slice('**Status:**'.length)];
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim().length === 0 || STARTS_SOMETHING_ELSE.test(lines[i])) {
            break;
        }
        collected.push(lines[i]);
    }
    return parseStatus(collected.join(' ').replace(/\s+/g, ' ').trim(), fileName);
}

/**
 * @param {string} statusText
 * @param {string} fileName
 */
function parseStatus(statusText, fileName) {
    const lower = statusText.toLowerCase();
    const entry = [...KEYWORDS]
        .sort((a, b) => b.name.length - a.name.length)
        .find((k) => lower.startsWith(k.name.toLowerCase()) && keywordEnds(statusText, k.name.length));
    if (!entry) {
        const valid = KEYWORDS.map((k) => k.name).join(', ');
        throw new DesignDocError(
            `${fileName}: unrecognised status "${statusText.slice(0, 40)}". Valid keywords: ${valid}.`,
        );
    }
    let detail = statusText.slice(entry.name.length).replace(LEADING_SEPARATOR, '');
    detail = detail.replace(TRAILING_FULL_STOP, '').trim();
    if (detail.length > MAX_DETAIL) {
        detail = `${detail.slice(0, MAX_DETAIL).trimEnd()}...`;
    }
    return { keyword: entry.name, detail };
}

/**
 * A keyword ends at the end of the text, whitespace or a separator: "Proposedfoo" is not "Proposed".
 * @param {string} text
 * @param {number} at
 */
const keywordEnds = (text, at) => text.length === at || KEYWORD_END.test(text.slice(at));

/**
 * The `**Validated:** <sha> (<date>)` stamp, sha shortened to 7 characters.
 * @param {string[]} lines
 * @returns {{sha: string, date: string} | null}
 */
export function readValidated(lines) {
    for (const line of lines) {
        const groups = VALIDATED.exec(line)?.groups;
        if (groups) {
            return { sha: groups.sha.slice(0, 7), date: groups.date };
        }
    }
    return null;
}

/**
 * The `**Priority:** <rank> - <reason>` line.
 * @param {string[]} lines
 * @param {string} fileName
 * @returns {{rank: number, reason: string} | null}
 */
export function readPriority(lines, fileName) {
    const line = lines.find((l) => l.startsWith('**Priority:**'));
    if (!line) {
        return null;
    }
    const groups = PRIORITY.exec(line)?.groups;
    if (!groups) {
        throw new DesignDocError(
            `${fileName}: "${line}" is not "**Priority:** <rank> - <reason>" with a rank of 1 or more.`,
        );
    }
    return { rank: Number.parseInt(groups.rank, 10), reason: groups.reason.replace(TRAILING_FULL_STOP, '').trim() };
}

/**
 * The links on the `**Depends on:**` line, as Markdown.
 * @param {string[]} lines
 */
export function readDependsOn(lines) {
    const line = lines.find((l) => l.startsWith('**Depends on:**'));
    return line ? [...line.matchAll(MARKDOWN_LINK)].map((m) => `[${m.groups?.text}](${m.groups?.href})`) : [];
}
