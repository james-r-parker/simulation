// The Queue block of `npm run state`: the first Build queue rows and each doc's next unbuilt task.
import { nextChunk } from './plan-next-chunk.mjs';

/**
 * @typedef {object} QueueRow
 * @property {string} rank the row's place in the queue, `2` for a lead and `2.1` for a step under it
 * @property {string} title the doc's title as the index links it
 * @property {string} file the doc's file name
 */

/**
 * @param {string} readme `docs/designs/README.md`
 * @param {number} [limit] how many rows to keep
 * @returns {QueueRow[]} the first `limit` rows of the Build queue, leads and the steps under them in listing order
 */
export function queueRows(readme, limit = 5) {
    const rows = [];
    let lead = 0;
    let inQueue = false;
    for (const line of readme.split('\n')) {
        if (/^## /.test(line)) {
            inQueue = /^## Build queue\b/.test(line);
            continue;
        }
        const m = inQueue ? /^( *)(\d+)\. \[([^\]]+)\]\(([^)]+\.md)\)/.exec(line) : null;
        if (!m) {
            continue;
        }
        if (m[1] === '') {
            lead = Number(m[2]);
            rows.push({ rank: String(lead), title: m[3], file: m[4] });
        } else {
            rows.push({ rank: `${lead}.${m[2]}`, title: m[3], file: m[4] });
        }
    }
    return rows.slice(0, limit);
}

/**
 * @param {string} docText a design doc
 * @returns {{id: string, task: string, chunk: string} | null} its first task not marked (built) in the next unbuilt chunk,
 *   null when every chunk is built or the doc has no Chunks table
 */
export function nextTask(docText) {
    const found = nextChunk(docText);
    for (const row of found?.tasks ?? []) {
        if (!row.includes('(built)')) {
            const cells = row.split('|').map((c) => c.trim());
            return { id: cells[1], task: cells[2], chunk: found?.chunk ?? '' };
        }
    }
    return null;
}

/**
 * @param {string} readme `docs/designs/README.md`
 * @param {(file: string) => string | null} readDoc reads a doc by file name, null when missing
 * @param {number} [limit] how many rows to keep
 * @returns {(QueueRow & {next: {id: string, task: string, chunk: string} | null})[]} the rows, each with its doc's next task
 */
export function queueBlock(readme, readDoc, limit = 5) {
    return queueRows(readme, limit).map((row) => {
        const text = readDoc(row.file);
        return { ...row, next: text === null ? null : nextTask(text) };
    });
}
