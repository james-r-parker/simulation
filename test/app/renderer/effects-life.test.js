import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { createEffectsPlayer, playEdges } from '../../../js/app/renderer/effects-player.js';
import { bornNamesOf } from '../../../js/app/renderer/effects-life.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const BITS = { ATE_SHIFT: 0, TIMER_MASK: 31, PREGNANT: 1 << 13, SICK: 1 << 18, INFECTED: 1 << 15 };

describe('bornNamesOf', () => {
    it('names each birth cause by number, and copes with no table', () => {
        expect(bornNamesOf({ INITIAL: 0, MATE: 1, SPLIT: 2 })).toEqual(['INITIAL', 'MATE', 'SPLIT']);
        expect(bornNamesOf(/** @type {any} */ (undefined))).toEqual([]);
    });
});

describe('a pregnancy edge', () => {
    it('rings the mother in the courtship colour once, when the pregnant bit rises', () => {
        const player = createEffectsPlayer({
            layout: { effectKinds: {}, deathCauses: {}, flags: BITS },
            info: { callRadius: 1, callTicks: 1, maxAgents: 8, maxFood: 4, worldWidth: 100, worldHeight: 100 },
        });
        for (const [tick, flags] of [
            [1, 30],
            [2, 30 | BITS.PREGNANT],
            [3, 30 | BITS.PREGNANT],
        ]) {
            const snapshot = makeSnapshot(tick, [{ slot: 1, genomeId: 5, x: 40, y: 50, size: 10, flags }]);
            const agents = createInterpolated(8);
            interpolateInto(null, snapshot, 1, agents);
            playEdges(player, agents, snapshot, tick);
        }
        const { pool } = player.fx;
        expect(pool.spawned).toBe(1);
        expect(pool.time[2]).toBe(CURVE.ringSlow);
        expect(pool.pose[0]).toBe(40);
        expect(pool.color[0]).toBeCloseTo(PALETTE.courtship[0] * 0.8);
    });
});
