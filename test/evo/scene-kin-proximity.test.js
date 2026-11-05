// The kin-proximity detector (hunter-learning.md T4b): juvenile hunters' distance to their nearest living parent and to their
// siblings, against hand-built worlds.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    KIN_DIRECTIONS,
    createKinProximityScene,
    kinProximityMetrics,
    sampleKinProximity,
} from '../../js/evo/scene-kin-proximity.js';

const CONFIG = { maxAgents: 16 };
const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const HUNT = new Float64Array([0, 1]);

/**
 * @typedef {object} Body
 * @property {number} id the genome id
 * @property {number} x the x position
 * @property {number} [y] the y position
 * @property {number} [parents] the genome id of both parents, 0 for a founder
 * @property {number} [age] the age in ticks
 * @property {number} [spec] the specialisation; 1 hunts
 */

/**
 * @param {Body[]} bodies the agents alive, one per slot
 * @param {{tick?: number}} [at] the tick
 * @returns {Record<string, any>} a hand-built world with `juvenileTicks` 3000
 */
function world(bodies, { tick = T } = {}) {
    const w = {
        tick,
        config: { juvenileTicks: 3000 },
        alive: new Uint8Array(16),
        spec: new Uint8Array(16),
        genomeId: new Uint32Array(16),
        parentA: new Uint32Array(16),
        parentB: new Uint32Array(16),
        ageTicks: new Uint32Array(16),
        x: new Float32Array(16),
        y: new Float32Array(16),
        huntBySpec: HUNT,
    };
    bodies.forEach(({ id, x, y = 0, parents = 0, age = 100, spec = 1 }, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = spec;
        w.genomeId[slot] = id;
        w.parentA[slot] = parents;
        w.parentB[slot] = parents;
        w.ageTicks[slot] = age;
        w.x[slot] = x;
        w.y[slot] = y;
    });
    return w;
}

/**
 * @param {Body[]} bodies the agents alive
 * @param {{tick?: number}} [at] the tick
 * @returns {Record<string, import('../../js/evo/metrics-stats.js').MetricResult>} the metrics after one sample
 */
function measure(bodies, at = {}) {
    const scene = createKinProximityScene(CONFIG);
    sampleKinProximity(scene, world(bodies, at));
    return kinProximityMetrics(scene);
}

describe('the kin-proximity metrics', () => {
    it('give the mean distance to the nearest parent, to the siblings, and their ratio', () => {
        const m = measure([
            { id: 1, x: 0 },
            { id: 2, x: 100, parents: 1 },
            { id: 3, x: 300, parents: 1 },
        ]);
        // child 2: parent 100, sibling 200; child 3: parent 300, sibling 200
        expect(m['eval.juvenile_parent_distance']).toEqual({ value: 200 });
        expect(m['eval.juvenile_sibling_distance']).toEqual({ value: 200 });
        expect(m['eval.juvenile_parent_pull']).toEqual({ value: 1 });
    });

    it('reads a pull above 1 when the juveniles stand nearer their parent than each other', () => {
        const m = measure([
            { id: 1, x: 0 },
            { id: 2, x: 10, parents: 1 },
            { id: 3, x: -10, parents: 1 },
        ]);
        expect(m['eval.juvenile_parent_distance']).toEqual({ value: 10 });
        expect(m['eval.juvenile_sibling_distance']).toEqual({ value: 20 });
        expect(m['eval.juvenile_parent_pull']).toEqual({ value: 2 });
    });

    it('takes the nearer of two living parents and averages over several siblings', () => {
        const w = world([
            { id: 1, x: 0 },
            { id: 9, x: 1000 },
            { id: 2, x: 50, parents: 1 },
            { id: 3, x: 150, parents: 1 },
            { id: 4, x: 250, parents: 1 },
        ]);
        w.parentB.set([0, 0, 9, 9, 9]);
        const scene = createKinProximityScene(CONFIG);
        sampleKinProximity(scene, w);
        const m = kinProximityMetrics(scene);
        // parents: 50, 150, 250 (to slot 0) -> mean 150; siblings: 150, 100, 150 -> mean 400 / 3
        expect(m['eval.juvenile_parent_distance'].value).toBeCloseTo(150, 9);
        expect(m['eval.juvenile_sibling_distance'].value).toBeCloseTo(400 / 3, 9);
    });

    it('uses the one living parent when the other is dead', () => {
        const w = world([
            { id: 1, x: 0 },
            { id: 2, x: 40, parents: 1 },
            { id: 3, x: 60, parents: 1 },
        ]);
        w.parentB.set([0, 77, 77]);
        w.parentA.set([0, 1, 1]);
        const scene = createKinProximityScene(CONFIG);
        sampleKinProximity(scene, w);
        expect(kinProximityMetrics(scene)['eval.juvenile_parent_distance']).toEqual({ value: 50 });
    });

    it('skips a juvenile with no living parent, no sibling, a grown hunter and a non-hunter', () => {
        const m = measure([
            { id: 1, x: 0 },
            { id: 2, x: 100, parents: 1, age: 3000 },
            { id: 3, x: 100, parents: 1, spec: 0 },
            { id: 4, x: 100, parents: 1 },
            { id: 5, x: 100, parents: 99 },
            { id: 6, x: 100, parents: 99 },
        ]);
        expect(m['eval.juvenile_parent_distance'].value).toBeNull();
        expect(m['eval.juvenile_parent_pull'].reason).toMatch(/no juvenile hunter/);
    });

    it('samples only the 1000-tick checkpoints after burn-in', () => {
        const bodies = [
            { id: 1, x: 0 },
            { id: 2, x: 10, parents: 1 },
            { id: 3, x: -10, parents: 1 },
        ];
        expect(measure(bodies, { tick: T + 500 })['eval.juvenile_parent_distance'].value).toBeNull();
        expect(measure(bodies, { tick: BURN_IN_TICKS - 1000 })['eval.juvenile_parent_distance'].value).toBeNull();
        expect(measure(bodies, { tick: T })['eval.juvenile_parent_distance'].value).toBe(10);
    });

    it('pools the juveniles of every checkpoint', () => {
        const scene = createKinProximityScene(CONFIG);
        sampleKinProximity(
            scene,
            world([
                { id: 1, x: 0 },
                { id: 2, x: 10, parents: 1 },
                { id: 3, x: -10, parents: 1 },
            ]),
        );
        sampleKinProximity(
            scene,
            world(
                [
                    { id: 1, x: 0 },
                    { id: 2, x: 30, parents: 1 },
                    { id: 3, x: -30, parents: 1 },
                ],
                { tick: T + 1000 },
            ),
        );
        expect(kinProximityMetrics(scene)['eval.juvenile_parent_distance']).toEqual({ value: 20 });
        expect(kinProximityMetrics(scene)['eval.juvenile_parent_pull']).toEqual({ value: 2 });
    });

    it('names three watch metrics', () => {
        expect(Object.values(KIN_DIRECTIONS)).toEqual(['watch', 'watch', 'watch']);
        expect(Object.keys(kinProximityMetrics(createKinProximityScene(CONFIG)))).toEqual(Object.keys(KIN_DIRECTIONS));
    });
});
