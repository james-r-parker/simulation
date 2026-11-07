// Inputs for the Rust kernel benches (`npm run bench:micro -- --area wasm`, docs/designs/wasm-kernels.md). Each tree
// reads its own `wasm/blob-kernels.wasm`, so `--compare HEAD` prices an uncommitted rebuilt binary (this tree) against
// the committed one (the ref's checkout).
import { readFileSync } from 'node:fs';
import { attachWasm } from '../../js/sim/wasm-arena.js';
import { loadKernels } from '../../js/sim/wasm-loader.js';
import { microWorld } from './fixture.js';

/** The compiled kernels of the tree this file runs in. */
export const KERNELS = loadKernels(readFileSync(new URL('../../wasm/blob-kernels.wasm', import.meta.url)));
if (!KERNELS.ok) {
    throw new Error(`wasm bench: the kernels did not load (${KERNELS.reason}: ${KERNELS.detail})`);
}
const MODULE = KERNELS.module;

/** Pages of the standalone memory `standaloneKernels` gives an instance: 4 MiB, room for any batch here. */
const STANDALONE_PAGES = 64;

/**
 * A copy of a 500-agent micro world on its own arena: the copy's hot arrays are arena views holding the micro world's
 * values, so the original stays as it was and the kernel can be called on the copy again and again.
 * @param {Record<string, number | boolean>} [overrides] config keys on top of the defaults
 * @returns {Record<string, any>} the attached copy, with `wasm` its arena
 */
export function kernelWorld(overrides = {}) {
    const world = microWorld(overrides);
    /** @type {Record<string, any>} */
    const copy = { ...world, brainScratch: world.brainScratch.slice() };
    delete copy.wasm;
    copy.agentRows = world.agentRows.map((/** @type {any} */ row) => ({ ...row }));
    // `wasmKernels` is the spike's switch; an attach without it ignores the key.
    if (!attachWasm(copy, KERNELS, { wasmKernels: true, midRun: true })) {
        throw new Error('wasm bench: the kernels did not attach');
    }
    return copy;
}

/**
 * An instance of the kernels on a small memory of its own, for the exports that take a plain range (`tanh_into`).
 * @returns {{ exports: Record<string, any>, memory: WebAssembly.Memory, heap: number }} the instance's exports, its
 *   memory and the first 16-byte aligned free byte
 */
export function standaloneKernels() {
    const memory = new WebAssembly.Memory({ initial: STANDALONE_PAGES, maximum: STANDALONE_PAGES });
    const instance = new WebAssembly.Instance(MODULE, { env: { memory } });
    const heapBase = /** @type {WebAssembly.Global} */ (instance.exports.__heap_base).value;
    return { exports: instance.exports, memory, heap: Math.ceil(heapBase / 16) * 16 };
}
