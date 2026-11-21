// The hunter choice detectors (body-genes.md, T22): the arithmetic, against hand-built state.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    CONTINUE_GAP,
    createHunterChoiceScene,
    EXPOSURE_EVERY,
    freeHunterChoiceSlot,
    hunterChoiceDetector,
    hunterChoiceMetrics,
    MIN_STARTS,
    tickHunterChoice,
} from '../../js/evo/scene-hunter-choice.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { SPEC } from '../../js/sim/specs.js';
import { directionOf, intendedOf, namesOf } from './helpers/metric-registry.js';

const TICK = BURN_IN_TICKS + 5 * EXPOSURE_EVERY;
const config = createConfig({ maxAgents: 8, initialAgents: 0, minAgents: 0 });

/**
 * @typedef {object} Body one hand-built agent
 * @property {number} spec specialisation index
 * @property {number} [x] default 100
 * @property {number} [size] default 10
 * @property {number} [speed] default 0
 * @property {boolean} [dead] default false
 */

/**
 * A world after a step: slot 0 is a hunter (size 30) holding BITE, the rest are the bodies. `bitten` is the slot it bit
 * this step.
 * @param {Body[]} bodies slots 1 and up
 * @param {{bitten?: number, tick?: number, bite?: number, contact?: number}} [options] the bitten slot, the world's tick
 *   (default `TICK`), the BITE output (default 1) and the slot in contact with the hunter (default the bitten one)
 * @returns {Record<string, any>} the world
 */
function world(bodies, { bitten, tick = TICK, bite = 1, contact = bitten } = {}) {
    const w = {
        tick,
        config,
        huntBySpec: Float64Array.from([0, 1, 0, 0, 0]),
        alive: new Uint8Array(8),
        spec: new Uint8Array(8),
        x: new Float32Array(8),
        y: new Float32Array(8),
        vx: new Float32Array(8),
        vy: new Float32Array(8),
        size: new Float32Array(8),
        lanes: { visionRange: new Float64Array(8).fill(200) },
        genomeId: Uint32Array.from([100, 101, 102, 103, 104, 105, 106, 107]),
        parentA: new Uint32Array(8),
        parentB: new Uint32Array(8),
        lastBiter: new Uint32Array(8),
        lastBiteTick: new Uint32Array(8),
        outputs: new Float32Array(8 * OUTPUT_COUNT),
        contacts: new Int32Array(8),
        contactCount: contact === undefined ? 0 : 1,
    };
    w.alive.fill(1, 0, bodies.length + 1);
    w.spec[0] = SPEC.PREDATOR;
    w.size[0] = 30;
    w.outputs[OUTPUT_INDEX.BITE] = bite;
    bodies.forEach((b, i) => {
        w.spec[i + 1] = b.spec;
        w.x[i + 1] = b.x ?? 100;
        w.size[i + 1] = b.size ?? 10;
        w.vx[i + 1] = b.speed ?? 0;
        w.alive[i + 1] = b.dead === true ? 0 : 1;
    });
    if (bitten !== undefined) {
        w.lastBiter[bitten] = w.genomeId[0];
        w.lastBiteTick[bitten] = tick - 1;
    }
    w.contacts[1] = contact ?? 0;
    return w;
}

/**
 * @param {Record<string, any>} w a world
 * @param {Record<string, any>} [scene] a scene to tick (default fresh)
 * @returns {Record<string, any>} the scene after one tick
 */
function ticked(w, scene = createHunterChoiceScene(config)) {
    tickHunterChoice(scene, w);
    return scene;
}

const FORAGER = { spec: SPEC.FORAGER };
const DEFENDER = { spec: SPEC.DEFENDER };

describe('a bite start', () => {
    it('is a bite that landed in the step, from a hunter with BITE held, on a body in contact', () => {
        expect(ticked(world([FORAGER], { bitten: 1 })).otherStarts).toBe(1);
        expect(ticked(world([DEFENDER], { bitten: 1 })).defenderStarts).toBe(1);
    });

    it('is not one with no contact, no wish, a dead victim, a stale bite or another biter', () => {
        expect(ticked(world([FORAGER], { contact: undefined })).otherStarts).toBe(0);
        expect(ticked(world([FORAGER], { bitten: 1, bite: -1 })).otherStarts).toBe(0);
        expect(ticked(world([{ ...FORAGER, dead: true }], { bitten: 1 })).otherStarts).toBe(0);
        const stale = world([FORAGER], { bitten: 1 });
        stale.lastBiteTick[1] = TICK - 3;
        expect(ticked(stale).otherStarts).toBe(0);
        const other = world([FORAGER], { bitten: 1 });
        other.lastBiter[1] = 999;
        expect(ticked(other).otherStarts).toBe(0);
    });

    it('is not one from a body that cannot hunt, and is read in either direction of the contact', () => {
        const w = world([FORAGER, FORAGER], { bitten: 2 });
        w.contacts[0] = 1;
        w.contacts[1] = 2;
        w.lastBiter[2] = w.genomeId[1];
        expect(ticked(w).otherStarts).toBe(0);
        const reversed = world([FORAGER], { bitten: 1 });
        reversed.contacts[0] = 1;
        reversed.contacts[1] = 0;
        expect(ticked(reversed).otherStarts).toBe(1);
    });

    it('counts nothing before burn-in, but still remembers the sizes', () => {
        const scene = ticked(world([FORAGER], { bitten: 1, tick: BURN_IN_TICKS - 1 }));
        expect(scene.otherStarts).toBe(0);
        expect(scene.prevSize[1]).toBe(10);
    });

    it('continues on the same body within the gap and starts again after it, or on another body', () => {
        const scene = ticked(world([FORAGER, FORAGER], { bitten: 1 }));
        ticked(world([FORAGER, FORAGER], { bitten: 1, tick: TICK + CONTINUE_GAP }), scene);
        expect(scene.otherStarts).toBe(1);
        ticked(world([FORAGER, FORAGER], { bitten: 1, tick: TICK + 2 * CONTINUE_GAP + 1 }), scene);
        expect(scene.otherStarts).toBe(2);
        ticked(world([FORAGER, FORAGER], { bitten: 2, tick: TICK + 2 * CONTINUE_GAP + 2 }), scene);
        expect(scene.otherStarts).toBe(3);
    });

    it('is forgotten when the hunter slot is freed', () => {
        const scene = ticked(world([FORAGER], { bitten: 1 }));
        freeHunterChoiceSlot(scene, 0);
        ticked(world([FORAGER], { bitten: 1, tick: TICK + 1 }), scene);
        expect(scene.otherStarts).toBe(2);
    });
});

describe('the choice of size and speed', () => {
    it('reads the bitten prey minus the mean of the others in view, as the prey stood before the bite', () => {
        const before = world(
            [
                { spec: SPEC.FORAGER, size: 4, speed: 1 },
                { spec: SPEC.FORAGER, size: 20, speed: 5 },
                { spec: SPEC.FORAGER, size: 10, speed: 3 },
            ],
            { bitten: 1 },
        );
        const scene = createHunterChoiceScene(config);
        scene.prevSize.set(before.size);
        scene.prevVx.set(before.vx);
        before.size[1] = 1;
        before.vx[1] = 0;
        tickHunterChoice(scene, before);
        expect(scene.choiceStarts).toBe(1);
        expect(scene.sizeGap).toBeCloseTo(4 - 15, 6);
        expect(scene.speedGap).toBeCloseTo(1 - 4, 6);
    });

    it('leaves out a start with no other prey in view, one too far, one too big and kin', () => {
        expect(ticked(world([FORAGER], { bitten: 1 })).choiceStarts).toBe(0);
        expect(ticked(world([FORAGER, { ...FORAGER, x: 600 }], { bitten: 1 })).choiceStarts).toBe(0);
        expect(ticked(world([FORAGER, { ...FORAGER, size: 40 }], { bitten: 1 })).choiceStarts).toBe(0);
        const kin = world([FORAGER, FORAGER], { bitten: 1 });
        kin.parentA[2] = kin.genomeId[0];
        expect(ticked(kin).choiceStarts).toBe(0);
    });

    it('reads null under the least starts and the mean from it', () => {
        const scene = createHunterChoiceScene(config);
        scene.choiceStarts = MIN_STARTS - 1;
        expect(hunterChoiceMetrics(scene)['eval.hunter_size_choice']?.value).toBeNull();
        scene.choiceStarts = MIN_STARTS;
        scene.sizeGap = -3 * MIN_STARTS;
        scene.speedGap = 2 * MIN_STARTS;
        const metrics = hunterChoiceMetrics(scene);
        expect(metrics['eval.hunter_size_choice']).toEqual({ value: -3 });
        expect(metrics['eval.hunter_slow_choice']).toEqual({ value: 2 });
    });
});

describe('the defender bite ratio', () => {
    it('weights the exposure of the sampled ticks and counts defenders apart from other prey', () => {
        const scene = createHunterChoiceScene(config);
        ticked(world([DEFENDER, FORAGER, FORAGER], { tick: BURN_IN_TICKS + 1 }), scene);
        expect(scene.defenderExposure).toBe(0);
        ticked(world([DEFENDER, FORAGER, FORAGER]), scene);
        expect(scene.defenderExposure).toBe(EXPOSURE_EVERY);
        expect(scene.otherExposure).toBe(2 * EXPOSURE_EVERY);
    });

    it('is the defender rate over the other rate, 0 with no defender bite, and null without the pieces', () => {
        const scene = createHunterChoiceScene(config);
        const ratio = () => hunterChoiceMetrics(scene)['eval.hunter_defender_bite_ratio'];
        expect(ratio()?.value).toBeNull();
        scene.defenderExposure = 100;
        scene.otherExposure = 400;
        scene.otherStarts = 8;
        expect(ratio()).toEqual({ value: 0 });
        scene.defenderStarts = 1;
        expect(ratio()).toEqual({ value: 0.01 / 0.02 });
        scene.otherStarts = 0;
        expect(ratio()?.value).toBeNull();
    });
});

describe('the detector and the registry', () => {
    it('names its module, builds the scene and frees a slot', () => {
        expect(hunterChoiceDetector.modules).toEqual(['js/evo/scene-hunter-choice.js']);
        const scene = hunterChoiceDetector.create(config, { runTicks: 0 });
        expect(Object.keys(hunterChoiceDetector.metrics(scene, {}, {})).sort()).toEqual(
            namesOf('js/evo/scene-hunter-choice.js'),
        );
        scene.victim[2] = 5;
        hunterChoiceDetector.onSlotFree?.(scene, 2);
        expect(scene.victim[2]).toBe(0);
    });

    it('lists the three metrics as watch metrics', () => {
        for (const name of namesOf('js/evo/scene-hunter-choice.js')) {
            expect(directionOf(name)).toBe('watch');
        }
        expect(intendedOf('eval.hunter_defender_bite_ratio')).toBe('lower');
    });
});
