// The progress of a gated stage (docs/designs/training-loop.md, Stage progress): one number in [0, 1] read from a gate
// checkpoint's drill readings, so a run shows it is closing on a lesson before it passes. A detector only: nothing here
// reaches fitness, merit, mate rank or archive rank, and no gate bar moves. Pure.

/** The least absolute rise of a stage's best progress that keeps the plateau stop from firing. */
export const PROGRESS_RISE = 0.02;

/** The drills whose win is a kill: their progress averages the win share with the share of trials that got the prey in the jaws. */
export const BITE_DRILLS = Object.freeze(['prey-adrift', 'prey-weak', 'prey-mid', 'prey-ahead', 'prey-crossing']);

/**
 * @param {readonly {read: string}[]} gate a gated stage's conditions
 * @returns {string[]} the drills the conditions name (`drill.<name>.<reading>`), in order, once each
 */
export function gateDrills(gate) {
    const names = gate.flatMap((c) => /^drill\.([a-z][a-z0-9-]*)\./.exec(c.read)?.[1] ?? []);
    return [...new Set(names)];
}

/**
 * @param {Record<string, any>} readings a checkpoint's gate readings (`readings.drill.<name>`)
 * @param {string} name a drill
 * @returns {number} the drill's progress: a bite drill's mean of `winShareLow` and `jawShareLow`, any other drill's
 *   `winShareLow`; a null reading counts 0
 */
function drillProgress(readings, name) {
    const reading = readings.drill?.[name] ?? {};
    const win = reading.winShareLow ?? 0;
    return BITE_DRILLS.includes(name) ? (win + (reading.jawShareLow ?? 0)) / 2 : win;
}

/**
 * @param {readonly {read: string}[]} gate a gated stage's conditions
 * @param {Record<string, any>} readings a checkpoint's gate readings
 * @returns {number} the mean progress over the gate's drills, in [0, 1]; 0 for a gate that names none. Conditions on other
 *   readings (`retention.*`, cross-play) do not enter it. A series within one stage, never scaled to the gate bar.
 */
export function stageProgress(gate, readings) {
    const drills = gateDrills(gate);
    if (drills.length === 0) {
        return 0;
    }
    return drills.reduce((sum, name) => sum + drillProgress(readings, name), 0) / drills.length;
}

/**
 * @param {readonly number[]} history a stage's progress at each gate checkpoint
 * @returns {number} the highest so far (0 for none)
 */
export function bestOf(history) {
    return history.reduce((best, value) => Math.max(best, value), 0);
}

/**
 * @param {readonly number[]} history a stage's progress at each gate checkpoint
 * @param {{plateauStop?: number, gate?: readonly {read: string}[]}} stage the stage's `plateauStop` and gate
 * @returns {boolean} whether the stage's best progress rose by less than `PROGRESS_RISE` over its last `plateauStop`
 *   checkpoints; false for a stage with no `plateauStop`, with fewer checkpoints than that, or whose gate names no drill
 *   (it has no progress to watch)
 */
export function plateaued(history, { plateauStop = 0, gate = [] }) {
    if (plateauStop < 1 || history.length < plateauStop || gateDrills(gate).length === 0) {
        return false;
    }
    const before = history.slice(0, history.length - plateauStop);
    return bestOf(history) - bestOf(before) < PROGRESS_RISE;
}
