import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../../js/app/actions.js';
import { createCameraController } from '../../js/app/camera.js';
import { followInsight, viewDeps } from '../../js/app/insights-follow.js';

afterEach(() => vi.restoreAllMocks());

/** @returns {{state: ReturnType<typeof createAppState>, camera: any}} the shared state and a camera on a 1000 world */
function app() {
    const camera = createCameraController({
        canvas: { width: 1000, height: 1000 },
        world: { width: 1000, height: 1000 },
    });
    camera.maxZoom = 24;
    return { state: createAppState(), camera };
}

describe('followInsight', () => {
    it('follows a genome the way the F key does, framing the entry zoom, and logs it', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const a = app();
        expect(followInsight(a, { kind: 'record', genomeId: 42, x: 1, y: 2 })).toBe('follow');
        expect(a.state.followId).toBe(42);
        expect(a.camera.targetZoom).toBeGreaterThan(a.camera.zoom);
        expect(info).toHaveBeenCalledWith({
            level: 'info',
            event: 'InsightsFollow',
            kind: 'record',
            done: 'follow',
            genomeId: 42,
        });
    });

    it('glides to the place when there is no genome, and leaves any follow', () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const a = app();
        a.state.followId = 9;
        expect(followInsight(a, { genomeId: 0, x: 200, y: 300 })).toBe('camera');
        expect(a.state.followId).toBe(0);
        expect([a.camera.targetX, a.camera.targetY]).toEqual([200, 300]);
    });

    it('does nothing for a row with neither a genome nor a place', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const a = app();
        a.state.followId = 9;
        expect(followInsight(a, {})).toBe('none');
        expect(followInsight(a, { x: NaN, y: 3 })).toBe('none');
        expect(a.state.followId).toBe(9);
        expect(info).toHaveBeenCalledWith({
            level: 'info',
            event: 'InsightsFollow',
            kind: '',
            done: 'none',
            genomeId: 0,
        });
    });
});

describe('viewDeps', () => {
    it('reads the camera, the frame and the pursuit table from the page, and follows through it', () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const a = app();
        const agents = { count: 0 };
        const page = {
            ...a,
            loop: { agents: () => agents },
            deps: { refs: { player: { flee: { pursuits: { count: 2 } } } } },
        };
        const deps = viewDeps(/** @type {any} */ (page));
        expect(deps.getCamera()).toBe(a.camera);
        expect(deps.getAgents()).toBe(agents);
        expect(deps.getFollowView()).toEqual({ agents, player: page.deps.refs.player });
        expect(deps.getPursuits()).toEqual({ count: 2 });
        const copied = /** @type {string[]} */ ([]);
        vi.stubGlobal('navigator', { clipboard: { writeText: (/** @type {string} */ t) => copied.push(t) } });
        deps.copyText('replay me');
        expect(copied).toEqual(['replay me']);
        vi.unstubAllGlobals();
        deps.followTarget({ genomeId: 5 });
        expect(a.state.followId).toBe(5);
        page.deps.refs.player = /** @type {any} */ (null);
        expect(deps.getPursuits()).toBeNull();
    });
});
