import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { playCrossings } from '../../../js/app/renderer/effects-terrain.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/**
 * @param {Record<string, any>} [terrain] the world's terrain
 * @returns {any} a player
 */
function build(terrain = { wallX: 500 }) {
    return createEffectsPlayer({
        layout: { effectKinds: {}, deathCauses: {} },
        info: { callRadius: 1, callTicks: 1, maxAgents: 8, terrain },
    });
}

/**
 * @param {{genomeId: number, x: number}[]} list agents in slot 1, by frame
 * @returns {import('../../../js/app/interpolate.js').Interpolated[]} one frame per entry
 */
function frames(list) {
    return list.map(({ genomeId, x }) => {
        const out = createInterpolated(8);
        interpolateInto(null, makeSnapshot(1, [{ slot: 1, genomeId, x, y: 70, size: 10 }]), 1, out);
        return out;
    });
}

describe('playCrossings', () => {
    it('lights a shimmer at the wall, at the agent height, when it changes side', () => {
        const player = build();
        const [a, b, c] = frames([
            { genomeId: 3, x: 400 },
            { genomeId: 3, x: 450 },
            { genomeId: 3, x: 560 },
        ]);
        expect(playCrossings(player, a, 0)).toBe(0);
        expect(playCrossings(player, b, 1)).toBe(0);
        expect(playCrossings(player, c, 2)).toBe(1);
        expect([player.fx.pool.pose[0], player.fx.pool.pose[1]]).toEqual([500, 70]);
    });

    it('ignores a new body in a reused slot and a world without a wall', () => {
        const player = build();
        const [a, b] = frames([
            { genomeId: 3, x: 400 },
            { genomeId: 4, x: 600 },
        ]);
        playCrossings(player, a, 0);
        expect(playCrossings(player, b, 1)).toBe(0);
        const open = build({});
        expect(playCrossings(open, a, 0)).toBe(0);
    });
});
