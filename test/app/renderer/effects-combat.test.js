import { describe, expect, it, vi } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { createDying, isPlaying, positionOf, trackBodies } from '../../../js/app/renderer/dying.js';
import { BITE_DENT, indexOfGenome, playBite, playDeath, tweenAt } from '../../../js/app/renderer/effects-combat.js';
import { createDents, dentAt } from '../../../js/app/renderer/dents.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { createEffectsPlayer, trackDying } from '../../../js/app/renderer/effects-player.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const layout = { effectKinds: {}, deathCauses: { STARVED: 0, EATEN: 1 } };

/**
 * @param {any[]} list agents
 * @returns {import('../../../js/app/interpolate.js').Interpolated} their blended form
 */
function alive(list) {
    const out = createInterpolated(8);
    interpolateInto(null, makeSnapshot(1, list), 1, out);
    return out;
}

describe('indexOfGenome', () => {
    it('finds an alive agent by genome, -1 when gone', () => {
        const agents = alive([
            { slot: 3, genomeId: 30 },
            { slot: 5, genomeId: 50 },
        ]);
        expect(indexOfGenome(agents, 50)).toBe(1);
        expect(indexOfGenome(agents, 7)).toBe(-1);
    });
});

describe('tweenAt', () => {
    it('starts a tween on the agent at the effect tick, and ignores a missing agent or a slot past the tween store', () => {
        const player = createEffectsPlayer({
            layout,
            info: { callRadius: 1, callTicks: 1, maxAgents: 4 },
        });
        player.effect.tick = 12;
        const agents = alive([
            { slot: 2, genomeId: 30 },
            { slot: 6, genomeId: 50 },
        ]);
        tweenAt(player, agents, 0, TWEEN.GULP);
        expect(player.tweens.kind[2]).toBe(TWEEN.GULP);
        expect(player.tweens.start[2]).toBe(12);
        tweenAt(player, agents, 1, TWEEN.GULP);
        tweenAt(player, agents, -1, TWEEN.GULP);
        expect(Array.from(player.tweens.kind)).toEqual([0, 0, TWEEN.GULP, 0]);
    });

    it('names each death cause by number from the layout', () => {
        const player = createEffectsPlayer({
            layout,
            info: { callRadius: 1, callTicks: 1 },
        });
        expect(player.causeNames).toEqual(['STARVED', 'EATEN']);
    });
});

describe('playBite', () => {
    it('dents the victim towards the biter and sends drain motes from the victim to the biter', () => {
        const dents = createDents(8);
        const player = createEffectsPlayer({ layout, info: { callRadius: 1, callTicks: 1, maxAgents: 8 }, dents });
        Object.assign(player.effect, { tick: 40, x: 50, y: 0, a: 30, b: 50 });
        const agents = alive([
            { slot: 1, genomeId: 30, x: 0, y: 0, angle: 0, size: 10 },
            { slot: 2, genomeId: 50, x: 20, y: 0, angle: 0, size: 10 },
        ]);
        playBite(player, agents);
        const out = { angle: 0, depth: 0, width: 0 };
        expect(dentAt(dents, { slot: 2, genome: 50, tick: 40 }, out)).toBe(true);
        expect(out.depth).toBeCloseTo(BITE_DENT);
        expect(Math.cos(out.angle)).toBeLessThan(-0.99);
        const { pool } = player.fx;
        let drains = 0;
        for (let k = 0; k < pool.limit; k++) {
            if (pool.time[k * 4 + 2] === CURVE.drain) {
                drains += 1;
            }
        }
        expect(drains).toBeGreaterThan(0);
    });
});

describe('playDeath', () => {
    it('hands the vanished body its cause, so it plays its death instead of popping out', () => {
        const dying = createDying(8);
        const player = createEffectsPlayer({
            layout: { effectKinds: {}, deathCauses: { STARVED: 0, EATEN: 1 } },
            info: { callRadius: 1, callTicks: 1, maxAgents: 8 },
            dying,
        });
        trackBodies(dying, alive([{ slot: 2, genomeId: 30, x: 5, y: 6 }]), 0);
        trackBodies(dying, alive([]), 16);
        Object.assign(player.effect, { tick: 9, x: 5, y: 6, a: 30, b: 0, c: 1 << 8, d: 1 });
        player.momentCtx.nowMs = 500;
        playDeath(player, alive([]));
        expect(isPlaying(dying, 0)).toBe(true);
        expect(dying.cause[0]).toBe(1);
        expect(dying.start[0]).toBe(500);
    });
});

describe('playDeath particles', () => {
    const layout3 = { effectKinds: {}, deathCauses: { STARVED: 0, EATEN: 1 } };
    const info3 = { callRadius: 1, callTicks: 1, maxAgents: 8 };

    /** @param {ReturnType<typeof createEffectsPlayer>} player a player @returns {import('../../../js/app/renderer/dying.js').Dying} its dying bodies */
    const bodies = (player) => /** @type {any} */ (player.dying);

    /**
     * @param {{size: number, ticksPerMs: number, cause?: number, killer?: boolean}} body the dying body and the rate
     * @returns {ReturnType<typeof createEffectsPlayer>} the player after the death played
     */
    function died({ size, ticksPerMs, cause = 0, killer = false }) {
        const dying = createDying(8);
        const player = createEffectsPlayer({ layout: layout3, info: info3, dying });
        player.fx.budget.ticksPerMs = ticksPerMs;
        trackBodies(dying, alive([{ slot: 2, genomeId: 30, x: 100, y: 50, size, speed: 5 }]), 0);
        const rest = killer ? [{ slot: 3, genomeId: 9, x: 100, y: 150, size: 10 }] : [];
        trackBodies(dying, alive(rest), 16);
        Object.assign(player.effect, { tick: 9, x: 100, y: 50, a: 30, b: killer ? 9 : 0, c: cause << 8, d: 1 });
        player.momentCtx.nowMs = 300;
        playDeath(player, alive(rest));
        return player;
    }

    it('spawn at the body drawn position, not where the record says, and scale with its size', () => {
        const small = died({ size: 10, ticksPerMs: 0.06 });
        const big = died({ size: 30, ticksPerMs: 0.06 });
        const at = positionOf(bodies(small), 0, 300);
        expect(at.x).toBeGreaterThan(100);
        expect(small.fx.pool.pose[0]).toBeCloseTo(at.x);
        expect(small.fx.pool.pose[1]).toBeCloseTo(at.y);
        expect(big.fx.pool.pose[3]).toBeCloseTo(3 * small.fx.pool.pose[3]);
    });

    it('keep wall time: the life in ticks follows the sim speed, so they end with the clip at x8 as at x1', () => {
        const x1 = died({ size: 10, ticksPerMs: 0.06 });
        const x8 = died({ size: 10, ticksPerMs: 0.48 });
        expect(x8.fx.pool.time[1]).toBeCloseTo(8 * x1.fx.pool.time[1]);
    });

    it('starts the eaten body tearing from its killer', () => {
        const player = died({ size: 10, ticksPerMs: 0.06, cause: 1, killer: true });
        expect(bodies(player).bearing[0]).toBeCloseTo(Math.PI / 2);
        const none = died({ size: 10, ticksPerMs: 0.06, cause: 1 });
        expect(bodies(none).bearing[0]).toBe(0);
    });

    it('logs a DeathClip at debug with the cause, the pending wait and the clip length', () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        died({ size: 10, ticksPerMs: 0.06, cause: 1 });
        expect(spy).toHaveBeenCalledWith({
            level: 'debug',
            event: 'DeathClip',
            cause: 'EATEN',
            pendingMs: 284,
            clipMs: 1600,
        });
        spy.mockClear();
        const none = createEffectsPlayer({ layout: layout3, info: info3, dying: createDying(8) });
        Object.assign(none.effect, { tick: 9, x: 7, y: 8, a: 99, b: 0, c: 0, d: 1 });
        playDeath(none, alive([]));
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('plays at the record when no body is drawn', () => {
        const player = createEffectsPlayer({ layout: layout3, info: info3 });
        Object.assign(player.effect, { tick: 9, x: 7, y: 8, a: 30, b: 0, c: 0, d: 1 });
        playDeath(player, alive([]));
        expect(player.fx.pool.pose[0]).toBe(7);
        expect(player.fx.pool.pose[1]).toBe(8);
    });
});

describe('trackDying', () => {
    const layout2 = { effectKinds: {}, deathCauses: { STARVED: 0 } };
    const info2 = { callRadius: 1, callTicks: 1, maxAgents: 8 };

    it('does nothing for a player without dying bodies', () => {
        const player = createEffectsPlayer({ layout: layout2, info: info2 });
        expect(trackDying(player, alive([{ slot: 1, genomeId: 4 }]), 0)).toBe(0);
    });

    it('counts the bodies still dying', () => {
        const dying = createDying(8);
        const player = createEffectsPlayer({ layout: layout2, info: info2, dying });
        trackDying(player, alive([{ slot: 1, genomeId: 4 }]), 0);
        expect(trackDying(player, alive([]), 16)).toBe(1);
    });
});
