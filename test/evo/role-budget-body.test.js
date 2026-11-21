import { describe, expect, it } from 'vitest';
import { arenaConfig, ARENA_CENTRE, stageArena } from '../../js/evo/chase-arena.js';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { applyCosts } from '../../js/sim/energy.js';
import { actAll, integrate } from '../../js/sim/physics.js';
import {
    aboveFloor,
    bite,
    charge,
    collide,
    costOf,
    createBody,
    factorOf,
    fatOf,
    mayBite,
    sizeOf,
    speedOf,
    stepBody,
} from '../../js/evo/role-budget-body.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const config = arenaConfig({ sprintStoreEnabled: true, sprintDrain: 0.01 });
const hunter = roleParams(config, 'predator');
const forager = roleParams(config, 'forager');
const at = { x: 0, y: 0, angle: 0 };

describe('createBody', () => {
    it('stands the body at the start energy and size with a full store, along its heading', () => {
        const b = createBody(hunter, { x: 5, y: 6, angle: Math.PI / 2, speed: 8 });
        expect(b.energy).toBe(hunter.energy);
        expect(b.size).toBe(45);
        expect(b.level).toBe(1);
        expect(b.vx).toBeCloseTo(0, 9);
        expect(b.vy).toBeCloseTo(8, 9);
        expect(fatOf(b)).toBe(0.75);
        expect(factorOf(b)).toBe(1);
        expect(aboveFloor(b)).toBe(true);
    });
});

describe('stepBody against the sim', () => {
    /** Runs the sim's own act, integrate and cost phases on one body with the outputs held, and the body alongside. */
    function race(/** @type {any} */ name, /** @type {any} */ out, /** @type {any} */ ticks) {
        const { world } = stageArena(config, [
            { spec: roleParams(config, name).spec === 'forager' ? 0 : 1, ...ARENA_CENTRE, angle: 0 },
        ]);
        const b = createBody(roleParams(config, name, {}, { age: 'juvenile' }), { ...at });
        const o = { turn: out.turn, sprint: out.sprint };
        for (let t = 0; t < ticks; t++) {
            world.outputs[OUTPUT_INDEX.THRUST] = 1;
            world.outputs[OUTPUT_INDEX.TURN] = out.turn;
            world.outputs[OUTPUT_INDEX.SPRINT] = out.sprint > 0 ? 1 : 0;
            // the sim's store step, then act, integrate and costs
            const level = world.sprintStore.level[0];
            world.sprintFactor[0] = level >= world.sprintStore.floor ? 1 : level / world.sprintStore.floor;
            if (out.sprint > 0) {
                world.sprintStore.level[0] = Math.max(0, level - world.sprintStore.drainBySpec[world.spec[0]]);
            }
            actAll(world);
            integrate(world);
            applyCosts(world);
            const factor = stepBody(b, o);
            charge(b, costOf(b, o, factor));
        }
        return { world, b };
    }

    it('moves and pays as the sim does over 120 ticks of a straight sprint, both bodies (a newborn hunter is a juvenile)', () => {
        for (const name of ['forager', 'predator']) {
            const { world, b } = race(name, { turn: 0, sprint: 1 }, 120);
            expect(speedOf(b)).toBeCloseTo(Math.hypot(world.vx[0], world.vy[0]), 2);
            expect(Math.abs(b.x - (world.x[0] - ARENA_CENTRE.x))).toBeLessThan(0.5);
            expect(b.energy).toBeCloseTo(world.energy[0], 2);
            expect(b.level).toBeCloseTo(world.sprintStore.level[0], 9);
        }
    });

    it('turns and pays as the sim does over 60 ticks of a held turn', () => {
        const { world, b } = race('predator', { turn: 1, sprint: 0 }, 60);
        expect(speedOf(b)).toBeCloseTo(Math.hypot(world.vx[0], world.vy[0]), 2);
        expect(b.energy).toBeCloseTo(world.energy[0], 2);
    });
});

describe('stepBody', () => {
    it('drains the store by drain x effort and grades the sprint by the effort', () => {
        const full = createBody(forager, { ...at });
        const half = createBody(forager, { ...at });
        for (let t = 0; t < 60; t++) {
            stepBody(full, { turn: 0, sprint: 1 });
            stepBody(half, { turn: 0, sprint: 0.5 });
        }
        expect(full.level).toBeCloseTo(1 - 60 * 0.01, 9);
        expect(half.level).toBeCloseTo(1 - 60 * 0.005, 9);
        expect(speedOf(full)).toBeGreaterThan(speedOf(half));
        expect(speedOf(half)).toBeGreaterThan(8);
    });

    it('does not move a prey that holds no thrust, and does not drain without a sprint', () => {
        const b = createBody(forager, { ...at });
        stepBody(b, { turn: 0, sprint: 0, thrust: 0 });
        expect(speedOf(b)).toBe(0);
        expect(b.level).toBe(1);
    });

    it('caps the speed, raised by the sprint factor, and wraps the heading', () => {
        const b = createBody(hunter, { ...at, angle: 3.1 });
        for (let t = 0; t < 60; t++) {
            stepBody(b, { turn: 1, sprint: 1 });
        }
        expect(speedOf(b)).toBeLessThanOrEqual(hunter.cap.sprint + 1e-9);
        expect(b.angle).toBeGreaterThanOrEqual(-Math.PI);
        expect(b.angle).toBeLessThan(Math.PI);
        const c = createBody(hunter, { ...at, angle: -3.1 });
        for (let t = 0; t < 5; t++) {
            stepBody(c, { turn: -1, sprint: 0 });
        }
        expect(c.angle).toBeGreaterThan(0);
    });
});

describe('charge and sizeOf', () => {
    it('takes the cost, never below 0, and recomputes the size from the energy', () => {
        const b = createBody(forager, { ...at });
        charge(b, 500);
        expect(b.energy).toBe(500);
        expect(b.size).toBe(sizeOf(b));
        expect(b.size).toBeCloseTo(25 + 500 / 250, 9);
        charge(b, 1e9);
        expect(b.energy).toBe(0);
        expect(b.size).toBe(25);
        expect(b.spent).toBe(1000);
    });
});

describe('collide', () => {
    it('separates two overlapping bodies and takes the approach out of their closing speed', () => {
        const h = createBody(hunter, { x: 0, y: 0, angle: 0, speed: 10 });
        const p = createBody(forager, { x: 60, y: 0, angle: 0, speed: 0 });
        collide(h, p);
        expect(p.x - h.x).toBeCloseTo(h.size + p.size, 9);
        expect(p.vx - h.vx).toBeGreaterThanOrEqual(-1e-9);
    });

    it('moves nothing of the velocities when the bodies are already parting', () => {
        const h = createBody(hunter, { x: 0, y: 0, angle: 0, speed: 1 });
        const p = createBody(forager, { x: 60, y: 0, angle: 0, speed: 5 });
        collide(h, p);
        expect(h.vx).toBe(1 * 1);
        expect(p.vx).toBe(5);
    });

    it('pushes along x for two bodies on the same spot', () => {
        const h = createBody(hunter, { ...at });
        const p = createBody(forager, { ...at });
        collide(h, p);
        expect(p.x).toBeGreaterThan(h.x);
        expect(p.y).toBe(h.y);
    });
});

describe('bite', () => {
    const tally = () => ({ bites: 0, income: 0, kick: 0 });

    it('lands five bites to kill a forager at 1000: 700 back (500 and a 200 gorge), a kick of about 22', () => {
        const h = createBody(hunter, { ...at });
        const p = createBody(forager, { x: 40, y: 0, angle: 0 });
        const t = tally();
        let fatal = false;
        while (!fatal) {
            fatal = bite(h, p, t);
        }
        expect(t.bites).toBe(5);
        expect(t.income).toBeCloseTo(700, 9);
        expect(t.kick).toBeCloseTo(22.25, 0);
        expect(p.energy).toBeCloseTo(300, 9);
    });

    it('lands four bites on a scout (150 each, 760 back) and ten on a defender (50 each)', () => {
        /** @type {[string, number, number][]} */
        const rows = [
            ['scout', 4, 760],
            ['defender', 10, 700],
        ];
        for (const [name, bites, income] of rows) {
            const h = createBody(hunter, { ...at });
            const p = createBody(roleParams(config, name), { x: 40, y: 0, angle: 0 });
            const t = tally();
            while (!bite(h, p, t)) {
                // bite until fatal
            }
            expect([t.bites, Math.round(t.income)]).toEqual([bites, income]);
        }
    });

    it('does not bite a body behind it, outside the jaws', () => {
        const h = createBody(hunter, { ...at });
        const p = createBody(forager, { x: -40, y: 0, angle: 0 });
        const t = tally();
        expect(bite(h, p, t)).toBe(false);
        expect(t.bites).toBe(0);
        expect(p.energy).toBe(forager.energy);
    });

    it('bites from any angle when the arc is a half turn or more', () => {
        const wide = roleParams(arenaConfig({ biteArc: Math.PI }), 'predator');
        const h = createBody(wide, { ...at });
        const p = createBody(forager, { x: -40, y: 0, angle: 0 });
        const t = tally();
        bite(h, p, t);
        expect(t.bites).toBe(1);
    });

    it('stops taking energy at a full store, and a victim already at zero gives nothing', () => {
        const h = createBody(hunter, { ...at });
        h.energy = hunter.sizing.max;
        const p = createBody(forager, { x: 40, y: 0, angle: 0 });
        p.energy = 0;
        const t = tally();
        expect(bite(h, p, t)).toBe(true);
        expect(t.income).toBe(0);
    });
});

describe('mayBite', () => {
    it('reads the size gate as the sizes stand: a victim that shrinks opens a gate refused before', () => {
        const [hunterSet, preySet] = ['predator', 'forager'].map((n) => roleParams(arenaConfig(), n));
        const h = createBody(hunterSet, { x: 0, y: 0, angle: 0 });
        const p = createBody(preySet, { x: 0, y: 0, angle: 0 });
        p.size = (h.size / hunterSet.bite.sizeRatio) * 1.01;
        expect(mayBite(h, p)).toBe(false);
        p.size *= 0.9;
        expect(mayBite(h, p)).toBe(true);
    });
});
