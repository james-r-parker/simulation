// The scripted pack in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"; docs/designs/status-effects.md
// T13a): two kin hunters and a forager. The caller holds `HUNT` for one tick, so one hunt call reaches the hearer, and both
// hunters sprint at the forager. Each reading carries the field of the formula it checks (`budgetPack` of role-budget-pack.js).

import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { pursuerBrain } from './chase-oracles.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { EFFECT, SYSTEM, liveOf } from '../sim/effects.js';
import { step } from '../sim/step.js';

/** The slots of the scene. */
const CALLER = 0;
const HEARER = 1;
const PREY = 2;
/** The tick of the world (counted at the brain phase) the caller holds `HUNT` on: before any body is in reach of the prey. */
const CALL_TICK = 3;
/** The ticks a scene runs: the hunters cover the gap in about 50, and the kill follows within 20. */
const SCENE_TICKS = 150;
/** The forager's distance ahead of the hunters, in px: far enough that both reach their top sprint before the first bite. */
const PREY_GAP = 500;
/** The hearer's distance beside the caller, in px, clear of the caller's body. */
const SIDE = 80;
/**
 * The forager's energy. A bite is 100 and the forager dies once bites have taken it down to where a hunter kills it: at this
 * energy the caller's first bite does not kill, and the hearer, who arrives with it, lands the kill.
 */
const PREY_ENERGY = 2700;

/** The ticks the speeds are read over: the hunters reach their top sprint by about tick 25 and arrive at about 49. */
const SPRINT_TICKS = 55;

/**
 * @typedef {object} PackScene
 * @property {{call: number | null, kill: number | null}} ticks the tick the hunt call fired (null: never) and the tick the
 *   forager died (null: it lived)
 * @property {{caller: number, hearer: number}} rallied the stacks of `rallied` each hunter holds the tick after the call
 * @property {{sprintBoost: number, passiveLoss: number}} lanes the hearer's live lane over the caller's, the tick after the call
 * @property {{caller: number, hearer: number}} peak the highest speed each hunter reached in the first `SPRINT_TICKS`, before the first bite, in px per tick
 * @property {{answered: number, killer: number | null, shared: boolean}} outcome the `answered` stacks the caller holds when
 *   the forager dies, the slot that killed it (null: it lived) and whether the hearer killed it after the caller bit it
 */

/**
 * Stages the caller at the arena's centre heading +x, the hearer `SIDE` px beside it (the caller's child, so kin) and the
 * forager `PREY_GAP` ahead, facing away and at rest with `PREY_ENERGY`.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @returns {ReturnType<typeof stageArena>} the arena
 */
function stage(config) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const { x, y } = ARENA_CENTRE;
    const staged = stageArena(config, [
        { spec: specs.predator.index, x, y, angle: 0 },
        { spec: specs.predator.index, x, y: y + SIDE, angle: 0 },
        { spec: specs.forager.index, x: x + PREY_GAP, y, angle: 0 },
    ]);
    const w = staged.world;
    w.parentA[HEARER] = w.genomeId[CALLER];
    w.energy[PREY] = PREY_ENERGY;
    return staged;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a body
 * @returns {number} its stacks of `rallied`
 */
const rallied = (world, slot) => world.effectStacks[SYSTEM.rowOf[EFFECT.RALLIED]][slot];

/**
 * @param {Record<string, any>} world the world
 * @returns {PackScene['lanes']} the hearer's live lanes over the caller's
 */
function laneRatios(world) {
    const ratio = (/** @type {string} */ lane) => liveOf(world, HEARER, lane) / liveOf(world, CALLER, lane);
    return { sprintBoost: ratio('sprintBoost'), passiveLoss: ratio('passiveLoss') };
}

/**
 * Notes what the readings name after step `n`.
 * @param {PackScene} out the readings, updated in place
 * @param {Record<string, any>} w the world after the step
 * @param {{n: number, before: {caller: number, hearer: number, lastBiter: number, prevBiter: number}}} at the step (from 1), each hunter's energy and the
 *   forager's last two biters (genome ids) before it
 * @returns {void}
 */
function note(out, w, { n, before }) {
    const speed = (/** @type {number} */ slot) => Math.sqrt(w.vx[slot] * w.vx[slot] + w.vy[slot] * w.vy[slot]);
    if (n <= SPRINT_TICKS) {
        out.peak.caller = Math.max(out.peak.caller, speed(CALLER));
        out.peak.hearer = Math.max(out.peak.hearer, speed(HEARER));
    }
    if (out.ticks.call === null && w.huntTimer[CALLER] > 0) {
        out.ticks.call = n;
        out.rallied = { caller: rallied(w, CALLER), hearer: rallied(w, HEARER) };
        out.lanes = laneRatios(w);
    }
    if (w.alive[PREY] === 0) {
        out.ticks.kill = n;
        out.outcome.answered = w.effectStacks[SYSTEM.rowOf[EFFECT.ANSWERED]][CALLER];
        out.outcome.killer = w.energy[HEARER] - before.hearer > w.energy[CALLER] - before.caller ? HEARER : CALLER;
        // with two hunters, the caller bit before the killer if it is either of the forager's last two biters
        const bit = before.lastBiter === w.genomeId[CALLER] || before.prevBiter === w.genomeId[CALLER];
        out.outcome.shared = out.outcome.killer === HEARER && bit;
    }
}

/**
 * Plays the pack: both hunters sprint at the forager, and with `call` the caller holds `HUNT` on tick `CALL_TICK` only.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{call: boolean}} options whether the caller calls
 * @returns {PackScene} the readings, from the real sim
 */
export function playPack(config, { call }) {
    const staged = stage(config);
    const w = staged.world;
    const chasers = [CALLER, HEARER].map((pursuer) => pursuerBrain({ pursuer, evader: PREY, sprint: true }));
    const brain = (/** @type {Record<string, any>} */ world) => {
        chasers.forEach((chase) => chase(world));
        if (call && world.tick === CALL_TICK) {
            world.outputs[CALLER * OUTPUT_COUNT + OUTPUT_INDEX.HUNT] = 1;
        }
    };
    const out = {
        ticks: { call: /** @type {number | null} */ (null), kill: /** @type {number | null} */ (null) },
        rallied: { caller: 0, hearer: 0 },
        lanes: { sprintBoost: 1, passiveLoss: 1 },
        peak: { caller: 0, hearer: 0 },
        outcome: { answered: 0, killer: /** @type {number | null} */ (null), shared: false },
    };
    const before = { caller: 0, hearer: 0, lastBiter: 0, prevBiter: 0 };
    for (let n = 1; n <= SCENE_TICKS && w.alive[PREY] === 1; n++) {
        Object.assign(before, {
            caller: w.energy[CALLER],
            hearer: w.energy[HEARER],
            lastBiter: w.lastBiter[PREY],
            prevBiter: w.prevBiter[PREY],
        });
        step(w, staged.policy, { brain });
        note(out, w, { n, before });
    }
    return out;
}
