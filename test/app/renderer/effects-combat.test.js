import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { indexOfGenome, tweenAt } from '../../../js/app/renderer/effects-combat.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { createRingPool } from '../../../js/app/renderer/rings.js';
import { createSparkPool } from '../../../js/app/renderer/sparks.js';
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
            rings: createRingPool(),
            sparks: createSparkPool(1),
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
            rings: createRingPool(),
            sparks: createSparkPool(1),
            layout,
            info: { callRadius: 1, callTicks: 1 },
        });
        expect(player.causeNames).toEqual(['STARVED', 'EATEN']);
    });
});
