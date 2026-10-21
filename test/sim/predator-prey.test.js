import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { HUNTER, PREY, createArena, fleeBrain, rayValues, runArena, stillBrain } from './helpers/predator-arena.js';

const KILL_TICKS = 120;
const ESCAPE_TICKS = 200;
const CH_PREY = 3;
const CH_SMOKE = 8;

/**
 * Steps until the prey is gone or the budget ends, counting the ticks it was bitten and the ticks the hunter saw it.
 * @param {Record<string, any>} world the arena
 * @param {{ticks: number, prey: (world: Record<string, any>) => void}} run the prey brain and the tick budget
 * @returns {{bites: number, pursuit: number, diedAt: number}} bite ticks, ticks with the prey in sight and the death tick
 */
function watch(world, { ticks, prey }) {
    const result = { bites: 0, pursuit: 0, diedAt: -1 };
    runArena(world, {
        ticks,
        prey,
        after(w) {
            result.bites += w.alive[PREY] === 1 && w.bittenTimer[PREY] === 1 ? 1 : 0;
            result.pursuit += rayValues(w, HUNTER).some((v, i) => i % RAY_CHANNELS === CH_PREY && v > 0) ? 1 : 0;
            result.diedAt = w.alive[PREY] === 0 ? w.tick : -1;
            return w.alive[PREY] === 0;
        },
    });
    return result;
}

describe('a scripted hunter against a stationary prey', () => {
    it('kills the prey within 120 ticks', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        const { diedAt } = watch(world, { ticks: KILL_TICKS, prey: stillBrain });
        expect(diedAt).toBeGreaterThan(0);
        expect(world.biteEnergy[HUNTER]).toBeGreaterThan(0);
    });

    // The same needs a hunter just over the size margin, which the huntSizeRatio of 1.01 allows.
    it('kills the prey within 120 ticks with a hunter just over the size margin', () => {
        const world = createArena({ gap: 200, hunterEnergy: 1200 });
        const { diedAt } = watch(world, { ticks: KILL_TICKS, prey: stillBrain });
        expect(diedAt).toBeGreaterThan(0);
    });
});

describe('a sprinting prey turning away from the hunter', () => {
    // The hunter only chases a prey in the prey class, which the huntSizeRatio of 1.01 allows at this size margin (900 energy is a size ratio of 1.014).
    it('is not bitten while the hunter, which is just over the size margin, burns its burst', () => {
        const world = createArena({ gap: 200, hunterEnergy: 900, preyHeading: Math.PI / 2 });
        const { bites, pursuit, diedAt } = watch(world, { ticks: ESCAPE_TICKS, prey: fleeBrain(false) });
        expect(bites).toBe(0);
        expect(diedAt).toBe(-1);
        expect(pursuit).toBeGreaterThan(30);
        expect(world.alive[PREY]).toBe(1);
    });
});

describe('smoke released behind a fleeing prey', () => {
    /**
     * @param {boolean} smoke whether the prey releases smoke
     * @returns {number[][]} the nine values of each hunter ray after two ticks
     */
    function hunterRays(smoke) {
        const world = createArena({ gap: 250, hunterEnergy: 2500 });
        runArena(world, { ticks: 2, prey: fleeBrain(smoke) });
        const flat = rayValues(world, HUNTER);
        return Array.from({ length: world.config.rayCount }, (_v, k) =>
            flat.slice(k * RAY_CHANNELS, (k + 1) * RAY_CHANNELS),
        );
    }

    it('shows the hunter the prey on the ray that points at it when there is no smoke', () => {
        const rays = hunterRays(false);
        expect(rays[0][CH_PREY]).toBeGreaterThan(0);
        expect(rays.every((ray) => ray[CH_SMOKE] === 0)).toBe(true);
    });

    it('cuts that ray: it stops at the cloud, with the smoke flag and without the prey', () => {
        const rays = hunterRays(true);
        expect(rays[0][CH_SMOKE]).toBe(1);
        expect(rays.every((ray) => ray[CH_PREY] === 0)).toBe(true);
        expect(rays[0][0]).toBeGreaterThan(0.7);
    });
});

describe('the arena', () => {
    it('starts the hunter and the prey apart with the hunter big enough to bite', () => {
        const world = createArena({ gap: 300, hunterEnergy: 2500 });
        expect(world.x[PREY] - world.x[HUNTER]).toBe(300);
        expect(world.size[HUNTER]).toBeGreaterThan(world.config.huntSizeRatio * world.size[PREY]);
        expect(world.spec[HUNTER]).toBe(1);
        expect(world.spec[PREY]).toBe(0);
    });
});
