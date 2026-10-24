import { describe, expect, it } from 'vitest';
import { createActions, createAppState, NEW_WORLD_CONFIRM_MS, PAN_STEP_PX, ZOOM_STEP } from '../../js/app/actions.js';
import { createCameraController, fitZoom } from '../../js/app/camera.js';

/**
 * @returns {{calls: any[], client: any}} a fake worker client that records every command
 */
function fakeClient() {
    const calls = /** @type {any[]} */ ([]);
    const client = {
        paused: false,
        pause() {
            client.paused = true;
            calls.push(['pause']);
        },
        resume() {
            client.paused = false;
            calls.push(['resume']);
        },
        step: (/** @type {number} */ n) => calls.push(['step', n]),
        setSpeed: (/** @type {number} */ n) => calls.push(['setSpeed', n]),
        select: (/** @type {number} */ id) => calls.push(['select', id]),
        reset: (/** @type {number} */ seed, /** @type {any} */ config) => calls.push(['reset', seed, config]),
    };
    return { calls, client };
}

/**
 * @param {{now?: number}} [options] the clock
 * @returns {{act: (action: string) => void, calls: any[], state: any, camera: any, clock: {now: number},
 *   toasts: string[]}} actions over fakes
 */
function setup({ now = 0 } = {}) {
    const { calls, client } = fakeClient();
    const state = createAppState();
    const camera = createCameraController({
        canvas: { width: 1920, height: 1080 },
        world: { width: 14400, height: 8100 },
    });
    const clock = { now };
    const toasts = /** @type {string[]} */ ([]);
    const act = createActions({
        getClient: () => client,
        camera,
        state,
        now: () => clock.now,
        chooseSeed: () => 99,
        config: { initialAgents: 7 },
        ui: /** @type {any} */ ({ toast: (/** @type {string} */ text) => toasts.push(text) }),
    });
    return { act, calls, state, camera, clock, toasts };
}

describe('createActions', () => {
    it('toggles pause and resume', () => {
        const { act, calls } = setup();
        act('togglePause');
        act('togglePause');
        expect(calls).toEqual([['pause'], ['resume']]);
    });

    it('steps one or ten ticks', () => {
        const { act, calls } = setup();
        act('step');
        act('step10');
        expect(calls).toEqual([
            ['step', 1],
            ['step', 10],
        ]);
    });

    it('moves the speed along the worker choices and stops at the ends', () => {
        const { act, calls, state } = setup();
        act('speedUp');
        expect(state.requestedTicksPerSecond).toBe(120);
        for (let i = 0; i < 10; i++) {
            act('speedUp');
        }
        expect(state.requestedTicksPerSecond).toBe(960);
        for (let i = 0; i < 10; i++) {
            act('speedDown');
        }
        expect(state.requestedTicksPerSecond).toBe(15);
        expect(calls.filter(([type]) => type === 'setSpeed')).toHaveLength(4 + 6);
    });

    it('starts a new world only on a second press within the window', () => {
        const { act, calls, clock, toasts } = setup();
        act('newWorld');
        expect(calls).toEqual([]);
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatch(/again/);
        clock.now = NEW_WORLD_CONFIRM_MS + 1;
        act('newWorld');
        expect(calls).toEqual([]);
        clock.now += 1000;
        act('newWorld');
        expect(calls).toEqual([['reset', 99, { initialAgents: 7 }]]);
        clock.now += 10;
        act('newWorld');
        expect(calls).toHaveLength(1);
    });

    it('clears the selection and the follow, telling the worker', () => {
        const { act, calls, state } = setup();
        state.selectedId = 5;
        state.followId = 5;
        act('clearSelection');
        expect(state).toMatchObject({ selectedId: 0, followId: 0 });
        expect(calls).toEqual([['select', 0]]);
    });

    it('follows the selected agent and releases the follow on a second press', () => {
        const { act, state } = setup();
        state.selectedId = 8;
        act('follow');
        expect(state.followId).toBe(8);
        act('follow');
        expect(state.followId).toBe(0);
    });

    it('pans the view in the direction of the key', () => {
        const { act, camera } = setup();
        const x = camera.targetX;
        const y = camera.targetY;
        camera.zoom = camera.targetZoom = fitZoom(camera.canvas, camera.world) * 2;
        act('panRight');
        expect(camera.targetX).toBeCloseTo(x + PAN_STEP_PX / camera.targetZoom);
        act('panUp');
        expect(camera.targetY).toBeCloseTo(y + PAN_STEP_PX / camera.targetZoom);
        act('panLeft');
        expect(camera.targetX).toBeCloseTo(x);
        act('panDown');
        expect(camera.targetY).toBeCloseTo(y);
    });

    it('zooms in by one step about the centre and homes to the fit', () => {
        const { act, camera } = setup();
        const fit = camera.targetZoom;
        act('zoomIn');
        expect(camera.targetZoom).toBeCloseTo(fit * ZOOM_STEP);
        act('zoomOut');
        act('zoomOut');
        expect(camera.targetZoom).toBeCloseTo(fit / ZOOM_STEP);
        act('home');
        expect(camera.targetZoom).toBeCloseTo(fit);
    });

    it('does nothing to a missing client and throws for an unknown action', () => {
        const state = createAppState();
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const act = createActions({
            getClient: () => null,
            camera,
            state,
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
        });
        expect(() => act('togglePause')).not.toThrow();
        expect(() => act('speedUp')).not.toThrow();
        expect(() => act('explode')).toThrow(/unknown action "explode"/);
    });
});

describe('follow', () => {
    /** @param {() => number} [leaderAgent] @returns {{act: (a: string) => void, state: any}} */
    function withLeader(leaderAgent) {
        const state = createAppState();
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const act = createActions({
            getClient: () => null,
            camera,
            state,
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
            leaderAgent,
        });
        return { act, state };
    }

    it('follows the selected agent, else the leading family largest, and a second press stops', () => {
        const { act, state } = withLeader(() => 77);
        state.selectedId = 5;
        act('follow');
        expect(state.followId).toBe(5);
        act('follow');
        expect(state.followId).toBe(0);
        state.selectedId = 0;
        act('follow');
        expect(state.followId).toBe(77);
        act('follow');
        expect(state.followId).toBe(0);
    });

    it('follows nothing when there is no selection and no leader', () => {
        const { act, state } = withLeader();
        act('follow');
        expect(state.followId).toBe(0);
    });
});

describe('page actions', () => {
    /**
     * @param {boolean} drawerOpen what `closeDrawer` reports
     * @returns {{act: (action: string) => void, calls: string[], state: any}} actions over fake page hooks
     */
    function withUi(drawerOpen) {
        const calls = /** @type {string[]} */ ([]);
        const { client } = fakeClient();
        const state = createAppState();
        state.selectedId = 5;
        const ui = {
            toggleDrawer: (/** @type {string} */ d) => calls.push(`drawer ${d}`),
            closeDrawer: () => (calls.push('closeDrawer'), drawerOpen),
            toggleHud: () => calls.push('hud'),
            toggleAudio: () => calls.push('audio'),
            volumeDown: () => calls.push('volDown'),
            volumeUp: () => calls.push('volUp'),
            toggleWakeLock: () => calls.push('wakeLock'),
            focusSeed: () => calls.push('seed'),
            fullscreen: () => calls.push('fullscreen'),
            exportArchive: () => calls.push('archive'),
            exportBundle: () => calls.push('bundle'),
            lensesChanged: () => calls.push('lenses'),
            toast: (/** @type {string} */ t) => calls.push(`toast ${t}`),
        };
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const act = createActions({
            getClient: () => client,
            camera,
            state,
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
            ui,
        });
        return { act, calls, state };
    }

    it('does nothing for the page actions when the page gives no hooks', () => {
        const { client } = fakeClient();
        const state = createAppState();
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const act = createActions({
            getClient: () => client,
            camera,
            state,
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
        });
        for (const a of [
            'toggleHud',
            'toggleAudio',
            'volumeDown',
            'volumeUp',
            'toggleWakeLock',
            'focusSeed',
            'fullscreen',
            'exportArchive',
            'exportBundle',
        ]) {
            expect(() => act(a), a).not.toThrow();
        }
    });

    it('routes each page action to its hook', () => {
        const { act, calls } = withUi(false);
        for (const a of [
            'toggleCharts',
            'toggleInspector',
            'toggleHelp',
            'toggleHud',
            'toggleAudio',
            'volumeDown',
            'volumeUp',
            'toggleWakeLock',
            'focusSeed',
            'fullscreen',
        ]) {
            act(a);
        }
        act('exportArchive');
        act('exportBundle');
        expect(calls).toEqual([
            'drawer charts',
            'drawer inspector',
            'drawer help',
            'hud',
            'audio',
            'volDown',
            'volUp',
            'wakeLock',
            'seed',
            'fullscreen',
            'archive',
            'bundle',
        ]);
    });

    it('toggles each lens and tells the page', () => {
        const { act, calls, state } = withUi(false);
        act('lens1');
        act('lens4');
        expect(state.lenses).toEqual([true, false, false, true]);
        act('lens1');
        expect(state.lenses).toEqual([false, false, false, true]);
        expect(calls).toEqual(['lenses', 'lenses', 'lenses']);
    });

    it('closes a drawer on Escape and keeps the selection', () => {
        const { act, state } = withUi(true);
        act('escape');
        expect(state.selectedId).toBe(5);
    });

    it('clears the selection on Escape when no drawer is open', () => {
        const { act, state } = withUi(false);
        act('escape');
        expect(state.selectedId).toBe(0);
    });

    it('does nothing for page actions when the page gave no hooks', () => {
        const state = createAppState();
        const camera = createCameraController({ canvas: { width: 10, height: 10 }, world: { width: 10, height: 10 } });
        const act = createActions({
            getClient: () => null,
            camera,
            state,
            now: () => 0,
            chooseSeed: () => 1,
            config: {},
        });
        for (const action of ['toggleCharts', 'escape', 'lens2', 'newWorld']) {
            expect(() => act(action), action).not.toThrow();
        }
    });
});
