import { describe, expect, it } from 'vitest';
import { createReelPart, reelTiles } from '../../js/app/interface-reel.js';
import { AFTER_MS } from '../../js/app/reel-format.js';
import { NOT_SEEN } from '../../js/app/ui/insights-reel.js';
import {
    bumpScene,
    createSceneCounters,
    resetSceneCounters,
    SCENE_AT,
    sceneRows,
} from '../../js/app/scene-counters.js';
import { PREFS_KEY } from '../../js/app/prefs.js';
import { byClass } from './helpers/fake-dom.js';
import { ready, setup } from './helpers/interface-setup.js';

/** A fake `MediaRecorder` that hands over one chunk when started. */
class FakeRecorder {
    constructor() {
        this.ondataavailable = /** @type {any} */ (null);
    }
    start() {
        this.ondataavailable({ data: { size: 1 } });
    }
    stop() {}
}

/** @param {Record<string, any>} [more] deps laid over the fakes @returns {any} the part, its counters and what it did */
function part(more = {}) {
    const scenes = createSceneCounters();
    resetSceneCounters(scenes, ready);
    const followed = /** @type {any[]} */ ([]);
    const clock = { ms: 0 };
    const deps = {
        now: () => clock.ms,
        MediaRecorder: FakeRecorder,
        getCanvas: () => ({ captureStream: () => ({ getTracks: () => [] }) }),
        getCamera: () => ({ x: 3, y: 4, zoom: 2 }),
        state: { followId: 8 },
        followTarget: (/** @type {any} */ t) => followed.push(t),
        reelMode: false,
        ...more,
    };
    return { scenes, followed, clock, reel: createReelPart(deps, scenes) };
}

describe('the reel tiles', () => {
    it('say why a scene has no clip: no signal, not seen, or seen with the clip still to come', () => {
        const scenes = createSceneCounters();
        resetSceneCounters(scenes, ready);
        bumpScene(scenes, SCENE_AT.call, { tick: 10, genome: 5, x: 1, y: 2 });
        const tiles = reelTiles(sceneRows(scenes, 10), () => null);
        const by = (/** @type {string} */ id) => tiles.find((t) => t.id === id);
        expect(by('patch')?.status).toBe('no live signal');
        expect(by('chase')?.status).toBe(NOT_SEEN);
        expect(by('chase')?.live).toBeNull();
        expect(by('call')?.status).toBe('seen, no clip yet');
        expect(by('call')?.live).toEqual({ kind: 'reel', name: "Call, or don't", genomeId: 5, x: 1, y: 2 });
        expect(by('call')?.url).toBeNull();
    });

    it('show the clip of a scene: its tick, its score and its URL', () => {
        const scenes = createSceneCounters();
        resetSceneCounters(scenes, ready);
        bumpScene(scenes, SCENE_AT.call, { tick: 10, genome: 5, x: 1, y: 2 });
        const clip = /** @type {any} */ ({ tick: 10, score: 3, url: 'blob:c' });
        const tile = reelTiles(sceneRows(scenes, 10), (id) => (id === 'call' ? clip : null)).find(
            (t) => t.id === 'call',
        );
        expect(tile).toMatchObject({ status: 'tick 10, 3 in 10 s', url: 'blob:c' });
    });
});

describe('the reel part', () => {
    it('starts the recorder once the canvas exists, and reads the camera and the follow into the reel', () => {
        let canvas = /** @type {any} */ (null);
        const p = part({ getCanvas: () => canvas });
        p.reel.tick(0);
        expect(p.reel.recorder.running()).toBe(false);
        canvas = { captureStream: () => ({ getTracks: () => [] }) };
        p.reel.tick(10);
        expect(p.reel.recorder.running()).toBe(true);
        bumpScene(p.scenes, SCENE_AT.call, { tick: 5, genome: 6, x: 0, y: 0 });
        p.reel.tick(20);
        p.clock.ms = 30;
        expect(p.reel.reel.pending()?.framing).toEqual({ x: 3, y: 4, zoom: 2, followId: 8 });
        p.clock.ms = 20 + AFTER_MS;
        p.reel.tick(20 + AFTER_MS);
        expect(p.reel.reel.clipOf('call')?.tick).toBe(5);
        expect(p.followed).toEqual([]);
    });

    it('starts the recorder once, even where the browser cannot record', () => {
        const p = part({ MediaRecorder: undefined });
        p.reel.tick(0);
        p.reel.tick(10);
        expect(p.reel.recorder.running()).toBe(false);
    });

    it('works before a canvas option exists', () => {
        const p = part({ getCanvas: undefined });
        expect(() => p.reel.tick(0)).not.toThrow();
    });

    it('follows the subject of a moment in reel mode, and not otherwise', () => {
        const p = part({ reelMode: true });
        bumpScene(p.scenes, SCENE_AT.pack, { tick: 5, genome: 6, x: 7, y: 8 });
        p.reel.tick(0);
        expect(p.followed).toEqual([{ kind: 'reel', genomeId: 6, x: 7, y: 8 }]);
        const quiet = part({ followTarget: undefined, reelMode: true });
        bumpScene(quiet.scenes, SCENE_AT.pack, { tick: 5, genome: 6, x: 7, y: 8 });
        expect(() => quiet.reel.tick(0)).not.toThrow();
    });
});

describe('the Reel tab in the interface', () => {
    it('lists a tile per scene and jumps the follow to a live instance when the button is pressed', () => {
        const targets = /** @type {any[]} */ ([]);
        const stored = { [PREFS_KEY]: JSON.stringify({ seen: true, insightsTab: 'reel' }) };
        const { ui, elements } = setup({ stored, deps: { followTarget: (/** @type {any} */ t) => targets.push(t) } });
        ui.listeners.onReady(ready);
        ui.onEffect({ kind: ready.layout.effectKinds.ALARM, tick: 10, x: 4, y: 5, a: 9, b: 0, c: 0, d: 0 });
        ui.hooks.toggleDrawer('insights');
        const tiles = byClass(elements.drawers, 'insights-reel-tile');
        expect(tiles).toHaveLength(15);
        const call = tiles.find((t) => byClass(t, 'insights-heading')[0].textContent === "Call, or don't");
        expect(byClass(call, 'insights-note')[0].textContent).toBe('seen, no clip yet');
        byClass(call, 'insights-reel-live')[0].dispatch('click');
        expect(targets).toEqual([{ kind: 'reel', name: "Call, or don't", genomeId: 9, x: 4, y: 5 }]);
    });

    it('forgets a world`s clips when the next world is ready', () => {
        const { ui } = setup();
        ui.listeners.onReady(ready);
        ui.listeners.onReady(ready);
        expect(ui.reel.reel.clips()).toEqual([]);
    });
});
