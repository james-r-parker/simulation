import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { createEffectsPlayer, playEdges } from '../../../js/app/renderer/effects-player.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { createRingPool } from '../../../js/app/renderer/rings.js';
import { createSparkPool } from '../../../js/app/renderer/sparks.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const BITS = { ATE_SHIFT: 0, TIMER_MASK: 31, SICK: 1 << 18, INFECTED: 1 << 15, PREGNANT: 1 << 13 };
const layout = { effectKinds: {}, deathCauses: { EATEN: 1 }, flags: BITS };
const info = { callRadius: 1, callTicks: 1, maxAgents: 8, maxFood: 16, worldWidth: 1000, worldHeight: 1000 };

/**
 * @param {any} player the player
 * @param {{tick: number, ate: number, foods: number[][]}} frame the snapshot's tick, the eater's ate timer and the food
 * @returns {void}
 */
function step(player, { tick, ate, foods }) {
    const snapshot = makeSnapshot(tick, [{ slot: 1, genomeId: 5, x: 100, y: 100, angle: 0, size: 10, flags: ate }], {
        foods,
    });
    const agents = createInterpolated(8);
    interpolateInto(null, snapshot, 1, agents);
    playEdges(player, agents, snapshot, tick);
}

/** @returns {any} a player */
function build() {
    return createEffectsPlayer({ rings: createRingPool(), sparks: createSparkPool(1), layout, info });
}

describe('playEdges: meals', () => {
    it('plays meat crumbs from the food the snapshot before showed, into the mouth, and gulps', () => {
        const player = build();
        step(player, { tick: 1, ate: 20, foods: [[130, 100, -6, 0, 0, 0]] });
        expect(player.fx.pool.spawned).toBe(0);
        step(player, { tick: 3, ate: 2, foods: [] });
        const { pool } = player.fx;
        expect(pool.spawned).toBe(7);
        expect(pool.time[2]).toBe(CURVE.crumbIn);
        expect(pool.pose[0]).toBeCloseTo(108);
        expect(pool.move[0]).toBeCloseTo(22);
        expect(pool.color[0]).toBeCloseTo(PALETTE.meat[0]);
        expect(player.tweens.kind[1]).toBe(TWEEN.GULP);
    });

    it('adds a warning pip for a toxic cap and spirals fungus in', () => {
        const toxic = build();
        step(toxic, { tick: 1, ate: 20, foods: [[120, 100, 5, 0, 5, 0]] });
        step(toxic, { tick: 3, ate: 1, foods: [] });
        expect(toxic.fx.pool.time[5 * 4 + 2]).toBe(CURVE.pip);
        const fungus = build();
        step(fungus, { tick: 1, ate: 20, foods: [[120, 100, 5, 0, 4, 0]] });
        step(fungus, { tick: 3, ate: 1, foods: [] });
        expect(fungus.fx.pool.time[2]).toBe(CURVE.orbit);
    });

    it('with no food in reach plays plant crumbs along the heading', () => {
        const player = build();
        step(player, { tick: 1, ate: 20, foods: [] });
        step(player, { tick: 3, ate: 1, foods: [] });
        expect(player.fx.pool.spawned).toBe(5);
    });
});

describe('playEdges: sickness', () => {
    /**
     * @param {any} player the player
     * @param {number[]} flagsByTick the agent's flags each frame
     * @returns {void}
     */
    function run(player, flagsByTick) {
        flagsByTick.forEach((flags, k) => {
            const snapshot = makeSnapshot(k + 1, [{ slot: 2, genomeId: 8, x: 50, y: 50, size: 10, flags }]);
            const agents = createInterpolated(8);
            interpolateInto(null, snapshot, 1, agents);
            playEdges(player, agents, snapshot, k + 1);
        });
    }

    it('bubbles toxin at onset and shakes it off with a sparkle and a tween at recovery', () => {
        const player = build();
        run(player, [30, 30 | BITS.SICK]);
        expect(player.fx.pool.spawned).toBe(6);
        expect(player.fx.pool.time[2]).toBe(CURVE.drop);
        run(player, [30 | BITS.SICK, 30]);
        expect(player.fx.pool.spawned).toBe(10);
        expect(player.tweens.kind[2]).toBe(TWEEN.SHAKE_OFF);
    });

    it('puffs spores when infected and rings the agent in the recovery colour when it clears', () => {
        const player = build();
        run(player, [30, 30 | BITS.INFECTED, 30]);
        expect(player.fx.pool.spawned).toBe(8 + 7);
        expect(player.fx.pool.color[14 * 4]).toBeCloseTo(PALETTE.recover[0] * 0.8);
    });
});
