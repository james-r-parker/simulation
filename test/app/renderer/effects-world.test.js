import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { createEffectsPlayer, playEffects } from '../../../js/app/renderer/effects-player.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { playWorldEffect } from '../../../js/app/renderer/effects-world.js';

const kinds = { BORN: 1, DIED: 2, HERD_DIED: 12, DUNG_DROPPED: 13, CALF_BORN: 14, PATCH_WILTED: 15, FIRST_KILL: 16 };

/** @returns {any} a player */
function build() {
    return createEffectsPlayer({
        layout: { effectKinds: kinds, deathCauses: {} },
        info: { callRadius: 1, callTicks: 1, maxAgents: 4 },
    });
}

/**
 * @param {number[]} r `[kind, tick, x, y, a, b, c, d]`
 * @returns {any} a one-record queue
 */
function queue(r) {
    const buffer = new ArrayBuffer(4 * 8 * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    u32.set([r[0], r[1]], 0);
    f32.set([r[2], r[3]], 2);
    u32.set(r.slice(4), 4);
    return { u32, f32, words: 8, start: 0, count: 1 };
}

describe('world effects', () => {
    it('plays each world kind at its position through the player', () => {
        /** @type {Record<number, [number, number]>} */
        const want = {
            12: [CURVE.puffRing, 2],
            14: [CURVE.ring, 1],
            13: [CURVE.puffRing, 2],
            15: [CURVE.moteFall, 6],
            16: [CURVE.ring, 9],
        };
        for (const [kind, [curve, count]] of Object.entries(want)) {
            const player = build();
            playEffects(player, queue([Number(kind), 5, 30, 40, 1, 2048, 2048, 0]), createInterpolated(4), 5);
            expect(player.fx.pool.spawned, `kind ${kind}`).toBe(count);
            expect(player.fx.pool.time[2], `kind ${kind}`).toBe(curve);
            expect(player.fx.pool.pose[0]).toBe(30);
        }
    });

    it('colours the first kill gold and the herd death in earth tones', () => {
        const player = build();
        playEffects(player, queue([16, 5, 0, 0, 1, 0, 0, 0]), createInterpolated(4), 5);
        expect(player.fx.pool.color[0]).toBeCloseTo(PALETTE.milestone[0] * 1.2);
        const herd = build();
        playEffects(herd, queue([12, 5, 0, 0, 1, 0, 0, 0]), createInterpolated(4), 5);
        expect(herd.fx.pool.color[0]).toBeCloseTo(PALETTE.stampedeDust[0] * 30);
    });

    it('leaves any other kind alone', () => {
        const player = build();
        player.effect.kind = 99;
        expect(playWorldEffect(player)).toBe(false);
        expect(player.fx.pool.spawned).toBe(0);
    });
});
