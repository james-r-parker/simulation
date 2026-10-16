import { describe, expect, it } from 'vitest';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { POLICIES } from '../../../js/evo/policies/index.js';
import { createNaturalV1 } from '../../../js/evo/policies/natural-v1.js';
import { SIGMA_MAX, SIGMA_MIN, SIGMA_START, WEIGHT_CLAMP } from '../../../js/evo/mutation.js';
import { createConfig } from '../../../js/sim/config.js';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { hashWorld } from '../../../js/sim/world-hash.js';
import { smallWorld } from '../../sim/helpers/small-world.js';

/** @returns {{policy: any, world: any}} a policy and a two-slot world (mother 0, father 1, child 2) of 4 hidden units */
function pair() {
    const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
    return { policy: createNaturalV1({ config: world.config }), world };
}

/**
 * @param {any} world
 * @param {number} slot
 * @returns {Float32Array}
 */
const row = (world, slot) =>
    world.weights.subarray(slot * world.layout.weightCount, (slot + 1) * world.layout.weightCount);

/**
 * @param {number} seed
 * @param {number} ticks
 * @param {boolean} observed
 * @returns {{policy: any, world: any, hash: string}}
 */
function run(seed, ticks, observed) {
    const config = createConfig({ seed, maxAgents: 60, initialAgents: 30, minAgents: 10, rayCount: 4, brainHidden: 6 });
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    const policy = createNaturalV1({ config, observer });
    const world = createWorld(config, policy.brain);
    const phases = observed ? observerPhases(observer) : undefined;
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        if (observed) {
            observe(observer, world, policy.fitness);
        }
        policy.afterStep(world);
    }
    return { policy, world, hash: String(hashWorld(world)) };
}

describe('natural-v1 shape', () => {
    it('is registered and has the documented policy shape', () => {
        expect(POLICIES['natural-v1'].create).toBe(createNaturalV1);
        const { policy } = pair();
        expect(policy.name).toBe('natural-v1');
        expect(policy.fitnessName).toBe('v1');
        expect(typeof policy.fitness).toBe('function');
        expect(policy.brain.initSpec).toBeUndefined();
        expect(policy.archive).toBeUndefined();
        expect(policy.sigma).toHaveLength(8);
        expect(policy.fatherSigma).toHaveLength(8);
    });
});

describe('initBrain', () => {
    it('writes a random row for the slot only and starts sigma at SIGMA_START', () => {
        const { policy, world } = pair();
        world.weights.fill(7);
        policy.brain.initBrain(world, 3, createRng(1));
        const { layout } = world;
        const r = row(world, 3);
        expect(r.some((w) => w !== 7)).toBe(true);
        expect(row(world, 2).every((w) => w === 7)).toBe(true);
        expect(row(world, 4).every((w) => w === 7)).toBe(true);
        expect(Array.from(r.subarray(layout.bHidden, layout.wOut)).every((b) => b === 0)).toBe(true);
        expect(policy.sigma[3]).toBe(Math.fround(SIGMA_START));
        const hiddenSd = 1 / Math.sqrt(layout.inputCount + layout.hidden);
        const sd = Math.sqrt(
            r.subarray(layout.wIn, layout.bHidden).reduce((a, w) => a + w * w, 0) / (layout.bHidden - layout.wIn),
        );
        expect(sd).toBeGreaterThan(hiddenSd * 0.8);
        expect(sd).toBeLessThan(hiddenSd * 1.2);
    });
});

describe('childBrain', () => {
    it('copies then mutates a split child, with sigma mutated within bounds', () => {
        const { policy, world } = pair();
        policy.brain.initBrain(world, 0, createRng(1));
        policy.sigma[0] = 0.01;
        policy.fatherSigma[0] = 0.4; // ignored for a split
        policy.brain.childBrain(world, 2, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(2) });
        const mother = row(world, 0);
        const child = row(world, 2);
        expect(Array.from(child)).not.toEqual(Array.from(mother));
        const maxDelta = Math.max(...child.map((w, i) => Math.abs(w - mother[i])));
        expect(maxDelta).toBeGreaterThan(0);
        expect(maxDelta).toBeLessThan(0.1);
        expect(policy.sigma[2]).toBeGreaterThanOrEqual(SIGMA_MIN);
        expect(policy.sigma[2]).toBeLessThanOrEqual(SIGMA_MAX);
        expect(policy.sigma[2]).not.toBe(0.01);
        expect(policy.sigma[2]).toBeLessThan(0.05);
    });

    it('draws sigma first: the same stream gives the same sigma for split and mate', () => {
        const { policy, world } = pair();
        policy.brain.initBrain(world, 0, createRng(1));
        policy.brain.childBrain(world, 2, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(5) });
        const split = policy.sigma[2];
        world.fatherWeights.set(row(world, 0), 0);
        policy.fatherSigma[0] = SIGMA_START;
        policy.brain.childBrain(world, 3, 0, { cause: BORN_CAUSE.MATE, rng: createRng(5) });
        expect(policy.sigma[3]).toBe(split);
    });

    it('takes whole neuron blocks from the mother or the father on a mating', () => {
        const { policy, world } = pair();
        const { layout } = world;
        policy.brain.initBrain(world, 0, createRng(1));
        policy.sigma[0] = SIGMA_MIN;
        policy.fatherSigma[0] = SIGMA_MIN;
        world.fatherWeights.fill(2, 0, layout.weightCount); // father row at mother slot 0
        world.weights.set(
            row(world, 0).map((w) => Math.max(-1, Math.min(1, w))),
            0,
        );
        policy.brain.childBrain(world, 2, 0, { cause: BORN_CAUSE.MATE, rng: createRng(9) });
        const child = row(world, 2);
        const fromFather = [];
        for (let h = 0; h < layout.hidden; h++) {
            const block = [layout.bHidden + h, layout.wIn + h, layout.wOut + h * layout.outputCount];
            const flags = block.map((i) => child[i] > 1.5);
            expect(new Set(flags).size).toBe(1);
            fromFather.push(flags[0]);
        }
        expect(fromFather.includes(true) || fromFather.includes(false)).toBe(true);
        for (let o = 0; o < layout.outputCount; o++) {
            expect(Math.abs(child[layout.bOut + o] - world.weights[layout.bOut + o])).toBeLessThan(0.1);
        }
    });

    it('uses the mean of the mother and father sigma for a mating, recorded in onMate', () => {
        const { policy, world } = pair();
        policy.sigma[0] = 0.02;
        policy.sigma[1] = 0.2;
        policy.brain.onMate(world, 0, 1);
        expect(policy.fatherSigma[0]).toBe(Math.fround(0.2));
        policy.brain.initBrain(world, 0, createRng(1));
        policy.sigma[0] = 0.02;
        policy.fatherSigma[0] = Math.fround(0.2);
        world.fatherWeights.set(row(world, 0), 0);
        policy.brain.childBrain(world, 2, 0, { cause: BORN_CAUSE.MATE, rng: createRng(3) });
        const ratio = policy.sigma[2] / ((Math.fround(0.02) + Math.fround(0.2)) / 2);
        const split = createNaturalV1({ config: world.config });
        split.sigma[0] = 0.02;
        split.brain.childBrain(world, 3, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(3) });
        expect(ratio).toBeCloseTo(split.sigma[3] / 0.02, 4);
    });

    it('clamps weights to the genome bound', () => {
        const { policy, world } = pair();
        row(world, 0).fill(WEIGHT_CLAMP);
        policy.sigma[0] = SIGMA_MAX;
        policy.brain.childBrain(world, 2, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(4) });
        expect(Math.max(...row(world, 2))).toBeLessThanOrEqual(WEIGHT_CLAMP);
    });
});

describe('in a real world', () => {
    it('is deterministic: the same seed gives the same hash and sigma', () => {
        const a = run(3, 400, true);
        const b = run(3, 400, true);
        expect(a.hash).toBe(b.hash);
        expect(Array.from(a.policy.sigma)).toEqual(Array.from(b.policy.sigma));
    });

    it('steps bit-identically with and without an observer, and breeds children', () => {
        const withObserver = run(4, 600, true);
        const replay = run(4, 600, false);
        expect(replay.hash).toBe(withObserver.hash);
        const bred = Array.from(replay.policy.sigma).filter((s) => s !== 0 && s !== SIGMA_START);
        expect(bred.length).toBeGreaterThan(0);
    });
});
