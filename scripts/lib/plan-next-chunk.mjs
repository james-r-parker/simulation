// Reads a design doc and names its next unbuilt chunk: the first row of a phase's Chunks table whose task rows are not
// all marked (built). Used by scripts/task-start.sh --plan.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} line a Markdown table row
 * @returns {string[]} its trimmed cells
 */
function cells(line) {
    return line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
}

/**
 * @param {string} text the doc
 * @returns {{id: string, row: string}[]} the task rows of the Task breakdown, in order
 */
function taskRows(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        const m = /^\| (T\d+[a-z]?) +\|/.exec(line);
        if (m) {
            rows.push({ id: m[1], row: line });
        }
    }
    return rows;
}

/**
 * @param {string} spec a Tasks cell such as `T28, T29, T31 to T33`
 * @param {string[]} order every task id in row order
 * @returns {string[]} the ids the cell names, ranges expanded by row order
 */
function expandTasks(spec, order) {
    const ids = [];
    for (const part of spec.split(',').map((p) => p.trim())) {
        const range = /^(T\d+[a-z]?) to (T\d+[a-z]?)$/.exec(part);
        if (range) {
            ids.push(...order.slice(order.indexOf(range[1]), order.indexOf(range[2]) + 1));
        } else if (/^T\d+[a-z]?$/.test(part)) {
            ids.push(part);
        }
    }
    return ids;
}

/**
 * @param {string} text the doc
 * @returns {{phase: string, cells: string[]}[]} the Chunks-table rows of every phase not marked (built), in order
 */
function chunkRows(text) {
    const out = [];
    let phase = '';
    let inChunks = false;
    for (const line of text.split('\n')) {
        const heading = /^### (Phase .*)$/.exec(line);
        if (heading) {
            phase = heading[1];
            inChunks = false;
        } else if (/^\| Chunk +\|/.test(line)) {
            inChunks = !/\(built\)\s*$/.test(phase);
        } else if (inChunks && /^\| [A-Za-z0-9]+ +\|/.test(line)) {
            out.push({ phase, cells: cells(line) });
        } else if (!line.startsWith('|') && line.trim() !== '') {
            inChunks = false;
        }
    }
    return out;
}

/**
 * @param {string} text the doc
 * @returns {{status: string, phase: string, chunk: string, builder: string, tasks: string[]} | null} the next unbuilt
 *   chunk and its task rows, or null when every chunk is built or the doc has no Chunks table
 */
export function nextChunk(text) {
    const status = (/^\*\*Status:\*\*\s*(.*)$/m.exec(text)?.[1] ?? '').trim();
    const rows = taskRows(text);
    const order = rows.map((r) => r.id);
    for (const {
        phase,
        cells: [chunk, spec, builder],
    } of chunkRows(text)) {
        const ids = expandTasks(spec, order);
        const mine = rows.filter((r) => ids.includes(r.id));
        if (mine.some((r) => !r.row.includes('(built)'))) {
            return { status, phase, chunk, builder: builder ?? '', tasks: mine.map((r) => r.row) };
        }
    }
    return null;
}

/**
 * @param {string} path the design doc
 * @returns {string} the report task-start.sh prints
 */
export function describeNext(path) {
    const found = nextChunk(readFileSync(path, 'utf8'));
    if (!found) {
        return `${path}: no unbuilt chunk found`;
    }
    return [
        `Plan: ${path}`,
        `Status: ${found.status}`,
        `Next chunk: ${found.chunk} (${found.phase}, builder ${found.builder})`,
        'Tasks:',
        ...found.tasks,
    ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const path = process.argv[2];
    if (!path) {
        console.error('usage: node scripts/lib/plan-next-chunk.mjs <design-doc>');
        process.exitCode = 2;
    } else {
        console.log(describeNext(path));
    }
}
