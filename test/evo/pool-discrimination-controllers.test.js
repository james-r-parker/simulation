import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { poolRays } from '../../js/sim/ray-pool.js';
import { senseAll } from '../../js/sim/sensors.js';
import { rebuild } from '../sim/helpers/sense-world.js';
import { flee, followCorridor, seekFood, seekFoodHue, steer } from '../../js/evo/pool-discrimination-controllers.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';

const SUBJECT = { x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 };
const HUNTER = { spec: 1, energy: 1500, angle: 0 };

/**
 * @param {Parameters<typeof stageWorld>[0]} stage the stage
 * @returns {Record<string, any>} the world after one sensing pass and pooling for slot 0
 */
function sensed(stage) {
    const { world } = stageWorld(stage);
    senseAll(world, rebuild(world));
    poolRays(world, 0);
    return world;
}

/**
 * @param {Record<string, any>} world the world
 * @param {(world: Record<string, any>, slot: number, pooled: boolean) => void} act a controller
 * @param {boolean} pooled which sensing it reads
 * @returns {{thrust: number, turn: number, sprint: number}} the subject's outputs
 */
function run(world, act, pooled) {
    act(world, 0, pooled);
    const row = Array.from(world.outputs.subarray(0, OUTPUT_COUNT));
    return { thrust: row[OUTPUT_INDEX.THRUST], turn: row[OUTPUT_INDEX.TURN], sprint: row[OUTPUT_INDEX.SPRINT] };
}

describe('steer', () => {
    it('turns in proportion near the heading, fully when the direction is behind, and not at all dead ahead', () => {
        expect(steer(1, 0)).toBe(0);
        expect(steer(Math.SQRT1_2, 0.1)).toBeGreaterThan(0);
        expect(steer(Math.SQRT1_2, 0.1)).toBeLessThan(1);
        expect(steer(0, 1)).toBe(1);
        expect(steer(-1, -0.01)).toBe(-1);
        expect(steer(-1, 0.01)).toBe(1);
    });
});

describe('seekFood', () => {
    it('aims the same at one food whether it reads the raw rays or the pooled row', () => {
        const world = sensed({ foods: [{ x: 1500, y: 2200 }], rocks: [], agents: [SUBJECT], seed: 1 });
        const raw = run(world, seekFood, false);
        const pooled = run(world, seekFood, true);
        expect(raw.turn).toBeGreaterThan(0);
        expect(pooled).toEqual(raw);
    });
});

describe('seekFoodHue', () => {
    it('uses hue to choose a food on the other side from a nearer positive-hue item', () => {
        const world = sensed({
            foods: [
                { x: 1500, y: 1800, hue: -0.75 },
                { x: 1500, y: 2150, hue: 0.75 },
            ],
            rocks: [],
            agents: [SUBJECT],
            seed: 1,
        });
        for (const pooled of [false, true]) {
            expect(run(world, seekFoodHue, pooled).turn).toBeLessThan(0);
        }
    });

    it('searches without forward thrust when no preferred hue is sensed', () => {
        const world = sensed({ foods: [{ x: 1500, y: 2200, hue: 0.75 }], rocks: [], agents: [SUBJECT], seed: 1 });
        for (const pooled of [false, true]) {
            expect(run(world, seekFoodHue, pooled)).toMatchObject({ thrust: 0, turn: 1 });
        }
    });
});

describe('flee', () => {
    const threats = [
        { ...HUNTER, x: 1500 - 150, y: 2000 + 150 },
        { ...HUNTER, x: 1500 - 150, y: 2000 - 150 },
    ];

    it('runs straight ahead from two threats behind on either side when it reads every ray, and sprints', () => {
        const world = sensed({ foods: [], rocks: [], agents: [SUBJECT, ...threats], seed: 1 });
        const raw = run(world, flee, false);
        expect(Math.abs(raw.turn)).toBeLessThan(0.05);
        expect([raw.thrust, raw.sprint]).toEqual([1, 1]);
    });

    it('runs straight ahead from two equal threats on either side when it reads the pooled row, which keeps both', () => {
        const world = sensed({ foods: [], rocks: [], agents: [SUBJECT, ...threats], seed: 1 });
        expect(Math.abs(run(world, flee, true).turn)).toBeLessThan(0.05);
    });

    it('runs from the much nearer of two threats when it reads the pooled row, which here means a turn', () => {
        const near = [{ ...threats[0], x: 1500 - 100, y: 2000 + 100 }, threats[1]];
        const world = sensed({ foods: [], rocks: [], agents: [SUBJECT, ...near], seed: 1 });
        expect(Math.abs(run(world, flee, true).turn)).toBeGreaterThan(0.2);
    });
});

describe('followCorridor', () => {
    /** @type {{x: number, y: number, r: number}[]} */
    const rocks = [];
    for (let i = 0; i < 5; i++) {
        rocks.push({ x: 1300 + 100 * i, y: 2000 - 130, r: 50 }, { x: 1300 + 100 * i, y: 2000 + 130, r: 50 });
    }

    it('turns away from a rock row that is closer, on both readings, and drives at the passage speed', () => {
        const low = { ...SUBJECT, y: 2000 - 40 };
        const world = sensed({ foods: [], rocks, agents: [low], seed: 1 });
        for (const pooled of [false, true]) {
            const out = run(world, followCorridor, pooled);
            expect(out.turn).toBeGreaterThan(0);
            expect(out.thrust).toBe(0.5);
        }
    });

    it('reads every rock ray when raw: a centred agent sees two rows and does not turn', () => {
        const world = sensed({ foods: [], rocks, agents: [SUBJECT], seed: 1 });
        expect(Math.abs(run(world, followCorridor, false).turn)).toBeLessThan(0.05);
    });
});
