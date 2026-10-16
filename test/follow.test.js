import { describe, expect, it } from 'vitest';
import { createFollower } from '../scripts/lib/follow.mjs';

/**
 * @returns {{records: any[], follower: import('../scripts/lib/follow.mjs').Follower}}
 */
function setup() {
    /** @type {any[]} */
    const records = [];
    const log = {
        level: /** @type {const} */ ('info'),
        log: (/** @type {any} */ level, /** @type {any} */ event, /** @type {any} */ f) =>
            records.push({ level, event, ...f }),
    };
    return { records, follower: createFollower(log, 7) };
}

/** @returns {Record<string, any>} a two-slot world with genome 7 in slot 1 */
function twoSlotWorld() {
    return {
        tick: 0,
        layout: { outputCount: 2 },
        alive: Uint8Array.of(1, 1),
        genomeId: Uint32Array.of(3, 7),
        x: Float32Array.of(0, 5),
        y: Float32Array.of(0, 6),
        energy: Float64Array.of(1, 50),
        outputs: Float32Array.of(0, 0, 0.5, -0.5),
    };
}

describe('createFollower', () => {
    it('samples the right slot on multiples of 10 only', () => {
        const world = twoSlotWorld();
        const { records, follower } = setup();
        for (world.tick = 1; world.tick <= 20; world.tick++) {
            follower.update(world);
        }

        expect(records).toEqual([
            {
                level: 'info',
                event: 'FollowSample',
                tick: 10,
                genomeId: 7,
                x: 5,
                y: 6,
                energy: 50,
                outputs: [0.5, -0.5],
            },
            {
                level: 'info',
                event: 'FollowSample',
                tick: 20,
                genomeId: 7,
                x: 5,
                y: 6,
                energy: 50,
                outputs: [0.5, -0.5],
            },
        ]);
    });

    it('reports a death on the tick it happens, including a slot reused by another genome', () => {
        const world = twoSlotWorld();
        const { records, follower } = setup();
        world.tick = 10;
        follower.update(world);
        world.tick = 11;
        world.genomeId[1] = 9;
        follower.update(world);
        world.tick = 20;
        follower.update(world);
        follower.finish(world);

        expect(records.map((r) => r.event)).toEqual(['FollowSample', 'FollowEnded']);
        expect(records[1]).toMatchObject({ tick: 11, reason: 'died' });
    });
});
