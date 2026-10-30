import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createRng } from '../../js/sim/rng.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { AUDIT_CONTROLLERS, CIRCLE_TURN, NEAR_MISS_PROXIMITY, REVERSE_THRUST } from '../../js/evo/scripted-audit.js';
import { SEEK_THRUST } from '../../js/evo/scripted-parts.js';
import { CH, clearRays, setRay } from './helpers/intent-world.js';

/**
 * @param {number} thrust the thrust output
 * @param {number} turn the turn output
 * @returns {{thrust: number, turn: number, bite: number}} the outputs as the float32 output array holds them
 */
const out = (thrust, turn) => ({ thrust: Math.fround(thrust), turn: Math.fround(turn), bite: 0 });

/**
 * One forager alone in a staged world with every ray clear.
 * @returns {Record<string, any>} the world
 */
function lone() {
    const { world } = stageWorld({
        foods: [],
        rocks: [],
        agents: [{ x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        seed: 1,
    });
    clearRays(world, 0);
    return world;
}

/**
 * @param {string} name a controller of the audit set
 * @param {Record<string, any>} world the world
 * @returns {{thrust: number, turn: number, bite: number}} slot 0's outputs after the controller has run once
 */
function act(name, world) {
    const run = SCRIPTED_CONTROLLERS[/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name)]({
        world,
        rng: createRng(1),
    });
    run(world);
    const row = Array.from(world.outputs.subarray(0, OUTPUT_COUNT));
    return { thrust: row[OUTPUT_INDEX.THRUST], turn: row[OUTPUT_INDEX.TURN], bite: row[OUTPUT_INDEX.BITE] };
}

describe('the audit controllers', () => {
    it('are part of the scripted set', () => {
        for (const name of Object.keys(AUDIT_CONTROLLERS)) {
            expect(SCRIPTED_CONTROLLERS, name).toHaveProperty(name);
        }
    });

    it('patchCircler and patchCirclerRight hold a fixed turn, one each way, whatever is on their rays', () => {
        const world = lone();
        const left = act('patchCircler', world);
        setRay(world, 0, 3, 0.4, CH.FOOD);
        expect(act('patchCircler', world)).toEqual(left);
        expect(left).toEqual(out(SEEK_THRUST, CIRCLE_TURN));
        expect(act('patchCirclerRight', world)).toEqual(out(SEEK_THRUST, -CIRCLE_TURN));
    });

    it('nearMiss steers at food until the hit is nearer than NEAR_MISS_PROXIMITY, then holds still', () => {
        const world = lone();
        setRay(world, 0, 2, NEAR_MISS_PROXIMITY - 0.1, CH.FOOD);
        expect(act('nearMiss', world)).toEqual(out(SEEK_THRUST, 1));
        setRay(world, 0, 2, NEAR_MISS_PROXIMITY + 0.1, CH.FOOD);
        expect(act('nearMiss', world)).toEqual(out(0, 1));
        clearRays(world, 0);
        expect(act('nearMiss', world)).toEqual(out(0, 0));
    });

    it('backingCollider turns to put food on a rear ray, reverses once it is there and holds still without food', () => {
        const world = lone();
        const rear = world.config.rayCount / 2;
        setRay(world, 0, 2, 0.4, CH.FOOD);
        expect(act('backingCollider', world)).toEqual(out(0, -1));
        setRay(world, 0, 2, 0, CH.OTHER);
        setRay(world, 0, world.config.rayCount - 2, 0.4, CH.FOOD);
        expect(act('backingCollider', world)).toEqual(out(0, 1));
        clearRays(world, 0);
        setRay(world, 0, rear, 0.4, CH.FOOD);
        expect(act('backingCollider', world)).toEqual(out(REVERSE_THRUST, 0));
        clearRays(world, 0);
        expect(act('backingCollider', world)).toEqual(out(0, 0));
    });
});
