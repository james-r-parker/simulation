// The strike miss energy share (eat-choice.md, Phase 5, T23): the arithmetic, against hand-built state.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createStrikeMissScene, strikeMissMetrics, tickStrikeMiss } from '../../js/evo/scene-strike-miss.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const NAME = 'eval.strike_miss_energy_share';
const TICK = 50;

/**
 * @typedef {object} Agent one hand-built agent
 * @property {number} spec 0 forager, 1 hunter
 * @property {boolean} [bite] whether its BITE output is above 0 (default true)
 * @property {boolean} [jaws] whether a body was in its jaws in the step that just ran (default false)
 * @property {boolean} [alive] default true
 */

/**
 * @param {Agent[]} agents the agents
 * @param {{cost?: number, income?: number[]}} [options] `strikeMissCost` (default 2) and the hunter income by source of
 *   specialisation 1 (kill, bite, carcass, herd), 0 for specialisation 0 forager bites it would never have
 * @returns {Record<string, any>} a hand-built world after a step: its tick is `TICK`, and a body in the jaws left `TICK`
 */
function world(agents, { cost = 2, income = [10, 20, 30, 40] } = {}) {
    const n = agents.length;
    const w = {
        tick: TICK,
        config: { strikeMissCost: cost },
        huntBySpec: Float64Array.from([0, 1]),
        alive: new Uint8Array(n),
        spec: new Uint8Array(n),
        jawsStamp: new Uint32Array(n),
        outputs: new Float32Array(n * OUTPUT_COUNT),
        hunterIncomeBySpec: Float64Array.from([1000, 1000, 1000, 1000, ...income]),
    };
    agents.forEach((a, i) => {
        w.alive[i] = a.alive === false ? 0 : 1;
        w.spec[i] = a.spec;
        w.jawsStamp[i] = a.jaws ? TICK : TICK - 1;
        w.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite === false ? -1 : 1;
    });
    return w;
}

/** @param {Agent[]} agents @param {Record<string, any>} [options] @returns {Record<string, any>} the scene after one tick */
function ticked(agents, options) {
    const scene = createStrikeMissScene();
    tickStrikeMiss(scene, world(agents, options));
    return scene;
}

describe('tickStrikeMiss', () => {
    it('counts the alive hunters that hold BITE with no body in their jaws this tick', () => {
        const scene = ticked([
            { spec: 1 }, // strikes at nothing
            { spec: 1, jaws: true }, // a body in its jaws: the strike lands
            { spec: 1, bite: false }, // no wish to bite
            { spec: 1, alive: false }, // dead
            { spec: 0 }, // a forager holding BITE is not a hunter
            { spec: 1 }, // strikes at nothing
        ]);
        expect(scene.misses).toBe(2);
    });

    it('counts nothing with strikeMissCost 0', () => {
        expect(ticked([{ spec: 1 }], { cost: 0 }).misses).toBe(0);
    });

    it('reads the stamp the step wrote against this tick: a stamp of the previous tick is a miss', () => {
        const w = world([{ spec: 1 }]);
        const scene = createStrikeMissScene();
        w.jawsStamp[0] = w.tick;
        tickStrikeMiss(scene, w);
        expect(scene.misses).toBe(0);
        w.jawsStamp[0] = w.tick - 1;
        tickStrikeMiss(scene, w);
        w.jawsStamp[0] = w.tick + 1;
        tickStrikeMiss(scene, w);
        expect(scene.misses).toBe(2);
    });
});

describe('the strike miss energy share', () => {
    it('prices the misses at strikeMissCost over what the hunters stored, hunters only', () => {
        const scene = createStrikeMissScene();
        scene.misses = 4;
        // 4 misses x 2 = 8 over 10 + 20 + 30 + 40 = 100; the forager specialisation's 4000 is not counted
        expect(strikeMissMetrics(scene, world([], {}))[NAME]).toEqual({ value: 0.08 });
    });

    it('is 0 with strikeMissCost 0, and null with no hunter income', () => {
        const scene = createStrikeMissScene();
        expect(strikeMissMetrics(scene, world([], { cost: 0 }))[NAME]).toEqual({ value: 0 });
        expect(strikeMissMetrics(scene, world([], { income: [0, 0, 0, 0] }))[NAME]).toEqual({
            value: null,
            reason: 'no hunter income',
        });
    });
});

describe('the registry', () => {
    it('lists the detector with its direction', () => {
        expect(namesOf('js/evo/scene-strike-miss.js')).toEqual([NAME]);
        expect(directionOf(NAME)).toBe('lower');
    });
});
