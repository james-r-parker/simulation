// Markdown helpers shared by the design-doc parser and lint: line endings, fenced code, tables and errors.

/** A design doc that breaks a rule in docs/designs/STYLE.md. */
export class DesignDocError extends Error {}

export const MARKDOWN_LINK = /\[(?<text>[^\]]+)\]\((?<href>[^)]+)\)/g;

/**
 * Normalises CRLF to LF.
 * @param {string} text
 */
export const toLf = (text) => text.replace(/\r\n/g, '\n');

/**
 * Splits a doc body into LF lines, dropping a byte-order mark.
 * @param {string} body
 */
export const toLines = (body) => toLf(body.replace(/^\uFEFF/, '')).split('\n');

/**
 * Throws a DesignDocError that names the file and the 1-based line.
 * @param {string} fileName
 * @param {number} index 0-based line index
 * @param {string} reason
 * @returns {never}
 */
export function fail(fileName, index, reason) {
    throw new DesignDocError(`${fileName}:${index + 1}: ${reason}`);
}

/**
 * Yields each line outside fenced code blocks with its index.
 * @param {string[]} lines
 * @returns {Generator<[number, string]>}
 */
export function* unfenced(lines) {
    let fenced = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trimStart().startsWith('```')) {
            fenced = !fenced;
            continue;
        }
        if (!fenced) {
            yield [i, lines[i]];
        }
    }
}

/**
 * Splits a Markdown table row into trimmed cells.
 * @param {string} line
 */
export const tableCells = (line) =>
    line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

/**
 * Rows of the tables under a `## <heading>` section, outside fenced code, with separator rows dropped. Header rows
 * stay in: callers tell them apart.
 * @param {string[]} lines
 * @param {string} heading
 * @returns {{sawSection: boolean, rows: {line: number, cells: string[]}[]}}
 */
export function sectionTable(lines, heading) {
    /** @type {{line: number, cells: string[]}[]} */
    const rows = [];
    let inSection = false;
    let sawSection = false;
    for (const [i, line] of unfenced(lines)) {
        if (line.startsWith('## ')) {
            inSection = line.trim() === `## ${heading}`;
            sawSection ||= inSection;
        } else if (inSection && line.startsWith('|')) {
            const cells = tableCells(line);
            if (!cells.every((c) => /^:?-+:?$/.test(c))) {
                rows.push({ line: i, cells });
            }
        }
    }
    return { sawSection, rows };
}
