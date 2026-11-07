// The kernel's det-math port (wasm/src/det_math.rs) against js/sim/det-math.js, bit for bit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detExp, detSigmoid, detTanh, detTanhInto } from '../../js/sim/det-math.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';

const bytes = readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url));
const memory = new WebAssembly.Memory({ initial: 4, maximum: 4 });
const { exports: kernel } = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { memory } });
const base = /** @type {any} */ (kernel.__heap_base).value;
const k = /** @type {Record<string, (...args: number[]) => number>} */ (/** @type {unknown} */ (kernel));

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

/**
 * @param {number} x a double
 * @returns {bigint} its bits, so -0 and 0 differ and NaN equals itself
 */
function bits(x) {
    f64[0] = x;
    return u64[0];
}

/** Edge values: zeros, subnormals, the saturation limit and its neighbours, tiny and near-one magnitudes. */
const EDGES = [
    0,
    -0,
    5e-324,
    -5e-324,
    2.2250738585072014e-308,
    -2.2250738585072014e-308,
    1e-300,
    1e-17,
    1e-8,
    0.5,
    1,
    0.34657359027997264,
    19.999999999999996,
    20,
    20.000000000000004,
    25,
    1e300,
    Number.MAX_VALUE,
].flatMap((x) => [x, -x]);

/**
 * @param {number} count how many values
 * @returns {number[]} seeded finite values over the brain's working range, with a share of tiny ones
 */
function fuzzValues(count) {
    const rng = createRng(20261107);
    const out = [];
    for (let i = 0; i < count; i++) {
        const u = nextFloat(rng) * 2 - 1;
        out.push(i % 7 === 0 ? u * 1e-6 : i % 5 === 0 ? u * 30 : u * 4);
    }
    return out;
}

const VALUES = [...EDGES, ...fuzzValues(20000)];

describe('wasm det-math', () => {
    it('tanh_f64 equals detTanh bit for bit over the edges and a fuzz', () => {
        const misses = VALUES.filter((x) => bits(k.tanh_f64(x)) !== bits(detTanh(x)));
        expect(misses).toEqual([]);
    });

    it('sigmoid_f64 equals detSigmoid bit for bit', () => {
        const misses = VALUES.filter((x) => bits(k.sigmoid_f64(x)) !== bits(detSigmoid(x)));
        expect(misses).toEqual([]);
    });

    it('exp_f64 equals detExp bit for bit over the tanh range and the full domain edges', () => {
        const xs = [...fuzzValues(5000).map((x) => -Math.abs(x) * 2), -708, 709, -40, 0, -0, 1e-300];
        const misses = xs.filter((x) => bits(k.exp_f64(x)) !== bits(detExp(x)));
        expect(misses).toEqual([]);
    });

    it('tanh_into matches detTanhInto in place for every length and mix of fast and edge values', () => {
        const view = new Float64Array(memory.buffer, base, 64);
        for (let n = 0; n <= 37; n++) {
            const src = Float64Array.from({ length: n }, (_, i) => VALUES[(n * 31 + i * 7) % VALUES.length]);
            const want = new Float64Array(n);
            detTanhInto(src, want, 0, n);
            view.set(src);
            expect(k.tanh_into(base, n)).toBe(0);
            expect(Array.from(view.subarray(0, n), bits)).toEqual(Array.from(want, bits));
        }
    });

    it('tanh_into stops at the first non-finite value and names it, where detTanh throws', () => {
        const view = new Float64Array(memory.buffer, base, 8);
        for (const bad of [NaN, Infinity, -Infinity]) {
            view.set([0.5, -1, 3, bad, 2, 1]);
            expect(k.tanh_into(base, 6)).toBe(4);
            expect(view[0]).toBe(detTanh(0.5));
            expect(view[3]).toBe(bad);
            expect(() => detTanhInto(Float64Array.of(0.5, -1, 3, bad), new Float64Array(4), 0, 4)).toThrow(
                /detTanh: expected a finite x/,
            );
        }
    });
});
