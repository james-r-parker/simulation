import { describe, expect, it } from 'vitest';
import { createEffectStores, effectStoreBytes } from '../../../js/app/pack/effect-stores.js';
import { startTween, TWEEN, tweenAge } from '../../../js/app/renderer/body-tweens.js';
import { dentAt, startDent } from '../../../js/app/renderer/dents.js';
import { beginDeath, trackBodies } from '../../../js/app/renderer/dying.js';
import { createInterpolated } from '../../../js/app/interpolate.js';

describe('effect stores', () => {
    it('are lanes of one buffer, so a second view of it sees what the first writes', () => {
        const memory = new SharedArrayBuffer(effectStoreBytes(8));
        const main = createEffectStores(memory, 8);
        const worker = createEffectStores(memory, 8);
        startDent(main.dents, { slot: 2, genome: 7 }, { angle: 1, depth: 0.3, tick: 5 });
        startTween(main.tweens, { slot: 1, genome: 4 }, TWEEN.GULP, 5);
        const out = { angle: 0, depth: 0, width: 0 };
        expect(dentAt(worker.dents, { slot: 2, genome: 7, tick: 5 }, out)).toBe(true);
        expect(out.angle).toBeCloseTo(1);
        expect(tweenAge(worker.tweens, 1, 4, 5)).toBe(0);
        const agents = createInterpolated(8);
        agents.count = 1;
        agents.slot[0] = 3;
        agents.genomeId[0] = 9;
        trackBodies(main.dying, agents, 10);
        agents.count = 0;
        trackBodies(main.dying, agents, 20);
        expect(beginDeath(worker.dying, { genome: 9, cause: 0, nowMs: 30 })).toBe(true);
        expect(main.dying.state.some((s) => s !== 0)).toBe(true);
    });

    it('refuses a buffer of the wrong size', () => {
        expect(() => createEffectStores(new SharedArrayBuffer(16), 8)).toThrow(/expected/);
    });
});
