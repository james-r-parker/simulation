import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    KERNEL_ABI,
    REQUIRED_EXPORTS,
    checkProbe,
    decodeBase64,
    embeddedKernels,
    loadKernels,
} from '../../js/sim/wasm-loader.js';

const BYTES = readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url));
/** The smallest valid module: the magic number and version, no sections. */
const EMPTY_MODULE = Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0);

describe('loadKernels', () => {
    it('compiles the committed binary, which has every required export, and reads its heap base', () => {
        const kernels = loadKernels(BYTES);
        const names = WebAssembly.Module.exports(kernels.module).map((e) => e.name);
        expect(names).toEqual(expect.arrayContaining([...REQUIRED_EXPORTS]));
        expect(kernels.heapBase).toBeGreaterThan(0);
    });

    it('fails loudly on a missing binary', () => {
        for (const bytes of [null, undefined, new Uint8Array(0)]) {
            expect(() => loadKernels(bytes)).toThrow('WASM kernels: no kernel bytes');
        }
    });

    it('fails loudly on bytes that do not compile', () => {
        expect(() => loadKernels(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8))).toThrow(/^WASM kernels: /);
    });

    it('fails loudly on a valid module without the kernel exports, naming them', () => {
        expect(() => loadKernels(EMPTY_MODULE)).toThrow(
            `WASM kernels: missing exports: ${REQUIRED_EXPORTS.join(', ')}`,
        );
    });

    it('accepts an ArrayBuffer as well as a Uint8Array', () => {
        const buffer = BYTES.buffer.slice(BYTES.byteOffset, BYTES.byteOffset + BYTES.byteLength);
        expect(loadKernels(buffer).heapBase).toBe(loadKernels(BYTES).heapBase);
    });
});

describe('decodeBase64', () => {
    it('decodes base64 to its bytes', () => {
        expect(Array.from(decodeBase64(Buffer.from([0, 1, 254, 255, 7]).toString('base64')))).toEqual([
            0, 1, 254, 255, 7,
        ]);
        expect(decodeBase64('').length).toBe(0);
    });
});

describe('checkProbe', () => {
    it('returns the heap base of a binary on this ABI', () => {
        expect(checkProbe(KERNEL_ABI, 70000)).toBe(70000);
    });

    it('refuses another ABI and a heap base that is not an integer', () => {
        expect(() => checkProbe(KERNEL_ABI + 1, 70000)).toThrow(`kernel ABI ${KERNEL_ABI + 1}, expected ${KERNEL_ABI}`);
        expect(() => checkProbe(KERNEL_ABI, 1.5)).toThrow('no integer __heap_base');
        expect(() => checkProbe(KERNEL_ABI, undefined)).toThrow('no integer __heap_base');
    });
});

describe('embeddedKernels', () => {
    it('compiles once per thread and returns the same kernels after', () => {
        expect(embeddedKernels()).toBe(embeddedKernels());
        expect(embeddedKernels().heapBase).toBe(loadKernels(BYTES).heapBase);
    });
});
