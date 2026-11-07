import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import {
    createMomentLog,
    FOCUS_MAX_AGE_MS,
    FOCUS_ZOOM,
    focusLast,
    MOMENT_LOG_SIZE,
    newestMoment,
    noteMoment,
} from '../../../js/app/director/moment-log.js';
import { EFFECT_BITS } from '../../../js/app/director/scoring.js';

const CTX = { kinds: { DIED: 2, SMOKE: 6, STAMPEDE: 10, FIRST_KILL: 16 }, eatenCause: 1, trampled: 5, nowMs: 1000 };
const kill = (/** @type {number} */ x) => ({ kind: 2, tick: 0, x, y: 7, c: (1 << 8) | EFFECT_BITS.DIED_DELIBERATE });

describe('the moment log', () => {
    it('keeps notable moments and skips the rest', () => {
        const log = createMomentLog();
        expect(noteMoment(log, kill(5), CTX)).toBe(true);
        expect(noteMoment(log, { kind: 2, tick: 0, x: 0, y: 0, c: 0 }, CTX)).toBe(false);
        expect(noteMoment(log, { kind: 16, tick: 0, x: 9, y: 9, c: 0 }, CTX)).toBe(true);
        expect(log.count).toBe(2);
        expect(log.kind[newestMoment(log)]).toBe('first-kill');
    });

    it('rings at MOMENT_LOG_SIZE, newest last', () => {
        const log = createMomentLog();
        expect(newestMoment(log)).toBe(-1);
        for (let i = 0; i < MOMENT_LOG_SIZE + 3; i++) {
            noteMoment(log, kill(i), CTX);
        }
        expect(log.count).toBe(MOMENT_LOG_SIZE);
        expect(log.x[newestMoment(log)]).toBe(MOMENT_LOG_SIZE + 2);
    });

    it('focusLast glides to the newest recent moment and ignores a stale or empty log', () => {
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 100, height: 100 }),
            world: { width: 1000, height: 1000 },
        });
        const log = createMomentLog();
        expect(focusLast(log, camera, 0)).toBe(false);
        expect(focusLast(null, camera, 0)).toBe(false);
        noteMoment(log, kill(300), CTX);
        expect(focusLast(log, camera, 1000 + FOCUS_MAX_AGE_MS + 1)).toBe(false);
        expect(focusLast(log, camera, 2000)).toBe(true);
        expect([camera.targetX, camera.targetY]).toEqual([300, 7]);
        expect(camera.targetZoom).toBeGreaterThanOrEqual(FOCUS_ZOOM);
    });

    it('logs a trampling, and keeps the same arrays over 10000 notes', () => {
        const log = createMomentLog();
        const arrays = [log.x, log.y, log.atMs, log.kind];
        expect(noteMoment(log, { kind: 2, tick: 0, x: 1, y: 1, c: 5 << 8 }, CTX)).toBe(true);
        expect(log.kind[newestMoment(log)]).toBe('trample');
        for (let i = 0; i < 10000; i++) {
            noteMoment(log, kill(i), CTX);
        }
        expect([log.x, log.y, log.atMs, log.kind]).toEqual(arrays);
        arrays.forEach((a, i) => expect([log.x, log.y, log.atMs, log.kind][i]).toBe(a));
        expect(log.kind.length).toBe(MOMENT_LOG_SIZE);
    });
});
