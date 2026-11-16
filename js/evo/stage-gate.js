// Stage gates (docs/designs/training-stages.md, Gates): a gate is a list of conditions on a checkpoint's readings. It
// decides when the next stage world starts and is never read by an offer, rank or birth. Pure: no files, no clock.

/** Trials per champion and drill at a gate checkpoint. */
export const GATE_TRIALS = 64;
/** Checkpoints in a row a gate must pass (or fail, for a regression). */
export const GATE_HOLD = 2;
/** Generations a review runs on a regressed stage's world. */
export const REVIEW_GENERATIONS = 5;
/** Reviews of one stage after which another regression stops the run. */
export const REVIEW_MAX = 3;

const NAME = '[a-z][a-z0-9-]*';
const KNOWN_KEYS = [
    new RegExp(`^drill\\.${NAME}\\.(edgeLow|winShareLow|winShareOverReference)$`),
    new RegExp(`^drill\\.${NAME}\\.lossShare\\.${NAME}$`),
    /^drill\.pack-converge\.(gainLow|blindGapLow)$/,
    /^crossplay\.(hunterProgressLow|preyProgressLow|cycleShare)$/,
    new RegExp(`^crossplay\\.preyVsStage\\.${NAME}$`),
    new RegExp(`^retention\\.(all|${NAME})$`),
];

/**
 * @typedef {object} Condition
 * @property {string} read a key of the checkpoint's gate readings, such as `drill.prey-ahead.edgeLow`
 * @property {number} [min] the reading must be at least this
 * @property {number} [max] the reading must be at most this
 */

/**
 * @typedef {object} ConditionRead
 * @property {string} read the key
 * @property {number | null} value the reading (null: none)
 * @property {number} [min] the bound
 * @property {number} [max] the bound
 * @property {boolean} passed whether the reading meets the bound
 */

/**
 * @typedef {object} GateRead
 * @property {boolean} passed whether every condition holds
 * @property {ConditionRead[]} conditions each condition with its reading
 */

/**
 * Checks a gate's shape: a non-empty list of conditions, each reading a known key against one bound. A world metric
 * (`eval.*`) is refused: 4 seeds are under every metric's verdict count.
 * @param {unknown} conditions the gate
 * @param {string} where what to name in an error
 * @returns {void}
 * @throws {Error} naming the condition and the rule it breaks
 */
export function validateGate(conditions, where) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
        throw new Error(`${where}: "gate" must be a non-empty list of conditions`);
    }
    conditions.forEach((c, i) => {
        const at = `${where}.gate[${i}]`;
        if (typeof c !== 'object' || c === null || typeof c.read !== 'string') {
            throw new Error(`${at}: expected { "read": <key>, "min" | "max": <number> }`);
        }
        if (c.read.startsWith('eval.')) {
            throw new Error(`${at}: "${c.read}" is a world metric; a gate reads drills, cross-play and retention only`);
        }
        if (!KNOWN_KEYS.some((pattern) => pattern.test(c.read))) {
            throw new Error(`${at}: unknown reading "${c.read}"`);
        }
        const bounds = ['min', 'max'].filter((k) => c[k] !== undefined);
        if (bounds.length !== 1 || !Number.isFinite(c[bounds[0]])) {
            throw new Error(`${at}: give exactly one finite "min" or "max"`);
        }
    });
}

/**
 * @param {Record<string, any>} readings a checkpoint's gate readings, flat by dotted key or nested
 * @param {string} key a dotted key
 * @returns {number | null} the reading; null when it is absent or not a finite number
 */
function reading(readings, key) {
    let value = Object.hasOwn(readings, key) ? readings[key] : undefined;
    if (value === undefined) {
        value = readings;
        for (const part of key.split('.')) {
            value = value !== null && typeof value === 'object' ? value[part] : undefined;
        }
    }
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Reads a gate against a checkpoint. A bound is inclusive and a null reading fails.
 * @param {readonly Condition[]} conditions the gate
 * @param {Record<string, any>} checkpoint the checkpoint's gate readings
 * @returns {GateRead} whether it passes, and each condition's reading
 */
export function readGate(conditions, checkpoint) {
    const reads = conditions.map((c) => {
        const value = reading(checkpoint, c.read);
        const bound = c.min !== undefined ? { min: c.min } : { max: c.max };
        const ok = value !== null && (c.min !== undefined ? value >= c.min : value <= /** @type {number} */ (c.max));
        return { read: c.read, value, ...bound, passed: ok };
    });
    return { passed: reads.every((r) => r.passed), conditions: reads };
}

/**
 * @param {readonly boolean[]} passes checkpoint results, oldest first
 * @param {number} [hold] checkpoints in a row that make a hold or a regression
 * @returns {{streak: number, failStreak: number, held: boolean, regressed: boolean}} the trailing run of passes and of
 *   failures; `held` when the passes reach `hold`, `regressed` when the failures do
 */
export function streaksOf(passes, hold = GATE_HOLD) {
    let streak = 0;
    let failStreak = 0;
    for (let i = passes.length - 1; i >= 0 && passes[i]; i--) {
        streak++;
    }
    for (let i = passes.length - 1; i >= 0 && !passes[i]; i--) {
        failStreak++;
    }
    return { streak, failStreak, held: streak >= hold, regressed: failStreak >= hold };
}

/**
 * @param {readonly Record<string, any>[]} history a stage's checkpoints' gate readings, oldest first
 * @param {readonly Condition[]} conditions the gate
 * @returns {{streak: number, failStreak: number, held: boolean, regressed: boolean, last: GateRead | null}} the trailing
 *   passes and failures, whether the gate holds (`GATE_HOLD` passes in a row) or has regressed (`GATE_HOLD` failures in a
 *   row), and the last checkpoint's read (null for an empty history)
 */
export function gateState(history, conditions) {
    const reads = history.map((checkpoint) => readGate(conditions, checkpoint));
    return { ...streaksOf(reads.map((r) => r.passed)), last: reads.at(-1) ?? null };
}
