// The ladder screen's grid (docs/designs/training-loop.md, Ladder screen): reads a grid file into the arms to run, each
// with its merged ladder and trainer options, and the run list (every arm on every offset). Pure: no files, no clock.
import { createHash } from 'node:crypto';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BASE_ARM = 'base';
/** Workers each training run gets when the grid does not say. */
export const DEFAULT_WORKERS_PER_RUN = 8;
/** The trainer options a grid or an arm may set, and the `train.mjs` flag each becomes. */
export const TRAIN_FLAGS = Object.freeze({
    episodes: '--episodes',
    ticks: '--ticks',
    offerFrom: '--offer-from',
    checkpointEvery: '--checkpoint-every',
});

/**
 * @typedef {object} GridFile
 * @property {string} curriculum the base ladder file
 * @property {number[]} offsets the `--seed-offset` values every arm runs
 * @property {string} [until] the stage after which each run stops
 * @property {number} generations the `--generations` of each run
 * @property {Record<string, number>} [train] trainer options every arm starts from
 * @property {Record<string, {curriculum?: string, train?: Record<string, number>, stages?: Record<string, Record<string, any>>}>} [arms]
 *   named overlays: a whole ladder file, `train` keys, and `stages` laid over the ladder's entries
 * @property {string} [reference] the arm the others are compared with (default an added arm `base`)
 * @property {number} [workersPerRun] workers per run (default 8)
 */

/**
 * @typedef {object} ScreenArm
 * @property {string} name the arm's name and directory
 * @property {string} curriculum the ladder file the arm starts from
 * @property {Record<string, any>[]} ladder the arm's merged ladder
 * @property {Record<string, number>} train the arm's trainer options
 */

/**
 * @typedef {object} ScreenPlan
 * @property {number[]} offsets the offsets, in order
 * @property {string | null} until the stage each run stops after
 * @property {number} generations the generations of each run
 * @property {number} workersPerRun workers per run
 * @property {string} reference the reference arm's name
 * @property {ScreenArm[]} arms the arms, the reference first when it was added
 */

/**
 * @param {unknown} value a value
 * @returns {boolean} whether it is a non-null, non-array object
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} train a `train` object
 * @param {string} where its place in the grid, for the error
 * @returns {Record<string, number>} the options
 * @throws {Error} on an unknown key or a non-integer value
 */
function trainOptions(train, where) {
    if (train === undefined) {
        return {};
    }
    if (!isObject(train)) {
        throw new Error(`grid: ${where} must be an object`);
    }
    for (const [key, value] of Object.entries(/** @type {object} */ (train))) {
        if (!Object.hasOwn(TRAIN_FLAGS, key)) {
            throw new Error(`grid: ${where}.${key} is not a trainer option (${Object.keys(TRAIN_FLAGS).join(', ')})`);
        }
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`grid: ${where}.${key} must be a non-negative integer`);
        }
    }
    return { .../** @type {Record<string, number>} */ (train) };
}

/**
 * @param {readonly Record<string, any>[]} ladder a ladder's entries
 * @param {Record<string, Record<string, any>> | undefined} stages the overlay by stage name
 * @param {string} where the arm, for the error
 * @returns {Record<string, any>[]} the ladder with each overlay laid over its entry (a copy)
 * @throws {Error} when an overlay names no stage of the ladder
 */
function overlayStages(ladder, stages, where) {
    const names = new Set(ladder.map((entry) => entry.name));
    for (const name of Object.keys(stages ?? {})) {
        if (!names.has(name)) {
            throw new Error(`grid: ${where}.stages names "${name}", which is not a stage of the ladder`);
        }
    }
    return ladder.map((entry) => ({ ...entry, ...(stages?.[entry.name] ?? {}) }));
}

/**
 * @param {unknown} offsets the grid's `offsets`
 * @returns {void}
 * @throws {Error} unless it is a non-empty list of distinct non-negative integers
 */
function checkOffsets(offsets) {
    if (!Array.isArray(offsets) || offsets.length === 0 || !offsets.every(Number.isInteger)) {
        throw new Error('grid: "offsets" must be a non-empty list of integers');
    }
    if (new Set(offsets).size !== offsets.length || offsets.some((k) => k < 0)) {
        throw new Error('grid: "offsets" must be distinct and not negative');
    }
}

/**
 * @param {GridFile} grid the grid file
 * @returns {void}
 * @throws {Error} on a missing or malformed key
 */
function checkGrid(grid) {
    if (!isObject(grid) || typeof grid.curriculum !== 'string') {
        throw new Error('grid: "curriculum" must name a ladder file');
    }
    checkOffsets(grid.offsets);
    if (!Number.isInteger(grid.generations) || grid.generations < 1) {
        throw new Error('grid: "generations" must be a positive integer');
    }
    if (grid.workersPerRun !== undefined && !(Number.isInteger(grid.workersPerRun) && grid.workersPerRun >= 1)) {
        throw new Error('grid: "workersPerRun" must be a positive integer');
    }
}

/**
 * @param {GridFile} grid the grid file
 * @param {(file: string) => Record<string, any>[]} readLadder reads a ladder file
 * @returns {ScreenPlan} the plan: the arms with their merged ladders, the reference first when it was added
 * @throws {Error} on a malformed grid, a bad arm name, an unknown reference or overlay
 */
export function planScreen(grid, readLadder) {
    checkGrid(grid);
    const named = grid.arms ?? {};
    const reference = grid.reference ?? BASE_ARM;
    const added = grid.reference === undefined && !Object.hasOwn(named, BASE_ARM);
    /** @type {Record<string, Record<string, any>>} */
    const overlays = { ...(added ? { [BASE_ARM]: {} } : {}), ...named };
    if (!Object.hasOwn(overlays, reference)) {
        throw new Error(`grid: "reference" names "${reference}", which is not an arm`);
    }
    const base = trainOptions(grid.train, 'train');
    const arms = Object.entries(overlays).map(([name, overlay]) => {
        if (!NAME.test(name) || !isObject(overlay)) {
            throw new Error(`grid: arm "${name}" must be a name of letters, digits, . _ - holding an object`);
        }
        const curriculum = overlay.curriculum ?? grid.curriculum;
        return {
            name,
            curriculum,
            ladder: overlayStages(readLadder(curriculum), overlay.stages, `arms.${name}`),
            train: { ...base, ...trainOptions(overlay.train, `arms.${name}.train`) },
        };
    });
    return {
        offsets: [...grid.offsets],
        until: grid.until ?? null,
        generations: grid.generations,
        workersPerRun: grid.workersPerRun ?? DEFAULT_WORKERS_PER_RUN,
        reference,
        arms,
    };
}

/**
 * @param {ScreenPlan} plan a plan
 * @returns {{arm: ScreenArm, offset: number}[]} every arm on every offset, offset by offset so an interrupted screen
 *   leaves matched pairs
 */
export function screenRuns(plan) {
    return plan.offsets.flatMap((offset) => plan.arms.map((arm) => ({ arm, offset })));
}

/**
 * @param {readonly Record<string, any>[]} ladder an arm's merged ladder
 * @returns {string} the text written to `<out>/<arm>/ladder.json`
 */
export function ladderText(ladder) {
    return `${JSON.stringify(ladder, null, 2)}\n`;
}

/**
 * @param {string} text a ladder file's text
 * @returns {string} its SHA-256, the hash `manifest.json` records for the curriculum file
 */
export function textHash(text) {
    return createHash('sha256').update(text).digest('hex');
}

/**
 * @param {ScreenPlan} plan the plan
 * @param {ScreenArm} arm an arm
 * @param {number} offset a seed offset
 * @returns {string[]} the `train.mjs` arguments for the run, without `--curriculum`, `--out` and `--workers`
 */
export function trainArgs(plan, arm, offset) {
    const flags = Object.entries(arm.train).flatMap(([key, value]) => [
        TRAIN_FLAGS[/** @type {keyof typeof TRAIN_FLAGS} */ (key)],
        String(value),
    ]);
    const until = plan.until === null ? [] : ['--until', plan.until];
    return ['--generations', String(plan.generations), '--seed-offset', String(offset), ...until, ...flags];
}
