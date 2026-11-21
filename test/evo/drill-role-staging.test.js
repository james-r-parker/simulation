import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { ARENA_CENTRE, ARENA_HEIGHT, ARENA_WIDTH } from '../../js/evo/chase-arena.js';
import { ROLE_ARENA, SLOT, creeping, paramsOf, perWorld, turned } from '../../js/evo/drill-role-staging.js';

describe('turned', () => {
    it('puts the scene frame at the arena centre, turned to the heading', () => {
        expect(turned(0, { x: 100, y: 30 })).toEqual({ x: ARENA_CENTRE.x + 100, y: ARENA_CENTRE.y + 30 });
        const quarter = turned(Math.PI / 2, { x: 100, y: 30 });
        expect(quarter.x).toBeCloseTo(ARENA_CENTRE.x - 30, 6);
        expect(quarter.y).toBeCloseTo(ARENA_CENTRE.y + 100, 6);
    });
});

describe('ROLE_ARENA', () => {
    it('is the chase arena world with the rules the stage world switches off put back to the defaults', () => {
        const defaults = createConfig();
        expect(ROLE_ARENA).toMatchObject({ worldWidth: ARENA_WIDTH, worldHeight: ARENA_HEIGHT });
        expect(ROLE_ARENA.grazeThrust).toBe(defaults.grazeThrust);
        expect(ROLE_ARENA.fatSlowShare).toBe(defaults.fatSlowShare);
        expect(ROLE_ARENA.specMutationRate).toBe(defaults.specMutationRate);
        expect(Object.isFrozen(ROLE_ARENA)).toBe(true);
    });
});

describe('paramsOf', () => {
    it('reads the body numbers of each named specialisation', () => {
        const [hunter, scout] = paramsOf(createConfig(), 'predator', 'scout');
        expect([hunter.spec, scout.spec]).toEqual(['predator', 'scout']);
        expect(hunter.cap.cruise).toBeGreaterThan(0);
    });
});

describe('creeping', () => {
    it('starts the hunter at its cruise speed along its heading on the first tick only', () => {
        const world = { tick: 0, vx: [0, 0, 0], vy: [0, 0, 0] };
        let calls = 0;
        const brain = creeping(() => calls++, { cruise: 8, angle: Math.PI / 2 });
        brain(world);
        expect(world.vx[SLOT.HUNTER]).toBeCloseTo(0, 6);
        expect(world.vy[SLOT.HUNTER]).toBeCloseTo(8, 6);
        world.vy[SLOT.HUNTER] = 3;
        world.tick = 1;
        brain(world);
        expect(world.vy[SLOT.HUNTER]).toBe(3);
        expect(calls).toBe(2);
    });
});

describe('perWorld', () => {
    it('builds a fresh brain for each new world and keeps it while the world is the same', () => {
        let built = 0;
        const act = perWorld(() => {
            const id = ++built;
            return (/** @type {any} */ world) => world.seen.push(id);
        });
        const a = { seen: /** @type {number[]} */ ([]) };
        const b = { seen: /** @type {number[]} */ ([]) };
        act(a);
        act(a);
        act(b);
        expect([a.seen, b.seen]).toEqual([[1, 1], [2]]);
    });
});
