// The cell of the role-budget matrix (docs/designs/role-budget.md, "The matrix"): one step's slack, its status, and the
// row's status and binding step. Pure.

/** The largest slack a bisection reports, in ticks; a cell at it prints `>200`. */
export const SLACK_CAP = 200;

/**
 * @typedef {object} Cell
 * @property {number | null} margin the slack in `unit`, null when the step is impossible, `undefined` when not a step
 * @property {string} unit what the margin is counted in
 * @property {number | null} distance a length that goes with the margin, in px, or null
 * @property {'ok' | 'tight' | 'impossible' | 'n/a'} status
 * @property {boolean} capped whether the margin is the cap of the search
 * @property {boolean} binding whether this is the step of the row with the least slack
 */

/**
 * @param {number | null | undefined} margin the slack: a number, null for a step a perfect performer fails, undefined for
 *   a step the job does not use
 * @param {{tightTicks: number}} model the model options
 * @param {{unit?: string, distance?: number | null}} [extra] the unit (ticks) and a length
 * @returns {Cell} the cell
 */
export function cell(margin, model, { unit = 'ticks', distance = null } = {}) {
    let status = /** @type {Cell['status']} */ ('n/a');
    if (margin === null) {
        status = 'impossible';
    } else if (margin !== undefined) {
        status = margin >= model.tightTicks ? 'ok' : 'tight';
    }
    return {
        margin: margin ?? null,
        unit,
        distance,
        status,
        capped: margin !== undefined && margin !== null && margin >= SLACK_CAP,
        binding: false,
    };
}

/**
 * @param {string} name the row's name
 * @param {Record<string, Cell>} cells the row's cells by step
 * @returns {{name: string, cells: Record<string, Cell>, status: Cell['status'], binding: string | null}} the row: its
 *   status (`impossible` when any cell is, else `tight` when any is, else `ok`; `n/a` with no step) and the step with the
 *   least slack (the first impossible step when there is one), which is marked in its cell
 */
export function rowOf(name, cells) {
    const steps = Object.entries(cells).filter(([, c]) => c.status !== 'n/a');
    const impossible = steps.find(([, c]) => c.status === 'impossible');
    const least = steps.reduce(
        (best, step) =>
            best === null || /** @type {number} */ (step[1].margin) < /** @type {number} */ (best[1].margin)
                ? step
                : best,
        /** @type {[string, Cell] | null} */ (null),
    );
    const binding = (impossible ?? least)?.[0] ?? null;
    if (binding !== null) {
        cells[binding].binding = true;
    }
    const statuses = steps.map(([, c]) => c.status);
    let status = /** @type {Cell['status']} */ ('n/a');
    if (steps.length > 0) {
        status = statuses.includes('impossible') ? 'impossible' : statuses.includes('tight') ? 'tight' : 'ok';
    }
    return { name, cells, status, binding };
}
