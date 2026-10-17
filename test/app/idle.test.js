import { describe, expect, it } from 'vitest';
import { createIdleTracker, MOVE_THRESHOLD_PX } from '../../js/app/idle.js';

/** @returns {{clock: {t: number}, idle: ReturnType<typeof createIdleTracker>}} a tracker over a fake clock */
function setup() {
    const clock = { t: 0 };
    return { clock, idle: createIdleTracker(() => clock.t) };
}

describe('createIdleTracker', () => {
    it('counts the time since the start, and resets on a key, a press and the wheel', () => {
        const { clock, idle } = setup();
        clock.t = 5000;
        expect(idle.idleMs()).toBe(5000);
        for (const type of /** @type {const} */ (['keydown', 'pointerdown', 'wheel'])) {
            clock.t += 1000;
            expect(idle.input({ type })).toBe(true);
            expect(idle.idleMs()).toBe(0);
        }
    });

    it('ignores a pointer move under the threshold and counts one at or over it', () => {
        const { clock, idle } = setup();
        idle.input({ type: 'pointermove', x: 100, y: 100 });
        clock.t = 2000;
        expect(idle.input({ type: 'pointermove', x: 102, y: 102 })).toBe(false);
        expect(idle.idleMs()).toBe(2000);
        expect(idle.input({ type: 'pointermove', x: 100 + MOVE_THRESHOLD_PX, y: 100 })).toBe(true);
        expect(idle.idleMs()).toBe(0);
    });

    it('measures a move from where the pointer last counted, so a slow drift still counts', () => {
        const { clock, idle } = setup();
        idle.input({ type: 'pointermove', x: 0, y: 0 });
        clock.t = 1000;
        for (let x = 1; x < MOVE_THRESHOLD_PX; x++) {
            expect(idle.input({ type: 'pointermove', x, y: 0 })).toBe(false);
        }
        expect(idle.input({ type: 'pointermove', x: MOVE_THRESHOLD_PX, y: 0 })).toBe(true);
    });

    it('resets without an event', () => {
        const { clock, idle } = setup();
        clock.t = 9000;
        idle.reset();
        expect(idle.idleMs()).toBe(0);
    });
});
