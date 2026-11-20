// The tuning lane's planner (docs/designs/training-loop.md, Tuning lane): from the tuning spec, the current ladder and the
// arms already screened, proposes up to `maxArms` one-change arms as ladder-screen grid arms. Pure and deterministic: no
// files, no clock, no randomness. A detector's input, never fitness.

/** The trainer options a tunable may set (the keys of a screen grid's `train`). */
const TRAIN_KEYS = Object.freeze(['episodes', 'ticks', 'offerFrom', 'checkpointEvery']);
/** The value of a trainer option `train.mjs` uses when no grid sets it (an option with no entry has no default). */
const TRAIN_DEFAULTS = /** @type {Record<string, number>} */ (Object.freeze({ episodes: 32, checkpointEvery: 10 }));
const DEFAULT_MAX_ARMS = 2;
const DEFAULT_WORLD_SEEDS = 16;
const OFFSET_COUNT = 32;
const OFFSET_STEP = 8;
const HOLDOUT_FROM = 256;

/**
 * @typedef {object} Tunable
 * @property {string} [key] a trainer option, or a ladder entry key (single-key tunable)
 * @property {string} [name] a bundled tunable's name (required when `key` is absent)
 * @property {string} [stage] the stage the key(s) belong to (none: a trainer option, or every gated stage)
 * @property {Array<number | Record<string, number>>} values the values (numbers, or `{key: value}` bundles) to try
 */

/**
 * @typedef {object} TuneSpec
 * @property {string} curriculum the ladder file tuned
 * @property {string} [until] the last stage the screen trains
 * @property {Tunable[]} tunables what may change
 * @property {number} maxArms arms per night
 * @property {number[]} tuneOffsets offsets of the screen
 * @property {number[]} holdoutOffsets offsets of the confirmation
 * @property {number} worldSeeds seeds of the champion world trial
 * @property {Record<string, number>} [train] trainer options every arm starts from
 */

/**
 * @typedef {object} TuneArm
 * @property {string} name the arm's name (a screen arm name)
 * @property {string} signature the change, `train.episodes=16` or `stages.hunt-weak.preyShare=0.7`: what `history` matches on
 * @property {{train?: Record<string, number>, stages?: Record<string, Record<string, number>>}} overlay the grid arm
 */

/**
 * @typedef {object} Now
 * @property {readonly Record<string, any>[]} ladder the ladder's trained entries
 * @property {Record<string, number>} train the trainer options every arm starts from
 */

/**
 * @param {number} from the first offset
 * @returns {number[]} sixteen offsets from `from` by 8
 */
const offsets = (from) => Array.from({ length: OFFSET_COUNT }, (_, i) => from + i * OFFSET_STEP);

/**
 * @param {unknown} value a value
 * @returns {boolean} whether it is a non-empty list of finite numbers
 */
const numbers = (value) => Array.isArray(value) && value.length > 0 && value.every(Number.isFinite);

/**
 * @param {unknown} value a value
 * @returns {boolean} whether it is a non-empty `{key: finiteNumber}` bundle
 */
const bundle = (value) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(Number.isFinite);

/**
 * @param {any} t a tunable as read from the spec
 * @returns {boolean} whether its values match either a single-key or bundled tunable
 */
const validValues = (t) =>
    (typeof t.key === 'string' && numbers(t.values)) ||
    (typeof (t.name ?? t.key) === 'string' && t.values.every(bundle));

/**
 * @param {any} t a tunable as read from the spec
 * @returns {boolean} whether it is a valid single-key or bundled tunable
 */
function validTunable(t) {
    if (!t || (t.stage !== undefined && typeof t.stage !== 'string')) {
        return false;
    }
    return Array.isArray(t.values) && t.values.length > 0 && validValues(t);
}

/**
 * @param {Record<string, any>} spec a spec as read from its file
 * @returns {void}
 * @throws {Error} on a missing `curriculum`, no tunables, or a malformed tunable
 */
function checkTunables(spec) {
    if (typeof spec?.curriculum !== 'string') {
        throw new Error('train-tune: "curriculum" must name a ladder file');
    }
    if (!Array.isArray(spec.tunables) || spec.tunables.length === 0) {
        throw new Error('train-tune: "tunables" must be a non-empty list');
    }
    if (!spec.tunables.every(validTunable)) {
        throw new Error('train-tune: each tunable needs a "key", an optional "stage" and a list of numeric "values"');
    }
}

/**
 * @param {Record<string, any>} spec a spec with its defaults laid in
 * @returns {void}
 * @throws {Error} on a malformed count or offset list
 */
function checkCounts(spec) {
    for (const key of ['maxArms', 'worldSeeds']) {
        if (!Number.isInteger(spec[key]) || spec[key] < 1) {
            throw new Error(`train-tune: "${key}" must be a positive integer`);
        }
    }
    for (const key of ['tuneOffsets', 'holdoutOffsets']) {
        if (!numbers(spec[key]) || !spec[key].every(Number.isInteger)) {
            throw new Error(`train-tune: "${key}" must be a non-empty list of integers`);
        }
    }
}

/**
 * @param {Record<string, any>} spec a spec as read from its file
 * @returns {TuneSpec & Record<string, any>} the spec with its defaults laid in (and every other key kept)
 * @throws {Error} on a missing `curriculum`, no tunables, or a malformed tunable, offset list or count
 */
export function withDefaults(spec) {
    checkTunables(spec);
    const out = /** @type {TuneSpec & Record<string, any>} */ ({
        ...spec,
        maxArms: spec.maxArms ?? DEFAULT_MAX_ARMS,
        tuneOffsets: spec.tuneOffsets ?? offsets(0),
        holdoutOffsets: spec.holdoutOffsets ?? offsets(HOLDOUT_FROM),
        worldSeeds: spec.worldSeeds ?? DEFAULT_WORLD_SEEDS,
    });
    checkCounts(out);
    return out;
}

/**
 * A stable key of a ladder (FNV-1a over its JSON), what `history` entries record as `ladderHash`.
 * @param {readonly Record<string, any>[]} ladder the ladder's entries
 * @returns {string} an 8-digit hex hash
 */
export function ladderKey(ladder) {
    let hash = 0x811c9dc5;
    for (const ch of JSON.stringify(ladder)) {
        hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * @param {readonly Record<string, any>[]} ladder the ladder's entries
 * @param {string | undefined} until the last stage trained
 * @returns {Record<string, any>[]} the entries up to and including `until` (all when it is unset or unknown)
 */
function trained(ladder, until) {
    const cut = ladder.findIndex((entry) => entry.name === until);
    return cut < 0 ? [...ladder] : ladder.slice(0, cut + 1);
}

/**
 * @param {Tunable} tunable a tunable
 * @param {number | Record<string, number>} value one of its values or bundles
 * @returns {Array<[string, number]>} sorted `[key, value]` pairs
 */
function valuePairs(tunable, value) {
    if (typeof value === 'number') {
        return [[/** @type {string} */ (tunable.key), value]];
    }
    return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * @param {Tunable} tunable a tunable
 * @param {number | Record<string, number>} value one of its values or bundles
 * @param {Now} now the trained ladder and the trainer options
 * @returns {TuneArm | null} the arm, or null when every key already has that value (or no stage is left to change)
 */
function armFor(tunable, value, { ladder, train }) {
    const { stage } = tunable;
    const pairs = valuePairs(tunable, value);
    const label = pairs.map(([k, v]) => `${k}=${v}`).join(',');
    const stem = /** @type {string} */ (tunable.name ?? tunable.key);
    const suffix = typeof value === 'number' ? String(value) : pairs.map(([k, v]) => `${k}-${v}`).join('-');
    const name = `${stem}${stage === undefined ? '' : `-${stage}`}-${suffix}`;
    if (stage === undefined && pairs.every(([k]) => TRAIN_KEYS.includes(k))) {
        const unchanged = pairs.every(([k, v]) => (train[k] ?? TRAIN_DEFAULTS[k]) === v);
        return unchanged ? null : { name, signature: `train.${label}`, overlay: { train: Object.fromEntries(pairs) } };
    }
    const entries = ladder.filter((entry) => (stage === undefined ? entry.gate !== undefined : entry.name === stage));
    const changed = entries.filter((entry) => pairs.some(([k, v]) => entry[k] !== v));
    if (changed.length === 0) {
        return null;
    }
    const patch = Object.fromEntries(pairs);
    return {
        name,
        signature: `stages.${stage ?? '*'}.${label}`,
        overlay: { stages: Object.fromEntries(changed.map((entry) => [entry.name, { ...patch }])) },
    };
}

/**
 * @param {Tunable} tunable a tunable
 * @param {Now} now the trained ladder and the trainer options
 * @returns {number} its current value (NaN when it has none; for a key of every gated stage, the first one's)
 */
function currentValue({ key, stage }, { ladder, train }) {
    if (key === undefined) {
        return NaN;
    }
    const entry = ladder.find((e) => (stage === undefined ? e.gate !== undefined : e.name === stage));
    return Number(entry?.[key] ?? train[key] ?? TRAIN_DEFAULTS[key] ?? NaN);
}

/**
 * @param {Record<string, any>} spec the spec (`TuneSpec`; the defaults are laid in)
 * @param {readonly Record<string, any>[]} ladder the current ladder's entries
 * @param {readonly {ladderHash: string, signature: string}[]} history the arms screened before, each with the hash of the
 *   ladder it was a change to
 * @returns {TuneArm[]} up to `spec.maxArms` arms: values equal to the current one and arms already screened at
 *   this ladder's hash are left out; the rest go round-robin over the tunables, each tunable's nearest value first
 */
export function proposeArms(spec, ladder, history) {
    const { maxArms, tunables, until } = withDefaults(spec);
    const now = { ladder: trained(ladder, until), train: spec.train ?? {} };
    const hash = ladderKey(ladder);
    const seen = new Set(history.filter((h) => h.ladderHash === hash).map((h) => h.signature));
    const queues = tunables.map((tunable) => {
        const current = currentValue(tunable, now);
        const values = numbers(tunable.values)
            ? [.../** @type {number[]} */ (tunable.values)].sort(
                  (a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b,
              )
            : tunable.values;
        return values
            .map((value) => armFor(tunable, value, now))
            .filter((arm) => arm !== null && !seen.has(arm.signature));
    });
    /** @type {TuneArm[]} */
    const arms = [];
    for (let round = 0; arms.length < maxArms && queues.some((q) => round < q.length); round++) {
        for (const queue of queues) {
            if (round < queue.length && arms.length < maxArms) {
                arms.push(/** @type {TuneArm} */ (queue[round]));
            }
        }
    }
    return arms;
}
