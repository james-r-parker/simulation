import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { SCENERY_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { playAtEffect, playCall, playPollinated } from '../../../js/app/renderer/effects-signals.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/** @returns {any} a player */
function build() {
    return createEffectsPlayer({
        layout: { effectKinds: {}, deathCauses: {} },
        info: { callRadius: 200, callTicks: 30, maxAgents: 8 },
    });
}

describe('effects-signals', () => {
    it('an alarm at a living caller sizes its waves to the call radius and throbs the caller', () => {
        const player = build();
        const agents = createInterpolated(8);
        interpolateInto(null, makeSnapshot(1, [{ slot: 4, genomeId: 9, x: 10, y: 20 }]), 1, agents);
        Object.assign(player.effect, { kind: 4, tick: 3, x: 0, y: 0, a: 9 });
        playCall(player, agents, false);
        expect(player.fx.pool.pose[0]).toBe(10);
        expect(player.fx.pool.pose[3]).toBeCloseTo(236);
        expect(player.fx.pool.time[1]).toBe(30);
        expect(player.tweens.kind[4]).toBe(TWEEN.CALL_THROB);
    });

    it('a seeded patch ring stays at scenery luminance while the sprout is lifted', () => {
        const player = build();
        Object.assign(player.effect, { kind: 9, tick: 3, x: 1, y: 2, a: 2048 });
        playPollinated(player);
        const c = player.fx.pool.color;
        const y = 0.2126729 * c[0] + 0.7151522 * c[1] + 0.072175 * c[2];
        expect(y).toBeCloseTo(SCENERY_MAX_LUMINANCE, 4);
        expect(c[4]).toBeCloseTo(c[0] * 40, 3);
    });

    it('a strain and a stampede play at the effect position', () => {
        const player = build();
        Object.assign(player.effect, { kind: 11, tick: 3, x: 7, y: 8 });
        playAtEffect(player, 'strain');
        expect(player.fx.pool.pose[0]).toBe(7);
        expect(player.fx.pool.spawned).toBe(1);
    });
});
