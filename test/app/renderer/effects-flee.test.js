import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { FLEE_KICK_TICKS, playFlee } from '../../../js/app/renderer/effects-flee.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const info = {
    callRadius: 1,
    callTicks: 1,
    maxAgents: 8,
    maxVelocity: 150,
    specs: [
        { index: 0, canHunt: true },
        { index: 1, canHunt: false },
    ],
};

/**
 * @param {number} preySpeed the prey's speed
 * @returns {import('../../../js/app/interpolate.js').Interpolated} a hunter closing on a fleeing prey
 */
function chase(preySpeed) {
    const out = createInterpolated(8);
    interpolateInto(
        null,
        makeSnapshot(1, [
            { slot: 0, genomeId: 1, spec: 0, x: 0, y: 0, angle: 0, size: 20, speed: 100 },
            { slot: 1, genomeId: 2, spec: 1, x: 100, y: 0, angle: 0, size: 10, speed: preySpeed },
        ]),
        1,
        out,
    );
    return out;
}

describe('playFlee', () => {
    it('marks the pursued prey by index and kicks dust behind it once a period when it sprints', () => {
        const player = createEffectsPlayer({ layout: { effectKinds: {}, deathCauses: {} }, info });
        const agents = chase(120);
        expect(playFlee(player, agents, 0)).toBe(1);
        expect(Array.from(player.flee.fleeing.subarray(0, 2))).toEqual([0, 1]);
        expect(player.fx.pool.spawned).toBe(2);
        expect(player.fx.pool.pose[0]).toBeCloseTo(90);
        playFlee(player, agents, FLEE_KICK_TICKS - 1);
        expect(player.fx.pool.spawned).toBe(2);
        playFlee(player, agents, FLEE_KICK_TICKS);
        expect(player.fx.pool.spawned).toBe(4);
    });

    it('marks but does not kick a prey that is fleeing slowly, and clears the mark when the chase ends', () => {
        const player = createEffectsPlayer({ layout: { effectKinds: {}, deathCauses: {} }, info });
        playFlee(player, chase(40), 0);
        expect(player.flee.fleeing[1]).toBe(1);
        expect(player.fx.pool.spawned).toBe(0);
        const calm = createInterpolated(8);
        interpolateInto(null, makeSnapshot(2, [{ slot: 1, genomeId: 2, spec: 1 }]), 1, calm);
        expect(playFlee(player, calm, 1)).toBe(0);
        expect(player.flee.fleeing[0]).toBe(0);
    });
});
