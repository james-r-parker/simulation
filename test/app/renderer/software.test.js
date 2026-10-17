import { describe, expect, it } from 'vitest';
import {
    isSoftwareRenderer,
    rendererName,
    scaledSize,
    SOFTWARE_RENDER_SCALE,
} from '../../../js/app/renderer/software.js';

const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const NVIDIA = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x00002B85) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const AMD = 'ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)';

describe('isSoftwareRenderer', () => {
    it('matches the software rasterisers browsers fall back to', () => {
        for (const name of [
            SWIFTSHADER,
            'llvmpipe (LLVM 15.0.7, 256 bits)',
            'softpipe',
            'Mesa Software Rasterizer',
            'Microsoft Basic Render Driver',
            'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)',
            'SWIFTSHADER',
        ]) {
            expect(isSoftwareRenderer(name), name).toBe(true);
        }
    });

    it('does not match a GPU', () => {
        for (const name of [NVIDIA, AMD, 'Apple M2 Max', 'ANGLE (Intel, Mesa Intel(R) Arc(tm) A770, OpenGL 4.6)']) {
            expect(isSoftwareRenderer(name), name).toBe(false);
        }
    });

    it('treats a missing string as hardware', () => {
        expect(isSoftwareRenderer('')).toBe(false);
        expect(isSoftwareRenderer(null)).toBe(false);
        expect(isSoftwareRenderer(undefined)).toBe(false);
    });
});

describe('rendererName', () => {
    const make = (/** @type {any} */ info, /** @type {unknown} */ unmasked, /** @type {unknown} */ plain) => ({
        RENDERER: 7937,
        getExtension: () => info,
        getParameter: (/** @type {number} */ p) => (p === 7937 ? plain : unmasked),
    });

    it('reads the unmasked renderer when the extension is there', () => {
        expect(rendererName(make({ UNMASKED_RENDERER_WEBGL: 37446 }, SWIFTSHADER, 'WebKit WebGL'))).toBe(SWIFTSHADER);
    });

    it('falls back to the plain renderer string without the extension', () => {
        expect(rendererName(make(null, 'x', 'llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(
            'llvmpipe (LLVM 15.0.7, 256 bits)',
        );
    });

    it('returns an empty string without a context or a string', () => {
        expect(rendererName(null)).toBe('');
        expect(rendererName(make(null, 1, null))).toBe('');
    });
});

describe('scaledSize', () => {
    it('scales and rounds the device-pixel size', () => {
        expect(scaledSize({ width: 1280, height: 720 }, SOFTWARE_RENDER_SCALE)).toEqual({ width: 640, height: 360 });
        expect(scaledSize({ width: 1001, height: 563 }, 0.5)).toEqual({ width: 501, height: 282 });
    });

    it('never goes below 1 x 1', () => {
        expect(scaledSize({ width: 1, height: 1 }, 0.25)).toEqual({ width: 1, height: 1 });
    });

    it('leaves the size alone at scale 1', () => {
        expect(scaledSize({ width: 3840, height: 2160 }, 1)).toEqual({ width: 3840, height: 2160 });
    });

    it('draws software at half size', () => {
        expect(SOFTWARE_RENDER_SCALE).toBe(0.5);
    });
});
