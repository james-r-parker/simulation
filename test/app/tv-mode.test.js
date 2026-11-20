import { describe, expect, it } from 'vitest';
import { createActions, createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { createTvMode } from '../../js/app/tv-mode.js';

/**
 * @param {{minutes?: number}} [options] the idle preference
 * @returns {any} TV mode over fakes, with what it did to them
 */
function setup({ minutes = 5 } = {}) {
    const calls = /** @type {string[]} */ ([]);
    const logs = /** @type {any[]} */ ([]);
    const idle = { ms: 0 };
    const camera = createCameraController({
        canvas: { width: 1920, height: 1080 },
        world: { width: 14400, height: 8100 },
    });
    const state = createAppState();
    const tv = createTvMode({
        driver: { start: () => calls.push('start'), stop: () => calls.push('stop') },
        state,
        camera,
        iface: {
            setTv: (on) => calls.push(`hud ${on ? 'hidden' : 'shown'}`),
            idleMs: () => idle.ms,
            resetIdle: () => (idle.ms = 0),
            tvIdleMinutes: () => minutes,
        },
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
    });
    return { tv, calls, logs, idle, camera, state };
}

describe('createTvMode', () => {
    it('enters from the URL, hands over the director and logs why', () => {
        const { tv, calls, logs } = setup();
        tv.enter('url');
        expect(tv.active()).toBe(true);
        expect(calls).toEqual(['start', 'hud hidden']);
        expect(logs).toEqual([{ level: 'info', event: 'TvEntered', reason: 'url' }]);
        tv.enter('key');
        expect(logs).toHaveLength(1);
    });

    it('toggles with the key and logs both ways', () => {
        const { tv, logs } = setup();
        tv.toggle();
        tv.toggle();
        expect(tv.active()).toBe(false);
        expect(logs.map((/** @type {any} */ l) => [l.event, l.reason])).toEqual([
            ['TvEntered', 'key'],
            ['TvLeft', 'key'],
        ]);
    });

    it('enters after the idle minutes and not before, and never when the preference is 0', () => {
        const { tv, idle, logs } = setup();
        idle.ms = 5 * 60000 - 1;
        tv.tick();
        expect(tv.active()).toBe(false);
        idle.ms = 5 * 60000;
        tv.tick();
        expect(tv.active()).toBe(true);
        expect(logs[0]).toMatchObject({ event: 'TvEntered', reason: 'idle' });
        const off = setup({ minutes: 0 });
        off.idle.ms = 1e9;
        off.tv.tick();
        expect(off.tv.active()).toBe(false);
    });

    it('leaves on any input and restores the camera, the HUD and the idle clock', () => {
        const { tv, calls, camera, state, idle, logs } = setup();
        camera.targetX = 3000;
        camera.targetY = 2000;
        camera.targetZoom = camera.minZoom * 2;
        const pose = { x: camera.targetX, y: camera.targetY, zoom: camera.targetZoom };
        tv.enter('idle');
        camera.targetX = 9000;
        camera.targetZoom = camera.minZoom;
        state.autoSpeed = 240;
        idle.ms = 7 * 60000;
        tv.noteInput({ type: 'pointerdown' });
        expect(tv.active()).toBe(false);
        expect(calls).toEqual(['start', 'hud hidden', 'stop', 'hud shown']);
        expect({ x: camera.targetX, y: camera.targetY, zoom: camera.targetZoom }).toEqual(pose);
        expect(state.autoSpeed).toBe(0);
        expect(idle.ms).toBe(0);
        expect(logs.at(-1)).toMatchObject({ event: 'TvLeft', reason: 'input' });
        tv.tick();
        expect(tv.active()).toBe(false);
    });

    it('does not leave on the TV key itself, so the key toggles instead of leaving then entering', () => {
        const { tv } = setup();
        tv.enter('url');
        tv.noteInput({ type: 'keydown', code: 'KeyT' });
        expect(tv.active()).toBe(true);
        tv.noteInput({ type: 'keydown', code: 'KeyH' });
        expect(tv.active()).toBe(false);
    });

    it('ignores input and leave while it is off', () => {
        const { tv, calls, logs } = setup();
        tv.noteInput({ type: 'wheel' });
        tv.leave('key');
        expect(calls).toEqual([]);
        expect(logs).toEqual([]);
    });

    it('is what the T action calls, and the action does nothing without it', () => {
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const base = {
            getClient: () => null,
            camera,
            state: createAppState(),
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
        };
        let toggled = 0;
        createActions({ ...base, toggleTv: () => toggled++ })('toggleTv');
        expect(toggled).toBe(1);
        expect(() => createActions(base)('toggleTv')).not.toThrow();
    });
});
