import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_EXPORTS, loadKernels } from '../../js/sim/wasm-loader.js';

const BYTES = readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url));
/** The smallest valid module: the magic number and version, no sections. */
const EMPTY_MODULE = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0);

describe('loadKernels', () => {
    it('compiles the committed binary, which has every required export', () => {
        const kernels = loadKernels(BYTES);
        expect(kernels.ok).toBe(true);
        const names = kernels.ok ? WebAssembly.Module.exports(kernels.module).map((e) => e.name) : [];
        expect(names).toEqual(expect.arrayContaining([...REQUIRED_EXPORTS]));
    });

    it('reports a missing binary as missing', () => {
        for (const bytes of [null, undefined, new Uint8Array(0)]) {
            expect(loadKernels(bytes)).toEqual({ ok: false, reason: 'missing', detail: 'no kernel bytes' });
        }
    });

    it('reports bytes that do not compile as instantiate, with the engine message', () => {
        const kernels = loadKernels(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8));
        expect(kernels).toMatchObject({ ok: false, reason: 'instantiate' });
        expect(kernels.ok ? '' : kernels.detail).not.toBe('');
    });

    it('reports a valid module without the kernel exports as instantiate, naming them', () => {
        const kernels = loadKernels(EMPTY_MODULE);
        expect(kernels).toEqual({
            ok: false,
            reason: 'instantiate',
            detail: `missing exports: ${REQUIRED_EXPORTS.join(', ')}`,
        });
    });

    it('accepts an ArrayBuffer as well as a Uint8Array', () => {
        const buffer = BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.byteLength);
        expect(loadKernels(buffer).ok).toBe(true);
    });
});
