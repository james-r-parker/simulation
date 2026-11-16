import { describe, expect, it } from 'vitest';
import { createInterpolated } from '../../../js/app/interpolate.js';
import { createLineBuffer } from '../../../js/app/renderer/line-buffer.js';
import { MAX_WAKES, pushWake, pushWakes, WAKE_ALPHA, WAKE_FROM, wakeStrength } from '../../../js/app/renderer/wake.js';

const RGB = [1, 0.2, 0.2];

describe('wakeStrength', () => {
    it('is 0 up to WAKE_FROM and 1 at top speed', () => {
        expect(wakeStrength(WAKE_FROM)).toBe(0);
        expect(wakeStrength(0.1)).toBe(0);
        expect(wakeStrength(1)).toBe(1);
        expect(wakeStrength(2)).toBe(1);
    });
});

describe('pushWake', () => {
    it('leaves nothing for a body below the threshold', () => {
        const lines = createLineBuffer(4);
        expect(pushWake(lines, { x: 0, y: 0, angle: 0, size: 10, speed01: 0.4 }, RGB)).toBe(false);
        expect(lines.vertices).toBe(0);
    });

    it('trails two lines behind a body heading +x, fading to nothing and longer when faster', () => {
        const slow = createLineBuffer(4);
        const fast = createLineBuffer(4);
        pushWake(slow, { x: 100, y: 0, angle: 0, size: 10, speed01: 0.7 }, RGB);
        pushWake(fast, { x: 100, y: 0, angle: 0, size: 10, speed01: 1 }, RGB);
        expect(fast.vertices).toBe(4);
        for (const k of [0, 2]) {
            expect(fast.position[k * 3]).toBeLessThan(100);
            expect(fast.position[(k + 1) * 3]).toBeLessThan(fast.position[k * 3]);
            expect(fast.color[k * 4 + 3]).toBeCloseTo(WAKE_ALPHA);
            expect(fast.color[(k + 1) * 4 + 3]).toBe(0);
        }
        expect(fast.position[0] - fast.position[3]).toBeGreaterThan(slow.position[0] - slow.position[3]);
        expect(fast.position[1]).toBeCloseTo(-fast.position[7]);
    });
});

describe('pushWakes', () => {
    /** @returns {{agents: ReturnType<typeof createInterpolated>, rules: any}} */
    function frame(count = 3) {
        const agents = createInterpolated(count + 100);
        agents.count = count;
        for (let i = 0; i < count; i++) {
            agents.size[i] = 10;
            agents.speed[i] = 10;
        }
        agents.spec[1] = 1;
        return { agents, rules: { canHunt: Uint8Array.from([0, 1]), maxVelocity: 10 } };
    }

    it('gives a wake to a running hunter and to marked prey, and to no other body', () => {
        const { agents, rules } = frame();
        const lines = createLineBuffer(8);
        const fleeing = new Uint8Array(8);
        fleeing[2] = 1;
        expect(pushWakes(agents, rules, { lines, fleeing })).toBe(2);
        expect(pushWakes(agents, rules, { lines: createLineBuffer(8), fleeing: null })).toBe(1);
    });

    it('stops at MAX_WAKES', () => {
        const { agents, rules } = frame(MAX_WAKES + 20);
        agents.spec.fill(1);
        const lines = createLineBuffer(MAX_WAKES * 2);
        expect(pushWakes(agents, rules, { lines, fleeing: null })).toBe(MAX_WAKES);
        expect(lines.vertices).toBe(MAX_WAKES * 4);
    });
});
