// Table rules for design docs: the machine-read Task breakdown and the Delivery requirements (docs/designs/STYLE.md).

import { DesignDocError, fail, sectionTable } from './markdown.mjs';

const TASK_HEADER = ['#', 'task', 'nature', 'depends on'].join('|');
const NATURES = ['[mechanical]', '[judgement]'];

/** The Delivery requirements rows every plan carries, in STYLE.md order. */
export const CONCERNS = [
    'Architecture',
    'Unit tests',
    'Headless e2e',
    'Performance budget',
    'Evolution metrics',
    'Determinism',
    'Config and persistence',
    'Logging and diagnostics',
    'Browser compatibility',
    'Docs',
    'Verification',
];

/**
 * The rules `jmz plan run` (PlanParser) applies: four columns, T-numbered unique ids, a Nature tag, dependencies on
 * known ids only, and no cycles.
 * @param {string[]} lines
 * @param {string} fileName
 */
export function validateTaskTable(lines, fileName) {
    const table = sectionTable(lines, 'Task breakdown');
    for (const header of table.rows.filter((r) => r.cells[0] === '#')) {
        if (header.cells.map((c) => c.toLowerCase()).join('|') !== TASK_HEADER) {
            fail(fileName, header.line, 'task table header must be | # | Task | Nature | Depends on |');
        }
    }
    const rows = table.rows.filter((r) => r.cells[0] !== '#');
    if (!table.sawSection || rows.length === 0) {
        throw new DesignDocError(`${fileName}: no "## Task breakdown" table (required unless the doc is a stub).`);
    }
    const deps = readTaskRows(rows, fileName);
    checkDependenciesExist(rows, deps, fileName);
    checkNoCycles(deps, fileName);
}

/**
 * Validates each task row and returns its dependencies by id.
 * @param {{line: number, cells: string[]}[]} rows
 * @param {string} fileName
 * @returns {Map<string, string[]>}
 */
function readTaskRows(rows, fileName) {
    /** @type {Map<string, string[]>} */
    const deps = new Map();
    for (const { line, cells } of rows) {
        if (cells.length !== 4) {
            fail(fileName, line, `task row has ${cells.length} cells, expected 4`);
        }
        const [id, task, nature, dependsOn] = cells;
        if (!/^T\d+[a-z]?$/.test(id)) {
            fail(fileName, line, `task id "${id}" must match T<number>[letter]`);
        }
        if (deps.has(id)) {
            fail(fileName, line, `duplicate task id ${id}`);
        }
        if (task.length === 0) {
            fail(fileName, line, `${id} has no task text`);
        }
        if (!NATURES.includes(nature.replaceAll('`', ''))) {
            fail(fileName, line, `${id} nature must be [mechanical] or [judgement]`);
        }
        deps.set(id, dependsOn === '-' ? [] : dependsOn.split(',').map((d) => d.trim()));
    }
    return deps;
}

/**
 * @param {{line: number, cells: string[]}[]} rows
 * @param {Map<string, string[]>} deps
 * @param {string} fileName
 */
function checkDependenciesExist(rows, deps, fileName) {
    for (const { line, cells } of rows) {
        for (const dep of deps.get(cells[0]) ?? []) {
            if (dep === cells[0] || !deps.has(dep)) {
                fail(fileName, line, `${cells[0]} depends on unknown or own id "${dep}"`);
            }
        }
    }
}

/**
 * Depth-first search for a dependency cycle.
 * @param {Map<string, string[]>} deps
 * @param {string} fileName
 */
function checkNoCycles(deps, fileName) {
    /** @type {Map<string, 'visiting' | 'done'>} */
    const state = new Map();
    /**
     * @param {string} id
     * @param {string[]} trail
     */
    const visit = (id, trail) => {
        if (state.get(id) === 'visiting') {
            throw new DesignDocError(`${fileName}: task dependency cycle ${trail.join(' -> ')}`);
        }
        if (state.get(id) === 'done') {
            return;
        }
        state.set(id, 'visiting');
        for (const dep of deps.get(id) ?? []) {
            visit(dep, [...trail, dep]);
        }
        state.set(id, 'done');
    };
    for (const id of deps.keys()) {
        visit(id, [id]);
    }
}

/**
 * Every Delivery requirements cell is concrete or "N/A - <reason>"; "TBD - <reason>" only in a stub.
 * @param {string[]} lines
 * @param {string} fileName
 * @param {boolean} stub
 */
export function validateDeliveryRequirements(lines, fileName, stub) {
    const table = sectionTable(lines, 'Delivery requirements');
    const headerFirstCell = table.rows[0]?.cells[0];
    const rows = table.rows.filter((r) => r.cells[0] !== headerFirstCell);
    if (!table.sawSection || rows.length === 0) {
        throw new DesignDocError(`${fileName}: no "## Delivery requirements" table. See docs/designs/STYLE.md.`);
    }
    const missing = CONCERNS.filter((concern) => !rows.some((r) => r.cells[0] === concern));
    if (missing.length > 0) {
        throw new DesignDocError(
            `${fileName}: Delivery requirements is missing ${missing.join(', ')}. See docs/designs/STYLE.md.`,
        );
    }
    for (const { line, cells } of rows) {
        const problem = requirementProblem(cells[0], cells[1] ?? '', stub);
        if (problem) {
            fail(fileName, line, problem);
        }
    }
}

/**
 * Why a Delivery requirements cell breaks the rules, or null.
 * @param {string} concern
 * @param {string} requirement
 * @param {boolean} stub
 */
function requirementProblem(concern, requirement, stub) {
    if (requirement.length === 0) {
        return `Delivery requirements row "${concern}" is empty`;
    }
    if (/^N\/A\s*\.?$/i.test(requirement)) {
        return `Delivery requirements row "${concern}" is a bare N/A - write "N/A - <reason>"`;
    }
    if (!/^TBD\b/i.test(requirement)) {
        return null;
    }
    if (!stub) {
        return `Delivery requirements row "${concern}" is TBD outside a stub`;
    }
    return /^TBD\s*-\s*\S/i.test(requirement)
        ? null
        : `Delivery requirements row "${concern}" is a bare TBD - write "TBD - <reason>"`;
}
