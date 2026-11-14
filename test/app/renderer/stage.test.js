import { afterEach, describe, expect, it, vi } from 'vitest';
import { Object3D } from 'three/webgpu';
import { createStage, startRenderer } from '../../../js/app/renderer/stage.js';

/** @returns {any} a renderer stand-in that records calls */
function fakeRenderer() {
    return {
        domElement: {
            style: {},
            removed: false,
            remove() {
                this.removed = true;
            },
        },
        backend: { isWebGPUBackend: true },
        samples: 4,
        sizes: /** @type {number[][]} */ ([]),
        renders: 0,
        disposed: false,
        onDeviceLost: /** @type {any} */ (null),
        setSize(/** @type {number} */ w, /** @type {number} */ h, /** @type {boolean} */ style) {
            this.sizes.push([w, h, style ? 1 : 0]);
        },
        render() {
            this.renders++;
        },
        dispose() {
            this.disposed = true;
        },
    };
}

/** @returns {any} a container stand-in */
function fakeContainer() {
    const children = /** @type {any[]} */ ([]);
    return {
        children,
        appendChild: (/** @type {any} */ c) => children.push(c),
        querySelector: (/** @type {string} */ sel) =>
            children.find((c) => c.className && `.${c.className}` === sel) ?? null,
        ownerDocument: { createElement: () => ({ style: {}, setAttribute() {} }) },
    };
}

/** @param {any[]} log where layer events go @returns {(ctx: any) => any[]} a layer builder making two layers */
function layers(log) {
    return () =>
        ['a', 'b'].map((name) => ({
            object: new Object3D(),
            update: (/** @type {any} */ f) => log.push(['update', name, f.width]),
            resize: (/** @type {number} */ w, /** @type {number} */ h) => log.push(['resize', name, w, h]),
            dispose: () => log.push(['dispose', name]),
        }));
}

const CAMERA = { x: 0, y: 0, zoom: 1, canvas: { width: 100, height: 50 } };

afterEach(() => vi.restoreAllMocks());

describe('createStage', () => {
    it('mounts the layers in order, resizes in device pixels and draws a frame', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const log = /** @type {any[]} */ ([]);
        const renderer = fakeRenderer();
        const stage = await createStage({
            container: fakeContainer(),
            info: {},
            buildLayers: layers(log),
            start: async () => renderer,
        });
        expect(stage.backend).toBe('webgpu');
        expect(
            info.mock.calls.some(([r]) => r.event === 'RendererReady' && r.backend === 'webgpu' && r.samples === 4),
        ).toBe(true);
        stage.resize(3840, 2160);
        expect(renderer.sizes).toEqual([[3840, 2160, 0]]);
        expect(log).toContainEqual(['resize', 'b', 3840, 2160]);
        const frame = /** @type {any} */ ({ camera: CAMERA });
        expect(stage.draw(frame)).toBe(true);
        expect(renderer.renders).toBe(1);
        expect(log).toContainEqual(['update', 'a', 3840]);
    });

    it('rebuilds once on a device loss, fails on a second inside ten seconds', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const log = /** @type {any[]} */ ([]);
        const made = [fakeRenderer(), fakeRenderer()];
        let t = 0;
        const container = fakeContainer();
        const restored = /** @type {any[]} */ ([]);
        const stage = await createStage({
            container,
            info: {},
            buildLayers: layers(log),
            start: async () => /** @type {any} */ (made.shift()),
            now: () => t,
            onRestored: (s) => restored.push(s),
        });
        const first = stage.renderer;
        first.onDeviceLost({ message: 'gone', reason: 'unknown' });
        expect(stage.isLost()).toBe(true);
        expect(stage.draw(/** @type {any} */ ({ camera: CAMERA }))).toBe(false);
        await vi.waitFor(() => expect(restored).toHaveLength(1));
        expect(stage.renderer).not.toBe(first);
        expect(first.domElement.removed).toBe(true);
        expect(stage.isLost()).toBe(false);
        expect(warn.mock.calls.some(([r]) => r.event === 'DeviceLost' && r.reason === 'unknown')).toBe(true);
        t = 5000;
        stage.renderer.onDeviceLost({ message: 'again' });
        expect(error.mock.calls.some(([r]) => r.event === 'RendererFailed')).toBe(true);
        expect(container.children.some((/** @type {any} */ c) => c.className === 'render-failure')).toBe(true);
    });

    it('logs RendererInitFailed, shows the message and rethrows when no renderer starts', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const container = fakeContainer();
        const start = async () => {
            throw new Error('no adapter');
        };
        await expect(createStage({ container, info: {}, buildLayers: layers([]), start })).rejects.toThrow(
            'no adapter',
        );
        expect(error.mock.calls.some(([r]) => r.event === 'RendererInitFailed' && r.message === 'no adapter')).toBe(
            true,
        );
        expect(container.children).toHaveLength(1);
    });

    it('disposes the layers and the renderer', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const log = /** @type {any[]} */ ([]);
        const renderer = fakeRenderer();
        const stage = await createStage({
            container: fakeContainer(),
            info: {},
            buildLayers: layers(log),
            start: async () => renderer,
        });
        stage.dispose();
        expect(log).toContainEqual(['dispose', 'a']);
        expect(renderer.disposed).toBe(true);
    });
});

describe('startRenderer', () => {
    /** @returns {any} a renderer class that records its options */
    function fakeClass() {
        return class {
            /** @param {any} options the options */
            constructor(options) {
                this.options = options;
                this.domElement = { style: { cssText: '' } };
            }
            async init() {}
            setClearColor() {}
            setPixelRatio() {}
        };
    }

    it('picks WebGPU on a hardware adapter and WebGL2 on a fallback adapter or no GPU', async () => {
        const Renderer = fakeClass();
        const hardware = { requestAdapter: async () => ({ info: { isFallbackAdapter: false } }) };
        const fallback = { requestAdapter: async () => ({}) };
        expect((await startRenderer({}, { Renderer, gpu: hardware })).options.forceWebGL).toBe(false);
        expect(
            (
                await startRenderer(
                    {},
                    { Renderer, gpu: { requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) } },
                )
            ).options.forceWebGL,
        ).toBe(true);
        expect(
            (await startRenderer({}, { Renderer, gpu: { requestAdapter: async () => null } })).options.forceWebGL,
        ).toBe(true);
        expect((await startRenderer({ gputime: true }, { Renderer, gpu: null })).options).toMatchObject({
            forceWebGL: true,
            trackTimestamp: true,
        });
        const made = await startRenderer({}, { Renderer, gpu: fallback });
        expect(made.toneMapping).toBe(0);
        expect(made.domElement.style.cssText).toContain('background:#000');
    });
});

describe('the stage after a build', () => {
    it('rebuilds its layers, and fails when a restart cannot start a renderer', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const log = /** @type {any[]} */ ([]);
        let calls = 0;
        const container = fakeContainer();
        const stage = await createStage({
            container,
            info: {},
            buildLayers: layers(log),
            start: async () => {
                calls += 1;
                if (calls > 1) {
                    throw new Error('gone for good');
                }
                return fakeRenderer();
            },
        });
        stage.rebuild();
        expect(log.filter((e) => e[0] === 'dispose')).toHaveLength(2);
        stage.renderer.onDeviceLost({});
        await vi.waitFor(() =>
            expect(error.mock.calls.some(([r]) => r.event === 'RendererFailed' && r.message === 'gone for good')).toBe(
                true,
            ),
        );
    });
});

describe('createStage edges', () => {
    it('logs a loss with no details, and a restart that throws a non-Error', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        let calls = 0;
        const stage = await createStage({
            container: fakeContainer(),
            info: {},
            buildLayers: layers([]),
            start: async () => {
                calls += 1;
                if (calls > 1) {
                    throw 'no device';
                }
                return fakeRenderer();
            },
        });
        stage.renderer.onDeviceLost(undefined);
        expect(warn.mock.calls.some(([r]) => r.event === 'DeviceLost' && r.reason === null && r.message === '')).toBe(
            true,
        );
        await vi.waitFor(() =>
            expect(error.mock.calls.some(([r]) => r.event === 'RendererFailed' && r.message === 'no device')).toBe(
                true,
            ),
        );
    });

    it('starts the real renderer when no start is given, and reports when it cannot', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const container = fakeContainer();
        await expect(createStage({ container, info: {}, buildLayers: layers([]) })).rejects.toBeDefined();
        expect(error.mock.calls.some(([r]) => r.event === 'RendererInitFailed')).toBe(true);
    });
});
