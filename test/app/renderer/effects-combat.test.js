import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { createDying, isPlaying, trackBodies } from '../../../js/app/renderer/dying.js';
import { BITE_DENT, indexOfGenome, playBite, playDeath, tweenAt } from '../../../js/app/renderer/effects-combat.js';
import { createDents, dentAt } from '../../../js/app/renderer/dents.js';
import { CURVE } from '../../../js/app/renderer/fx-curves.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
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
