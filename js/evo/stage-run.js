// The stage state machine of a training run (docs/designs/training-stages.md, Gates): `nextStage` advances a run by one
// generation and, at a checkpoint, reads the current stage's gate, the retention of every passed stage, the hold, the
// stall and the review. A fixed-length stage is the same machine with no gate. Pure: no files, no clock; the state is
// plain data (apart from the stage list) so a run resumes from it.

import { GATE_HOLD, REVIEW_GENERATIONS, REVIEW_MAX, readGate, streaksOf } from './stage-gate.js';
import { bestOf, plateaued, stageProgress } from './stage-progress.js';

/**
 * @typedef {object} RunStage
 * @property {string} name the stage's name
 * @property {number} [generations] a fixed-length stage's generations
 * @property {import('./stage-gate.js').Condition[]} [gate] a gated stage's conditions
 * @property {number} [minGenerations] a gated stage's least generations before it can pass
 * @property {number} [maxGenerations] a gated stage's generations before it stalls
 * @property {boolean} [optional] a stalled optional stage lets the ladder move on
 * @property {number} [plateauStop] gate checkpoints over which the stage's best progress must rise by `PROGRESS_RISE` once
 *   `minGenerations` have run, or the stage stalls with reason `plateau` (0 or absent: it runs to `maxGenerations`)
 * @property {number} [checkpointEvery] this stage's generations between checkpoints
 * @property {import('./adaptive-difficulty.js').Adapt} [adapt] a gated stage's adaptive difficulty: the value of `param` the
 *   episodes run at moves at each gate checkpoint (`RunState.difficulty`)
 * @property {boolean} [keepPasser] a gated stage's best passing elites are kept (`readings.keepers.<stage>`, the drill
 *   readings of the kept passers on the stage's own drills) and count for its retention when the current champions fail
 */

/**
 * @typedef {object} RunState
 * @property {readonly RunStage[]} stages the stages in order (static; not part of a saved state)
 * @property {number} total the run's generations
 * @property {number} index the stage being run
 * @property {number} generation generations completed
 * @property {number} count generations run in the current stage since it began (reviews not counted)
 * @property {Record<string, number>} ran generations run in each stage's world, reviews included
 * @property {Record<string, {passedAt: number, checkpoints: number, gate: object[]}>} passed each passed stage
 * @property {Record<string, number>} reviews reviews begun per stage
 * @property {boolean[]} history the current stage's gate results since it began or last returned from a review
 * @property {number[]} progressHistory the current stage's progress (`stageProgress`) at each gate checkpoint since it began or
 *   last returned from a review
 * @property {Record<string, number>} failStreaks each passed stage's retention failures in a row
 * @property {{index: number, left: number} | null} review the review being run
 * @property {'running' | 'done' | 'stalled'} status whether the run goes on
 * @property {{stage: string, generation: number, optional: boolean, failing: object[], reason: StallReason, bestProgress: number}[]} stalled
 *   each stall
 * @property {object[]} last the failing conditions of the last gate read
 * @property {string | null} lastStage the stage whose world ran the last generation (null before the first)
 * @property {number | null} difficulty the current stage's adapted value (`adapt.param`), set to `adapt.from` when the stage begins;
 *   null when the stage has no `adapt`. Laid over the episodes' world outside the stage's `rulesHash`
 */

/** @typedef {'max' | 'plateau' | 'review'} StallReason why a stage stalled: its maximum generations, a plateau of its progress, or a regression past `REVIEW_MAX` */

/**
 * @typedef {object} StageEvent
 * @property {'info' | 'warn' | 'error'} level the log level
 * @property {string} event the log event name
 * @property {Record<string, any>} fields its fields
 */

/**
 * @param {RunStage} entry a stage
 * @returns {boolean} whether it ends on a gate
 */
export function isGated(entry) {
    return Array.isArray(entry.gate);
}

/**
 * @param {readonly RunStage[]} stages the stages in order
 * @param {number} total the run's generations
 * @returns {RunState} the state before generation 0
 */
export function initialState(stages, total) {
    return {
        stages,
        total,
        index: 0,
        generation: 0,
        count: 0,
        ran: {},
        passed: {},
        reviews: {},
        history: [],
        progressHistory: [],
        failStreaks: {},
        review: null,
        status: 'running',
        stalled: [],
        last: [],
        lastStage: null,
        difficulty: stages[0]?.adapt?.from ?? null,
    };
}

/**
 * The state of a run of fixed-length stages after `done` generations, replayed with no checkpoints (a resume of a run
 * saved without a state).
 * @param {readonly RunStage[]} stages the stages in order, none gated
 * @param {number} total the run's generations
 * @param {number} done generations completed
 * @returns {RunState} the state
 */
export function stateAfter(stages, total, done) {
    let state = initialState(stages, total);
    for (let i = 0; i < done; i++) {
        state = nextStage(state).state;
    }
    return state;
}

/**
 * @param {RunState} state the state
 * @returns {RunStage} the stage whose world the next generation runs: the reviewed one during a review
 */
export function currentEntry(state) {
    return state.stages[state.review === null ? state.index : state.review.index];
}

/**
 * @param {RunState} state the state before a generation
 * @param {number} every the checkpoint interval in force (0: none)
 * @returns {boolean} whether the generation about to run is followed by a checkpoint: on the interval, at the end of the
 *   run, or at the generation where a gated stage would stall
 */
export function checkpointDue(state, every) {
    const done = state.generation + 1;
    const entry = currentEntry(state);
    const last =
        isGated(entry) && state.review === null && state.count + 1 >= /** @type {number} */ (entry.maxGenerations);
    return every > 0 && (done % every === 0 || done === state.total || last);
}

/**
 * @param {RunState} state the state
 * @returns {number | null} the value of `adapt.param` the next generation's episodes run at: the stage's `difficulty`, the
 *   full value (`adapt.to`) in a review of a passed stage, null when the stage world has no `adapt`
 */
export function episodeDifficulty(state) {
    const adapt = currentEntry(state).adapt;
    if (adapt === undefined) {
        return null;
    }
    return state.review === null ? state.difficulty : adapt.to;
}

/**
 * @param {RunState} state the state
 * @returns {boolean} whether the next checkpoint must read gate drills: a gated stage is being run, not a review
 */
export function needsGate(state) {
    return state.review === null && isGated(currentEntry(state));
}

/**
 * @param {RunState} state a state
 * @returns {Omit<RunState, 'stages'> & {names: string[], hashes: (string | null)[]}} the state as saved: the stage names stand for the stages
 */
export function snapshotState(state) {
    const { stages, ...rest } = state;
    const hashes = stages.map((s) => /** @type {any} */ (s).rulesHash ?? null);
    return { ...JSON.parse(JSON.stringify(rest)), names: stages.map((s) => s.name), hashes };
}

/**
 * @param {readonly RunStage[]} stages the run's stages
 * @param {number} total the run's generations
 * @param {Record<string, any>} saved a `snapshotState` result
 * @returns {RunState} the saved state on these stages
 * @throws {Error} when the saved stage names are not these stages'
 */
export function restoreState(stages, total, saved) {
    const names = stages.map((s) => s.name).join(',');
    if (!Array.isArray(saved.names) || saved.names.join(',') !== names) {
        throw new Error(`resume: the archive was written by stages [${saved.names}], this run has [${names}]`);
    }
    const hashes = stages.map((s) => /** @type {any} */ (s).rulesHash ?? null).join(',');
    if (saved.hashes !== undefined && saved.hashes.join(',') !== hashes) {
        throw new Error("resume: the stages' rules differ from the ones the archive was written under");
    }
    const state = /** @type {RunState} */ ({ ...initialState(stages, total), ...saved, status: 'running', total });
    if (saved.difficulty === undefined) {
        state.difficulty = currentEntry(state).adapt?.from ?? null;
    }
    delete (/** @type {any} */ (state).names);
    delete (/** @type {any} */ (state).hashes);
    return state;
}

/**
 * @param {RunState} state a state
 * @returns {RunState} a copy whose mutable parts are not shared
 */
function copy(state) {
    return {
        ...state,
        ran: { ...state.ran },
        passed: { ...state.passed },
        reviews: { ...state.reviews },
        history: [...state.history],
        progressHistory: [...state.progressHistory],
        failStreaks: { ...state.failStreaks },
        review: state.review === null ? null : { ...state.review },
        stalled: [...state.stalled],
    };
}

/** @param {RunState} s the state (changed) @returns {void} */
function moveOn(s) {
    if (s.index + 1 >= s.stages.length) {
        s.status = 'done';
        return;
    }
    s.index += 1;
    s.count = 0;
    s.history = [];
    s.progressHistory = [];
    s.difficulty = s.stages[s.index].adapt?.from ?? null;
}

/**
 * Records a stall: a required stage stops the run, an optional one lets the ladder move on.
 * @param {RunState} s the state (changed)
 * @param {RunStage} entry the stalled stage
 * @param {StallReason} reason why it stalled
 * @param {StageEvent[]} events receives `TrainStageStalled`
 * @returns {void}
 */
function stall(s, entry, reason, events) {
    const optional = entry.optional === true;
    const bestProgress = bestOf(s.progressHistory);
    const stalled = { stage: entry.name, generation: s.generation, optional, failing: s.last, reason, bestProgress };
    s.stalled.push(stalled);
    events.push({ level: 'error', event: 'TrainStageStalled', fields: stalled });
    if (optional) {
        moveOn(s);
    } else {
        s.status = 'stalled';
    }
}

/**
 * Reads one passed stage's gate on the current champions, then (for a `keepPasser` stage) on the kept passers.
 * @param {RunStage} entry the passed stage
 * @param {Record<string, any>} readings the checkpoint's readings
 * @param {Record<string, number>} retention the retention read so far
 * @returns {{read: {passed: boolean, conditions: any[]}, kept: boolean}} the read that counts, and whether a kept
 *   passer carried it
 */
function readPassed(entry, readings, retention) {
    const gate = /** @type {any} */ (entry.gate);
    const read = readGate(gate, { ...readings, retention });
    const keeper = entry.keepPasser === true ? readings.keepers?.[entry.name] : undefined;
    if (read.passed || keeper === undefined) {
        return { read, kept: false };
    }
    const alt = readGate(gate, { ...readings, drill: { ...readings.drill, ...keeper }, retention });
    return alt.passed ? { read: alt, kept: true } : { read, kept: false };
}

/**
 * Reads the gate of every passed stage and keeps each one's failure streak.
 * @param {RunState} s the state (failure streaks changed)
 * @param {Record<string, any>} readings the checkpoint's readings
 * @returns {{retention: Record<string, number>, failing: Record<string, object[]>, kept: string[]}} `retention.<stage>`
 *   (1 or 0), `retention.all`, the failing conditions of each failed stage and the stages a kept passer carried
 */
function readRetention(s, readings) {
    /** @type {Record<string, number>} */
    const retention = {};
    /** @type {Record<string, object[]>} */
    const failing = {};
    /** @type {string[]} */
    const kept = [];
    retention.all = 1;
    for (const entry of s.stages.slice(0, s.index)) {
        if (!Object.hasOwn(s.passed, entry.name)) {
            continue;
        }
        const { read, kept: carried } = readPassed(entry, readings, retention);
        if (carried) {
            kept.push(entry.name);
        }
        retention[entry.name] = read.passed ? 1 : 0;
        retention.all = Math.min(retention.all, retention[entry.name]);
        s.failStreaks[entry.name] = read.passed ? 0 : (s.failStreaks[entry.name] ?? 0) + 1;
        failing[entry.name] = read.conditions.filter((c) => !c.passed);
    }
    return { retention, failing, kept };
}

/**
 * A passed stage that failed on `GATE_HOLD` checkpoints in a row: review it, or stop the run when it was reviewed
 * `REVIEW_MAX` times already.
 * @param {RunState} s the state (changed)
 * @param {{stage: string, failing: object[]}} regressed the regressed stage and its failing conditions
 * @param {StageEvent[]} events receives `TrainStageRegressed`, `TrainReview` and a stall
 * @returns {void}
 */
function regress(s, { stage, failing }, events) {
    events.push({ level: 'warn', event: 'TrainStageRegressed', fields: { generation: s.generation, stage, failing } });
    s.history = [];
    s.failStreaks = {};
    if ((s.reviews[stage] ?? 0) >= REVIEW_MAX) {
        s.last = failing;
        stall(s, { name: stage }, 'review', events);
        return;
    }
    s.reviews[stage] = (s.reviews[stage] ?? 0) + 1;
    s.review = { index: s.stages.findIndex((e) => e.name === stage), left: REVIEW_GENERATIONS };
    events.push({
        level: 'info',
        event: 'TrainReview',
        fields: { generation: s.generation, stage, review: s.reviews[stage] },
    });
}

/**
 * Stalls a stage whose best progress stopped rising (`plateauStop`), unless this checkpoint also reaches its maximum
 * generations, which stalls it with reason `max` instead.
 * @param {RunState} s the state (changed on a stall)
 * @param {RunStage} entry the current stage
 * @param {StageEvent[]} events receives `TrainStageStalled`
 * @returns {boolean} whether the stage stalled on a plateau
 */
function plateauStall(s, entry, events) {
    if (s.count >= /** @type {number} */ (entry.maxGenerations) || !plateaued(s.progressHistory, entry)) {
        return false;
    }
    stall(s, entry, 'plateau', events);
    return true;
}

/**
 * Reads a checkpoint for a gated stage: retention, regression, the gate and the hold.
 * @param {RunState} s the state (changed)
 * @param {RunStage} entry the current stage
 * @param {Record<string, any>} readings the checkpoint's gate readings
 * @param {StageEvent[]} events receives the events
 * @returns {boolean} whether the run moved on, started a review or stopped
 */
function gateCheckpoint(s, entry, readings, events) {
    const ripe = s.count >= (entry.minGenerations ?? 1);
    const { retention, failing, kept } = ripe ? readRetention(s, readings) : { retention: {}, failing: {}, kept: [] };
    const regressed = Object.keys(failing).find((name) => s.failStreaks[name] >= GATE_HOLD);
    if (regressed !== undefined) {
        regress(s, { stage: regressed, failing: failing[regressed] }, events);
        return true;
    }
    const read = readGate(/** @type {any} */ (entry.gate), { ...readings, retention });
    s.last = read.conditions.filter((c) => !c.passed);
    s.history.push(read.passed);
    s.progressHistory.push(stageProgress(/** @type {any} */ (entry.gate), readings));
    const { streak, held } = streaksOf(s.history);
    events.push({
        level: 'info',
        event: 'TrainGate',
        fields: {
            generation: s.generation,
            stage: entry.name,
            passed: read.passed,
            conditions: read.conditions,
            retention,
            progress: s.progressHistory[s.progressHistory.length - 1],
            bestProgress: bestOf(s.progressHistory),
            ...(kept.length === 0 ? {} : { kept }),
        },
    });
    if (!held || !ripe) {
        return !read.passed && ripe && plateauStall(s, entry, events);
    }
    s.passed[entry.name] = { passedAt: s.generation, checkpoints: streak, gate: read.conditions };
    events.push({
        level: 'info',
        event: 'TrainStagePassed',
        fields: { generation: s.generation, stage: entry.name, checkpoints: streak },
    });
    moveOn(s);
    return true;
}

/**
 * Ends a generation of a review: after `REVIEW_GENERATIONS` the run returns to its stage with a clean gate history.
 * @param {RunState} s the state (changed)
 * @returns {void}
 */
function stepReview(s) {
    const review = /** @type {{index: number, left: number}} */ (s.review);
    review.left -= 1;
    if (review.left === 0) {
        s.review = null;
        s.history = [];
        s.progressHistory = [];
        s.failStreaks = {};
        // a review only starts inside a gated stage; leave room for a hold before its stall
        const max = /** @type {number} */ (s.stages[s.index].maxGenerations);
        s.count = Math.max(0, Math.min(s.count, max - GATE_HOLD));
    }
}

/**
 * @param {RunState} s the state (changed)
 * @param {RunStage} entry the gated stage just run
 * @param {Record<string, any> | null} readings the checkpoint's gate readings, or null when none was taken
 * @param {StageEvent[]} events receives the events
 * @returns {void}
 */
function stepGated(s, entry, readings, events) {
    const moved = readings !== null && gateCheckpoint(s, entry, readings, events);
    if (!moved && s.count >= /** @type {number} */ (entry.maxGenerations)) {
        stall(s, entry, 'max', events);
    }
}

/**
 * Advances the run past the generation `state.generation` just run in `currentEntry(state)`'s world.
 * @param {RunState} state the state before the generation
 * @param {{readings: Record<string, any>} | null} [checkpoint] the checkpoint taken after it, with its gate readings
 *   (null: none; ignored during a review)
 * @returns {{state: RunState, events: StageEvent[]}} the state after it, and the events to log
 */
export function nextStage(state, checkpoint = null) {
    const s = copy(state);
    /** @type {StageEvent[]} */
    const events = [];
    const entry = currentEntry(s);
    s.generation += 1;
    s.lastStage = entry.name;
    s.ran[entry.name] = (s.ran[entry.name] ?? 0) + 1;
    if (s.review !== null) {
        stepReview(s);
    } else if (isGated(entry)) {
        s.count += 1;
        stepGated(s, entry, checkpoint?.readings ?? null, events);
    } else {
        s.count += 1;
        if (s.index < s.stages.length - 1 && s.count >= /** @type {number} */ (entry.generations)) {
            moveOn(s);
        }
    }
    return { state: s, events };
}
