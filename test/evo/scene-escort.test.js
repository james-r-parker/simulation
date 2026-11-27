import { describe, expect, it } from 'vitest';
import { ESCAPE_TICKS } from '../../js/sim/merit-state.js';
import { BITTEN_THIS_TICK } from '../../js/evo/observer-intent-episode.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { ESCORT_CLEARANCE } from '../../js/evo/role-budget-escort.js';
import {
    createEscortScene,
    escortDetector,
    escortMetrics,
    RATIO_BIN,
    histogramMedian,
    tickEscort,
} from '../../js/evo/scene-escort.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

const DISTANCE = 'eval.defender_escort_distance';
const RATIO = 'eval.defender_escort_ratio';
const CONFIG = { maxAgents: 5, worldWidth: 1000, worldHeight: 1000 };

/** Slots: 0 a forager victim, 1 a defender, 2 a farther defender, 3 a hunter, 4 a dead defender. */
/** @returns {Record<string, any>} the fixture world */
function makeWorld() {
    return {
        tick: BURN_IN_TICKS,
        alive: Uint8Array.of(1, 1, 1, 1, 0),
        spec: Uint8Array.of(0, 4, 4, 1, 4),
        huntBySpec: Uint8Array.of(0, 1, 0, 0, 0),
        x: Float64Array.of(0, 60, 30, 10, 5),
        y: Float64Array.of(0, 80, 0, 0, 0),
        size: Float64Array.of(10, 8, 8, 12, 8),
        bittenTimer: new Uint8Array(5).fill(255),
    };
}

/** Runs one tick with `victim` bitten this tick (`BITTEN_THIS_TICK`). */
function bite(/** @type {Record<string, any>} */ scene, /** @type {Record<string, any>} */ world, victim = 0) {
    world.bittenTimer[victim] = BITTEN_THIS_TICK;
    tickEscort(scene, world);
    world.bittenTimer[victim] = 255;
}

describe('scene-escort: the opening', () => {
    it('reads the nearest alive defender by centre distance, and the ratio against the calculator gap', () => {
        const world = makeWorld();
        const scene = createEscortScene(CONFIG);
        bite(scene, world);
        // Defender 2 stands 30 px away; 4 is nearer but dead; 1 is 100 px away.
        const m = /** @type {Record<string, any>} */ (escortMetrics(scene));
        expect(m[DISTANCE].value).toBeCloseTo(30.5, 5);
        expect(Math.abs(m[RATIO].value - 30 / (10 + 8 * (1 + ESCORT_CLEARANCE)))).toBeLessThanOrEqual(0.005 + 1e-9);
        expect(scene.read).toBe(1);
    });

    it('keeps the nearer defender when a farther one has the later slot', () => {
        const world = makeWorld();
        world.x[2] = 400;
        const scene = createEscortScene(CONFIG);
        bite(scene, world);
        expect(/** @type {Record<string, any>} */ (escortMetrics(scene))[DISTANCE].value).toBeCloseTo(100.5, 5);
    });

    it('reads one opening per episode, and a new one after ESCAPE_TICKS from the last bite', () => {
        const world = makeWorld();
        const scene = createEscortScene(CONFIG);
        bite(scene, world);
        world.tick += 5;
        bite(scene, world);
        expect(scene.read).toBe(1);
        world.tick += ESCAPE_TICKS - 1;
        tickEscort(scene, world);
        expect(scene.open[0]).toBe(1);
        world.tick += 1;
        tickEscort(scene, world);
        expect(scene.open[0]).toBe(0);
        bite(scene, world);
        expect(scene.read).toBe(2);
    });

    it('opens a fresh episode after the victim died or its slot was freed', () => {
        const world = makeWorld();
        const scene = createEscortScene(CONFIG);
        bite(scene, world);
        escortDetector.onSlotFree?.(scene, 0);
        bite(scene, world);
        expect(scene.read).toBe(2);
    });

    it('reads nothing before burn-in, for a hunter or a defender victim, or a dead one', () => {
        const world = makeWorld();
        const scene = createEscortScene(CONFIG);
        world.tick = BURN_IN_TICKS - 1;
        bite(scene, world);
        world.tick = BURN_IN_TICKS;
        bite(scene, world, 3);
        bite(scene, world, 1);
        world.alive[0] = 0;
        bite(scene, world, 0);
        expect(scene.read + scene.undefended).toBe(0);
    });

    it('counts an opening with no defender alive apart, and reads none', () => {
        const world = makeWorld();
        world.alive.fill(0, 1, 3);
        const scene = createEscortScene(CONFIG);
        bite(scene, world);
        expect(scene.undefended).toBe(1);
        expect(/** @type {Record<string, any>} */ (escortMetrics(scene))[DISTANCE]).toMatchObject({ value: null });
        expect(/** @type {Record<string, any>} */ (escortMetrics(scene))[RATIO]).toMatchObject({ value: null });
    });

    it('reads a distance past 1000 px exactly, up to the world diagonal (10 of 32 seeds saturated a 1000 px cap)', () => {
        const world = makeWorld();
        world.alive.fill(0, 2, 3);
        world.x[1] = 1500;
        world.y[1] = 0;
        const scene = createEscortScene({ maxAgents: 5, worldWidth: 1600, worldHeight: 1200 });
        expect(scene.distance.length).toBe(2001);
        bite(scene, world);
        expect(/** @type {Record<string, any>} */ (escortMetrics(scene))[DISTANCE]).toMatchObject({ value: 1500.5 });
        const ratio = /** @type {Record<string, any>} */ (escortMetrics(scene))[RATIO].value;
        expect(Math.abs(ratio - 1500 / 26)).toBeLessThanOrEqual(RATIO_BIN / 2);
    });
});

describe('scene-escort: the config', () => {
    it('refuses a config without a world size, which sizes the distance histogram', () => {
        expect(() => createEscortScene({ maxAgents: 5 })).toThrow(/worldWidth and worldHeight/);
        expect(() => createEscortScene({ maxAgents: 5, worldWidth: 100, worldHeight: 0 })).toThrow(/worldWidth/);
    });
});

describe('scene-escort: the histogram median', () => {
    it('is within half a bin of the sorted median on a deterministic sequence', () => {
        const bin = 0.5;
        for (const n of [1, 2, 7, 100, 501]) {
            const counts = new Uint32Array(401);
            const values = [];
            let seed = 12345;
            for (let i = 0; i < n; i++) {
                seed = (seed * 1103515245 + 12345) % 2147483648;
                const v = (seed / 2147483648) * 150;
                values.push(v);
                counts[Math.floor(v / bin)] += 1;
            }
            values.sort((a, b) => a - b);
            const naive = values[Math.ceil(n / 2) - 1];
            expect(Math.abs(/** @type {number} */ (histogramMedian(counts, bin)) - naive)).toBeLessThanOrEqual(
                bin / 2 + 1e-9,
            );
        }
    });

    it('is null when empty', () => {
        expect(histogramMedian(new Uint32Array(4), 1)).toBeNull();
    });
});

describe('scene-escort: the registry', () => {
    it('registers both metrics as watch readings', () => {
        expect(namesOf('js/evo/scene-escort.js')).toEqual([DISTANCE, RATIO]);
        expect(directionOf(DISTANCE)).toBe('watch');
        expect(directionOf(RATIO)).toBe('watch');
    });
});
