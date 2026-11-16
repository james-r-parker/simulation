import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { startTween, TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { MAX_BUMPS } from '../../../js/app/renderer/bumps.js';
import { createDents, dentAt } from '../../../js/app/renderer/dents.js';
import { BUMP_DENT, playBumps } from '../../../js/app/renderer/effects-bumps.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';

/**
 * @param {number[]} speeds each agent speed share
 * @returns {ReturnType<typeof createInterpolated>} agents in slots 0 up, genome 10 up, top speed 10
 */
function frame(speeds) {
    const agents = createInterpolated(MAX_BUMPS + 8);
    agents.count = speeds.length;
    speeds.forEach((s, i) => {
        agents.slot[i] = i;
        agents.genomeId[i] = 10 + i;
        agents.speed[i] = s * 10;
    });
    return agents;
}

describe('playBumps', () => {
    const layout = { effectKinds: {}, deathCauses: { STARVED: 0 } };
    const info = { callRadius: 1, callTicks: 1, maxAgents: MAX_BUMPS + 8, maxVelocity: 10, specs: [] };

    it('squashes the bumped body and puts a faint ripple at its nose, harder for a harder hit', () => {
        const dents = createDents(MAX_BUMPS + 8);
        const player = createEffectsPlayer({ layout, info, dents });
        playBumps(player, frame([0.9, 0.9]), 5);
        const agents = frame([0.5, 0.1]);
        agents.angle[1] = 1;
        expect(playBumps(player, agents, 6)).toBe(2);
        expect(player.tweens.kind[0]).toBe(TWEEN.BUMP);
        expect(player.tweens.kind[1]).toBe(TWEEN.BUMP_HARD);
        const out = { angle: 0, depth: 0, width: 0 };
        expect(dentAt(dents, { slot: 1, genome: 11, tick: 6 }, out)).toBe(true);
        expect(out.angle).toBeCloseTo(1);
        expect(out.depth).toBeCloseTo(BUMP_DENT.hard);
    });

    it('yields to a bite already running on the body', () => {
        const dents = createDents(MAX_BUMPS + 8);
        const player = createEffectsPlayer({ layout, info, dents });
        playBumps(player, frame([0.9]), 5);
        startTween(player.tweens, { slot: 0, genome: 10 }, TWEEN.FLINCH, 5);
        playBumps(player, frame([0.1]), 6);
        expect(player.tweens.kind[0]).toBe(TWEEN.FLINCH);
    });
});
