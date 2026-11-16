import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import {
    BUMP,
    BUMP_HARD,
    BUMP_MIN_SPEED,
    BUMP_SOFT,
    bumpKind,
    createBumps,
    findBumps,
    MAX_BUMPS,
} from '../../../js/app/renderer/bumps.js';
import { sampleClip } from '../../../js/app/renderer/clip-sampler.js';
import { CH, CLIPS } from '../../../js/app/renderer/clips.js';

describe('bumpKind', () => {
    it('is none under the soft loss, soft up to the hard loss and hard from it', () => {
        expect(bumpKind(1, 1 - BUMP_SOFT + 0.01)).toBe(BUMP.NONE);
        expect(bumpKind(1, 1 - BUMP_SOFT)).toBe(BUMP.SOFT);
        expect(bumpKind(1, 1 - BUMP_HARD + 0.01)).toBe(BUMP.SOFT);
        expect(bumpKind(1, 1 - BUMP_HARD)).toBe(BUMP.HARD);
    });

    it('ignores a body that was not running, and a body that sped up', () => {
        expect(bumpKind(BUMP_MIN_SPEED - 0.01, 0)).toBe(BUMP.NONE);
        expect(bumpKind(0.5, 0.9)).toBe(BUMP.NONE);
    });
});

/**
 * @param {number[]} speeds each agent's speed share
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

describe('findBumps', () => {
    it('needs a previous frame, then reports a running body that lost its speed', () => {
        const state = createBumps(MAX_BUMPS + 8);
        expect(findBumps(frame([0.9, 0.9]), 10, state)).toBe(0);
        expect(findBumps(frame([0.2, 0.9]), 10, state)).toBe(1);
        expect(state.index[0]).toBe(0);
        expect(state.kind[0]).toBe(BUMP.HARD);
        expect(findBumps(frame([0.2, 0.9]), 10, state)).toBe(0);
    });

    it('does not carry a speed over to a new body in the slot', () => {
        const state = createBumps(8);
        findBumps(frame([0.9]), 10, state);
        const next = frame([0.1]);
        next.genomeId[0] = 99;
        expect(findBumps(next, 10, state)).toBe(0);
    });

    it('reports at most MAX_BUMPS in a frame', () => {
        const state = createBumps(MAX_BUMPS + 8);
        const many = Array.from({ length: MAX_BUMPS + 5 }, () => 0.9);
        findBumps(frame(many), 10, state);
        expect(findBumps(frame(many.map(() => 0.1)), 10, state)).toBe(MAX_BUMPS);
    });
});

describe('the bump clips', () => {
    it('squash along the heading and rebound, a hard one more, with no flash', () => {
        for (const [name, least] of [
            ['bump', 0.85],
            ['bumpHard', 0.7],
        ]) {
            let low = 1;
            for (let t = 0; t <= 1; t += 0.02) {
                const rig = sampleClip(/** @type {any} */ (CLIPS)[name], t);
                low = Math.min(low, rig[CH.sx]);
                expect(rig[CH.flash]).toBe(0);
            }
            expect(low).toBeLessThan(0.95);
            expect(low).toBeGreaterThan(least);
            expect(sampleClip(/** @type {any} */ (CLIPS)[name], 1)[CH.sx]).toBe(1);
        }
        const soft = Math.min(...[0.2, 0.25, 0.3].map((t) => sampleClip(CLIPS.bump, t)[CH.sx]));
        const hard = Math.min(...[0.2, 0.22, 0.25].map((t) => sampleClip(CLIPS.bumpHard, t)[CH.sx]));
        expect(hard).toBeLessThan(soft);
    });
});
