import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createPointerInput } from '../../js/app/pointer-input.js';
import {
    createDoubleTap,
    BROWSER_TIMERS,
    createLongPress,
    DOUBLE_TAP_MS,
    DOUBLE_TAP_PX,
    LONG_PRESS_MS,
    TWO_FINGER_TAP_MS,
} from '../../js/app/touch-gestures.js';

/**
 * @returns {{now: () => number, advance: (ms: number) => void, timers: {set: (run: () => void, ms: number) => number,
 *   clear: (h: unknown) => void}}} a clock and timers that move only when told
 */
function fakeTime() {
    let t = 1000;
    /** @type {Map<number, {at: number, run: () => void}>} */
    const pending = new Map();
    let next = 1;
    return {
        now: () => t,
        advance(ms) {
            t += ms;
            for (const [h, p] of [...pending]) {
                if (p.at <= t) {
                    pending.delete(h);
                    p.run();
                }
            }
        },
        timers: {
            set(run, ms) {
                pending.set(next, { at: t + ms, run });
                return next++;
            },
            clear: (h) => pending.delete(/** @type {number} */ (h)),
        },
    };
}

describe('createDoubleTap', () => {
    it('tells a second tap near the first within the window', () => {
        const time = fakeTime();
        const d = createDoubleTap(time.now);
        expect(d.tap(10, 10)).toBe(false);
        time.advance(DOUBLE_TAP_MS - 1);
        expect(d.tap(10 + DOUBLE_TAP_PX, 10)).toBe(true);
    });

    it('does not pair taps that are late or far apart, and a third tap starts afresh', () => {
        const time = fakeTime();
        const d = createDoubleTap(time.now);
        d.tap(0, 0);
        time.advance(DOUBLE_TAP_MS + 1);
        expect(d.tap(0, 0)).toBe(false);
        expect(d.tap(DOUBLE_TAP_PX + 1, 0)).toBe(false);
        expect(d.tap(DOUBLE_TAP_PX + 1, 0)).toBe(true);
        expect(d.tap(DOUBLE_TAP_PX + 1, 0)).toBe(false);
    });
});

describe('createLongPress', () => {
    it('fires once after the delay and not after a stop', () => {
        const time = fakeTime();
        let fired = 0;
        const p = createLongPress({ timers: time.timers, onFire: () => fired++ });
        p.start();
        time.advance(LONG_PRESS_MS - 1);
        expect(fired).toBe(0);
        time.advance(1);
        expect(fired).toBe(1);
        p.start();
        p.stop();
        time.advance(LONG_PRESS_MS * 2);
        expect(fired).toBe(1);
    });
});

/**
 * @returns {{input: ReturnType<typeof createPointerInput>, camera: any, time: ReturnType<typeof fakeTime>,
 *   picks: number[], presses: number[][]}} an input over one agent at the world centre, with a fake clock
 */
function setup() {
    const camera = createCameraController({ canvas: { width: 200, height: 100 }, world: { width: 200, height: 100 } });
    const agents = {
        count: 1,
        x: new Float32Array([100]),
        y: new Float32Array([50]),
        size: new Float32Array([10]),
        spec: new Uint32Array([0]),
        genomeId: new Uint32Array([77]),
    };
    const time = fakeTime();
    const picks = /** @type {number[]} */ ([]);
    const presses = /** @type {number[][]} */ ([]);
    const input = createPointerInput({
        camera,
        getAgents: () => /** @type {any} */ (agents),
        getMinPx: () => [12],
        onPick: (id) => picks.push(id),
        onLongPress: (id, x, y) => presses.push([id, x, y]),
        now: time.now,
        timers: time.timers,
    });
    return { input, camera, time, picks, presses };
}

/**
 * @param {ReturnType<typeof setup>} s the setup
 * @param {number} x tap x
 * @param {number} y tap y
 * @returns {void}
 */
function touchTap(s, x, y) {
    s.input.down(x, y, 1, true);
    s.input.up(x, y, 1);
}

describe('double tap', () => {
    it('zooms in 2x about the second tap, which does not pick again', () => {
        const s = setup();
        const zoom = s.camera.targetZoom;
        touchTap(s, 150, 20);
        s.time.advance(120);
        touchTap(s, 150, 20);
        expect(s.camera.targetZoom).toBeCloseTo(zoom * 2);
        expect(s.picks).toEqual([0]);
    });

    it('is a touch gesture: two mouse clicks only pick', () => {
        const s = setup();
        const zoom = s.camera.targetZoom;
        s.input.down(100, 50);
        s.input.up(100, 50);
        s.input.down(100, 50);
        s.input.up(100, 50);
        expect(s.camera.targetZoom).toBe(zoom);
        expect(s.picks).toEqual([77, 77]);
    });
});

describe('two-finger tap', () => {
    /**
     * @param {ReturnType<typeof setup>} s the setup
     * @param {number} holdMs how long the fingers stay down
     * @param {number} slide how far the second finger moves, in device px
     * @returns {void}
     */
    function twoFingers(s, holdMs, slide) {
        s.input.down(80, 50, 1, true);
        s.input.down(120, 50, 2, true);
        s.input.move(120 + slide, 50, 2);
        s.time.advance(holdMs);
        s.input.up(80, 50, 1);
        s.input.up(120 + slide, 50, 2);
    }

    it('goes Home and picks nothing', () => {
        const s = setup();
        s.camera.targetZoom *= 3;
        s.camera.targetX += 20;
        twoFingers(s, TWO_FINGER_TAP_MS - 50, 0);
        expect(s.camera.targetZoom).toBeCloseTo(1);
        expect(s.camera.targetX).toBeCloseTo(100);
        expect(s.picks).toEqual([]);
    });

    it('does nothing after a hold or a spread', () => {
        const s = setup();
        s.camera.targetZoom *= 3;
        twoFingers(s, TWO_FINGER_TAP_MS + 50, 0);
        expect(s.camera.targetZoom).toBeGreaterThan(2);
        const spread = setup();
        twoFingers(spread, 50, 30);
        expect(spread.camera.targetZoom).toBeGreaterThan(1);
    });
});

describe('long press', () => {
    it('calls onLongPress for an agent held still and the release picks nothing', () => {
        const s = setup();
        s.input.down(100, 50, 1, true);
        s.time.advance(LONG_PRESS_MS);
        s.input.up(100, 50, 1);
        expect(s.presses).toEqual([[77, 100, 50]]);
        expect(s.picks).toEqual([]);
    });

    it('is cancelled by a drag, a second finger, a lift or a cancel', () => {
        const s = setup();
        s.input.down(100, 50, 1, true);
        s.input.move(130, 50, 1);
        s.time.advance(LONG_PRESS_MS);
        s.input.up(130, 50, 1);
        s.input.down(100, 50, 1, true);
        s.input.down(110, 50, 2, true);
        s.time.advance(LONG_PRESS_MS);
        s.input.cancel(1);
        s.input.cancel(2);
        s.input.down(100, 50, 3, true);
        s.input.cancel(3);
        s.time.advance(LONG_PRESS_MS);
        expect(s.presses).toEqual([]);
    });

    it('does nothing over empty space, and a mouse never long-presses', () => {
        const s = setup();
        s.input.down(5, 5, 1, true);
        s.time.advance(LONG_PRESS_MS);
        s.input.up(5, 5, 1);
        s.input.down(100, 50, 2, false);
        s.time.advance(LONG_PRESS_MS);
        s.input.up(100, 50, 2);
        expect(s.presses).toEqual([]);
    });
});

describe('createDoubleTap reset', () => {
    it('forgets the last tap, so the next one is a first tap again', () => {
        const time = fakeTime();
        const taps = createDoubleTap(time.now);
        expect(taps.tap(10, 10)).toBe(false);
        taps.reset();
        time.advance(50);
        expect(taps.tap(10, 10)).toBe(false);
        time.advance(50);
        expect(taps.tap(10, 10)).toBe(true);
    });
});

describe('BROWSER_TIMERS', () => {
    it('runs a timer on the real clock and a cleared one never fires', async () => {
        let ran = 0;
        const handle = BROWSER_TIMERS.set(() => ran++, 1);
        BROWSER_TIMERS.clear(handle);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(ran).toBe(0);
        await new Promise((resolve) => {
            BROWSER_TIMERS.set(() => {
                ran++;
                resolve(undefined);
            }, 1);
        });
        expect(ran).toBe(1);
    });
});
