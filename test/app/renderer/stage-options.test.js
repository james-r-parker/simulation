import { describe, expect, it } from 'vitest';
import {
    backendOf,
    chooseBackend,
    configureRenderer,
    LOSS_WINDOW_MS,
    lossVerdict,
    MSAA_SAMPLES,
    stageOptions,
} from '../../../js/app/renderer/stage-options.js';

describe('stageOptions', () => {
    it('asks for 4x MSAA, no alpha, depth or stencil, and the high-performance adapter', () => {
        const o = stageOptions({});
        expect(o).toMatchObject({ antialias: true, samples: MSAA_SAMPLES, alpha: false, depth: false, stencil: false });
        expect(o.powerPreference).toBe('high-performance');
        expect(MSAA_SAMPLES).toBe(4);
    });

    it('forces WebGL only for the webgl2 backend and tracks timestamps only with gputime', () => {
        expect(stageOptions({}).forceWebGL).toBe(false);
        expect(stageOptions({ backend: 'webgpu' }).forceWebGL).toBe(false);
        expect(stageOptions({ backend: 'webgl2' }).forceWebGL).toBe(true);
        expect(stageOptions({}).trackTimestamp).toBe(false);
        expect(stageOptions({ gputime: true }).trackTimestamp).toBe(true);
    });
});

describe('chooseBackend', () => {
    it('takes WebGPU on a hardware adapter and WebGL2 on a fallback adapter or none', () => {
        expect(chooseBackend(null, { isFallbackAdapter: false })).toBe('webgpu');
        expect(chooseBackend(null, {})).toBe('webgpu');
        expect(chooseBackend(null, { isFallbackAdapter: true })).toBe('webgl2');
        expect(chooseBackend(null, null)).toBe('webgl2');
    });

    it('lets ?backend= win', () => {
        expect(chooseBackend('webgl2', {})).toBe('webgl2');
        expect(chooseBackend('webgpu', { isFallbackAdapter: true })).toBe('webgpu');
        expect(chooseBackend('nonsense', {})).toBe('webgpu');
    });
});

describe('configureRenderer', () => {
    it('turns colour management and tone mapping off, writes linear output and clears to black at ratio 1', () => {
        const calls = /** @type {any[]} */ ([]);
        const renderer = {
            setClearColor: (/** @type {number} */ c, /** @type {number} */ a) => calls.push(['clear', c, a]),
            setPixelRatio: (/** @type {number} */ r) => calls.push(['ratio', r]),
        };
        const ColorManagement = { enabled: true };
        configureRenderer(renderer, { ColorManagement, NoToneMapping: 0, LinearSRGBColorSpace: 'srgb-linear' });
        expect(ColorManagement.enabled).toBe(false);
        expect(renderer).toMatchObject({ toneMapping: 0, outputColorSpace: 'srgb-linear', autoClear: true });
        expect(calls).toEqual([
            ['clear', 0, 1],
            ['ratio', 1],
        ]);
    });
});

describe('lossVerdict', () => {
    it('rebuilds after a first loss and fails on a second inside the window', () => {
        const state = { lastLossMs: -Infinity };
        expect(lossVerdict(state, 1000)).toBe('rebuild');
        expect(lossVerdict(state, 1000 + LOSS_WINDOW_MS - 1)).toBe('fail');
        expect(lossVerdict(state, 1000 + 3 * LOSS_WINDOW_MS)).toBe('rebuild');
    });
});

describe('backendOf', () => {
    it('names the backend', () => {
        expect(backendOf({ backend: { isWebGPUBackend: true } })).toBe('webgpu');
        expect(backendOf({ backend: { isWebGLBackend: true } })).toBe('webgl2');
    });
});
