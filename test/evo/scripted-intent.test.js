import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { DECISION_WINDOW, INTENT_CONTROLLERS } from '../../js/evo/scripted-intent.js';
import { SCRIPTED_CONTROLLERS, SEEK_THRUST } from '../../js/evo/scripted.js';

const CH = { food: 1, threat: 2, kin: 5 };
const O = OUTPUT_INDEX;

/**
 * @param {keyof typeof INTENT_CONTROLLERS} name the controller
 * @param {number} [seed] the scripted stream's seed
 * @returns {{world: any, run: (w: any) => void}} a small world and the controller's brain phase
 */
function setup(name, seed = 1) {
    const config = createConfig({ seed: 1, initialAgents: 3, maxAgents: 6, minAgents: 0 });
    const world = createWorld(config, createBaselineV5().brain);
    return { world, run: INTENT_CONTROLLERS[name]({ world, rng: fork(createRng(seed), 'scripted') }) };
}

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} k the ray
 * @param {number} channel the class channel
 * @returns {void}
 */
function hit(world, slot, k, channel) {
    const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
    world.inputs[base] = 0.5;
    world.inputs[base + channel] = 1;
}

/**
 * @param {Record<number, number>} set the outputs that are not 0, by index; `SPLIT` is 1 unless set
 * @returns {number[]} a full output row, so the SPLIT output is pinned at 1 and the memory outputs at 0
 */
function fullRow(set) {
    return Array.from({ length: OUTPUT_COUNT }, (_, i) => set[i] ?? (i === O.SPLIT ? 1 : 0));
}

/**
 * @param {any} world the world
 * @param {number} [slot] the agent
 * @returns {number[]} the slot's output row
 */
function out(world, slot = 0) {
    return Array.from(world.outputs.subarray(slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT));
}

/**
 * @param {any} world the world
 * @param {(w: any) => void} run the controller
 * @param {number} ticks how many ticks to run
 * @returns {number[][]} slot 0's output row after each tick
 */
function trace(world, run, ticks) {
    return Array.from({ length: ticks }, () => {
        run(world);
        world.tick += 1;
        return out(world);
    });
}

describe('intent controllers', () => {
    it('are frozen and merged into SCRIPTED_CONTROLLERS', () => {
        expect(Object.keys(INTENT_CONTROLLERS)).toEqual([
            'sloppyForager',
            'jawSitter',
            'huntCallSpammer',
            'grouper',
            'cruiser',
        ]);
        expect(Object.isFrozen(INTENT_CONTROLLERS)).toBe(true);
        for (const name of Object.keys(INTENT_CONTROLLERS)) {
            expect(SCRIPTED_CONTROLLERS[/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name)], name).toBeDefined();
        }
    });

    it('jawSitter holds still with only BITE set, whatever its rays see', () => {
        const { world, run } = setup('jawSitter');
        hit(world, 0, 2, CH.food);
        hit(world, 1, 1, CH.threat);
        run(world);
        for (const slot of [0, 1, 2]) {
            expect(out(world, slot)).toEqual(fullRow({ [O.BITE]: 1 }));
        }
    });

    it('huntCallSpammer runs hunter and sets HUNT on every tick, with or without prey in sight', () => {
        const { world, run } = setup('huntCallSpammer');
        hit(world, 0, 3, 3);
        run(world);
        expect(out(world, 0)).toEqual(fullRow({ 0: 1, 1: 1, 2: 1, [O.BITE]: 1, [O.HUNT]: 1 }));
        run(world);
        expect(out(world, 0)[O.HUNT]).toBe(1);
        expect(out(world, 2)).toEqual(fullRow({ [O.THRUST]: Math.fround(SEEK_THRUST), [O.HUNT]: 1 }));
    });

    it('grouper flees as fleer does with no lineage mate near, and turns towards the nearest one when threatened', () => {
        const { world, run } = setup('grouper');
        const { rayCount, callRadius } = world.config;
        world.lineageId.set([10, 10, 20]);
        world.x.set([100, 100 + callRadius / 2, 5000]);
        world.y.fill(100);
        world.angle.fill(0);
        for (const slot of [0, 1, 2]) {
            hit(world, slot, 3, CH.threat);
        }
        world.x[1] = 100 + callRadius * 3;
        run(world);
        expect(out(world, 0)[O.TURN]).toBe(-1);
        world.x[1] = 100;
        world.y[1] = 100 + callRadius / 2;
        run(world);
        expect(rayCount).toBeGreaterThan(4);
        expect(out(world, 0)[O.TURN]).toBe(1);
        expect(out(world, 0)[O.SPRINT]).toBe(1);
        expect(out(world, 1)[O.TURN]).toBe(-1);
        world.y[1] = 100 - callRadius / 2;
        run(world);
        expect(out(world, 0)[O.TURN]).toBe(-1);
        expect(out(world, 2)[O.TURN]).toBe(-1);
    });

    it('cruiser holds SEEK_THRUST straight ahead whatever its rays see', () => {
        const { world, run } = setup('cruiser');
        hit(world, 0, 3, CH.food);
        hit(world, 1, 2, CH.threat);
        run(world);
        for (const slot of [0, 1, 2]) {
            expect(out(world, slot)).toEqual(fullRow({ [O.THRUST]: Math.fround(SEEK_THRUST) }));
        }
    });

    it('grouper ignores kin when nothing threatens it', () => {
        const { world, run } = setup('grouper');
        hit(world, 0, 3, CH.kin);
        run(world);
        expect(out(world, 0)).toEqual(fullRow({ [O.THRUST]: Math.fround(SEEK_THRUST) }));
    });

    it('sloppyForager keeps one choice for a decision window and draws from its rng', () => {
        const { world, run } = setup('sloppyForager', 3);
        hit(world, 0, 2, CH.food);
        const rows = trace(world, run, 4 * DECISION_WINDOW);
        for (let w = 0; w < 4; w++) {
            const window = rows.slice(w * DECISION_WINDOW, (w + 1) * DECISION_WINDOW);
            const seeks = window.map((row) => row[O.THRUST] === Math.fround(SEEK_THRUST));
            expect(new Set(seeks).size, `window ${w}`).toBe(1);
        }
        const kinds = new Set(rows.map((row) => row[O.THRUST]));
        expect([...kinds].sort()).toEqual([Math.fround(SEEK_THRUST), 1].sort());
    });

    it('sloppyForager replays from its seed and differs between seeds', () => {
        const run = (/** @type {number} */ seed) => {
            const s = setup('sloppyForager', seed);
            return trace(s.world, s.run, 6 * DECISION_WINDOW);
        };
        expect(run(5)).toEqual(run(5));
        expect(run(5)).not.toEqual(run(6));
    });

    it('sloppyForager redraws its choice when a slot gets a new genome mid-window', () => {
        const { world, run } = setup('sloppyForager', 3);
        trace(world, run, 3);
        const draws = [];
        for (let id = 100; id < 140; id++) {
            world.genomeId[0] = id;
            run(world);
            draws.push(out(world)[O.THRUST]);
        }
        expect(new Set(draws).size).toBe(2);
    });
});
