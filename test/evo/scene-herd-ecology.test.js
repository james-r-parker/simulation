import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { countSeedlings, samplePatchHerdFollowing } from '../../js/evo/scene-herd-ecology.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';

function followScene() {
    return {
        followPatchSerial: Uint32Array.of(0xffffffff),
        followHerdedBlobs: new Float64Array(1),
        followBareBlobs: new Float64Array(1),
        followHerdedTicks: new Uint32Array(1),
        followBareTicks: new Uint32Array(1),
    };
}

function followWorld() {
    return {
        config: { foodPatchRadius: 100 },
        patchAlive: Uint8Array.of(1),
        patchSerial: Uint32Array.of(3),
        patchX: Float64Array.of(0),
        patchY: Float64Array.of(0),
        alive: Uint8Array.of(1),
        x: Float64Array.of(50),
        y: Float64Array.of(0),
        herdAlive: Uint8Array.of(1),
        herdX: Float64Array.of(0),
        herdY: Float64Array.of(0),
    };
}

describe('herd ecology sampling', () => {
    it('samples patch blob counts separately with and without nearby herds', () => {
        const scene = followScene();
        const world = followWorld();
        samplePatchHerdFollowing(scene, world);
        world.herdX[0] = 1000;
        samplePatchHerdFollowing(scene, world);
        expect(scene.followPatchSerial[0]).toBe(3);
        expect(scene.followHerdedBlobs[0]).toBe(1);
        expect(scene.followBareBlobs[0]).toBe(1);
        expect(scene.followHerdedTicks[0]).toBe(1);
        expect(scene.followBareTicks[0]).toBe(1);
    });

    it('ignores a dead blob, a dead herd animal and a dead patch', () => {
        const scene = followScene();
        const world = followWorld();
        world.alive = Uint8Array.of(0, 1);
        world.x = Float64Array.of(10, 50);
        world.y = Float64Array.of(0, 0);
        world.herdAlive = Uint8Array.of(0);
        samplePatchHerdFollowing(scene, world);
        expect([scene.followBareBlobs[0], scene.followBareTicks[0], scene.followHerdedTicks[0]]).toEqual([1, 1, 0]);
        world.patchAlive[0] = 0;
        samplePatchHerdFollowing(scene, world);
        expect(scene.followBareTicks[0]).toBe(1);
    });

    it('counts HerdSeeded events only after burn-in', () => {
        const scene = { herdSeededPatches: 0 };
        const data = new Float64Array(EVENT_STRIDE * 2);
        data[0] = EVENT_TYPE.HERD_SEEDED;
        data[1] = BURN_IN_TICKS;
        data[EVENT_STRIDE] = EVENT_TYPE.HERD_SEEDED;
        data[EVENT_STRIDE + 1] = BURN_IN_TICKS + 1;
        countSeedlings(scene, { events: { data, count: 2 } });
        expect(scene.herdSeededPatches).toBe(1);
    });
});
