import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { DRILLS, RING_DISTANCE, RING_RADIUS } from '../../js/evo/drill-scenarios.js';
import { CENTRE_X, CENTRE_Y, FOOD_VIEW_SHARE } from '../../js/evo/memory-probe-scenarios.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';

const byName = (/** @type {string} */ name) => {
    const drill = DRILLS.find((d) => d.name === name);
    if (drill === undefined) {
        throw new Error(`no drill ${name}`);
    }
    return drill;
};
const stream = (/** @type {string} */ name, seed = 1) => fork(createRng(seed), `drill:${name}`);
const dist = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOff = (/** @type {any} */ from, /** @type {any} */ to, /** @type {number} */ heading) => {
    const raw = Math.atan2(to.y - from.y, to.x - from.x) - heading;
    return Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw)));
};

/**
 * @param {string} name a drill
 * @param {any} subject a probe subject
 * @param {number} trials trials to play
 * @returns {number} the wins
 */
function wins(name, subject, trials) {
    const drill = byName(name);
    const rng = stream(name);
    const view = 300;
    let won = 0;
    for (let t = 0; t < trials; t++) {
        const plan = drill.plan(rng, view);
        const spec = subject.spec ?? drill.spec;
        const run = { ...subject, spec };
        won += playTrial({ plan, subject: run, controlSpec: { name: 'intact' }, seed: 1 + t, config: {} }) ? 1 : 0;
    }
    return won;
}

const zeroBrain = () => ({
    name: 'zero',
    id: 7,
    spec: null,
    weights: new Float32Array(brainLayout(createConfig({})).weightCount),
    act: null,
});

describe('DRILLS', () => {
    it('lists the seven drills with a scene each', () => {
        expect(DRILLS.map((d) => d.name)).toEqual([
            'food-ahead',
            'food-behind',
            'two-foods',
            'prey-ahead',
            'prey-too-big',
            'hunter-closing',
            'rock-refuge',
        ]);
        expect(DRILLS.every((d) => d.scene.length > 0)).toBe(true);
        expect(DRILLS.filter((d) => d.needsHunter).map((d) => d.name)).toEqual(['prey-ahead', 'prey-too-big']);
    });

    it('stages the same trial from the same stream and another from another seed', () => {
        for (const drill of DRILLS) {
            const a = drill.plan(stream(drill.name), 300).stage;
            expect(drill.plan(stream(drill.name), 300).stage).toEqual(a);
            expect(drill.plan(stream(drill.name, 2), 300).stage).not.toEqual(a);
        }
    });

    it('keeps every staged thing inside the arena', () => {
        for (const drill of DRILLS) {
            const rng = stream(drill.name);
            for (let t = 0; t < 20; t++) {
                const { stage } = drill.plan(rng, 350);
                for (const p of [...stage.agents, ...stage.foods, ...stage.rocks]) {
                    expect(p.x).toBeGreaterThan(0);
                    expect(p.x).toBeLessThan(3000);
                    expect(p.y).toBeGreaterThan(0);
                    expect(p.y).toBeLessThan(4000);
                }
            }
        }
    });

    it('puts the food ahead within 45 degrees and behind 120 to 180 degrees off the heading', () => {
        for (const [name, low, high] of /** @type {[string, number, number][]} */ ([
            ['food-ahead', 0, 45],
            ['food-behind', 120, 180],
        ])) {
            const rng = stream(name);
            for (let t = 0; t < 30; t++) {
                const { stage } = byName(name).plan(rng, 300);
                const off = (angleOff(stage.agents[0], stage.foods[0], stage.agents[0].angle) * 180) / Math.PI;
                expect(off).toBeGreaterThanOrEqual(low - 1e-6);
                expect(off).toBeLessThanOrEqual(high + 1e-6);
            }
        }
        const { stage } = byName('food-ahead').plan(stream('food-ahead'), 300);
        expect(dist(stage.agents[0], stage.foods[0])).toBeCloseTo(FOOD_VIEW_SHARE * 300, 6);
    });

    it('stages the toxic item nearer than the safe one', () => {
        const { stage } = byName('two-foods').plan(stream('two-foods'), 300);
        const [toxic, safe] = /** @type {any[]} */ (stage.foods);
        expect(toxic.toxicity).toBeGreaterThan(0);
        expect(safe.toxicity).toBe(0);
        expect(dist(stage.agents[0], toxic)).toBeCloseTo(0.4 * 300, 6);
        expect(dist(stage.agents[0], safe)).toBeCloseTo(0.7 * 300, 6);
    });

    it('ends two-foods when one food is gone, and wins only when the toxic one is the one left', () => {
        const plan = byName('two-foods').plan(stream('two-foods'), 300);
        const world = (/** @type {number[]} */ alive, /** @type {number[]} */ tox) => ({
            foodAlive: Uint8Array.from(alive),
            foodTox: Float32Array.from(tox),
        });
        expect(plan.done(/** @type {any} */ (world([1, 1], [1, 0])))).toBe(false);
        expect(plan.done(/** @type {any} */ (world([0, 1], [1, 0])))).toBe(true);
        expect(plan.won(/** @type {any} */ (world([1, 0], [1, 0])))).toBe(true);
        expect(plan.won(/** @type {any} */ (world([0, 1], [1, 0])))).toBe(false);
        expect(plan.won(/** @type {any} */ (world([0, 0], [1, 0])))).toBe(false);
    });

    it('wins the hunter drills on a living subject, and the ring drill only after the subject entered the ring', () => {
        const alive = /** @type {any} */ ({ alive: Uint8Array.of(1) });
        const dead = /** @type {any} */ ({ alive: Uint8Array.of(0) });
        const chase = byName('hunter-closing').plan(stream('hunter-closing'), 300);
        expect([chase.won(alive), chase.won(dead)]).toEqual([true, false]);
        const ring = byName('rock-refuge').plan(stream('rock-refuge'), 300);
        expect([ring.won(alive), ring.won(dead)]).toEqual([false, false]);
    });

    it('stages the hunter 500 px away and the prey of prey-too-big with twice the subject energy', () => {
        const closing = byName('hunter-closing').plan(stream('hunter-closing'), 300).stage;
        expect(dist(closing.agents[0], closing.agents[1])).toBeCloseTo(500, 6);
        const big = byName('prey-too-big').plan(stream('prey-too-big'), 350).stage;
        expect(big.agents[1].energy).toBe(2 * big.agents[0].energy);
    });

    it('builds the refuge ring on the far side of the subject, which starts outside it', () => {
        const { stage } = byName('rock-refuge').plan(stream('rock-refuge'), 300);
        expect(stage.rocks).toHaveLength(8);
        const centre = {
            x: stage.rocks.reduce((sum, r) => sum + r.x, 0) / 8,
            y: stage.rocks.reduce((sum, r) => sum + r.y, 0) / 8,
        };
        expect(dist(centre, { x: CENTRE_X, y: CENTRE_Y })).toBeCloseTo(RING_DISTANCE, 6);
        expect(dist(stage.rocks[0], centre)).toBeCloseTo(RING_RADIUS, 6);
        expect(dist(centre, stage.agents[1])).toBeGreaterThan(RING_DISTANCE);
        expect(RING_DISTANCE).toBeGreaterThan(RING_RADIUS);
    });
});

describe('DRILLS played', () => {
    it('is won on food-ahead by a scripted forager on every trial and by a still brain on none', () => {
        expect(wins('food-ahead', referenceSubject('memoryless'), 8)).toBe(8);
        expect(wins('food-ahead', zeroBrain(), 8)).toBe(0);
    });

    it('is won on food-behind by the scripted forager only when it sees the food on its rear rays', () => {
        expect(wins('food-behind', zeroBrain(), 8)).toBe(0);
        expect(wins('food-behind', referenceSubject('memoryless'), 8)).toBeGreaterThan(0);
    });

    it('scores a still subject as a loss on prey-ahead, a win on prey-too-big, and the chaser the reverse', () => {
        expect(wins('prey-ahead', zeroBrain(), 4)).toBe(0);
        expect(wins('prey-too-big', zeroBrain(), 4)).toBe(4);
        expect(wins('prey-ahead', referenceSubject('memoryless'), 8)).toBeGreaterThan(0);
        expect(wins('prey-too-big', referenceSubject('memoryless'), 8)).toBeLessThan(8);
    });

    it('needs the ring on rock-refuge: a still subject dies or never enters', () => {
        expect(wins('rock-refuge', zeroBrain(), 4)).toBe(0);
    });
});
